import { INFINITY_API_BASE_URL, INFINITY_API_CONSUMER_KEY, INFINITY_API_CONSUMER_SECRET } from './settings';

import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import oauthSignature from 'oauth-signature';
import { MemoizeExpiring } from 'typescript-memoize';
import * as xml2js from 'xml2js';

export const SYSTEM_MODE = {
  OFF: 'off',
  COOL: 'cool',
  HEAT: 'heat',
  AUTO: 'auto',
};

class OAuthHeaders {
  static genHeader(httpMethod: string, url: string, username: string, token: string): string {
    // Needed for header and sig
    const sig_params = {
      oauth_consumer_key : INFINITY_API_CONSUMER_KEY,
      oauth_token : username,
      oauth_signature_method : 'HMAC-SHA1',
      oauth_timestamp : Math.floor(Date.now() / 1000),
      // TODO: make nonce bigger
      oauth_nonce : Math.floor(Math.random() * 100000000000) + 1,
      oauth_version : '1.0',
    };
    // Make the sig
    const signature = oauthSignature.generate(httpMethod, url, sig_params, INFINITY_API_CONSUMER_SECRET, token);
    // Turn into header
    const header_params = [
      `realm=${encodeURIComponent(url)}`,
    ];
    for (const k in sig_params) {
      header_params.push(
        `${k}=${sig_params[k]}`,
      );
    }
    header_params.push(`oauth_signature=${signature}`);
    return `OAuth ${header_params.join(',')}`;
  }

  static intercept(config: AxiosRequestConfig, username: string, token: string): AxiosRequestConfig {
    config.headers.Authorization = this.genHeader(config.method || 'GET', config.url || '/', username, token);
    return config;
  }
}

export class InfinityEvolutionOpenApi {
  private token = '';
  private token_refresh_days = 30;
  private token_last_update = 0;
  public username: string;
  private password: string;
  public axios: AxiosInstance;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;

    this.axios = Axios.create({
      baseURL: INFINITY_API_BASE_URL,
      headers: {
        featureset: 'CONSUMER_PORTAL',
        Accept: 'application/xml',
      },
    });
    this.axios.interceptors.request.use(config => OAuthHeaders.intercept(config, this.username, this.token));
  }

  async maybeRefreshToken(): Promise<void> {
    // Only refresh if token is old
    if (
      this.token_last_update + (this.token_refresh_days * 24 * 60 * 60 * 1000) <
      Date.now()
    ) {
      await this.refreshToken();
    }
    // TODO: if token isn't working, also force refresh
  }

  async refreshToken(): Promise<void> {
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
    this.token_last_update = Date.now();
  }
}

abstract class BaseInfinityEvolutionApi {
  // TODO make unknown and handle type checking in getters
  protected data_object: any = null;

  constructor(
    protected readonly InfinityEvolutionOpenApi: InfinityEvolutionOpenApi,
  ) {}

  abstract getPath(): string;

  @MemoizeExpiring(30 * 1000)
  async fetch(): Promise<void> {
    await this.forceFetch();
  }

  protected async forceFetch(): Promise<void> {
    await this.InfinityEvolutionOpenApi.maybeRefreshToken();
    // TODO: handle errors
    const response = await this.InfinityEvolutionOpenApi.axios.get(this.getPath());
    this.data_object = await xml2js.parseStringPromise(response.data);
  }

  async push(): Promise<void> {
    const builder = new xml2js.Builder();
    const new_xml = builder.buildObject(this.data_object);
    // TODO: POST new_xml back
    console.log(new_xml);
  }
}

export class InfinityEvolutionLocations extends BaseInfinityEvolutionApi {
  constructor(api: InfinityEvolutionOpenApi) {
    super(api);
  }

  getPath(): string {
    return `/users/${this.InfinityEvolutionOpenApi.username}/locations`;
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

abstract class BaseInfinityEvolutionSystemApi extends BaseInfinityEvolutionApi {
  protected data_object: any = null;

  constructor(
    api: InfinityEvolutionOpenApi,
    public readonly serialNumber: string,
  ) {
    super(api);
  }
}

export class InfinityEvolutionSystemStatus extends BaseInfinityEvolutionSystemApi {
  constructor(api: InfinityEvolutionOpenApi, serialNumber: string) {
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

  async getZoneSetpoint(zone = 0): Promise<number> {
    // TODO make based on mode
    return Number((await this.getZone(zone)).clsp[0]);
  }

  async getZoneCoolSetpoint(zone = 0): Promise<number> {
    return Number((await this.getZone(zone)).clsp[0]);
  }

  async getZoneHeatSetpoint(zone = 0): Promise<number> {
    return Number((await this.getZone(zone)).htsp[0]);
  }
}

export class InfinityEvolutionSystemConfig extends BaseInfinityEvolutionSystemApi {
  constructor(api: InfinityEvolutionOpenApi, serialNumber: string) {
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

  // TODO: this should have a mutex on it
  async set(key: string, value: string): Promise<void> {
    await this.forceFetch();
    // TODO modify this.data_object
    await this.push();
  }
}
