import { processSetpointDeadband } from './helpers';
import { INFINITY_API_BASE_URL, INFINITY_API_CONSUMER_KEY, INFINITY_API_CONSUMER_SECRET } from './settings';

import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import oauthSignature from 'oauth-signature';
import { MemoizeExpiring } from 'typescript-memoize';
import { Mutex, tryAcquire, E_ALREADY_LOCKED, E_CANCELED } from 'async-mutex';
import * as xml2js from 'xml2js';
import { Logger } from 'homebridge';
import hash from 'object-hash';

export const SYSTEM_MODE = {
  OFF: 'off',
  COOL: 'cool',
  HEAT: 'heat',
  AUTO: 'auto',
  FAN_ONLY: 'fanonly',
};

export const ACTIVITY = {
  HOME: 'home',
  AWAY: 'away',
  SLEEP: 'sleep',
  WAKE: 'wake',
  MANUAL: 'manual',
  VACATION: 'vacation',
};

export const FAN_MODE = {
  OFF: 'off',
  LOW: 'low',
  MED: 'med',
  HIGH: 'high',
};

export const STATUS = {
  ON: 'on',
  OFF: 'off',
};

interface BaseElement {
  '$': {id: string};
}

interface ZoneActivity extends BaseElement {
  clsp: string[];
  htsp: string[];
  fan: string[];
}

interface ZoneProgram {
  day: {
    period: {
      time: string[];
      activity: string[];
      enabled: string[];
    }[];
  }[];
}

interface Zone {
  name: string[];
  fan: string[];
  rt: string[];
  rh: string[];
  clsp: string[];
  htsp: string[];
  currentActivity?: string[];
  hold: string[];
  holdActivity?: string[];
  activities?: ZoneActivity[];
  program?: ZoneProgram[];
  zoneconditioning?: string[];
  damperposition?: string[];
}

class OAuthHeaders {
  static genHeader(httpMethod: string, url: string, username: string, token: string, data: string | null): string {
    // Needed for header and sig
    const sig_header_params = {
      oauth_consumer_key : INFINITY_API_CONSUMER_KEY,
      oauth_token : username,
      oauth_signature_method : 'HMAC-SHA1',
      oauth_timestamp : Math.floor(Date.now() / 1000),
      // TODO: make nonce bigger
      oauth_nonce : Math.floor(Math.random() * 100000000000) + 1,
      oauth_version : '1.0',
    };

    // If there is post data, we need to include it
    const sig_body_params = {};
    if (data) {
      const pairs = data.split('&');
      for (const i in pairs) {
        const pair = pairs[i].split('=');
        sig_body_params[pair[0]] = decodeURIComponent(pair[1]);
      }
    }
    const sig_params = Object.assign({}, sig_header_params, sig_body_params);


    // Make the sig
    const signature = oauthSignature.generate(httpMethod, url, sig_params, INFINITY_API_CONSUMER_SECRET, token);
    // Turn into header
    const header_params = [
      `realm=${encodeURIComponent(url)}`,
    ];
    for (const k in sig_header_params) {
      header_params.push(
        `${k}=${sig_params[k]}`,
      );
    }
    header_params.push(`oauth_signature=${signature}`);
    return `OAuth ${header_params.join(',')}`;
  }

  static intercept(config: AxiosRequestConfig, username: string, token: string): AxiosRequestConfig {
    if (config.headers === undefined) {
      config.headers = {};
    }
    config.headers.Authorization = this.genHeader(config.method || 'GET', config.url || '/', username, token, config.data);
    return config;
  }
}

export class InfinityEvolutionApiConnection {
  private token = '';
  public axios: AxiosInstance;

  constructor(
    public username: string,
    private password: string,
    public readonly log: Logger) {
    this.axios = Axios.create({
      baseURL: INFINITY_API_BASE_URL,
      headers: {
        featureset: 'CONSUMER_PORTAL',
        Accept: 'application/xml',
      },
    });
    this.axios.interceptors.request.use(config => OAuthHeaders.intercept(config, this.username, this.token));
  }

