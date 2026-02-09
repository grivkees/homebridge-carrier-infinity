/**
 * GraphQL-based Models for Carrier Infinity API
 *
 * This file implements the same model interfaces as models.ts but uses
 * the GraphQL API instead of the REST API. The public API remains unchanged
 * to maintain backward compatibility with accessory and characteristic code.
 */

import {
  processSetpointDeadband,
  convertSystemHum2CharHum,
  convertCharHum2SystemHum,
  convertSystemDehum2CharDehum,
  convertCharDehum2SystemDehum,
} from '../helpers';
import { MemoizeExpiring } from 'typescript-memoize';
import { Mutex, tryAcquire, E_ALREADY_LOCKED, E_CANCELED, E_TIMEOUT } from 'async-mutex';
import { Logger } from 'homebridge';
import hash from 'object-hash';
import { PrefixLogger } from '../helper_logging';
import { InfinityGraphQLClient } from './graphql_client';
import Axios, { AxiosError } from 'axios';
import EventEmitter from 'events';

import {
  InfinitySystem,
  InfinitySystemProfile,
  InfinitySystemStatus,
  InfinitySystemConfig,
  InfinityZoneConfig,
  InfinityZoneActivity,
  InfinityZoneStatus,
  GetInfinitySystemsResponse,
  GetUserResponse,
} from './interface_graphql_system';
import {
  InfinityConfigInput,
  InfinityZoneActivityInput,
  InfinityZoneConfigInput,
  UpdateInfinityConfigResponse,
  UpdateInfinityZoneActivityResponse,
  UpdateInfinityZoneConfigResponse,
} from './interface_graphql_mutations';
import {
  GET_INFINITY_SYSTEMS,
  GET_USER,
  UPDATE_INFINITY_CONFIG,
  UPDATE_INFINITY_ZONE_ACTIVITY,
  UPDATE_INFINITY_ZONE_CONFIG,
} from './graphql_operations';
import { ACTIVITY, SYSTEM_MODE, STATUS, SUBSCRIPTION } from './constants';

/**
 * Base model for GraphQL API interactions
 *
 * Similar to the old BaseModel but works with GraphQL and JSON instead of REST and XML
 */
abstract class BaseModelGraphQL {
  protected data_object!: object;
  protected data_object_hash?: string;
  protected HASH_IGNORE_KEYS = new Set<string>();
  protected write_lock: Mutex;
  protected log: Logger = new PrefixLogger(this.graphql_client.log, 'API');

  // Exponential backoff state for API errors (#397)
  private consecutiveFailures = 0;
  private backoffUntil = 0;
  private static readonly BACKOFF_BASE_MS = 30 * 1000;         // 30 seconds initial backoff
  private static readonly BACKOFF_MAX_MS = 10 * 60 * 1000;     // 10 minutes max backoff

  constructor(
    protected readonly graphql_client: InfinityGraphQLClient,
  ) {
    this.write_lock = new Mutex();
  }

  protected hashDataObject(data?: object): string {
    return hash(
      data || this.data_object,
      {excludeKeys: (key) => {
        return this.HASH_IGNORE_KEYS.has(key);
      }},
    );
  }

  /** Whether initial data has been successfully loaded */
  get isDataAvailable(): boolean {
    return this.data_object !== undefined;
  }

  @MemoizeExpiring(10 * 1000)
  async fetch(): Promise<void> {
    // Exponential backoff: skip fetch if still in backoff period (#397)
    if (Date.now() < this.backoffUntil) {
      this.log.debug(`Backing off API calls for ${Math.round((this.backoffUntil - Date.now()) / 1000)}s more`);
      return;
    }

    // If push is ongoing, skip this update fetch. The push will do a fetch.
    try {
      await tryAcquire(this.write_lock).runExclusive(async () => {
        await this.forceFetch();
      });
      // Success: reset backoff
      if (this.consecutiveFailures > 0) {
        this.log.info('API connection restored after backoff.');
      }
      this.consecutiveFailures = 0;
      this.backoffUntil = 0;
    } catch (e) {
      if (e === E_ALREADY_LOCKED) {
        return;
      } else if (e === E_TIMEOUT || e === E_CANCELED) {
        this.log.error(`Deadlock on fetch ${e}. Report bug: https://bit.ly/3igbU7D`);
      } else {
        this.consecutiveFailures++;
        const backoffMs = Math.min(
          BaseModelGraphQL.BACKOFF_BASE_MS * Math.pow(2, this.consecutiveFailures - 1),
          BaseModelGraphQL.BACKOFF_MAX_MS,
        );
        this.backoffUntil = Date.now() + backoffMs;
        const errorMessage = Axios.isAxiosError(e) ? (e as AxiosError).message : String(e);
        this.log.error(
          `Failed to fetch updates (attempt ${this.consecutiveFailures},` +
          ` backing off ${Math.round(backoffMs / 1000)}s): `,
          errorMessage,
        );
      }
    }
  }

