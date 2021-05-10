export const REACT_APP_INFINITY_BASE_URL = 'https://www.app-api.ing.carrier.com';
export const REACT_APP_INFINITY_CONSUMER_KEY = '8j30j19aj103911h';
export const REACT_APP_INFINITY_CONSUMER_SECRET = '0f5ur7d89sjv8d45';
const X_WWW_FORM_URLENCODED_HEADERS_CONFIG = {
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
};
import Axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Mutex } from 'async-mutex';
import oauthSignature from 'oauth-signature';

class OAuthHeaders {
  static genHeader(httpMethod: string, url: string, username: string, token: string): string {
    // Needed for header and sig
    const sig_params = {
      oauth_consumer_key : REACT_APP_INFINITY_CONSUMER_KEY,
      oauth_token : username,
      oauth_signature_method : 'HMAC-SHA1',
      oauth_timestamp : Math.floor(Date.now() / 1000),
      // TODO: make nonce bigger
      oauth_nonce : Math.floor(Math.random() * 100000000000) + 1,
      oauth_version : '1.0',
    };
    // Make the sig
    const signature = oauthSignature.generate(httpMethod, url, sig_params, REACT_APP_INFINITY_CONSUMER_SECRET, token);
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
  private username: string;
  private password: string;
  private axios: AxiosInstance;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;

    this.axios = Axios.create({
      baseURL: REACT_APP_INFINITY_BASE_URL,
      headers: {
        featureset: 'CONSUMER_PORTAL',
        Accept: 'application/json',
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
      X_WWW_FORM_URLENCODED_HEADERS_CONFIG,
    );
    // TODO: handle possible errors
    this.token = response.data['result']['accessToken'];
    this.token_last_update = Date.now();
  }

  async getSystems(): Promise<Record<string, string | number>> {
    await this.maybeRefreshToken();
    const systems = {};
    const response = await this.axios.get(`/users/${this.username}/locations`);
    // TODO: handle errors
    const locations = response.data.locations.location;
    for (const i in locations) {
      const locaton = locations[i];
      for (const j in locaton.systems) {
        const system = locaton.systems[j][0];
        const linkparts = system['atom:link']['$']['href'].split('/');
        const name = system['atom:link']['$']['title'];
        systems[name] = linkparts[linkparts.length - 1];
      }
    }
    return systems;
  }

  async getSystemStatus(serialNumber: string): Promise<Record<string, string | number>> {
    await this.maybeRefreshToken();
    const response = await this.axios.get(`/systems/${serialNumber}/status`);
    // TODO: handle errors
    const status = response.data.status;
    // TODO: support other zones?
    const zone1 = status.zones.zone[0];
    return {
      units: status.cfgem,
      current_state: status.mode,
      current_temp: zone1.rt,
      target_cool: zone1.clsp,
      target_heat: zone1.htsp,
      current_rh: zone1.rh,
      target_rh: status.humlvl,
    };
  }

  async getSystemConfig(serialNumber: string): Promise<Record<string, string | number>> {
    await this.maybeRefreshToken();
    const response = await this.axios.get(`/systems/${serialNumber}/config`);
    // TODO: handle errors
    const config = response.data.config;
    // activities and schedules also live here
    return {
      units: config.cfgem,
      target_state: config.mode,
    };
  }
}

export class InfinityEvolutionSystem {
  private serialNumber: string;
  private storage = {};
  private refresh_seconds = 60; // TODO: make configurable
  private last_update = 0;
  private mutex = new Mutex();

  constructor(
    private readonly InfinityEvolutionOpenApi: InfinityEvolutionOpenApi,
    serialNumber: string,
  ) {
    this.serialNumber = serialNumber;
  }

  async refresh(): Promise<void> {
    // If we refreshed recently, don't refresh again.
    if (this.last_update + (this.refresh_seconds * 1000) > Date.now()) {
      return;
    }
    await this.mutex.runExclusive(async () => {
      await this._refresh();
    });
  }

  async _refresh(): Promise<void> {
    // We check this again, since its possible it has already been refreshed while
    // waiting on the lock.
    if (this.last_update + (this.refresh_seconds * 1000) > Date.now()) {
      return;
    }
    this.storage = Object.assign(
      this.storage,
      await this.InfinityEvolutionOpenApi.getSystemStatus(this.serialNumber),
      await this.InfinityEvolutionOpenApi.getSystemConfig(this.serialNumber),
    );
    this.last_update = Date.now();
  }

  async get(key: string): Promise<string> {
    await this.refresh();
    if (key === 'target_temp') {
      // TODO: figure out what set point unspecified target type should be based on current state.
      key = 'target_cool';
    }
    return this.storage[key];
  }

  // TODO: should be Promise<void>
  async set(key: string, value: string): Promise<string> {
    // TODO: actually set stuff back to api
    return key + value;
  }
}