  @MemoizeExpiring(24 * 60 * 60 * 1000) // every 24 hrs
  async refreshToken(): Promise<void> {
    await this.forceRefreshToken();
  }

  // TODO: on some api errors, force a refresh
  private async forceRefreshToken(): Promise<void> {
    const builder = new xml2js.Builder({cdata: true, headless: true});
    const new_xml = builder.buildObject({
      credentials: {
        username: this.username,
        password: this.password,
      },
    });
    const data = `data=${encodeURIComponent(new_xml)}`;

    try {
      const response = await this.axios.post(
        '/users/authenticated',
        data,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        },
      );

      if (response.data.error) {
        throw new Error('API returned error on status 2xx: ' + JSON.stringify(response.data));
      } else if (response.data.result) {
        this.token = response.data.result.accessToken;
      } else {
        throw new Error('Could not find refreshed api access token: ' + JSON.stringify(response.data));
      }
    } catch (error) {
      if (Axios.isAxiosError(error)) {
        this.log.error(
          'Could not refresh api access token: ', error.message,
          '\nStatus: ', error.response?.status,
          '\nData: ', error.response?.data,
        );
      } else {
        this.log.error('Could not refresh api access token: ', error);
      }
    }
  }
}

abstract class BaseInfinityEvolutionApiModel {
  // TODO make unknown and handle type checking in get methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected data_object: any = null;
  protected data_object_hash?: string;
  protected HASH_IGNORE_KEYS = new Set<string>();
  protected write_lock: Mutex;

  constructor(
    protected readonly api_connection: InfinityEvolutionApiConnection,
  ) {
    this.write_lock = new Mutex();
  }

  abstract getPath(): string;

  protected hashDataObject(): string {
    return hash(
      this.data_object,
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
      if (e !== E_ALREADY_LOCKED) {
        this.api_connection.log.error(`Deadlock on fetch ${e}. Report bug: https://bit.ly/3igbU7D`);
      }
    }
  }

  protected async forceFetch(): Promise<void> {
    await this.api_connection.refreshToken();
    try {
      const response = await this.api_connection.axios.get(this.getPath());
      this.data_object = await xml2js.parseStringPromise(response.data);
      this.data_object_hash = this.hashDataObject();
    } catch (error) {
      if (Axios.isAxiosError(error)) {
        this.api_connection.log.error('Failed to fetch updates (axios): ', error.message);
      } else {
        this.api_connection.log.error('Failed to fetch updates (unknown): ', error);
      }
    }
  }
}

export class InfinityEvolutionLocations extends BaseInfinityEvolutionApiModel {
  getPath(): string {
    return `/users/${this.api_connection.username}/locations`;
  }

  async getSystems(): Promise<string[]> {
    await this.fetch();
    const systems: string[] = [];
    for (const location of this.data_object.locations.location) {
      for (const system of location.systems[0].system) {
        const link_parts = system['atom:link'][0]['$']['href'].split('/');
        systems.push(link_parts[link_parts.length - 1]);
      }
    }
    return systems;
  }
}

abstract class BaseInfinityEvolutionSystemApiModel extends BaseInfinityEvolutionApiModel {
  private last_updated = 0;  // TODO use this
  protected HASH_IGNORE_KEYS = new Set<string>(['timestamp', 'localTime']);

  constructor(
    protected readonly api_connection: InfinityEvolutionApiConnection,
    public readonly serialNumber: string,
  ) {
    super(api_connection);
  }

  protected async forceFetch(): Promise<void> {
    await super.forceFetch();
    const top_level_key = Object.keys(this.data_object)[0];
    this.last_updated = Date.parse(this.data_object[top_level_key].timestamp[0]);
  }
}

export class InfinityEvolutionSystemProfile extends BaseInfinityEvolutionSystemApiModel {
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
      (zone: BaseElement) => zone['$'].id,
    );
  }
}