  protected abstract forceFetch(): Promise<void>;
}

/**
 * Locations Model - GraphQL Version
 *
 * Fetches user information and discovers available systems
 */
export class LocationsModelGraphQL extends BaseModelGraphQL {
  protected data_object!: GetUserResponse;

  protected async forceFetch(): Promise<void> {
    const response = await this.graphql_client.query<GetUserResponse>(
      GET_USER,
      { userName: this.graphql_client.username },
    );
    this.data_object = response;
    this.data_object_hash = this.hashDataObject(response);
  }

  async getSystems(): Promise<string[]> {
    await this.fetch();
    if (!this.isDataAvailable) {
      throw new Error('Could not retrieve systems (API has not responded successfully)');
    }
    const systems: string[] = [];

    // Extract serial numbers from user locations
    for (const location of this.data_object.user.locations) {
      for (const system of location.systems) {
        systems.push(system.profile.serial);
      }
    }

    return systems;
  }
}

/**
 * Unified System Model - GraphQL Version
 *
 * This model fetches all system data (profile + status + config) in a single GraphQL query.
 * The old REST API required 3 separate calls. This unified approach is more efficient.
 */
class UnifiedSystemModelGraphQL extends BaseModelGraphQL {
  protected data_object!: InfinitySystem;
  protected HASH_IGNORE_KEYS = new Set<string>(['timestamp', 'localTime', 'etag']);
  private last_updated = 0;

  constructor(
    protected readonly graphql_client: InfinityGraphQLClient,
    public readonly serialNumber: string,
    protected readonly log: Logger,
    protected readonly events: EventEmitter,
  ) {
    super(graphql_client);
  }

  protected async forceFetch(): Promise<void> {
    const old_hash = this.data_object_hash;

    // Single GraphQL query fetches profile, status, AND config
    const response = await this.graphql_client.query<GetInfinitySystemsResponse>(
      GET_INFINITY_SYSTEMS,
      { userName: this.graphql_client.username },
    );

    // Find our system in the response
    const system = response.infinitySystems.find(s => s.profile.serial === this.serialNumber);
    if (!system) {
      throw new Error(`System ${this.serialNumber} not found in GraphQL response`);
    }

    this.data_object = system;
    const new_hash = this.hashDataObject(system);
    this.data_object_hash = new_hash;

    // Update timestamp
    if (system.status.localTime) {
      this.last_updated = Date.parse(system.status.localTime);
      this.log.debug(`TIMESTAMP reports ${system.status.localTime} (${this.last_updated})`);
    }

    // Emit events if data changed (for backward compatibility with old model)
    if (old_hash !== new_hash) {
      // Emit granular events for each section
      // Accessories subscribe to these specific events
      this.events.emit('updated_system_profile');
      this.events.emit('updated_status');
      this.events.emit('updated_config');
    }
  }

  // Direct accessors for internal use by facade models
  getProfile(): InfinitySystemProfile {
    if (!this.isDataAvailable) {
      throw new Error('System data not yet available (API has not responded successfully)');
    }
    return this.data_object.profile;
  }

  getStatus(): InfinitySystemStatus {
    if (!this.isDataAvailable) {
      throw new Error('System data not yet available (API has not responded successfully)');
    }
    return this.data_object.status;
  }

  getConfig(): InfinitySystemConfig {
    if (!this.isDataAvailable) {
      throw new Error('System data not yet available (API has not responded successfully)');
    }
    return this.data_object.config;
  }

  // Public method to force a fresh fetch, bypassing memoization
  // Used for propagation checking where we need actual current values
  async forceFreshFetch(): Promise<void> {
    await this.forceFetch();
  }
}

/**
 * System Profile Model - GraphQL Facade
 *
 * Maintains the same public API as the old SystemProfileModel but delegates
 * to the UnifiedSystemModelGraphQL internally. No changes needed in accessory code.
 */
export class SystemProfileModelGraphQL {
  constructor(
    private readonly unified: UnifiedSystemModelGraphQL,
  ) {}

  async fetch(): Promise<void> {
    await this.unified.fetch();
  }

  async getName(): Promise<string> {
    await this.fetch();
    return this.unified.getProfile().name;
  }

