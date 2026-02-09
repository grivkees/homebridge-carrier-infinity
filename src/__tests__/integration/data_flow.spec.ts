/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Integration tests for end-to-end data flows through real model objects.
 *
 * Only the HTTP boundary is mocked (graphql_client.query / graphql_client.mutate).
 * Everything else — UnifiedSystemModelGraphQL, the facade models, hash-based
 * change detection, event emission — runs with real code.
 */

jest.mock('typescript-memoize', () => ({
  MemoizeExpiring: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
}));

import { mockLogger } from '../../__mocks__/homebridge';
import {
  mockGetInfinitySystemsResponse,
  mockSystemConfig,
  mockSystemStatus,
} from '../../__mocks__/graphql_fixtures';
import { SystemModelGraphQL } from '../../api/models_graphql';
import { ACTIVITY, STATUS, SYSTEM_MODE } from '../../api/constants';
import { convertCharHum2SystemHum, convertCharDehum2SystemDehum } from '../../helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockGraphQLClient() {
  return {
    username: 'testuser',
    log: mockLogger(),
    query: jest.fn(),
    mutate: jest.fn(),
  } as any;
}

// ===========================================================================
// READ FLOW
// ===========================================================================

describe('Integration: read flow', () => {
  let client: any;
  let system: SystemModelGraphQL;

  beforeEach(async () => {
    jest.useFakeTimers();
    client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    system = new SystemModelGraphQL(client, 'ABC123DEF456');
    // Trigger initial data load
    await system.status.fetch();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------- profile ----------

  test('profile.getName returns system name', async () => {
    expect(await system.profile.getName()).toBe('My Home');
  });

  test('profile.getBrand returns brand', async () => {
    expect(await system.profile.getBrand()).toBe('Bryant');
  });

  test('profile.getModel returns outdoor model', async () => {
    expect(await system.profile.getModel()).toBe('24VNA936A003');
  });

  test('profile.getFirmware returns firmware version', async () => {
    expect(await system.profile.getFirmware()).toBe('15.03');
  });

  test('profile.getZones returns both enabled zone IDs', async () => {
    expect(await system.profile.getZones()).toEqual(['1', '2']);
  });

  // ---------- status ----------

  test('status.getOutdoorTemp returns outdoor temperature as number', async () => {
    expect(await system.status.getOutdoorTemp()).toBe(31);
  });

  test('status.getMode passes through direct mode value', async () => {
    expect(await system.status.getMode()).toBe('auto');
  });

  test('status.getZoneTemp returns zone 1 room temperature', async () => {
    expect(await system.status.getZoneTemp('1')).toBe(72);
  });

  test('status.getZoneHumidity returns zone 1 relative humidity', async () => {
    expect(await system.status.getZoneHumidity('1')).toBe(38);
  });

  test('status.getZoneConditioning maps idle to off', async () => {
    expect(await system.status.getZoneConditioning('1')).toBe(SYSTEM_MODE.OFF);
  });

  test('status.getFilterUsed returns filter level as number', async () => {
    expect(await system.status.getFilterUsed()).toBe(25);
  });

  // ---------- config ----------

  test('config.getMode returns configured mode', async () => {
    expect(await system.config.getMode()).toBe('auto');
  });

  test('config.getUnits returns temperature units', async () => {
    expect(await system.config.getUnits()).toBe('F');
  });

  test('config.getZoneName returns zone 1 name', async () => {
    expect(await system.config.getZoneName('1')).toBe('Zone 1');
  });

  test('config.getZoneName returns zone 2 name', async () => {
    expect(await system.config.getZoneName('2')).toBe('Upstairs');
  });

  test('config.getZoneActivityCoolSetpoint returns home cool setpoint', async () => {
    expect(await system.config.getZoneActivityCoolSetpoint('1', 'home')).toBe(74);
  });

  test('config.getZoneActivityHeatSetpoint returns home heat setpoint', async () => {
    expect(await system.config.getZoneActivityHeatSetpoint('1', 'home')).toBe(68);
  });

  test('config.getZoneActivityFan returns home fan mode', async () => {
    expect(await system.config.getZoneActivityFan('1', 'home')).toBe('off');
  });
});

// ===========================================================================
// WRITE FLOW
// ===========================================================================

describe('Integration: write flow', () => {
  let client: any;
  let system: SystemModelGraphQL;

  beforeEach(async () => {
    jest.useFakeTimers();
    client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    client.mutate.mockResolvedValue({ updateInfinityConfig: { etag: 'new' } });
    system = new SystemModelGraphQL(client, 'ABC123DEF456');
    await system.status.fetch();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('setMode queues mutation that produces correct input', async () => {
    await system.config.setMode('cool');
    expect(system.config.mutations.length).toBeGreaterThan(0);

    const config = mockSystemConfig();
    const status = mockSystemStatus();
    const input = system.config.mutations[0](config, status);

    expect(input).toEqual({ serial: 'ABC123DEF456', mode: 'cool' });
  });

  test('setZoneActivityHold queues hold-on mutation', async () => {
    await system.config.setZoneActivityHold('1', 'away', '17:00');
    expect(system.config.mutations.length).toBeGreaterThan(0);

    const config = mockSystemConfig();
    const status = mockSystemStatus();
    const input = system.config.mutations[0](config, status);

    expect(input).toEqual({
      serial: 'ABC123DEF456',
      zoneId: '1',
      hold: STATUS.ON,
      holdActivity: 'away',
      otmr: '17:00',
    });
  });

  test('setZoneActivityHold with empty activity turns hold off', async () => {
    await system.config.setZoneActivityHold('1', '', '17:00');
    expect(system.config.mutations.length).toBeGreaterThan(0);

    const config = mockSystemConfig();
    const status = mockSystemStatus();
    const input = system.config.mutations[0](config, status);

    expect(input).toEqual({
      serial: 'ABC123DEF456',
      zoneId: '1',
      hold: STATUS.OFF,
      holdActivity: null,
      otmr: null,
    });
  });

  test('setZoneActivityManualHold queues two mutations: activity update then hold', async () => {
    await system.config.setZoneActivityManualHold('1', 74, null, '');

    expect(system.config.mutations.length).toBe(2);

    const config = mockSystemConfig();
    const status = mockSystemStatus();

    // First mutation: zone activity update
    const activityInput = system.config.mutations[0](config, status) as any;
    expect(activityInput.serial).toBe('ABC123DEF456');
    expect(activityInput.zoneId).toBe('1');
    expect(activityInput.activityType).toBe(ACTIVITY.MANUAL);
    expect(activityInput).toHaveProperty('htsp');
    expect(activityInput).toHaveProperty('clsp');
    expect(activityInput).toHaveProperty('fan');

    // Second mutation: hold
    const holdInput = system.config.mutations[1](config, status) as any;
    expect(holdInput).toEqual({
      serial: 'ABC123DEF456',
      zoneId: '1',
      hold: STATUS.ON,
      holdActivity: ACTIVITY.MANUAL,
      otmr: '',
    });
  });

  test('setHumidityConfig queues mutation with correct humidity input', async () => {
    await system.config.setHumidityConfig(ACTIVITY.HOME, 'on', undefined, 35);
    expect(system.config.mutations.length).toBeGreaterThan(0);

    const config = mockSystemConfig();
    const status = mockSystemStatus();
    const input = system.config.mutations[0](config, status) as any;

    expect(input.serial).toBe('ABC123DEF456');
    expect(input.humidityHome).toBeDefined();
    expect(input.humidityHome.humidifier).toBe('on');
    expect(input.humidityHome.rhtg).toBe(convertCharHum2SystemHum(35));
    // Existing fields should be preserved
    expect(input.humidityHome.rclg).toBe(4); // original fixture value
  });

  test('setHumidityConfig for away targets humidityAway', async () => {
    await system.config.setHumidityConfig(ACTIVITY.AWAY, undefined, 'on', undefined, 52);
    expect(system.config.mutations.length).toBeGreaterThan(0);

    const config = mockSystemConfig();
    const status = mockSystemStatus();
    const input = system.config.mutations[0](config, status) as any;

    expect(input.humidityAway).toBeDefined();
    expect(input.humidityAway.humid).toBe('on');
    expect(input.humidityAway.rclgovercool).toBe('on');
    expect(input.humidityAway.rclg).toBe(convertCharDehum2SystemDehum(52));
    expect(input.humidityHome).toBeUndefined();
  });
});

// ===========================================================================
// EVENT FLOW
// ===========================================================================

describe('Integration: event flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('emits events on first fetch', async () => {
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    const system = new SystemModelGraphQL(client, 'ABC123DEF456');

    const configSpy = jest.fn();
    const statusSpy = jest.fn();
    const profileSpy = jest.fn();
    system.events.on('updated_config', configSpy);
    system.events.on('updated_status', statusSpy);
    system.events.on('updated_system_profile', profileSpy);

    await system.status.fetch();

    expect(configSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(profileSpy).toHaveBeenCalledTimes(1);
  });

  test('does NOT emit events when fetched data hash is unchanged', async () => {
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    const system = new SystemModelGraphQL(client, 'ABC123DEF456');

    // First fetch — events fire
    await system.status.fetch();

    const spy = jest.fn();
    system.events.on('updated_config', spy);

    // Second fetch with identical data — hash unchanged, no event
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    await system.status.fetch();

    expect(spy).toHaveBeenCalledTimes(0);
  });

  test('emits events when data actually changes', async () => {
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    const system = new SystemModelGraphQL(client, 'ABC123DEF456');

    // First fetch
    await system.status.fetch();

    const spy = jest.fn();
    system.events.on('updated_config', spy);

    // Change something meaningful (mode) and re-fetch
    const changedResponse = mockGetInfinitySystemsResponse();
    changedResponse.infinitySystems[0].config.mode = 'cool';
    client.query.mockResolvedValue(changedResponse);

    await system.status.fetch();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('changing only hash-ignored keys does NOT trigger events', async () => {
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    const system = new SystemModelGraphQL(client, 'ABC123DEF456');

    // First fetch
    await system.status.fetch();

    const spy = jest.fn();
    system.events.on('updated_config', spy);

    // Change only ignored keys: timestamp, localTime, etag
    const sameResponse = mockGetInfinitySystemsResponse();
    sameResponse.infinitySystems[0].status.localTime = '2099-12-31T23:59:59-05:00';
    sameResponse.infinitySystems[0].config.etag = 'totally-different-etag';
    client.query.mockResolvedValue(sameResponse);

    await system.status.fetch();

    expect(spy).toHaveBeenCalledTimes(0);
  });
});

// ===========================================================================
// MULTI-ZONE FLOW
// ===========================================================================

describe('Integration: multi-zone flow', () => {
  let system: SystemModelGraphQL;

  beforeEach(async () => {
    jest.useFakeTimers();
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetInfinitySystemsResponse());
    system = new SystemModelGraphQL(client, 'ABC123DEF456');
    await system.status.fetch();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('zone 2 returns correct temperature', async () => {
    expect(await system.status.getZoneTemp('2')).toBe(70);
  });

  test('zone 2 returns correct humidity', async () => {
    expect(await system.status.getZoneHumidity('2')).toBe(35);
  });

  test('zone 2 returns correct name from config', async () => {
    expect(await system.config.getZoneName('2')).toBe('Upstairs');
  });

  test('zone 2 returns correct current activity', async () => {
    expect(await system.status.getZoneActivity('2')).toBe('away');
  });
});

// ===========================================================================
// STATUS MODE MAPPING
// ===========================================================================

describe('Integration: status mode mapping through real objects', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function systemWithStatusMode(mode: string) {
    const client = mockGraphQLClient();
    const response = mockGetInfinitySystemsResponse();
    response.infinitySystems[0].status.mode = mode;
    client.query.mockResolvedValue(response);
    const system = new SystemModelGraphQL(client, 'ABC123DEF456');
    await system.status.fetch();
    return system;
  }

  test('gasheat maps to heat', async () => {
    const system = await systemWithStatusMode('gasheat');
    expect(await system.status.getMode()).toBe(SYSTEM_MODE.HEAT);
  });

  test('hpheat maps to heat', async () => {
    const system = await systemWithStatusMode('hpheat');
    expect(await system.status.getMode()).toBe(SYSTEM_MODE.HEAT);
  });

  test('electric maps to heat', async () => {
    const system = await systemWithStatusMode('electric');
    expect(await system.status.getMode()).toBe(SYSTEM_MODE.HEAT);
  });

  test('dehumidify maps to cool', async () => {
    const system = await systemWithStatusMode('dehumidify');
    expect(await system.status.getMode()).toBe(SYSTEM_MODE.COOL);
  });

  test('cool passes through unchanged', async () => {
    const system = await systemWithStatusMode('cool');
    expect(await system.status.getMode()).toBe('cool');
  });

  test('off passes through unchanged', async () => {
    const system = await systemWithStatusMode('off');
    expect(await system.status.getMode()).toBe('off');
  });

  // Zone conditioning mapping through real objects

  async function systemWithZoneConditioning(conditioning: string) {
    const client = mockGraphQLClient();
    const response = mockGetInfinitySystemsResponse();
    response.infinitySystems[0].status.zones[0].zoneconditioning = conditioning;
    client.query.mockResolvedValue(response);
    const system = new SystemModelGraphQL(client, 'ABC123DEF456');
    await system.status.fetch();
    return system;
  }

  test('zone conditioning active_heat maps to heat', async () => {
    const system = await systemWithZoneConditioning('active_heat');
    expect(await system.status.getZoneConditioning('1')).toBe(SYSTEM_MODE.HEAT);
  });

  test('zone conditioning active_cool maps to cool', async () => {
    const system = await systemWithZoneConditioning('active_cool');
    expect(await system.status.getZoneConditioning('1')).toBe(SYSTEM_MODE.COOL);
  });

  test('zone conditioning prep_heat maps to heat', async () => {
    const system = await systemWithZoneConditioning('prep_heat');
    expect(await system.status.getZoneConditioning('1')).toBe(SYSTEM_MODE.HEAT);
  });

  test('zone conditioning idle maps to off', async () => {
    const system = await systemWithZoneConditioning('idle');
    expect(await system.status.getZoneConditioning('1')).toBe(SYSTEM_MODE.OFF);
  });
});
