/**
 * TypeScript interfaces for Carrier Infinity GraphQL API responses
 *
 * These interfaces define the structure of data returned from GraphQL queries.
 * The GraphQL API combines profile, status, and config data into a single response.
 */

/**
 * System Profile - Hardware and firmware information
 * Equivalent to the old REST API's /systems/{serial}/profile endpoint
 */
export interface InfinitySystemProfile {
  serial: string;
  name: string;
  firmware: string;
  model: string;
  brand: string;
  indoorModel: string;
  indoorSerial: string;
  idutype: string;
  idusource: string;
  outdoorModel: string;
  outdoorSerial: string;
  odutype: string;
}

/**
 * ODU (Outdoor Unit) Status
 */
export interface InfinityOduStatus {
  type: string;
  opstat: string;
}

/**
 * IDU (Indoor Unit) Status
 */
export interface InfinityIduStatus {
  type: string;
  opstat: string;
  cfm: string;
  statpress: string;
  blwrpm: string;
}

/**
 * Zone Status - Real-time zone information
 */
export interface InfinityZoneStatus {
  id: string;
  rt: string;  // Room temperature
  rh: string;  // Relative humidity
  fan: string;  // Fan mode: "off", "low", "med", "high"
  htsp: string;  // Heat setpoint
  clsp: string;  // Cool setpoint
  hold: string;  // Hold status: "on" or "off"
  enabled: string;  // Zone enabled: "on" or "off"
  currentActivity: string;  // Current activity: "home", "away", "sleep", "wake", "manual", "vacation"
  zoneconditioning: string;  // Zone conditioning status
}

/**
 * System Status - Real-time system information
 * Equivalent to the old REST API's /systems/{serial}/status endpoint
 */
export interface InfinitySystemStatus {
  localTime: string;
  localTimeOffset: string;
  utcTime: string;
  wcTime: string;
  isDisconnected: string;
  cfgem: string;  // Temperature units: "F" or "C"
  mode: string;  // System mode: "off", "cool", "heat", "auto", "fanonly"
  vacatrunning: string;  // Vacation mode running: "on" or "off"
  oat: string;  // Outdoor air temperature
  odu: InfinityOduStatus;
  filtrlvl: string;  // Filter level (percentage)
  idu: InfinityIduStatus;
  vent: string;  // Ventilation status
  ventlvl: string;  // Ventilation level
  humid: string;  // Humidity status
  humlvl: string;  // Humidity level
  uvlvl: string;  // UV level
  zones: InfinityZoneStatus[];
}

/**
 * Humidity Configuration
 */
export interface InfinityHumidityConfig {
  humid?: string;
  humidifier?: string;
  rhtg?: number;  // Heating humidity target (divided by 5: e.g., 40% = 8)
  rclg?: number;  // Cooling humidity target (divided by 5)
  rclgovercool?: string;  // Over-cooling: "on" or "off"
  ventspdclg?: string;
  ventclg?: string;
  venthtg?: string;
  ventspdhtg?: string;
}

/**
 * Schedule Period - Single time period in a day's schedule
 */
export interface InfinitySchedulePeriod {
  id: string;
  zoneId: string;
  dayId: string;
  activity: string;  // Activity type: "home", "away", "sleep", "wake"
  time: string;  // Time in HH:MM format
  enabled: string;  // "on" or "off"
}

/**
 * Schedule Day - All periods for a single day
 */
export interface InfinityScheduleDay {
  id: string;  // Day number: "0" (Sunday) through "6" (Saturday)
  zoneId: string;
  period: InfinitySchedulePeriod[];
}

/**
 * Zone Program - Weekly schedule for a zone
 */
export interface InfinityZoneProgram {
  id: string;
  day: InfinityScheduleDay[];
}

/**
 * Zone Activity - Setpoints and fan mode for an activity
 */
export interface InfinityZoneActivity {
  id: string;
  zoneId: string;
  type: string;  // Activity type: "home", "away", "sleep", "wake", "manual", "vacation"
  fan: string;  // Fan mode: "off", "low", "med", "high"
  htsp: string;  // Heat setpoint
  clsp: string;  // Cool setpoint
}

/**
 * Zone Configuration - Zone settings and schedules
 */