  async getBrand(): Promise<string> {
    await this.fetch();
    return this.unified.getProfile().brand;
  }

  async getModel(): Promise<string> {
    await this.fetch();
    return this.unified.getProfile().model;
  }

  async getFirmware(): Promise<string> {
    await this.fetch();
    return this.unified.getProfile().firmware;
  }

  async getZones(): Promise<Array<string>> {
    await this.fetch();
    const status = this.unified.getStatus();
    // Return zones that are enabled
    return status.zones
      .filter(zone => zone.enabled === STATUS.ON)
      .map(zone => zone.id);
  }
}

/**
 * System Status Model - GraphQL Facade
 *
 * Maintains the same public API as the old SystemStatusModel
 */
export class SystemStatusModelGraphQL {
  constructor(
    private readonly unified: UnifiedSystemModelGraphQL,
  ) {}

  async fetch(): Promise<void> {
    await this.unified.fetch();
  }

  async getUnits(): Promise<string> {
    await this.fetch();
    return this.unified.getStatus().cfgem;
  }

  async getOutdoorTemp(): Promise<number> {
    await this.fetch();
    return Number(this.unified.getStatus().oat);
  }

  async getFilterUsed(): Promise<number> {
    await this.fetch();
    return Number(this.unified.getStatus().filtrlvl);
  }

  async getMode(): Promise<string> {
    await this.fetch();
    const raw_mode = this.unified.getStatus().mode;
    switch(raw_mode) {
      case 'gasheat':
      case 'electric':
      case 'hpheat':
        return SYSTEM_MODE.HEAT;
      case 'dehumidify':
        return SYSTEM_MODE.COOL;
      default:
        return raw_mode;
    }
  }

  private getZone(zone: string): InfinityZoneStatus {
    const zones = this.unified.getStatus().zones;
    const found = zones.find(z => z.id === zone.toString());
    if (!found) {
      throw new Error(`Zone ${zone} not found in status`);
    }
    return found;
  }

  async getZoneConditioning(zone: string): Promise<string> {
    await this.fetch();
    const raw_mode = this.getZone(zone).zoneconditioning;
    switch(raw_mode) {
      case 'active_heat':
      case 'prep_heat':
      case 'pending_heat':
        return SYSTEM_MODE.HEAT;
      case 'active_cool':
      case 'prep_cool':
      case 'pending_cool':
        return SYSTEM_MODE.COOL;
      case 'idle':
        return SYSTEM_MODE.OFF;
      default:
        return raw_mode;
    }
  }

  async getZoneFan(zone: string): Promise<string> {
    await this.fetch();
    const zone_obj = this.getZone(zone);
    // Note: In GraphQL API, damperposition is not in status, check fan directly
    return zone_obj.fan;
  }

  async getZoneOpen(zone: string): Promise<boolean> {
    await this.fetch();
    const zone_obj = this.getZone(zone);
    // Zone is open if enabled
    return zone_obj.enabled === STATUS.ON;
  }

  async getZoneTemp(zone: string): Promise<number> {
    await this.fetch();
    return Number(this.getZone(zone).rt);
  }

  async getZoneHumidity(zone: string): Promise<number> {
    await this.fetch();
    return Number(this.getZone(zone).rh);
  }

  async getZoneActivity(zone: string): Promise<string> {
    await this.fetch();
    return this.getZone(zone).currentActivity;
  }

  async getZoneCoolSetpoint(zone: string): Promise<number> {
    await this.fetch();
    return Number(this.getZone(zone).clsp);
  }

  async getZoneHeatSetpoint(zone: string): Promise<number> {
    await this.fetch();
    return Number(this.getZone(zone).htsp);
  }

  async getHumidifier(): Promise<string> {
    await this.fetch();
    // Check if humidifier is actively running based on status mode
    // The 'humid' field indicates humidifier status
    const status = this.unified.getStatus();
    return status.humid || STATUS.OFF;
  }

  async getDehumidifier(): Promise<string> {
    await this.fetch();
    // Check if dehumidifier is actively running
    // Dehumidify mode uses the AC to remove humidity
    const status = this.unified.getStatus();
    return status.mode === 'dehumidify' ? STATUS.ON : STATUS.OFF;
  }
}

/**
 * System Config Model (Read-Only) - GraphQL Facade
 *
 * Maintains the same public API as the old SystemConfigModelReadOnly
 */
export class SystemConfigModelReadOnlyGraphQL {
  constructor(
    protected readonly unified: UnifiedSystemModelGraphQL,
    protected readonly log: Logger,
  ) {}

  async fetch(): Promise<void> {
    await this.unified.fetch();
  }

