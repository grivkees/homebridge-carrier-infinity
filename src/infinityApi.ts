import { INFINITY_API_BASE_URL, INFINITY_API_CONSUMER_KEY, INFINITY_API_CONSUMER_SECRET } from './settings';

import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import oauthSignature from 'oauth-signature';
import { MemoizeExpiring } from 'typescript-memoize';
import { Mutex } from 'async-mutex';
import * as xml2js from 'xml2js';
import { Logger } from 'homebridge';

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
  protected write_lock: Mutex;

  constructor(
    protected readonly api_connection: InfinityEvolutionApiConnection,
  ) {
    this.write_lock = new Mutex();
  }

  abstract getPath(): string;

  @MemoizeExpiring(10 * 1000)
  async fetch(): Promise<void> {
    await this.forceFetch();
  }

  protected async forceFetch(): Promise<void> {
    await this.api_connection.refreshToken();
    try {
      const response = await this.api_connection.axios.get(this.getPath());
      this.data_object = await xml2js.parseStringPromise(response.data);
    } catch (error) {
      if (Axios.isAxiosError(error)) {
        this.api_connection.log.error('Failed to fetch updates (axios): ', error.message);
      } else {
        this.api_connection.log.error('Failed to fetch updates (unknown): ', error);
      }
    }
  }

  async push(): Promise<void> {
    await this.write_lock.runExclusive(async () => {
      await this.pushUnsafe();
    });
  }

  private async pushUnsafe(): Promise<void> {
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
    await this.forceFetch();
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
  public last_updated = 0;

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
      (zone: { present: string[] }) => zone['present'][0] === 'on',
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
        return SYSTEM_MODE.HEAT;
      case 'dehumidify':
        return SYSTEM_MODE.COOL;
      default:
        return raw_mode;
    }
  }

  private async getZone(zone: string): Promise<Zone> {
    await this.fetch();
    return this.data_object.status.zones[0].zone[zone];
  }

  async getZoneConditioning(zone: string): Promise<string> {
    const raw_mode = (await this.getZone(zone)).zoneconditioning![0];
    switch(raw_mode) {
      case 'active_heat':
        return SYSTEM_MODE.HEAT;
      case 'active_cool':
        return SYSTEM_MODE.COOL;
      default:
        return SYSTEM_MODE.OFF;
    }
  }

  async getZoneFan(zone: string): Promise<string> {
    return (await this.getZone(zone)).fan[0];
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

  async setMode(mode: string): Promise<void> {
    await this.forceFetch();
    if (mode !== await this.getMode()) {
      this.data_object.config.mode[0] = mode;
      await this.push();  
    }
  }

  private async getZone(zone: string): Promise<Zone> {
    await this.fetch();
    return this.data_object.config.zones[0].zone[zone.toString()];
  }

  async getZoneName(zone: string): Promise<string> {
    const zone_obj = await this.getZone(zone);
    return zone_obj['name'][0];
  }

  async getZoneActivity(zone: string): Promise<string> {
    const zone_obj = await this.getZone(zone);
    if (zone_obj.hold[0] === 'on') {
      return zone_obj.holdActivity![0];
    } else {
      const now = new Date();
      const program_obj = (await this.getZone(zone)).program![0];
      const today_schedule = program_obj.day[now.getDay()].period.filter(period => period.enabled[0] === 'on').reverse();
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
      const yesterday_schedule = program_obj['day'][(now.getDay() + 8) % 7].period.filter(period => period.enabled[0] === 'on').reverse();
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

  private async roundSetpoint(temp: number): Promise<string> {
    if (await this.getUnits() === 'F') {
      // Increments of 1
      return temp.toFixed(0);
    } else {
      // Increments of .5
      return (Math.round(temp * 2) / 2).toFixed(1);
    }
  }

  // TODO: this is unsafe if clsp and htsp are called at the same time, one could undo the other.
  async setZoneActivity(
    zone: string,
    clsp: number | null,
    htsp: number | null,
    hold_until: string | null,
    fan: string | null = null,
  ): Promise<void> {
    await this.forceFetch();
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
    // Set to manual activity
    zone_obj['holdActivity']![0] = ACTIVITY.MANUAL;
    zone_obj['hold'][0] = 'on';
    zone_obj['otmr'][0] = hold_until || '';
    // Set setpoints on manual activity
    if (clsp) {
      manual_activity_obj['clsp'][0] = await this.roundSetpoint(clsp);
    }
    if (htsp) {
      manual_activity_obj['htsp'][0] = await this.roundSetpoint(htsp);
    }
    if (fan) {
      manual_activity_obj['fan'][0] = fan;
    }
    await this.push();
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