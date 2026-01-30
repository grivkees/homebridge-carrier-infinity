/**
 * TypeScript interfaces for Carrier Infinity GraphQL API mutation inputs
 *
 * These interfaces define the structure of input variables for GraphQL mutations.
 */

/**
 * assistedLogin mutation input
 */
export interface AssistedLoginInput {
  username: string;
  password: string;
}

/**
 * assistedLogin mutation response data
 */
export interface AssistedLoginData {
  token_type: string;
  expires_in: number;
  access_token: string;
  scope: string;
  refresh_token: string;
}

/**
 * assistedLogin mutation response
 */
export interface AssistedLoginResponse {
  assistedLogin: {
    success: boolean;
    status: string;
    errorMessage: string | null;
    data: AssistedLoginData;
  };
}

/**
 * Humidity configuration input for mutations
 */
export interface HumidityConfigInput {
  humid?: string;
  humidifier?: string;
  rhtg?: number;
  rclg?: number;
  rclgovercool?: string;
  ventspdclg?: string;
  ventclg?: string;
  venthtg?: string;
  ventspdhtg?: string;
}

/**
 * updateInfinityConfig mutation input
 *
 * All fields are optional except serial. Only include the fields you want to update.
 */
export interface InfinityConfigInput {
  serial: string;
  mode?: string;  // "off", "cool", "heat", "auto", "fanonly"
  cfgem?: string;  // "F" or "C"
  cfgdead?: string;
  cfgvent?: string;
  cfghumid?: string;
  cfguv?: string;
  cfgfan?: string;
  heatsource?: string;  // "idu only", "odu only", "system"
  vacat?: string;  // "on" or "off"
  vacstart?: string;
  vacend?: string;
  vacmint?: string;
  vacmaxt?: string;
  vacfan?: string;
  fueltype?: string;
  gasunit?: string;
  filtertype?: string;
  filterinterval?: string;
  humidityVacation?: HumidityConfigInput;
  humidityAway?: HumidityConfigInput;
  humidityHome?: HumidityConfigInput;
}

/**
 * updateInfinityConfig mutation response
 */
export interface UpdateInfinityConfigResponse {
  updateInfinityConfig: {
    etag: string;
  };
}

/**
 * updateInfinityZoneActivity mutation input
 *
 * Used to change zone activity type, setpoints, and fan mode
 */
export interface InfinityZoneActivityInput {
  serial: string;
  zoneId: string;
  activityType: string;  // "home", "away", "sleep", "wake", "manual", "vacation"
  clsp?: string;  // Cool setpoint (as string)
  htsp?: string;  // Heat setpoint (as string)
  fan?: string;  // "off", "low", "med", "high"
}

/**
 * updateInfinityZoneActivity mutation response
 */
export interface UpdateInfinityZoneActivityResponse {
  updateInfinityZoneActivity: {
    etag: string;
  };
}

/**
 * updateInfinityZoneConfig mutation input
 *
 * Used to set hold status, schedule, and other zone-level configuration
 */
export interface InfinityZoneConfigInput {
  serial: string;
  zoneId: string;
  hold?: string;  // "on" or "off"
  holdActivity?: string | null;  // Activity to hold: "home", "away", "sleep", "wake", "manual"
  otmr?: string | null;  // Override timer: ISO 8601 timestamp or null for indefinite hold
  occEnabled?: string;  // "on" or "off"
  enabled?: string;  // "on" or "off"
  // Note: Program/schedule updates would go here but are not commonly used
}

/**
 * updateInfinityZoneConfig mutation response
 */
export interface UpdateInfinityZoneConfigResponse {
  updateInfinityZoneConfig: {
    etag: string;
  };
}

/**
 * GraphQL Error
 */
export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, any>;
}

/**
 * GraphQL Response wrapper
 *
 * All GraphQL responses follow this structure
 */
export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}