  async getUnits(): Promise<string> {
    await this.fetch();
    return this.unified.getConfig().cfgem;
  }

  async getTempBounds(): Promise<[number, number]> {
    await this.fetch();
    // GraphQL API may not have utilityEvent, use sensible defaults
    // TODO: Find where temperature bounds are in GraphQL schema
    return [50, 90];  // Default bounds in Fahrenheit
  }

  async getMode(): Promise<string> {
    await this.fetch();
    return this.unified.getConfig().mode;
  }

  protected getZone(zone: string): InfinityZoneConfig {
    const zones = this.unified.getConfig().zones;
    const found = zones.find(z => z.id === zone.toString());
    if (!found) {
      throw new Error(`Zone ${zone} not found in config`);
    }
    return found;
  }

  async getZoneName(zone: string): Promise<string> {
    await this.fetch();
    return this.getZone(zone).name;
  }

  async getZoneHoldStatus(zone: string): Promise<[string, string]> {
    await this.fetch();
    const zone_obj = this.getZone(zone);
    return [zone_obj.hold, zone_obj.otmr || ''];
  }

  protected getZoneActivityInternal(zone: string): string {
    const zone_obj = this.getZone(zone);
    if (zone_obj.hold === STATUS.ON) {
      return zone_obj.holdActivity || ACTIVITY.HOME;
    } else {
      const now = new Date();
      const program_obj = zone_obj.program;
      const today_schedule = program_obj.day[now.getDay()].period
        .filter(period => period.enabled === STATUS.ON)
        .reverse();

      for (const period of today_schedule) {
        const time = period.time;
        const [hours, minutes] = time.split(':').map(Number);
        if (
          hours < now.getHours() ||
          (hours === now.getHours() && minutes < now.getMinutes())
        ) {
          return period.activity;
        }
      }

      // If we got to the end, activity is the last from yesterday
      const yesterday_schedule = program_obj.day[(now.getDay() + 6) % 7].period
        .filter(period => period.enabled === STATUS.ON)
        .reverse();
      return yesterday_schedule[0].activity;
    }
  }

  async getZoneActivity(zone: string): Promise<string> {
    await this.fetch();
    return this.getZoneActivityInternal(zone);
  }

  /**
   * Check if all enabled zones have the specified activity hold active
   *
   * @param activity_name - The activity name to check (e.g., "away", "home")
   * @returns true if ALL enabled zones have hold active with this activity, false otherwise
   */
  async getAllZonesActivityHoldStatus(activity_name: string): Promise<boolean> {
    await this.fetch();
    const config = this.unified.getConfig();
    const status = this.unified.getStatus();

    const enabledZones = config.zones.filter(z => z.enabled === STATUS.ON);
    if (enabledZones.length === 0) {
      return false;
    }

    // All enabled zones must have:
    // 1. Hold enabled
    // 2. This specific activity as the holdActivity
    // 3. Current activity matches (from status)
    return enabledZones.every(zone => {
      const zoneStatus = status.zones.find(z => z.id === zone.id);
      return zone.hold === STATUS.ON &&
             zone.holdActivity === activity_name &&
             zoneStatus?.currentActivity === activity_name;
    });
  }

  protected getZoneActivityConfig(zone: string, activity_name: string): InfinityZoneActivity {
    const config = this.unified.getConfig();

    // Vacation is stored at system level
    if (activity_name === ACTIVITY.VACATION) {
      return {
        id: ACTIVITY.VACATION,
        zoneId: zone,
        type: ACTIVITY.VACATION,
        clsp: config.vacmaxt,
        htsp: config.vacmint,
        fan: config.vacfan,
      };
    }

    const zone_obj = this.getZone(zone);
    const activity = zone_obj.activities.find(a => a.type === activity_name);
    if (!activity) {
      throw new Error(`Activity ${activity_name} not found for zone ${zone}`);
    }
    return activity;
  }

  async getZoneActivityFan(zone: string, activity: string): Promise<string> {
    await this.fetch();
    return this.getZoneActivityConfig(zone, activity).fan;
  }

  async getZoneActivityCoolSetpoint(zone: string, activity: string): Promise<number> {
    await this.fetch();
    return Number(this.getZoneActivityConfig(zone, activity).clsp);
  }

  async getZoneActivityHeatSetpoint(zone: string, activity: string): Promise<number> {
    await this.fetch();
    return Number(this.getZoneActivityConfig(zone, activity).htsp);
  }

