/**
 * GraphQL API response fixtures for tests.
 *
 * Every export is a function returning a fresh deep-cloned object
 * so tests can mutate freely without cross-test pollution.
 */

import {
  InfinitySystemProfile,
  InfinitySystemStatus,
  InfinitySystemConfig,
  InfinityZoneConfig,
  InfinityZoneActivity,
  InfinityZoneStatus,
  InfinitySystem,
  GetInfinitySystemsResponse,
  GetUserResponse,
  InfinityHumidityConfig,
} from '../api/interface_graphql_system';

// ---------- helpers ----------

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ---------- profile ----------

const PROFILE: InfinitySystemProfile = {
  serial: 'ABC123DEF456',
  name: 'My Home',
  firmware: '15.03',
  model: '24VNA936A003',
  brand: 'Bryant',
  indoorModel: 'FE4ANB006L00',
  indoorSerial: '1234567890',
  idutype: 'furnacemodule',
  idusource: 'SERIAL',
  outdoorModel: '24VNA936A003',
  outdoorSerial: '0987654321',
  odutype: 'acmodule',
};

export function mockSystemProfile(): InfinitySystemProfile {
  return deepClone(PROFILE);
}

// ---------- zone status ----------

function makeZoneStatus(id: string, overrides: Partial<InfinityZoneStatus> = {}): InfinityZoneStatus {
  return {
    id,
    rt: '72',
    rh: '38',
    fan: 'off',
    htsp: '68',
    clsp: '74',
    hold: 'off',
    enabled: 'on',
    currentActivity: 'home',
    zoneconditioning: 'idle',
    ...overrides,
  };
}

// ---------- status ----------

const STATUS: InfinitySystemStatus = {
  localTime: '2025-01-15T14:30:00-05:00',
  localTimeOffset: '-05:00',
  utcTime: '2025-01-15T19:30:00Z',
  wcTime: '2025-01-15T19:30:00Z',
  isDisconnected: 'off',
  cfgem: 'F',
  mode: 'auto',
  vacatrunning: 'off',
  oat: '31',
  odu: { type: 'acmodule', opstat: 'off' },
  filtrlvl: '25',
  idu: { type: 'furnacemodule', opstat: 'off', cfm: '0', statpress: '0', blwrpm: '0' },
  vent: 'off',
  ventlvl: '0',
  humid: 'off',
  humlvl: '0',
  uvlvl: '0',
  zones: [
    makeZoneStatus('1'),
    makeZoneStatus('2', { rt: '70', rh: '35', enabled: 'on', currentActivity: 'away' }),
  ],
};

export function mockSystemStatus(): InfinitySystemStatus {
  return deepClone(STATUS);
}

// ---------- zone activities ----------

function makeZoneActivity(zoneId: string, type: string, overrides: Partial<InfinityZoneActivity> = {}): InfinityZoneActivity {
  return {
    id: `${zoneId}-${type}`,
    zoneId,
    type,
    fan: 'off',
    htsp: '68',
    clsp: '74',
    ...overrides,
  };
}

// ---------- zone config ----------

function makeZoneConfig(id: string, name: string): InfinityZoneConfig {
  const days = Array.from({length: 7}, (_, d) => ({
    id: String(d),
    zoneId: id,
    period: [
      { id: '1', zoneId: id, dayId: String(d), activity: 'wake', time: '06:00', enabled: 'on' },
      { id: '2', zoneId: id, dayId: String(d), activity: 'home', time: '08:00', enabled: 'on' },
      { id: '3', zoneId: id, dayId: String(d), activity: 'away', time: '12:00', enabled: 'on' },
      { id: '4', zoneId: id, dayId: String(d), activity: 'home', time: '17:00', enabled: 'on' },
      { id: '5', zoneId: id, dayId: String(d), activity: 'sleep', time: '22:00', enabled: 'on' },
    ],
  }));

  return {
    id,
    name,
    enabled: 'on',
    hold: 'off',
    holdActivity: null,
    otmr: null,
    occEnabled: 'off',
    program: { id: `prog-${id}`, day: days },
    activities: [
      makeZoneActivity(id, 'home'),
      makeZoneActivity(id, 'away', { htsp: '62', clsp: '78' }),
      makeZoneActivity(id, 'sleep', { htsp: '65', clsp: '76' }),
      makeZoneActivity(id, 'wake', { htsp: '70', clsp: '74' }),
      makeZoneActivity(id, 'manual', { htsp: '68', clsp: '74' }),
    ],
  };
}

