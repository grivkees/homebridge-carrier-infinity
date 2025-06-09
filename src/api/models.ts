import { processSetpointDeadband } from '../helpers';
import { MemoizeExpiring } from 'typescript-memoize';
import { Mutex, tryAcquire, E_ALREADY_LOCKED, E_CANCELED, E_TIMEOUT } from 'async-mutex';
import * as xml2js from 'xml2js';
import { Logger } from 'homebridge';
import hash from 'object-hash';
import { PrefixLogger } from '../helper_logging';
import { InfinityRestClient } from './rest_client';
import Axios from 'axios';
import EventEmitter from 'events';

import Config, {Zone as CZone, Activity3 as CActivity} from './interface_config';
import Location from './interface_locations';
import Profile from './interface_profile';
import Status, {Zone as SZone} from './interface_status';
import { ACTIVITY, FAN_MODE, SYSTEM_MODE, STATUS, SUBSCRIPTION } from './constants';

abstract class BaseModel {
  protected data_object!: object;
  protected data_object_hash?: string;
  protected HASH_IGNORE_KEYS = new Set<string>();
  protected write_lock: Mutex;
  protected log: Logger = new PrefixLogger(this.infinity_client.log, 'API');

  constructor(
    protected readonly infinity_client: InfinityRestClient,
  ) {
    this.write_lock = new Mutex();
  }

  abstract getPath(): string;

  protected hashDataObject(data?: object): string {
    return hash(
      data || this.data_object,
      {excludeKeys: (key) => {
        return this.HASH_IGNORE_KEYS.has(key);
      }},
    );
  }

  @MemoizeExpiring(10 * 1000)
  async fetch(): Promise<void> {
    // If push is ongoing, skip this update fetch. The push will do a fetch.
    try {
      await tryAcquire(this.write_lock).runExclusive(async () => {
        await this.forceFetch();
      });
    } catch (e) {
      if (e === E_ALREADY_LOCKED) {
        return;
      } else if (e === E_TIMEOUT || e === E_CANCELED) {
        this.log.error(`Deadlock on fetch ${e}. Report bug: https://bit.ly/3igbU7D`);
      } else {
        this.log.error(
          'Failed to fetch updates: ',
          Axios.isAxiosError(e) ? e.message : e,
        );
      }
    }
  }

  protected async forceFetch(): Promise<void> {
    const [data_object_hash, data_object] = await this.forceFetchInternal();
    this.data_object = data_object;
    this.data_object_hash = data_object_hash;
  }

  protected async forceFetchInternal(): Promise<[string, object]> {
    await this.infinity_client.refreshToken();
    await this.infinity_client.activate();
    const response = await this.infinity_client.axios.get(this.getPath());
    if (response.data) {
      const data_object = await xml2js.parseStringPromise(response.data) as object;
      const data_object_hash = this.hashDataObject(data_object);
      return [data_object_hash, data_object];
    } else {
      this.log.debug(response.data);
      throw new Error('Response from API contained errors.');
    }
  }
}

export class LocationsModel extends BaseModel {
  protected data_object!: Location;

  getPath(): string {
    return `/users/${this.infinity_client.username}/locations`;
  }

  async getSystems(): Promise<string[]> {
    await this.fetch();
    const systems: string[] = [];
    for (const location of this.data_object.locations.location) {
      for (const system of location.systems[0].system || []) {
        const link_parts = system['atom:link'][0]['$']['href'].split('/');
        systems.push(link_parts[link_parts.length - 1]);
      }
    }
    return systems;
  }
}

abstract class BaseSystemModel extends BaseModel {
  private last_updated = 0;  // TODO use this
  protected HASH_IGNORE_KEYS = new Set<string>(['timestamp', 'localTime']);

  constructor(
    protected readonly infinity_client: InfinityRestClient,
    public readonly serialNumber: string,
    protected readonly log: Logger,
    protected readonly events: EventEmitter,
  ) {
    super(infinity_client);
  }