  async getZoneNextActivityTime(zone: string): Promise<string> {
    await this.fetch();
    const now = new Date();
    const program_obj = this.getZone(zone).program;
    const day_obj = program_obj.day[now.getDay()];

    for (const period of day_obj.period) {
      const time = period.time;
      const [hours, minutes] = time.split(':').map(Number);
      if (
        hours > now.getHours() ||
        (hours === now.getHours() && minutes > now.getMinutes())
      ) {
        return time;
      }
    }

    // Next activity is first from tomorrow
    const tomorrow_obj = program_obj.day[(now.getDay() + 1) % 7];
    return tomorrow_obj.period[0].time;
  }

  protected getHumidityConfig(activity: string) {
    const config = this.unified.getConfig();
    switch (activity) {
      case ACTIVITY.HOME:
      case ACTIVITY.WAKE:
      case ACTIVITY.SLEEP:
      case ACTIVITY.MANUAL:
        return config.humidityHome;
      case ACTIVITY.AWAY:
        return config.humidityAway;
      case ACTIVITY.VACATION:
        return config.humidityVacation;
      default:
        return config.humidityHome;
    }
  }

  async getActivityHumidifierState(activity: string): Promise<string> {
    await this.fetch();
    const humidityConfig = this.getHumidityConfig(activity);
    return humidityConfig?.humidifier || STATUS.OFF;
  }

  async getActivityDehumidifierState(activity: string): Promise<string> {
    await this.fetch();
    const humidityConfig = this.getHumidityConfig(activity);
    // Dehumidification is enabled when humid is "on" or rclgovercool is "on"
    return humidityConfig?.humid || humidityConfig?.rclgovercool || STATUS.OFF;
  }

  async getActivityHumidifierTarget(activity: string): Promise<number> {
    await this.fetch();
    const humidityConfig = this.getHumidityConfig(activity);
    const rhtg = humidityConfig?.rhtg;

    // Log if we get unexpected values
    if (humidityConfig === undefined) {
      this.log.debug(`No humidity config found for activity "${activity}"`);
    } else if (rhtg === undefined || rhtg === null) {
      this.log.debug(`No rhtg (humidifier target) in humidity config for activity "${activity}"`);
    } else if (!Number.isFinite(rhtg) || rhtg < 0) {
      this.log.warn(`Unexpected rhtg value "${rhtg}" for activity "${activity}", using default`);
    }

    // rhtg is stored as value/5 (e.g., 40% = 8), convert to actual percentage
    return convertSystemHum2CharHum(rhtg || 0);
  }

  async getActivityDehumidifierTarget(activity: string): Promise<number> {
    await this.fetch();
    const humidityConfig = this.getHumidityConfig(activity);
    const rclg = humidityConfig?.rclg;

    // Log if we get unexpected values
    if (humidityConfig === undefined) {
      this.log.debug(`No humidity config found for activity "${activity}"`);
    } else if (rclg === undefined || rclg === null) {
      this.log.debug(`No rclg (dehumidifier target) in humidity config for activity "${activity}"`);
    } else if (!Number.isFinite(rclg) || rclg < 0) {
      this.log.warn(`Unexpected rclg value "${rclg}" for activity "${activity}", using default`);
    }

    // rclg is stored as value/5 (e.g., 50% = 10), convert to actual percentage
    return convertSystemDehum2CharDehum(rclg || 0);
  }
}

/**
 * Config Mutation Interface
 */
interface ConfigMutationGraphQL {
  (config: InfinitySystemConfig, status: InfinitySystemStatus): InfinityConfigInput | InfinityZoneActivityInput | InfinityZoneConfigInput;
}

/**
 * System Config Model (Writable) - GraphQL Version
 *
 * Handles mutations to system configuration via GraphQL mutations
 */
export class SystemConfigModelGraphQL extends SystemConfigModelReadOnlyGraphQL {
  mutations: ConfigMutationGraphQL[] = [];

  constructor(
    protected readonly unified: UnifiedSystemModelGraphQL,
    protected readonly graphql_client: InfinityGraphQLClient,
    protected readonly log: Logger,
    private readonly events: EventEmitter,
  ) {
    super(unified, log);
  }

  // Skip fetching new data when we have a dirty local state
  async fetch(): Promise<void> {
    if (this.mutations.length > 0) {
      return;
    }
    await super.fetch();
  }

