import { INFINITY_API_BASE_URL, INFINITY_API_CONSUMER_KEY, INFINITY_API_CONSUMER_SECRET } from './settings';

import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import oauthSignature from 'oauth-signature';
import { MemoizeExpiring } from 'typescript-memoize';
import { Mutex } from 'async-mutex';
import * as xml2js from 'xml2js';

export const SYSTEM_MODE = {
  OFF: 'off',
  COOL: 'cool',
  HEAT: 'heat',
  AUTO: 'auto',
};

export const ACTIVITY = {
  HOME: 'home',
  AWAY: 'away',
  SLEEP: 'sleep',
  WAKE: 'wake',
  MANUAL: 'manual',
  VACATION: 'vacation',
};

interface BaseElement {
  '$': {id: string};
}

interface ZoneActivity extends BaseElement {
  clsp: string[];
  htsp: string[];
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
  rt: string[];
  rh: string[];
  clsp: string[];
  htsp: string[];
  currentActivity?: string[];
  hold: string[];
  holdActivity?: string[];
  activities?: ZoneActivity[];
  program?: ZoneProgram[];
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
    config.headers.Authorization = this.genHeader(config.method || 'GET', config.url || '/', username, token, config.data);
    return config;
  }
}

export class InfinityEvolutionApi {
  private token = '';
  public axios: AxiosInstance;

  constructor(
    public username: string,
    private password: string) {
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
    const loginxml = '<credentials>'
      + `<username>${this.username}</username>`
      + `<password>${this.password}</password>`
      + '</credentials>';
    const data = `data=${encodeURIComponent(loginxml)}`;

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
    // TODO: handle possible errors
    this.token = response.data['result']['accessToken'];
  }
}

abstract class BaseInfinityEvolutionApiModel {
  // TODO make unknown and handle type checking in getters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected data_object: any = null;
  protected write_lock: Mutex;

  constructor(
    protected readonly InfinityEvolutionApi: InfinityEvolutionApi,
  ) {
    this.write_lock = new Mutex();
  }

  abstract getPath(): string;

  @MemoizeExpiring(10 * 1000)
  async fetch(): Promise<void> {
    await this.forceFetch();
  }

  protected async forceFetch(): Promise<void> {
    await this.InfinityEvolutionApi.refreshToken();
    // TODO: handle errors
    const response = await this.InfinityEvolutionApi.axios.get(this.getPath());
    this.data_object = await xml2js.parseStringPromise(response.data);
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
    // TODO: handle errors
    await this.InfinityEvolutionApi.axios.post(
      this.getPath(),
      data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    await this.forceFetch();
  }
}

export class InfinityEvolutionLocations extends BaseInfinityEvolutionApiModel {
  constructor(api: InfinityEvolutionApi) {
    super(api);
  }

  getPath(): string {
    return `/users/${this.InfinityEvolutionApi.username}/locations`;
  }

  async getSystems(): Promise<string[]> {
    await this.fetch();
    const systems: string[] = [];
    for (const location of this.data_object.locations.location) {
      for (const system of location.systems[0].system) {
        const linkparts = system['atom:link'][0]['$']['href'].split('/');
        systems.push(linkparts[linkparts.length - 1]);
      }
    }
    return systems;
  }
}

abstract class BaseInfinityEvolutionSystemApiModel extends BaseInfinityEvolutionApiModel {
  public last_updated = 0;

  constructor(
    api: InfinityEvolutionApi,
    public readonly serialNumber: string,
  ) {
    super(api);
  }

  protected async forceFetch(): Promise<void> {
    await super.forceFetch();
    const top_level_key = Object.keys(this.data_object)[0];
    this.last_updated = Date.parse(this.data_object[top_level_key].timestamp[0]);
  }
}

export class InfinityEvolutionSystemProfile extends BaseInfinityEvolutionSystemApiModel {
  constructor(api: InfinityEvolutionApi, serialNumber: string) {
    super(api, serialNumber);
  }

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
  constructor(api: InfinityEvolutionApi, serialNumber: string) {
    super(api, serialNumber);
  }

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

  async getMode(): Promise<string> {
    await this.fetch();
    const raw_mode = this.data_object.status.mode[0];
    switch(raw_mode) {
      case 'gasheat':
      case 'electric':
        return SYSTEM_MODE.HEAT;
      case 'dehumidify':
        return SYSTEM_MODE.COOL;
      case 'fanonly':
        return SYSTEM_MODE.OFF;
      default:
        return raw_mode;
    }
  }

  private async getZone(zone: string): Promise<Zone> {
    await this.fetch();
    return this.data_object.status.zones[0].zone[zone];
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
  constructor(api: InfinityEvolutionApi, serialNumber: string) {
    super(api, serialNumber);
  }

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
      };
    }

    const activites_obj = (await this.getZone(zone)).activities![0];
    return activites_obj['activity'].find(
      (activity: ZoneActivity) => activity['$'].id === activity_name,
    );
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
  async setZoneSetpoints(
    zone: string,
    clsp: number | null,
    htsp: number | null,
    hold_until: string | null,
  ): Promise<void> {
    await this.forceFetch();
    // Set to manual activity
    const zone_obj = await this.getZone(zone);
    zone_obj['holdActivity']![0] = ACTIVITY.MANUAL;
    zone_obj['hold'][0] = 'on';
    zone_obj['otmr'][0] = hold_until || '';
    // Set setpoints on manual activity
    const activity_obj = await this.getZoneActivityConfig(zone, ACTIVITY.MANUAL);
    if (clsp) {
      activity_obj['clsp'][0] = await this.roundSetpoint(clsp);
    }
    if (htsp) {
      activity_obj['htsp'][0] = await this.roundSetpoint(htsp);
    }
    await this.push();
  }
}
