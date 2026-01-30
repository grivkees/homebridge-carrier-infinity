/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'CarrierInfinity';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-carrier-infinity';

/**
 * Carrier/Bryant Infinity/Evolution API Settings
 *
 * Migrated from REST API (OAuth 1.0, XML) to GraphQL API (OAuth 2.0, JSON)
 */
export const INFINITY_GRAPHQL_ENDPOINT = 'https://dataservice.infinity.iot.carrier.com/graphql';
export const INFINITY_GRAPHQL_NO_AUTH_ENDPOINT = 'https://dataservice.infinity.iot.carrier.com/graphql-no-auth';
export const INFINITY_OAUTH_TOKEN_ENDPOINT = 'https://sso.carrier.com/oauth2/default/v1/token';
export const INFINITY_OAUTH_CLIENT_ID = '0oa1ce7hwjuZbfOMB4x7';