  private async push(): Promise<void> {
    // Emit local mutation event for immediate HK updates
    this.events.emit(SUBSCRIPTION.CONFIG_MUTATE);

    // Wait a bit to batch mutations
    await new Promise(r => setTimeout(r, 2000));

    // Cancel any pending pushes
    const write_lock = (this.unified as unknown as { write_lock: Mutex }).write_lock;
    write_lock.cancel();

    try {
      await write_lock.runExclusive(async () => {
        if (this.mutations.length === 0) {
          return;
        }

        // Fetch fresh config to ensure we don't overwrite other data
        await this.unified.forceFreshFetch();
        const localConfig = JSON.parse(JSON.stringify(this.unified.getConfig()));
        const status = this.unified.getStatus();

        const executedInputs: (InfinityConfigInput | InfinityZoneActivityInput | InfinityZoneConfigInput)[] = [];
        while (this.mutations.length > 0) {
          const mutation = this.mutations.shift();
          if (mutation) {
            const input = mutation(localConfig, status);
            await this.executeMutation(input);
            this.applyMutationToLocalConfig(input, localConfig);
            executedInputs.push(input);
          }
        }

        this.log.info('... pushing changes complete.');

        // Wait before checking propagation (like the old REST API code)
        await new Promise(r => setTimeout(r, 5000));

        // If new mutations came in during push, skip the confirmation check
        // The next push will handle refreshing from remote API state
        if (this.mutations.length > 0) {
          return;
        }

        // Fetch fresh data and verify each mutation's fields landed
        await this.unified.forceFreshFetch();
        const actualConfig = this.unified.getConfig();

        if (executedInputs.every(input => this.verifyMutationLanded(input, actualConfig))) {
          this.log.debug('Successful propagation to carrier api is confirmed.');
        } else {
          this.log.warn('Changes do not (yet?) appear to have propagated to the carrier api.');
        }
      });
    } catch (e) {
      if (e === E_CANCELED) {
        return;
      } else if (e === E_TIMEOUT || e === E_ALREADY_LOCKED) {
        this.log.error(`Deadlock on push ${e}. Report bug: https://bit.ly/3igbU7D`);
      } else {
        const errorMessage = Axios.isAxiosError(e) ? (e as AxiosError).message : String(e);
        this.log.error('Failed to push updates: ', errorMessage);
      }
    }
  }

  private async executeMutation(input: any): Promise<void> {
    // Determine mutation type based on input properties
    const isSystemConfig = 'mode' in input ||
      'humidityHome' in input ||
      'humidityAway' in input ||
      'humidityVacation' in input;

    if (isSystemConfig && !('zoneId' in input)) {
      // System config mutation (mode, humidity settings, etc.)
      await this.graphql_client.mutate<UpdateInfinityConfigResponse>(
        UPDATE_INFINITY_CONFIG,
        { input },
      );
      this.log.info('Executed updateInfinityConfig mutation');
    } else if ('activityType' in input) {
      // Zone activity mutation
      await this.graphql_client.mutate<UpdateInfinityZoneActivityResponse>(
        UPDATE_INFINITY_ZONE_ACTIVITY,
        { input },
      );
      this.log.info('Executed updateInfinityZoneActivity mutation');
    } else if ('zoneId' in input) {
      // Zone config mutation
      await this.graphql_client.mutate<UpdateInfinityZoneConfigResponse>(
        UPDATE_INFINITY_ZONE_CONFIG,
        { input },
      );
      this.log.info('Executed updateInfinityZoneConfig mutation');
    } else {
      this.log.error('Unknown mutation type:', input);
    }
  }

  private static readonly MUTATION_META_KEYS = new Set(['serial', 'zoneId', 'activityType']);

  /**
   * Resolve the target object in config that a mutation input applies to.
   */
  private resolveMutationTarget(
    input: InfinityConfigInput | InfinityZoneActivityInput | InfinityZoneConfigInput,
    config: InfinitySystemConfig,
  ): Record<string, unknown> | undefined {
    if ('activityType' in input && 'zoneId' in input) {
      const zone = config.zones.find(z => z.id === input.zoneId);
      return zone?.activities.find(a => a.type === input.activityType) as unknown as Record<string, unknown>;
    } else if ('zoneId' in input) {
      return config.zones.find(z => z.id === input.zoneId) as unknown as Record<string, unknown>;
    }
    return config as unknown as Record<string, unknown>;
  }

  /**
   * Apply mutation input fields back to localConfig so subsequent batched
   * mutations see the pending changes instead of stale values.
   */
  private applyMutationToLocalConfig(
    input: InfinityConfigInput | InfinityZoneActivityInput | InfinityZoneConfigInput,
    config: InfinitySystemConfig,
  ): void {
    const target = this.resolveMutationTarget(input, config);
    if (!target) return;
    for (const [key, value] of Object.entries(input)) {
      if (!SystemConfigModelGraphQL.MUTATION_META_KEYS.has(key) && value !== undefined) {
        target[key] = value;
      }
    }
  }

