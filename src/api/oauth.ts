import { INFINITY_API_CONSUMER_KEY, INFINITY_API_CONSUMER_SECRET } from '../settings';

import { AxiosRequestConfig } from 'axios';
import oauthSignature from 'oauth-signature';

export class OAuthHeaders {
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