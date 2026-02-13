/**
 * GraphQL Client for Carrier Infinity API
 *
 * This replaces the InfinityRestClient with a GraphQL-based implementation
 * using OAuth 2.0 Bearer token authentication instead of OAuth 1.0 HMAC signatures.
 */

import {
  INFINITY_GRAPHQL_ENDPOINT,
  INFINITY_GRAPHQL_NO_AUTH_ENDPOINT,
  INFINITY_OAUTH_TOKEN_ENDPOINT,
  INFINITY_OAUTH_CLIENT_ID,
} from '../settings';
import { OAuth2Headers, OAuth2RefreshResponse } from './oauth2';
import { ASSISTED_LOGIN } from './graphql_operations';
import {
  AssistedLoginInput,
  AssistedLoginResponse,
  GraphQLResponse,
  GraphQLError,
} from './interface_graphql_mutations';

import Axios, { AxiosInstance } from 'axios';
import { Logger } from 'homebridge';
import { MemoizeExpiring } from 'typescript-memoize';
import { Retryable, BackOffPolicy } from 'typescript-retry-decorator';

/**
 * GraphQL Client for Carrier Infinity API
 *
 * Handles OAuth 2.0 authentication and GraphQL query/mutation execution.
 * Much simpler than the old REST client - no XML parsing, no OAuth signatures,
 * no custom certificates, no activation endpoint.
 */
export class InfinityGraphQLClient {
  private access_token = '';
  private refresh_token = '';
  private token_type = 'Bearer';
  private token_expires_in = 0;
  private token_acquired_at = 0;

  public axios: AxiosInstance;
  private axiosNoAuth: AxiosInstance;

