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

  async getSystems(): Promise<Record<string, string>> {
    await this.fetch();
    const systems = {};
    const locations = this.data_object.locations.location;
    for (const i in locations) {
      const locaton = locations[i];
      for (const j in locaton.systems) {
        const system = locaton.systems[j].system[0];
        const linkparts = system['atom:link'][0]['$']['href'].split('/');
        const name = system['atom:link'][0]['$']['title'];
        systems[name] = linkparts[linkparts.length - 1];
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

  async getMode(): Promise<string> {
    await this.fetch();
    const raw_mode = this.data_object.status.mode[0];
    switch(raw_mode) {
      case 'gasheat':
      case 'electrc':
        return SYSTEM_MODE.HEAT;
      default:
        return raw_mode;
    }
  }

  private async getZone(zone: number): Promise<Record<string, string>> {
    await this.fetch();
    return this.data_object.status.zones[0].zone[zone.toString()];
  }

  async getZoneTemp(zone = 0): Promise<number> {
    return Number((await this.getZone(zone)).rt[0]);
  }

  async getZoneActivity(zone = 0): Promise<string> {
    return (await this.getZone(zone)).currentActivity[0];
  }

  async getZoneCoolSetpoint(zone = 0): Promise<number> {
    return Number((await this.getZone(zone)).clsp[0]);
  }

  async getZoneHeatSetpoint(zone = 0): Promise<number> {
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

  private async getZone(zone = 0): Promise<Record<string, Array<unknown>>> {
    await this.fetch();
    return this.data_object.config.zones[0].zone[zone.toString()];
  }

  async getZoneActivity(zone = 0): Promise<string | null> {
    const zone_obj = await this.getZone(zone);
    if (zone_obj['hold'][0] === 'on' && typeof zone_obj['holdActivity'][0] === 'string') {
      return zone_obj['holdActivity'][0];
    }
    return null;
  }

  private async getZoneActivityConfig(zone = 0, activity: string): Promise<Record<string, Array<string>>> {
    const activites_obj = (await this.getZone(zone))['activities'][0];
    if (typeof activites_obj === 'object' && activites_obj !== null) {
      for (const i in activites_obj['activity']) {
        if (activites_obj['activity'][i]['$'].id === activity) {
          return activites_obj['activity'][i];
        }
      }
    }
    throw new Error('Error parsing zone activities config.');
  }

  async getZoneActivityCoolSetpoint(zone = 0, activity: string): Promise<number> {
    const activity_obj = await this.getZoneActivityConfig(zone, activity);
    return Number(activity_obj.clsp[0]);
  }

  async getZoneActivityHeatSetpoint(zone = 0, activity: string): Promise<number> {
    const activity_obj = await this.getZoneActivityConfig(zone, activity);
    return Number(activity_obj.htsp[0]);
  }

  // TODO: this is unsafe if clsp and htsp are called at the same time, one could undo the other.
  async setZoneSetpoints(
    zone = 0,
    clsp: number | null,
    htsp: number | null,
  ): Promise<void> {
    await this.forceFetch();
    // Set to manual activity
    const zone_obj = await this.getZone(zone);
    zone_obj['holdActivity'][0] = 'manual';
    zone_obj['hold'][0] = 'on';
    // TODO: set manual expire time to beginning of next scheduled activity
    zone_obj['otmr'][0] = '02:30';
    // Set setpoints on manual activity
    const activity_obj = await this.getZoneActivityConfig(zone, 'manual');
    if (clsp) {
      activity_obj['clsp'][0] = clsp.toFixed(1);
    }
    if (htsp) {
      activity_obj['htsp'][0] = htsp.toFixed(1);
    }
    await this.push();
  }
}
