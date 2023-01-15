import { INFINITY_API_BASE_URL } from '../settings';
import { OAuthHeaders } from './oauth';

import xml2js from 'xml2js';
import Axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { MemoizeExpiring } from 'typescript-memoize';

export class InfinityRestClient {
  private access_token = '';
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
    // Axios debug logging and error handling
    this.axios.interceptors.response.use(
      // Success
      response => {
        this.log.debug(
          `${response.request?.method} ${response.request.host}${response.request?.path}`,
          `${response.status} ${response.statusText}`,
        );
        return response;
      },
      // Failure
      error => {
        if (Axios.isAxiosError(error)) {
          this.log.debug(
            `${error.request?.method} ${error.request?.host}${error.request?.path}`,
            `${error.response?.status} ${error.response?.statusText}`,
          );
        }
        return Promise.reject(error); // this makes http errors raise
      },
    );
    // Oauth header add
    this.axios.interceptors.request.use(config => {
      return OAuthHeaders.intercept(config, this.username, this.access_token);
    });
  }

  // Api seems to expect this every min or so. more frequent doesn't seem to
  // make any difference.
  @MemoizeExpiring(1 * 60 * 1000)
  async activate(): Promise<void> {
    try {
      await this.forceActivate();
    } catch (error) {
      this.log.error(
        '[API] Failure sending activation signal: ',
        Axios.isAxiosError(error) ? error.message : error,
      );
    }
  }

  async forceActivate(): Promise<void> {
    await this.axios.post(
      `/users/${this.username}/activateSystems`,
      null,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
  }

  @MemoizeExpiring(24 * 60 * 60 * 1000) // every 24 hrs
  async refreshToken(): Promise<void> {
    try {
      await this.forceRefreshToken();
    } catch (error) {
      this.log.error(
        '[API] Could not refresh access token: ',
        Axios.isAxiosError(error) ? error.message : error,
      );
    }
  }

  // TODO: on some api errors, force a refresh
  async forceRefreshToken(): Promise<void> {
    const builder = new xml2js.Builder({cdata: true, headless: true});
    const new_xml = builder.buildObject({
      credentials: {
        username: this.username,
        password: this.password,
      },
    });
    const data = `data=${encodeURIComponent(new_xml)}`;

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

    if (response.data.result?.accessToken) {
      this.access_token = response.data.result.accessToken;
    } else {
      this.log.debug(response.data);
      throw new Error('User authentication error.');
    }
  }
}