  constructor(
    public username: string,
    private password: string,
    public readonly log: Logger,
  ) {
    // Create authenticated Axios instance (for GraphQL queries after login)
    this.axios = Axios.create({
      baseURL: INFINITY_GRAPHQL_ENDPOINT,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Create no-auth Axios instance (for login mutation)
    this.axiosNoAuth = Axios.create({
      baseURL: INFINITY_GRAPHQL_NO_AUTH_ENDPOINT,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Response interceptor for debug logging
    this.axios.interceptors.response.use(
      response => {
        this.log.debug(
          `[GraphQL] ${response.request?.method} ${response.request.host}${response.request?.path}`,
          `${response.status} ${response.statusText}`,
        );
        return response;
      },
      error => {
        if (Axios.isAxiosError(error)) {
          this.log.debug(
            `[GraphQL] ${error.request?.method} ${error.request?.host}${error.request?.path}`,
            `${error.response?.status} ${error.response?.statusText}`,
          );
        }
        return Promise.reject(error);
      },
    );

    // Same for no-auth instance
    this.axiosNoAuth.interceptors.response.use(
      response => {
        this.log.debug(
          `[GraphQL-NoAuth] ${response.request?.method} ${response.request.host}${response.request?.path}`,
          `${response.status} ${response.statusText}`,
        );
        return response;
      },
      error => {
        if (Axios.isAxiosError(error)) {
          this.log.debug(
            `[GraphQL-NoAuth] ${error.request?.method} ${error.request?.host}${error.request?.path}`,
            `${error.response?.status} ${error.response?.statusText}`,
          );
        }
        return Promise.reject(error);
      },
    );

    // OAuth 2.0 Bearer token injection for authenticated instance
    this.axios.interceptors.request.use(config => {
      return OAuth2Headers.intercept(config, this.access_token, this.token_type);
    });
  }

  /**
   * Check if auth token is expired and refresh if needed
   *
   * This is called before every API request to ensure we have a valid token.
   * Unlike the old implementation with 24-hour memoization, this checks
   * the actual token expiration time before each request.
   *
   * We refresh tokens with a 5-minute buffer before actual expiration to
   * prevent race conditions where a token expires mid-request.
   */
  async checkAuthExpiration(): Promise<void> {
    // If we have no refresh token, we need to login
    if (!this.refresh_token) {
      await this.forceRefreshToken();
      return;
    }

    // Check if token is expired (with 5-minute buffer)
    const BUFFER_SECONDS = 5 * 60;
    const now = Date.now() / 1000;
    const tokenAge = now - this.token_acquired_at;
    const tokenExpired = tokenAge >= (this.token_expires_in - BUFFER_SECONDS);

    if (tokenExpired) {
      await this.forceRefreshToken();
    }
  }

  /**
   * Public method to refresh token (for backward compatibility)
   *
   * This method is called explicitly during platform initialization.
   * It now delegates to checkAuthExpiration() which handles the logic.
   */
  async refreshToken(): Promise<void> {
    await this.checkAuthExpiration();
  }

  /**
   * Force refresh OAuth 2.0 token with retry logic
   *
   * If we have a refresh token, use the Okta token endpoint.
   * Otherwise, use the assistedLogin mutation to get a new token.
   */
  @Retryable({
    maxAttempts: 5,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    backOff: 1000,
    exponentialOption: { maxInterval: 5 * 60 * 1000, multiplier: 5 },
  })
  async forceRefreshToken(): Promise<void> {
    this.log.info('Attempting login / token refresh.');

    // If we have a refresh token, try Okta first
    if (this.refresh_token) {
      try {
        await this.refreshTokenViaOkta();
        this.log.info('Completed login / token refresh successfully.');
        return;
      } catch (error) {
        this.log.warn('Okta token refresh failed, falling back to assistedLogin:', error);
        // Fall through to assistedLogin
      }
    }

    // Use assistedLogin mutation
    try {
      await this.loginViaAssistedLogin();
      this.log.info('Completed login / token refresh successfully.');
    } catch (error) {
      this.log.error(
        '[API] Could not refresh access token: ',
        Axios.isAxiosError(error) ? error.message : error,
      );
      throw error;
    }
  }

  /**
   * Refresh token via Okta OAuth2 endpoint
   */
  private async refreshTokenViaOkta(): Promise<void> {
    const response = await Axios.post<OAuth2RefreshResponse>(
      INFINITY_OAUTH_TOKEN_ENDPOINT,
      {
        client_id: INFINITY_OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: this.refresh_token,
        scope: 'offline_access',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.data.access_token) {
      this.access_token = response.data.access_token;
      this.token_type = response.data.token_type;
      this.token_expires_in = response.data.expires_in;
      this.token_acquired_at = Date.now() / 1000;

      // Okta may return a new refresh token
      if (response.data.refresh_token) {
        this.refresh_token = response.data.refresh_token;
      }

      this.log.debug('Token refreshed via Okta endpoint.');
    } else {
      throw new Error('Okta token refresh did not return access_token.');
    }
  }

  /**
   * Login via assistedLogin GraphQL mutation
   */
  private async loginViaAssistedLogin(): Promise<void> {
    const input: AssistedLoginInput = {
      username: this.username,
      password: this.password,
    };

    const response = await this.axiosNoAuth.post<GraphQLResponse<AssistedLoginResponse>>('', {
      query: ASSISTED_LOGIN,
      variables: { input },
    });

    // Check for GraphQL errors
    if (response.data.errors && response.data.errors.length > 0) {
      const errorMessages = response.data.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL errors during login: ${errorMessages}`);
    }

    // Check for mutation-level errors
    const result = response.data.data?.assistedLogin;
    if (!result || !result.success) {
      const errorMessage = result?.errorMessage || 'Unknown error';
      throw new Error(`assistedLogin failed: ${errorMessage}`);
    }

    // Extract tokens
    const tokenData = result.data;
    if (!tokenData.access_token) {
      throw new Error('assistedLogin did not return access_token.');
    }

    this.access_token = tokenData.access_token;
    this.refresh_token = tokenData.refresh_token;
    this.token_type = tokenData.token_type;
    this.token_expires_in = tokenData.expires_in;
    this.token_acquired_at = Date.now() / 1000;

    this.log.debug('Token acquired via assistedLogin mutation.');
  }

  /**
   * Execute a GraphQL query
   *
   * @param query - GraphQL query string
   * @param variables - Query variables
   * @returns GraphQL response data
   */
  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    // Ensure we have a valid token
    await this.checkAuthExpiration();

    const response = await this.axios.post<GraphQLResponse<T>>('', {
      query,
      variables,
    });

    // Check for GraphQL errors
    if (response.data.errors && response.data.errors.length > 0) {
      const errorMessages = response.data.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL query errors: ${errorMessages}`);
    }

    if (!response.data.data) {
      throw new Error('GraphQL query returned no data.');
    }

    return response.data.data;
  }

  /**
   * Execute a GraphQL mutation
   *
   * @param mutation - GraphQL mutation string
   * @param variables - Mutation variables
   * @returns GraphQL response data
   */
  async mutate<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
    // Ensure we have a valid token
    await this.checkAuthExpiration();

    const response = await this.axios.post<GraphQLResponse<T>>('', {
      query: mutation,
      variables,
    });

    // Check for GraphQL errors
    if (response.data.errors && response.data.errors.length > 0) {
      const errorMessages = response.data.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL mutation errors: ${errorMessages}`);
    }

    if (!response.data.data) {
      throw new Error('GraphQL mutation returned no data.');
    }

    return response.data.data;
  }

  /**
   * Helper to check if GraphQL response has errors
   */
  private hasGraphQLErrors(errors?: GraphQLError[]): boolean {
    return !!(errors && errors.length > 0);
  }
}