  /**
   * Verify that a mutation's fields are reflected in the actual config,
   * using numeric comparison for values like "68.0" vs "68".
   */
  private verifyMutationLanded(
    input: InfinityConfigInput | InfinityZoneActivityInput | InfinityZoneConfigInput,
    config: InfinitySystemConfig,
  ): boolean {
    const target = this.resolveMutationTarget(input, config);
    if (!target) return false;
    for (const [key, expected] of Object.entries(input)) {
      if (SystemConfigModelGraphQL.MUTATION_META_KEYS.has(key) || expected === undefined) continue;
      const actual = target[key];
      if (typeof expected === 'object' && expected !== null) {
        // Nested objects (e.g. humidityHome): check each sub-field
        const actualObj = (actual || {}) as Record<string, unknown>;
        for (const [subKey, subExpected] of Object.entries(expected as Record<string, unknown>)) {
          if (subExpected !== undefined && !this.valuesMatch(subExpected, actualObj[subKey])) return false;
        }
      } else if (!this.valuesMatch(expected, actual)) {
        return false;
      }
    }
    return true;
  }

  private valuesMatch(expected: unknown, actual: unknown): boolean {
    if (expected === actual) return true;
    // Numeric comparison handles format differences like "68.0" vs "68"
    const numExpected = Number(expected);
    const numActual = Number(actual);
    return !isNaN(numExpected) && !isNaN(numActual) && numExpected === numActual;
  }

  async setMode(mode: string): Promise<void> {
    this.log.debug('Setting mode to ' + mode);

    const m: ConfigMutationGraphQL = (config, status) => {
      return {
        serial: this.unified.serialNumber,
        mode,
      } as InfinityConfigInput;
    };

    this.mutations.push(m);
    this.push();
  }

  async setZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.log.debug(`Setting zone ${zone} activity to ${activity} until ${hold_until}`);

    const m: ConfigMutationGraphQL = (config, status) => {
      return {
        serial: this.unified.serialNumber,
        zoneId: zone,
        hold: activity ? STATUS.ON : STATUS.OFF,
        holdActivity: activity || null,
        otmr: activity ? hold_until : null,
      } as InfinityZoneConfigInput;
    };