// ---------- humidity config ----------

function makeHumidityConfig(overrides: Partial<InfinityHumidityConfig> = {}): InfinityHumidityConfig {
  return {
    humid: 'off',
    humidifier: 'off',
    rhtg: 7,
    rclg: 4,
    rclgovercool: 'off',
    ventspdclg: 'off',
    ventclg: 'off',
    venthtg: 'off',
    ventspdhtg: 'off',
    ...overrides,
  };
}

// ---------- config ----------

const CONFIG: InfinitySystemConfig = {
  etag: 'abc123',
  mode: 'auto',
  cfgem: 'F',
  cfgdead: '2',
  cfgvent: 'off',
  cfghumid: 'off',
  cfguv: 'off',
  cfgfan: 'off',
  heatsource: 'system',
  vacat: 'off',
  vacstart: '',
  vacend: '',
  vacmint: '55',
  vacmaxt: '85',
  vacfan: 'off',
  fueltype: 'gas',
  gasunit: 'therms',
  filtertype: 'standard',
  filterinterval: '6',
  humidityVacation: makeHumidityConfig(),
  humidityAway: makeHumidityConfig(),
  humidityHome: makeHumidityConfig({ humidifier: 'on', humid: 'on', rhtg: 7, rclg: 4 }),
  zones: [
    makeZoneConfig('1', 'Zone 1'),
    makeZoneConfig('2', 'Upstairs'),
  ],
};

export function mockSystemConfig(): InfinitySystemConfig {
  return deepClone(CONFIG);
}

// ---------- full system ----------

export function mockInfinitySystem(): InfinitySystem {
  return {
    profile: mockSystemProfile(),
    status: mockSystemStatus(),
    config: mockSystemConfig(),
  };
}

// ---------- GraphQL query responses ----------

export function mockGetInfinitySystemsResponse(): GetInfinitySystemsResponse {
  return {
    infinitySystems: [mockInfinitySystem()],
  };
}

export function mockGetUserResponse(): GetUserResponse {
  return {
    user: {
      username: 'testuser@example.com',
      identityId: 'id-123',
      first: 'Test',
      last: 'User',
      email: 'testuser@example.com',
      emailVerified: true,
      postal: '12345',
      locations: [
        {
          locationId: 'loc-1',
          name: 'Home',
          systems: [
            {
              config: { zones: [{ id: '1', enabled: 'on' }, { id: '2', enabled: 'on' }] },
              profile: { serial: 'ABC123DEF456', name: 'My Home' },
              status: { isDisconnected: 'off' },
            },
          ],
          devices: [],
        },
      ],
    },
  };
}

/**
 * Create a response with multiple systems across multiple locations.
 */
export function mockMultiSystemUserResponse(): GetUserResponse {
  return {
    user: {
      username: 'testuser@example.com',
      identityId: 'id-123',
      first: 'Test',
      last: 'User',
      email: 'testuser@example.com',
      emailVerified: true,
      postal: '12345',
      locations: [
        {
          locationId: 'loc-1',
          name: 'Home',
          systems: [
            {
              config: { zones: [{ id: '1', enabled: 'on' }] },
              profile: { serial: 'ABC123DEF456', name: 'My Home' },
              status: { isDisconnected: 'off' },
            },
          ],
          devices: [],
        },
        {
          locationId: 'loc-2',
          name: 'Lake House',
          systems: [
            {
              config: { zones: [{ id: '1', enabled: 'on' }] },
              profile: { serial: 'XYZ789GHI012', name: 'Lake House' },
              status: { isDisconnected: 'off' },
            },
          ],
          devices: [],
        },
      ],
    },
  };
}