export class InfinityEvolutionSystemStatus extends BaseInfinityEvolutionSystemApiModel {
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

  private async getZone(zone: string): Promise<Zone> {
    await this.fetch();
    return this.data_object.status.zones[0].zone.find(
      (z: BaseElement) => z['$'].id === zone.toString(),
    );
  }

  async getZoneConditioning(zone: string): Promise<string> {
    const raw_mode = (await this.getZone(zone)).zoneconditioning![0];
    switch(raw_mode) {
      case 'active_heat':
      case 'prep_heat':
        return SYSTEM_MODE.HEAT;
      case 'active_cool':
      case 'prep_cool':
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

export class InfinityEvolutionSystemConfig extends BaseInfinityEvolutionSystemApiModel {
  getPath(): string {
    return `/systems/${this.serialNumber}/config`;
  }

  async getUnits(): Promise<string> {
    await this.fetch();
    return this.data_object.config.cfgem[0];
  }

  async getTempBounds(): Promise<[number, number]> {
    await this.fetch();
    const utility_events = this.data_object.config.utilityEvent[0];
    return [Number(utility_events.minLimit[0]), Number(utility_events.maxLimit[0])];
  }

  async getMode(): Promise<string> {
    await this.fetch();
    return this.data_object.config.mode[0];
  }

  private async getZone(zone: string): Promise<Zone> {
    await this.fetch();
    return this.data_object.config.zones[0].zone.find(
      (z: BaseElement) => z['$'].id === zone.toString(),
    );
  }

  async getZoneName(zone: string): Promise<string> {
    const zone_obj = await this.getZone(zone);
    return zone_obj['name'][0];
  }

  async getZoneHoldStatus(zone: string): Promise<[string, string]> {
    const zone_obj = await this.getZone(zone);
    return [zone_obj['hold'][0], zone_obj['otmr'][0]];
  }

  async getZoneActivity(zone: string): Promise<string> {
    const zone_obj = await this.getZone(zone);
    if (zone_obj.hold[0] === STATUS.ON) {
      return zone_obj.holdActivity![0];
    } else {
      const now = new Date();
      const program_obj = (await this.getZone(zone)).program![0];
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

  private async getZoneActivityConfig(zone: string, activity_name: string): Promise<ZoneActivity> {
    await this.fetch();
    // Vacation is stored somewhere else...
    if (activity_name === ACTIVITY.VACATION) {
      return {
        '$': {id: ACTIVITY.VACATION},
        clsp: this.data_object.config.vacmaxt,
        htsp: this.data_object.config.vacmint,
        fan: this.data_object.config.vacfan,
      };
    }

    const activities_obj = (await this.getZone(zone)).activities![0];
    return activities_obj['activity'].find(
      (activity: ZoneActivity) => activity['$'].id === activity_name,
    );
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

  /* Write APIs */
  mutations: (() => Promise<void>)[] = [];

  private async push(): Promise<void> {
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
        const mutated_hash = await this.mutate();
        if (mutated_hash === null) {
          return;
        }
        // 2. Push
        await this.forcePush();
        // 3. Confirm
        await new Promise(r => setTimeout(r, 5000));
        await this.forceFetch();
        if (mutated_hash === this.data_object_hash) {
          this.api_connection.log.info('Changes sent to carrier api successfully.');
        } else {
          this.api_connection.log.warn('Changes may not have successfully propagated to the carrier api.');
        }
      });
    } catch (e) {
      if (e !== E_CANCELED) {
        this.api_connection.log.error(`Deadlock on push ${e}. Report bug: https://bit.ly/3igbU7D`);
      }
    }
  }

  private async mutate(): Promise<string | null> {
    // short circuit if no mutations in queue
    if (this.mutations.length === 0) {
      return null;
    }

    // Refresh config.
    const old_hash = this.data_object_hash;
    await this.forceFetch();
    if (old_hash !== this.data_object_hash) {
      this.api_connection.log.warn(
        'Cached config was stale before mutation and push.',
      );
    }

    // Take config mutations of the queue and run them.
    // TODO make mutations non-async. these need to happen in order. and async
    // in a loop is an anti-pattern.
    while(this.mutations.length > 0) {
      const m = this.mutations.shift();
      if (m) {
        await m();
      }
    }
    const mutated_hash = this.hashDataObject();

    // If nothing actually changed, no need to push.
    if (old_hash === mutated_hash) {
      this.api_connection.log.warn(
        'Config doesn\'t appear to have changed. No changes sent.',
      );
      return null;
    }

    return mutated_hash;
  }

  private async forcePush(): Promise<void> {
    this.api_connection.log.info('Pushing changes to carrier api...');
    const builder = new xml2js.Builder();
    const new_xml = builder.buildObject(this.data_object);
    const data = `data=${encodeURIComponent(new_xml)}`;
    try {
      await this.api_connection.axios.post(
        this.getPath(),
        data,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    } catch (error) {
      if (Axios.isAxiosError(error)) {
        this.api_connection.log.error('Failed to push updates (axios): ', error.message);
      } else {
        this.api_connection.log.error('Failed to push updates (unknown): ', error);
      }
    }
  }

  async setMode(mode: string): Promise<void> {
    this.mutations.push(async () => {
      this.mutateMode(mode);
    });
    // Schedule the push event, but don't wait for it to return.
    this.push();
  }

  private mutateMode(mode: string): void {
    this.data_object.config.mode[0] = mode;
  }

  async setZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.mutations.push(async () => {
      await this.mutateZoneActivityHold(zone, activity, hold_until);
    });
    // Schedule the push event, but don't wait for it to return.
    this.push();
  }

  private async mutateZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    const zone_obj = await this.getZone(zone);
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
    // Modify MANUAL activity to the requested setpoints
    this.mutations.push(async () => {
      await this.mutateZoneActivityManualHold(zone, clsp, htsp, fan);
    });
    // Set hold to MANUAL activity
    this.mutations.push(async () => {
      await this.mutateZoneActivityHold(zone, ACTIVITY.MANUAL, hold_until);
    });
    // Schedule the push event, but don't wait for it to return.
    this.push();
  }

  private async mutateZoneActivityManualHold(
    zone: string,
    clsp: number | null,
    htsp: number | null,
    fan: string | null = null,
  ): Promise<void> {
    const zone_obj = await this.getZone(zone);
    // When moving to manual activity, default to prev activity settings.
    const manual_activity_obj = await this.getZoneActivityConfig(zone, ACTIVITY.MANUAL);
    if (zone_obj['holdActivity']![0] !== ACTIVITY.MANUAL) {
      const prev_activity_obj = await this.getZoneActivityConfig(
        zone,
        await this.getZoneActivity(zone),
      );
      manual_activity_obj['clsp'][0] = prev_activity_obj['clsp'][0];
      manual_activity_obj['htsp'][0] = prev_activity_obj['htsp'][0];
      manual_activity_obj['fan'][0] = prev_activity_obj['fan'][0];
    }
    // Set setpoints on manual activity
    [htsp, clsp] = processSetpointDeadband(
      htsp || parseFloat(manual_activity_obj['htsp'][0]),
      clsp || parseFloat(manual_activity_obj['clsp'][0]),
      await this.getUnits(),
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

export class InfinityEvolutionSystemModel {
  public status: InfinityEvolutionSystemStatus;
  public config: InfinityEvolutionSystemConfig;
  public profile: InfinityEvolutionSystemProfile;

  constructor(
    protected readonly api_connection: InfinityEvolutionApiConnection,
    public readonly serialNumber: string,
  ) {
    this.status = new InfinityEvolutionSystemStatus(
      api_connection,
      serialNumber,
    );
    this.config = new InfinityEvolutionSystemConfig(
      api_connection,
      serialNumber,
    );
    this.profile = new InfinityEvolutionSystemProfile(
      api_connection,
      serialNumber,
    );
  }
}