export interface InfinityZoneConfig {
  id: string;
  name: string;
  enabled: string;  // "on" or "off"
  hold: string;  // Hold status: "on" or "off"
  holdActivity: string | null;  // Activity to hold: "home", "away", "sleep", "wake", "manual"
  otmr: string | null;  // Override timer: ISO 8601 timestamp or null for indefinite hold
  occEnabled: string;  // Occupancy detection enabled: "on" or "off"
  program: InfinityZoneProgram;
  activities: InfinityZoneActivity[];
}

/**
 * System Configuration - System settings
 * Equivalent to the old REST API's /systems/{serial}/config endpoint
 */
export interface InfinitySystemConfig {
  etag: string;  // Entity tag for optimistic concurrency control
  mode: string;  // System mode: "off", "cool", "heat", "auto", "fanonly"
  cfgem: string;  // Temperature units: "F" or "C"
  cfgdead: string;  // Deadband
  cfgvent: string;  // Ventilation config
  cfghumid: string;  // Humidity config
  cfguv: string;  // UV config
  cfgfan: string;  // Fan config
  heatsource: string;  // Heat source: "idu only", "odu only", "system"
  vacat: string;  // Vacation mode enabled: "on" or "off"
  vacstart: string;  // Vacation start time
  vacend: string;  // Vacation end time
  vacmint: string;  // Vacation minimum temperature
  vacmaxt: string;  // Vacation maximum temperature
  vacfan: string;  // Vacation fan mode
  fueltype: string;  // Fuel type
  gasunit: string;  // Gas unit
  filtertype: string;  // Filter type
  filterinterval: string;  // Filter replacement interval
  humidityVacation: InfinityHumidityConfig;
  humidityAway: InfinityHumidityConfig;
  humidityHome: InfinityHumidityConfig;
  zones: InfinityZoneConfig[];
}

/**
 * Complete Infinity System - Combines profile, status, and config
 * This is what the getInfinitySystems query returns
 */
export interface InfinitySystem {
  profile: InfinitySystemProfile;
  status: InfinitySystemStatus;
  config: InfinitySystemConfig;
}

/**
 * getInfinitySystems query response
 */
export interface GetInfinitySystemsResponse {
  infinitySystems: InfinitySystem[];
}

/**
 * User location data
 */
export interface UserLocation {
  locationId: string;
  name: string;
  systems: {
    config: {
      zones: {
        id: string;
        enabled: string;
      }[];
    };
    profile: {
      serial: string;
      name: string;
    };
    status: {
      isDisconnected: string;
    };
  }[];
  devices: {
    deviceId: string;
    type: string;
    thingName: string;
    name: string;
    connectionStatus: string;
  }[];
}

/**
 * User information
 */
export interface UserInfo {
  username: string;
  identityId: string;
  first: string;
  last: string;
  email: string;
  emailVerified: boolean;
  postal: string;
  locations: UserLocation[];
}

/**
 * getUser query response
 */
export interface GetUserResponse {
  user: UserInfo;
}

/**
 * Energy display configuration
 */
export interface EnergyDisplayConfig {
  display: boolean;
  enabled: boolean;
}

/**
 * Energy configuration
 */
export interface InfinityEnergyConfig {
  cooling: EnergyDisplayConfig;
  eheat: EnergyDisplayConfig;
  fan: EnergyDisplayConfig;
  fangas: EnergyDisplayConfig;
  gas: EnergyDisplayConfig;
  hpheat: EnergyDisplayConfig;
  looppump: EnergyDisplayConfig;
  reheat: EnergyDisplayConfig;
  hspf: number;
  seer: number;
}

/**
 * Energy usage period
 */
export interface InfinityEnergyPeriod {
  energyPeriodType: string;
  eHeatKwh: number;
  coolingKwh: number;
  fanGasKwh: number;
  fanKwh: number;
  hPHeatKwh: number;
  loopPumpKwh: number;
  gasKwh: number;
  reheatKwh: number;
}

/**
 * Energy data
 */
export interface InfinityEnergy {
  energyConfig: InfinityEnergyConfig;
  energyPeriods: InfinityEnergyPeriod[];
}

/**
 * getInfinityEnergy query response
 */
export interface GetInfinityEnergyResponse {
  infinityEnergy: InfinityEnergy;
}