  protected async forceFetch(): Promise<void> {
    const old_hash = this.data_object_hash;
    await super.forceFetch();
    const new_hash = this.data_object_hash;
    const top_level_key = Object.keys(this.data_object)[0];
    const ts = this.data_object[top_level_key].timestamp[0];
    this.last_updated = Date.parse(ts);
    this.log.debug(`TIMESTAMP ${this.getPath()} reports ${ts} (${this.last_updated})`);
    if (old_hash !== new_hash) {
      this.events.emit(`updated_${top_level_key}`);
    }
  }
}

export class SystemProfileModel extends BaseSystemModel {
  protected data_object!: Profile;

  getPath(): string {
    return `/systems/${this.serialNumber}/profile`;
  }

  async getName(): Promise<string> {
    await this.fetch();
    return this.data_object.system_profile.name[0];
  }

  async getBrand(): Promise<string> {
    await this.fetch();
    return this.data_object.system_profile.brand[0];
  }

  async getModel(): Promise<string> {
    await this.fetch();
    return this.data_object.system_profile.model[0];
  }

  async getFirmware(): Promise<string> {
    await this.fetch();
    return this.data_object.system_profile.firmware[0];
  }

  async getZones(): Promise<Array<string>> {
    await this.fetch();
    return this.data_object.system_profile.zones[0].zone.filter(
      (zone: { present: string[] }) => zone['present'][0] === STATUS.ON,
    ).map(
      (zone) => zone['$'].id,
    );
  }
}

export class SystemStatusModel extends BaseSystemModel {
  protected data_object!: Status;

  getPath(): string {
    return `/systems/${this.serialNumber}/status`;
  }

  async getUnits(): Promise<string> {
    await this.fetch();
    return this.data_object.status.cfgem[0];
  }

  async getOutdoorTemp(): Promise<number> {
    await this.fetch();
    return Number(this.data_object.status.oat[0]);
  }

  async getFilterUsed(): Promise<number> {
    await this.fetch();
    return Number(this.data_object.status.filtrlvl[0]);
  }

  async getMode(): Promise<string> {
    await this.fetch();
    const raw_mode = this.data_object.status.mode[0];
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

  private async getZone(zone: string): Promise<SZone> {
    await this.fetch();
    return this.data_object.status.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;
  }

  async getZoneConditioning(zone: string): Promise<string> {
    const raw_mode = (await this.getZone(zone)).zoneconditioning![0];
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
    const zone_obj = await this.getZone(zone);
    if (zone_obj.damperposition![0] === '0') {
      return FAN_MODE.OFF;
    } else {
      return zone_obj.fan[0];
    }
  }

  async getZoneOpen(zone: string): Promise<boolean> {
    return (await this.getZone(zone)).damperposition![0] !== '0';
  }

  async getZoneTemp(zone: string): Promise<number> {
    return Number((await this.getZone(zone)).rt[0]);
  }

  async getZoneHumidity(zone: string): Promise<number> {
    return Number((await this.getZone(zone)).rh[0]);
  }

  async getZoneActivity(zone: string): Promise<string> {
    return (await this.getZone(zone)).currentActivity![0];
  }

  async getZoneCoolSetpoint(zone: string): Promise<number> {
    return Number((await this.getZone(zone)).clsp[0]);
  }

  async getZoneHeatSetpoint(zone: string): Promise<number> {
    return Number((await this.getZone(zone)).htsp[0]);
  }
}

export class SystemConfigModelReadOnly extends BaseSystemModel {
  protected data_object!: Config;

  getPath(): string {
    return `/systems/${this.serialNumber}/config`;
  }

  protected static getUnits(data_object: Config): string {
    return data_object.config.cfgem[0];
  }

  async getUnits(): Promise<string> {
    await this.fetch();
    return SystemConfigModelReadOnly.getUnits(this.data_object);
  }

  async getTempBounds(): Promise<[number, number]> {
    // TODO: Utility event isn't always set. Find somewhere else to get this #543
    await this.fetch();
    const utility_events = this.data_object.config.utilityEvent?.[0] || {'minLimit':['50'], 'maxLimit':['90']};
    return [Number(utility_events.minLimit[0]), Number(utility_events.maxLimit[0])];
  }

  async getMode(): Promise<string> {
    await this.fetch();
    return this.data_object.config.mode[0];
  }

  protected static getZone(data_object: Config, zone: string): CZone {
    return data_object.config.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;
  }

