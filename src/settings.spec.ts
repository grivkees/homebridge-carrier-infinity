import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  INFINITY_GRAPHQL_ENDPOINT,
  INFINITY_GRAPHQL_NO_AUTH_ENDPOINT,
  INFINITY_OAUTH_TOKEN_ENDPOINT,
  INFINITY_OAUTH_CLIENT_ID,
} from './settings';

describe('settings', () => {
  test('PLATFORM_NAME is correct', () => {
    expect(PLATFORM_NAME).toBe('CarrierInfinity');
  });

  test('PLUGIN_NAME matches package name', () => {
    expect(PLUGIN_NAME).toBe('homebridge-carrier-infinity');
  });

  test('GraphQL endpoint is a valid HTTPS URL', () => {
    expect(INFINITY_GRAPHQL_ENDPOINT).toMatch(/^https:\/\/.+/);
  });

  test('GraphQL no-auth endpoint is a valid HTTPS URL', () => {
    expect(INFINITY_GRAPHQL_NO_AUTH_ENDPOINT).toMatch(/^https:\/\/.+/);
  });

  test('OAuth token endpoint is a valid HTTPS URL', () => {
    expect(INFINITY_OAUTH_TOKEN_ENDPOINT).toMatch(/^https:\/\/.+/);
  });

  test('OAuth client ID is a non-empty string', () => {
    expect(INFINITY_OAUTH_CLIENT_ID).toBeTruthy();
    expect(typeof INFINITY_OAUTH_CLIENT_ID).toBe('string');
  });
});
