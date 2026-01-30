/**
 * OAuth 2.0 Authentication Helpers for Carrier Infinity GraphQL API
 *
 * This replaces the old OAuth 1.0 HMAC signature-based authentication
 * with simple OAuth 2.0 Bearer token authentication via Okta.
 */

import { InternalAxiosRequestConfig } from 'axios';

/**
 * OAuth 2.0 token response from assistedLogin mutation
 */
export interface OAuth2TokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token: string;
}

/**
 * OAuth 2.0 token refresh response from Okta endpoint
 */
export interface OAuth2RefreshResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token?: string;  // May not be included in refresh response
}

/**
 * OAuth2Headers - Simple Bearer token injection for authenticated requests
 *
 * This is much simpler than the old OAuth 1.0 implementation which required
 * HMAC-SHA1 signatures, nonces, timestamps, and complex header generation.
 */
export class OAuth2Headers {
  /**
   * Inject Bearer token into Axios request config
   *
   * @param config - Axios request configuration
   * @param access_token - OAuth 2.0 access token
   * @param token_type - OAuth 2.0 token type (usually "Bearer")
   * @returns Modified request config with Authorization header
   */
  static intercept(
    config: InternalAxiosRequestConfig,
    access_token: string,
    token_type: string = 'Bearer',
  ): InternalAxiosRequestConfig {
    if (!config.headers) {
      config.headers = {} as any;
    }

    // Set Authorization header with Bearer token
    config.headers['Authorization'] = `${token_type} ${access_token}`;

    return config;
  }
}