  protected async getZone(zone: string): Promise<CZone> {
    await this.fetch();
    return SystemConfigModelReadOnly.getZone(this.data_object, zone);
  }

  async getZoneName(zone: string): Promise<string> {
    const zone_obj = await this.getZone(zone);
    return zone_obj['name'][0];
  }

  async getZoneHoldStatus(zone: string): Promise<[string, string]> {
    const zone_obj = await this.getZone(zone);
    return [zone_obj['hold'][0], zone_obj['otmr'][0]];
  }

  protected static getZoneActivity(data_object: Config, zone: string): string {
    const zone_obj = SystemConfigModelReadOnly.getZone(data_object, zone);
    if (zone_obj.hold[0] === STATUS.ON) {
      return zone_obj.holdActivity![0];
    } else {
      const now = new Date();
      const program_obj = SystemConfigModelReadOnly.getZone(data_object, zone).program![0];
      const today_schedule = program_obj.day[now.getDay()].period.filter(period => period.enabled[0] === STATUS.ON).reverse();
      for (const i in today_schedule) {
        const time = today_schedule[i].time[0];
        const split = time.split(':');
        if (
          // The hour is past
          Number(split[0]) < now.getHours() ||
          // The hour is now, the minute is past
          (Number(split[0]) === now.getHours() && Number(split[1]) < now.getMinutes())
        ) {
          return today_schedule[i].activity[0];
        }
      }
      // If we got to the end without finding the next activity, it means the activity is the last from yesterday
      const yesterday_schedule = program_obj['day'][(now.getDay() + 8) % 7].period.filter(
        period => period.enabled[0] === STATUS.ON,
      ).reverse();
      return yesterday_schedule[0].activity[0];
    }
  }

  async getZoneActivity(zone: string): Promise<string> {
    await this.fetch();
    return SystemConfigModelReadOnly.getZoneActivity(this.data_object, zone);
  }

  protected static getZoneActivityConfig(data_object: Config, zone: string, activity_name: string): CActivity {
    // Vacation is stored somewhere else...
    if (activity_name === ACTIVITY.VACATION) {
      return {
        '$': {id: ACTIVITY.VACATION},
        clsp: data_object.config.vacmaxt,
        htsp: data_object.config.vacmint,
        fan: data_object.config.vacfan,
        previousFan: [],
      };
    }

    const activities_obj = SystemConfigModelReadOnly.getZone(data_object, zone).activities![0];
    return activities_obj['activity'].find(
      (activity: CActivity) => activity['$'].id === activity_name,
    )!;
  }

  protected async getZoneActivityConfig(zone: string, activity_name: string): Promise<CActivity> {
    await this.fetch();
    return SystemConfigModelReadOnly.getZoneActivityConfig(this.data_object, zone, activity_name);
  }

  async getZoneActivityFan(zone: string, activity: string): Promise<string> {
    const activity_obj = await this.getZoneActivityConfig(zone, activity);
    return activity_obj.fan[0];
  }

  async getZoneActivityCoolSetpoint(zone: string, activity: string): Promise<number> {
    const activity_obj = await this.getZoneActivityConfig(zone, activity);
    return Number(activity_obj.clsp[0]);
  }

  async getZoneActivityHeatSetpoint(zone: string, activity: string): Promise<number> {
    const activity_obj = await this.getZoneActivityConfig(zone, activity);
    return Number(activity_obj.htsp[0]);
  }

  async getZoneNextActivityTime(zone: string): Promise<string> {
    const now = new Date();
    const program_obj = (await this.getZone(zone)).program![0];
    const day_obj = program_obj['day'][now.getDay()];
    for (const i in day_obj['period']) {
      const time = day_obj['period'][i].time[0];
      const split = time.split(':');
      if (
        // The hour is nigh
        Number(split[0]) > now.getHours() ||
        // The hour is now, the minute is nigh
        (Number(split[0]) === now.getHours() && Number(split[1]) > now.getMinutes())
      ) {
        return time;
      }
    }
    // If we got to the end without finding the next activity, it means the next activity is the first from tomorrow
    const tomorrow_obj = program_obj['day'][(now.getDay() + 1) % 7];
    return tomorrow_obj['period'][0].time[0];
  }
}

interface ConfigMutation {
  (data_object: Config): void;
}

export class SystemConfigModel extends SystemConfigModelReadOnly {
  /*
   * A writable version of the system config model.
   *
   * Provides a set data api, which is cached locally, and periodically pushed
   * out to the carrier api.
   */
  mutations: ConfigMutation[] = [];