    this.mutations.push(m);
    this.push();
  }

  /**
   * Set all enabled zones to the same activity hold
   *
   * This method queues mutations for all enabled zones to set them to the specified
   * activity with the given hold time. The mutations are batched and executed with
   * the standard 2-second debounce and verification mechanism.
   *
   * @param activity - Activity name ("away", "home", etc.) or empty string to clear hold
   * @param hold_until - ISO 8601 timestamp for hold expiration, or null for indefinite
   */
  async setAllZonesActivityHold(
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.log.debug(`Setting all zones activity to ${activity} until ${hold_until}`);

    const config = this.unified.getConfig();

    // Create mutation for each enabled zone
    for (const zone of config.zones) {
      if (zone.enabled === STATUS.ON) {
        const m: ConfigMutationGraphQL = (_cfg, _status) => {
          return {
            serial: this.unified.serialNumber,
            zoneId: zone.id,
            hold: activity ? STATUS.ON : STATUS.OFF,
            holdActivity: activity || null,
            otmr: activity ? hold_until : null,
          } as InfinityZoneConfigInput;
        };
        this.mutations.push(m);
      }
    }

    this.push();
  }

  async setZoneActivityManualHold(
    zone: string,
    clsp: number | null,
    htsp: number | null,
    hold_until: string | null,
    fan: string | null = null,
  ): Promise<void> {
    this.log.debug(
      `Setting zone ${zone} to`,
      clsp ? `clsp=${clsp}` : '',
      htsp ? `htsp=${htsp}` : '',
      fan ? `fan=${fan}` : '',
      '.',
    );

    // First, update the MANUAL activity setpoints
    const m1: ConfigMutationGraphQL = (config, status) => {
      const zone_obj = config.zones.find(z => z.id === zone);
      const manual_activity = zone_obj?.activities.find(a => a.type === ACTIVITY.MANUAL);

      if (!manual_activity) {
        throw new Error(`MANUAL activity not found for zone ${zone}`);
      }

      // Get current setpoints as defaults
      let current_htsp = Number(manual_activity.htsp);
      let current_clsp = Number(manual_activity.clsp);
      const current_fan = manual_activity.fan;

      // Apply deadband processing
      [current_htsp, current_clsp] = processSetpointDeadband(
        htsp !== null ? htsp : current_htsp,
        clsp !== null ? clsp : current_clsp,
        config.cfgem,
        htsp === null,  // make clsp sticky if no htsp change
      );

      return {
        serial: this.unified.serialNumber,
        zoneId: zone,
        activityType: ACTIVITY.MANUAL,
        htsp: current_htsp.toFixed(1),
        clsp: current_clsp.toFixed(1),
        fan: fan || current_fan,
      } as InfinityZoneActivityInput;
    };

    // Then, set hold to MANUAL activity
    const m2: ConfigMutationGraphQL = (config, status) => {
      return {
        serial: this.unified.serialNumber,
        zoneId: zone,
        hold: STATUS.ON,
        holdActivity: ACTIVITY.MANUAL,
        otmr: hold_until,
      } as InfinityZoneConfigInput;
    };

    this.mutations.push(m1, m2);
    this.push();
  }

  async setHumidityConfig(
    activity: string,
    humidifier?: string,
    dehumidifier?: string,
    humidifierTarget?: number,
    dehumidifierTarget?: number,
  ): Promise<void> {
    this.log.debug(
      `Setting humidity for ${activity}:`,
      humidifier !== undefined ? `humidifier=${humidifier}` : '',
      dehumidifier !== undefined ? `dehumidifier=${dehumidifier}` : '',
      humidifierTarget !== undefined ? `humidifierTarget=${humidifierTarget}` : '',
      dehumidifierTarget !== undefined ? `dehumidifierTarget=${dehumidifierTarget}` : '',
    );

    const m: ConfigMutationGraphQL = (config, _status) => {
      // Get current humidity config for the activity
      const activityKey = activity === ACTIVITY.AWAY ? 'humidityAway'
        : activity === ACTIVITY.VACATION ? 'humidityVacation'
          : 'humidityHome';
      const currentHumidityConfig = config?.[activityKey] || {};

      // Start with a complete copy of current config, then apply changes
      const humidityInput: any = { ...currentHumidityConfig };

      // Apply explicit changes
      if (humidifier !== undefined) {
        humidityInput.humidifier = humidifier;
      }
      if (dehumidifier !== undefined) {
        humidityInput.humid = dehumidifier;
        humidityInput.rclgovercool = dehumidifier;
      }
      if (humidifierTarget !== undefined) {
        humidityInput.rhtg = convertCharHum2SystemHum(humidifierTarget);
      }
      if (dehumidifierTarget !== undefined) {
        humidityInput.rclg = convertCharDehum2SystemDehum(dehumidifierTarget);
      }

      const input: InfinityConfigInput = {
        serial: this.unified.serialNumber,
      };

      // Apply to appropriate activity config
      switch (activity) {
        case ACTIVITY.HOME:
        case ACTIVITY.WAKE:
        case ACTIVITY.SLEEP:
        case ACTIVITY.MANUAL:
          input.humidityHome = humidityInput;
          break;
        case ACTIVITY.AWAY:
          input.humidityAway = humidityInput;
          break;
        case ACTIVITY.VACATION:
          input.humidityVacation = humidityInput;
          break;
        default:
          input.humidityHome = humidityInput;
      }

      return input;
    };

    this.mutations.push(m);
    this.push();
  }
}

/**
 * System Model - GraphQL Version
 *
 * Top-level facade that combines profile, status, and config models
 * Maintains the same public API as the old SystemModel
 */
export class SystemModelGraphQL {
  public status: SystemStatusModelGraphQL;
  public config: SystemConfigModelGraphQL;
  public profile: SystemProfileModelGraphQL;
  public log: Logger = new PrefixLogger(this.graphql_client.log, this.serialNumber);
  public events: EventEmitter = new EventEmitter().setMaxListeners(100);

  private unified: UnifiedSystemModelGraphQL;

  constructor(
    protected readonly graphql_client: InfinityGraphQLClient,
    public readonly serialNumber: string,
  ) {
    const api_logger = new PrefixLogger(this.log, 'API');

    // Create unified model that fetches all data
    this.unified = new UnifiedSystemModelGraphQL(
      graphql_client,
      serialNumber,
      api_logger,
      this.events,
    );

    // Create facade models that delegate to unified model
    this.status = new SystemStatusModelGraphQL(this.unified);
    this.profile = new SystemProfileModelGraphQL(this.unified);
    this.config = new SystemConfigModelGraphQL(
      this.unified,
      graphql_client,
      api_logger,
      this.events,
    );

    // Periodically fetch to keep data fresh
    // Note: No activate() call needed with GraphQL API
    setInterval(() => {
      this.status.fetch();
    }, 30 * 60 * 1000); // every 30 min
  }
}