  // Skip fetching new data when we have a dirty local state.
  async fetch(): Promise<void> {
    if (this.mutations.length > 0) {
      return;
    }
    await super.fetch();
  }

  private async push(): Promise<void> {
    // While waiting to push to api, push locally to HK.
    this.events.emit(SUBSCRIPTION.CONFIG_MUTATE);
    // Wait a bit so we can catch other mutations that came in around the
    // same time.
    await new Promise(r => setTimeout(r, 2000));
    // We only ever need 2 pushes ongoing at a time. One active, and one pending.
    // The first one will handle mutations available at its start, and the next
    // one will cover mutations that arrived during the previous's run.
    // First, to make sure we only ever have one 'pending' push, cancel any other
    // possible 'pending' pushes, and make this one become the 'pending' push.
    this.write_lock.cancel();
    // Then, grab the lock. so this push can move from 'pending' to 'active'.
    try {
      await this.write_lock.runExclusive(async () => {
      // 1. Do mutations
        const mutated = await this.mutate();
        if (mutated === null) {
          return;
        }
        const [mutated_hash, mutated_data_object] = mutated;
        // 2. Push
        await this.forcePush(mutated_data_object);
        this.log.info('... pushing changes complete.');
        // 3. Confirm
        await new Promise(r => setTimeout(r, 5000));
        if (this.mutations.length > 0) {
          // If local state is dirty (from new mutations queued during push)
          // don't do a forceFetch or it will cause apparent bouncing, let the
          // next push refresh from remote api state.
          // This is safe because mutations are always done on a fresh fetched
          // config, even if local config is dirty or stale.
          return;
        }
        await this.forceFetch();
        if (mutated_hash === this.data_object_hash) {
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
        this.log.error(
          'Failed to push updates: ',
          Axios.isAxiosError(e) ? e.message : e,
        );
      }
    }
  }

  private async mutate(): Promise<[string, Config] | null> {
    // short circuit if no mutations in queue
    if (this.mutations.length === 0) {
      return null;
    }

    // Refresh config, to make sure we don't write back old data accidentally.
    const stale_hash = this.data_object_hash;
    const [fresh_hash, fresh_data_object] = await this.forceFetchInternal();
    if (stale_hash !== fresh_hash) {
      this.log.warn('Cached config was stale before mutation and push.');
    }

    // Take config mutations of the queue and run them against the fresh object.
    // This ensures we don't overwrite other data if the api config has changed,
    // and avoids a race condition where new mutations come in during the push.
    const mutated_data_object = fresh_data_object as Config;
    while(this.mutations.length > 0) {
      const m = this.mutations.shift();
      if (m) {
        m(mutated_data_object);
      }
    }
    const mutated_hash = this.hashDataObject(mutated_data_object);

    // If nothing actually changed, no need to push.
    if (fresh_hash === mutated_hash) {
      this.log.warn('Config doesn\'t appear to have changed. No changes sent.');
      return null;
    }

    return [mutated_hash, mutated_data_object];
  }

  private async forcePush(data_object: Config): Promise<void> {
    this.log.info('Pushing changes to carrier api...');
    const builder = new xml2js.Builder();
    const new_xml = builder.buildObject(data_object);
    const data = `data=${encodeURIComponent(new_xml)}`;
    await this.infinity_client.axios.post(
      this.getPath(),
      data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  }

  async setMode(mode: string): Promise<void> {
    this.log.debug('Setting mode to ' + mode);

    const m = (data_object: Config) => {
      SystemConfigModel.mutateMode(data_object, mode);
    };
    // Mutate the local state to propagate changes throughout HK.
    m(this.data_object);
    // Schedule the push event, but don't wait for it to return.
    this.mutations.push(m);
    this.push();
  }

  private static mutateMode(data_object: Config, mode: string): void {
    data_object.config.mode[0] = mode;
  }

  async setZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.log.debug(`Setting zone ${zone} activity to ${activity} until ${hold_until}`);

    const m = (data_object: Config) => {
      SystemConfigModel.mutateZoneActivityHold(data_object, zone, activity, hold_until);
    };
    // Mutate the local state to propagate changes throughout HK.
    m(this.data_object);
    // Schedule the push event, but don't wait for it to return.
    this.mutations.push(m);
    this.push();
  }

  private static mutateZoneActivityHold(
    data_object: Config,
    zone: string,
    activity: string,
    hold_until: string | null,
  ): void {
    const zone_obj = SystemConfigModel.getZone(data_object, zone);
    zone_obj['holdActivity']![0] = activity;
    zone_obj['hold'][0] = activity ? STATUS.ON : STATUS.OFF;
    zone_obj['otmr'][0] = activity ? hold_until || '' : '';
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

    const m = (data_object: Config) => {
      // Modify MANUAL activity to the requested setpoints
      SystemConfigModel.mutateZoneActivityManualHold(data_object, zone, clsp, htsp, fan);
      // Set hold to MANUAL activity
      SystemConfigModel.mutateZoneActivityHold(data_object, zone, ACTIVITY.MANUAL, hold_until);

    };

    // Mutate the local state to propagate changes throughout HK.
    m(this.data_object);
    // Schedule the push event, but don't wait for it to return.
    this.mutations.push(m);
    this.push();
  }

  private static mutateZoneActivityManualHold(
    data_object: Config,
    zone: string,
    clsp: number | null,
    htsp: number | null,
    fan: string | null = null,
  ): void {
    const zone_obj = SystemConfigModel.getZone(data_object, zone);
    // When moving to manual activity, default to prev activity settings.
    const manual_activity_obj = SystemConfigModel.getZoneActivityConfig(data_object, zone, ACTIVITY.MANUAL);
    if (zone_obj['holdActivity']![0] !== ACTIVITY.MANUAL) {
      const prev_activity_obj = SystemConfigModel.getZoneActivityConfig(
        data_object,
        zone,
        SystemConfigModel.getZoneActivity(data_object, zone),
      );
      manual_activity_obj['clsp'][0] = prev_activity_obj['clsp'][0];
      manual_activity_obj['htsp'][0] = prev_activity_obj['htsp'][0];
      manual_activity_obj['fan'][0] = prev_activity_obj['fan'][0];
    }
    // Set setpoints on manual activity
    [htsp, clsp] = processSetpointDeadband(
      htsp || parseFloat(manual_activity_obj['htsp'][0]),
      clsp || parseFloat(manual_activity_obj['clsp'][0]),
      SystemConfigModel.getUnits(data_object),
      // when setpoints are too close, make clsp sticky when no change made to htsp
      htsp === null,
    );
    manual_activity_obj['htsp'][0] = htsp.toFixed(1);
    manual_activity_obj['clsp'][0] = clsp.toFixed(1);
    // Set fan on manual activity
    if (fan) {
      manual_activity_obj['fan'][0] = fan;
    }
  }
}

export class SystemModel {
  public status: SystemStatusModel;
  public config: SystemConfigModel;
  public profile: SystemProfileModel;
  public log: Logger = new PrefixLogger(this.infinity_client.log, this.serialNumber);
  public events: EventEmitter = new EventEmitter().setMaxListeners(100);

  constructor(
    protected readonly infinity_client: InfinityRestClient,
    public readonly serialNumber: string,
  ) {
    const api_logger = new PrefixLogger(this.log, 'API');
    this.status = new SystemStatusModel(
      infinity_client,
      serialNumber,
      api_logger,
      this.events,
    );
    this.config = new SystemConfigModel(
      infinity_client,
      serialNumber,
      api_logger,
      this.events,
    );
    this.profile = new SystemProfileModel(
      infinity_client,
      serialNumber,
      api_logger,
      this.events,
    );
    // Periodically ping the carrier api to keep it in sync with the thermostat.
    // By fetching status, we both make sure 'activate' gets called, and
    // internal state of status is updated, which will push updates to HK.
    setInterval(() => {
      this.status.fetch();
    }, 30 * 60 * 1000); // every 30 min
  }
}