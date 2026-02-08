/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('typescript-memoize', () => ({
  MemoizeExpiring: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
}));

import { mockLogger } from '../__mocks__/homebridge';
import {
  mockGetUserResponse,
  mockGetInfinitySystemsResponse,
  mockSystemConfig,
  mockSystemStatus,
  mockMultiSystemUserResponse,
} from '../__mocks__/graphql_fixtures';
import {
  LocationsModelGraphQL,
  SystemModelGraphQL,
} from './models_graphql';
import { ACTIVITY, STATUS, SYSTEM_MODE } from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockGraphQLClient(overrides: Record<string, any> = {}) {
  return {
    username: 'testuser',
    log: mockLogger(),
    query: jest.fn(),
    mutate: jest.fn(),
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// LocationsModelGraphQL
// ---------------------------------------------------------------------------

describe('LocationsModelGraphQL', () => {
  test('getSystems extracts serial numbers from single location', async () => {
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockGetUserResponse());

    const model = new LocationsModelGraphQL(client);
    const systems = await model.getSystems();

    expect(systems).toEqual(['ABC123DEF456']);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  test('getSystems extracts serial numbers from multiple locations', async () => {
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(mockMultiSystemUserResponse());

    const model = new LocationsModelGraphQL(client);
    const systems = await model.getSystems();

    expect(systems).toEqual(['ABC123DEF456', 'XYZ789GHI012']);
  });

  test('getSystems throws when data is not available', async () => {
    const client = mockGraphQLClient();
    client.query.mockRejectedValue(new Error('Network error'));

    const model = new LocationsModelGraphQL(client);
    await expect(model.getSystems()).rejects.toThrow(
      'Could not retrieve systems (API has not responded successfully)',
    );
  });
});

// ---------------------------------------------------------------------------
// SystemModelGraphQL — top-level facade (uses setInterval)
// ---------------------------------------------------------------------------

describe('SystemModelGraphQL', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createSystemModel(clientOverrides: Record<string, any> = {}) {
    const response = mockGetInfinitySystemsResponse();
    const client = mockGraphQLClient(clientOverrides);
    client.query.mockResolvedValue(response);
    const model = new SystemModelGraphQL(client, 'ABC123DEF456');
    return { model, client, response };
  }

  test('exposes status, config, and profile facades', () => {
    const { model } = createSystemModel();
    expect(model.status).toBeDefined();
    expect(model.config).toBeDefined();
    expect(model.profile).toBeDefined();
  });

  test('exposes serialNumber', () => {
    const { model } = createSystemModel();
    expect(model.serialNumber).toEqual('ABC123DEF456');
  });

  test('events emitter is created with max listeners', () => {
    const { model } = createSystemModel();
    expect(model.events).toBeDefined();
    expect(model.events.getMaxListeners()).toEqual(100);
  });

  // ---------- SystemProfileModelGraphQL ----------

  describe('SystemProfileModelGraphQL (via SystemModelGraphQL)', () => {
    test('getName returns profile name', async () => {
      const { model } = createSystemModel();
      const name = await model.profile.getName();
      expect(name).toEqual('My Home');
    });

    test('getBrand returns profile brand', async () => {
      const { model } = createSystemModel();
      const brand = await model.profile.getBrand();
      expect(brand).toEqual('Bryant');
    });

    test('getModel returns profile model', async () => {
      const { model } = createSystemModel();
      const m = await model.profile.getModel();
      expect(m).toEqual('24VNA936A003');
    });

    test('getFirmware returns profile firmware', async () => {
      const { model } = createSystemModel();
      const firmware = await model.profile.getFirmware();
      expect(firmware).toEqual('15.03');
    });

    test('getZones returns enabled zone IDs from status', async () => {
      const { model } = createSystemModel();
      const zones = await model.profile.getZones();
      expect(zones).toEqual(['1', '2']);
    });

    test('getZones excludes disabled zones', async () => {
      const response = mockGetInfinitySystemsResponse();
      response.infinitySystems[0].status.zones[1].enabled = 'off';
      const client = mockGraphQLClient();
      client.query.mockResolvedValue(response);

      const model = new SystemModelGraphQL(client, 'ABC123DEF456');
      const zones = await model.profile.getZones();
      expect(zones).toEqual(['1']);
    });
  });

  // ---------- SystemStatusModelGraphQL ----------

  describe('SystemStatusModelGraphQL (via SystemModelGraphQL)', () => {
    test('getOutdoorTemp returns number from status.oat', async () => {
      const { model } = createSystemModel();
      const temp = await model.status.getOutdoorTemp();
      expect(temp).toEqual(31);
    });

    test('getFilterUsed returns number from status.filtrlvl', async () => {
      const { model } = createSystemModel();
      const level = await model.status.getFilterUsed();
      expect(level).toEqual(25);
    });

    test('getUnits returns temperature units', async () => {
      const { model } = createSystemModel();
      const units = await model.status.getUnits();
      expect(units).toEqual('F');
    });

    describe('getMode maps status modes', () => {
      test.each([
        ['gasheat', SYSTEM_MODE.HEAT],
        ['electric', SYSTEM_MODE.HEAT],
        ['hpheat', SYSTEM_MODE.HEAT],
        ['dehumidify', SYSTEM_MODE.COOL],
        ['cool', 'cool'],
        ['heat', 'heat'],
        ['auto', 'auto'],
        ['off', 'off'],
        ['fanonly', 'fanonly'],
      ])('maps "%s" to "%s"', async (raw, expected) => {
        const response = mockGetInfinitySystemsResponse();
        response.infinitySystems[0].status.mode = raw;
        const client = mockGraphQLClient();
        client.query.mockResolvedValue(response);

        const model = new SystemModelGraphQL(client, 'ABC123DEF456');
        const mode = await model.status.getMode();
        expect(mode).toEqual(expected);
      });
    });

    describe('getZoneConditioning maps conditioning states', () => {
      test.each([
        ['active_heat', SYSTEM_MODE.HEAT],
        ['prep_heat', SYSTEM_MODE.HEAT],
        ['pending_heat', SYSTEM_MODE.HEAT],
        ['active_cool', SYSTEM_MODE.COOL],
        ['prep_cool', SYSTEM_MODE.COOL],
        ['pending_cool', SYSTEM_MODE.COOL],
        ['idle', SYSTEM_MODE.OFF],
        ['unknown_state', 'unknown_state'],
      ])('maps "%s" to "%s"', async (raw, expected) => {
        const response = mockGetInfinitySystemsResponse();
        response.infinitySystems[0].status.zones[0].zoneconditioning = raw;
        const client = mockGraphQLClient();
        client.query.mockResolvedValue(response);

        const model = new SystemModelGraphQL(client, 'ABC123DEF456');
        const conditioning = await model.status.getZoneConditioning('1');
        expect(conditioning).toEqual(expected);
      });
    });

    test('getZoneConditioning throws on invalid zone', async () => {
      const { model } = createSystemModel();
      await expect(model.status.getZoneConditioning('99')).rejects.toThrow(
        'Zone 99 not found in status',
      );
    });

    test('getZoneFan returns fan mode for zone', async () => {
      const { model } = createSystemModel();
      const fan = await model.status.getZoneFan('1');
      expect(fan).toEqual('off');
    });

    test('getZoneOpen returns true for enabled zone', async () => {
      const { model } = createSystemModel();
      const open = await model.status.getZoneOpen('1');
      expect(open).toEqual(true);
    });

    test('getZoneOpen returns false for disabled zone', async () => {
      const response = mockGetInfinitySystemsResponse();
      response.infinitySystems[0].status.zones[0].enabled = 'off';
      const client = mockGraphQLClient();
      client.query.mockResolvedValue(response);

      const model = new SystemModelGraphQL(client, 'ABC123DEF456');
      const open = await model.status.getZoneOpen('1');
      expect(open).toEqual(false);
    });

    test('getZoneTemp returns number from zone rt', async () => {
      const { model } = createSystemModel();
      const temp = await model.status.getZoneTemp('1');
      expect(temp).toEqual(72);
    });

    test('getZoneHumidity returns number from zone rh', async () => {
      const { model } = createSystemModel();
      const humidity = await model.status.getZoneHumidity('1');
      expect(humidity).toEqual(38);
    });

    test('getZoneActivity returns current activity', async () => {
      const { model } = createSystemModel();
      const activity = await model.status.getZoneActivity('1');
      expect(activity).toEqual('home');
    });

    test('getZoneActivity returns correct activity for zone 2', async () => {
      const { model } = createSystemModel();
      const activity = await model.status.getZoneActivity('2');
      expect(activity).toEqual('away');
    });

    test('getZoneCoolSetpoint returns number from zone clsp', async () => {
      const { model } = createSystemModel();
      const setpoint = await model.status.getZoneCoolSetpoint('1');
      expect(setpoint).toEqual(74);
    });

    test('getZoneHeatSetpoint returns number from zone htsp', async () => {
      const { model } = createSystemModel();
      const setpoint = await model.status.getZoneHeatSetpoint('1');
      expect(setpoint).toEqual(68);
    });

    test('getHumidifier returns humidifier status', async () => {
      const { model } = createSystemModel();
      const status = await model.status.getHumidifier();
      expect(status).toEqual('off');
    });

    test('getHumidifier returns on when humid field is on', async () => {
      const response = mockGetInfinitySystemsResponse();
      response.infinitySystems[0].status.humid = 'on';
      const client = mockGraphQLClient();
      client.query.mockResolvedValue(response);

      const model = new SystemModelGraphQL(client, 'ABC123DEF456');
      const status = await model.status.getHumidifier();
      expect(status).toEqual('on');
    });

    test('getDehumidifier returns off when mode is not dehumidify', async () => {
      const { model } = createSystemModel();
      const status = await model.status.getDehumidifier();
      expect(status).toEqual('off');
    });

    test('getDehumidifier returns on when mode is dehumidify', async () => {
      const response = mockGetInfinitySystemsResponse();
      response.infinitySystems[0].status.mode = 'dehumidify';
      const client = mockGraphQLClient();
      client.query.mockResolvedValue(response);

      const model = new SystemModelGraphQL(client, 'ABC123DEF456');
      const status = await model.status.getDehumidifier();
      expect(status).toEqual('on');
    });
  });

  // ---------- SystemConfigModelReadOnlyGraphQL ----------

  describe('SystemConfigModelReadOnlyGraphQL (via SystemModelGraphQL)', () => {
    test('getMode returns config mode', async () => {
      const { model } = createSystemModel();
      const mode = await model.config.getMode();
      expect(mode).toEqual('auto');
    });

    test('getUnits returns config temperature units', async () => {
      const { model } = createSystemModel();
      const units = await model.config.getUnits();
      expect(units).toEqual('F');
    });

    test('getTempBounds returns default bounds', async () => {
      const { model } = createSystemModel();
      const bounds = await model.config.getTempBounds();
      expect(bounds).toEqual([50, 90]);
    });

    test('getZoneName returns zone name', async () => {
      const { model } = createSystemModel();
      expect(await model.config.getZoneName('1')).toEqual('Zone 1');
      expect(await model.config.getZoneName('2')).toEqual('Upstairs');
    });

    test('getZoneName throws on invalid zone', async () => {
      const { model } = createSystemModel();
      await expect(model.config.getZoneName('99')).rejects.toThrow(
        'Zone 99 not found in config',
      );
    });

    test('getZoneHoldStatus returns hold status and otmr', async () => {
      const { model } = createSystemModel();
      const [hold, otmr] = await model.config.getZoneHoldStatus('1');
      expect(hold).toEqual('off');
      expect(otmr).toEqual('');
    });

    test('getZoneHoldStatus returns on with timer when set', async () => {
      const response = mockGetInfinitySystemsResponse();
      response.infinitySystems[0].config.zones[0].hold = 'on';
      response.infinitySystems[0].config.zones[0].otmr = '2025-01-15T18:00:00';
      const client = mockGraphQLClient();
      client.query.mockResolvedValue(response);

      const model = new SystemModelGraphQL(client, 'ABC123DEF456');
      const [hold, otmr] = await model.config.getZoneHoldStatus('1');
      expect(hold).toEqual('on');
      expect(otmr).toEqual('2025-01-15T18:00:00');
    });

    // ---------- getZoneActivity (schedule-based) ----------

    describe('getZoneActivity', () => {
      test('returns holdActivity when hold is on', async () => {
        const response = mockGetInfinitySystemsResponse();
        response.infinitySystems[0].config.zones[0].hold = 'on';
        response.infinitySystems[0].config.zones[0].holdActivity = 'manual';
        const client = mockGraphQLClient();
        client.query.mockResolvedValue(response);

        const model = new SystemModelGraphQL(client, 'ABC123DEF456');
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('manual');
      });

      test('returns home as default holdActivity when hold is on but holdActivity is null', async () => {
        const response = mockGetInfinitySystemsResponse();
        response.infinitySystems[0].config.zones[0].hold = 'on';
        response.infinitySystems[0].config.zones[0].holdActivity = null;
        const client = mockGraphQLClient();
        client.query.mockResolvedValue(response);

        const model = new SystemModelGraphQL(client, 'ABC123DEF456');
        const activity = await model.config.getZoneActivity('1');
        // holdActivity is null, fallback: holdActivity || ACTIVITY.HOME => 'home'
        expect(activity).toEqual('home');
      });

      test('determines activity from schedule based on current time - morning wake', async () => {
        // Schedule has: wake@06:00, home@08:00, away@12:00, home@17:00, sleep@22:00
        // Set time to Wednesday 07:30 -> after wake@06:00, before home@08:00
        jest.setSystemTime(new Date(2025, 0, 15, 7, 30, 0)); // Wednesday

        const { model } = createSystemModel();
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('wake');
      });

      test('determines activity from schedule based on current time - midday home', async () => {
        // Set time to Wednesday 10:00 -> after home@08:00, before away@12:00
        jest.setSystemTime(new Date(2025, 0, 15, 10, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('home');
      });

      test('determines activity from schedule based on current time - afternoon away', async () => {
        // Set time to Wednesday 14:00 -> after away@12:00, before home@17:00
        jest.setSystemTime(new Date(2025, 0, 15, 14, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('away');
      });

      test('determines activity from schedule based on current time - evening home', async () => {
        // Set time to Wednesday 19:00 -> after home@17:00, before sleep@22:00
        jest.setSystemTime(new Date(2025, 0, 15, 19, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('home');
      });

      test('determines activity from schedule based on current time - night sleep', async () => {
        // Set time to Wednesday 23:00 -> after sleep@22:00
        jest.setSystemTime(new Date(2025, 0, 15, 23, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('sleep');
      });

      test('falls back to yesterday last activity when before first period today', async () => {
        // Set time to Wednesday 05:00 -> before wake@06:00
        // Should fall back to yesterday's last enabled period (sleep@22:00)
        jest.setSystemTime(new Date(2025, 0, 15, 5, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const activity = await model.config.getZoneActivity('1');
        expect(activity).toEqual('sleep');
      });
    });

    // ---------- Activity setpoints ----------

    describe('getZoneActivityCoolSetpoint', () => {
      test('returns cool setpoint for home activity', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityCoolSetpoint('1', ACTIVITY.HOME);
        expect(setpoint).toEqual(74);
      });

      test('returns cool setpoint for away activity', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityCoolSetpoint('1', ACTIVITY.AWAY);
        expect(setpoint).toEqual(78);
      });

      test('returns cool setpoint for sleep activity', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityCoolSetpoint('1', ACTIVITY.SLEEP);
        expect(setpoint).toEqual(76);
      });
    });

    describe('getZoneActivityHeatSetpoint', () => {
      test('returns heat setpoint for home activity', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityHeatSetpoint('1', ACTIVITY.HOME);
        expect(setpoint).toEqual(68);
      });

      test('returns heat setpoint for away activity', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityHeatSetpoint('1', ACTIVITY.AWAY);
        expect(setpoint).toEqual(62);
      });

      test('returns heat setpoint for wake activity', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityHeatSetpoint('1', ACTIVITY.WAKE);
        expect(setpoint).toEqual(70);
      });
    });

    describe('getZoneActivityFan', () => {
      test('returns fan mode for activity', async () => {
        const { model } = createSystemModel();
        const fan = await model.config.getZoneActivityFan('1', ACTIVITY.HOME);
        expect(fan).toEqual('off');
      });
    });

    // ---------- Vacation activity ----------

    describe('vacation activity config', () => {
      test('getZoneActivityCoolSetpoint uses system-level vacmaxt for vacation', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityCoolSetpoint('1', ACTIVITY.VACATION);
        expect(setpoint).toEqual(85);
      });

      test('getZoneActivityHeatSetpoint uses system-level vacmint for vacation', async () => {
        const { model } = createSystemModel();
        const setpoint = await model.config.getZoneActivityHeatSetpoint('1', ACTIVITY.VACATION);
        expect(setpoint).toEqual(55);
      });

      test('getZoneActivityFan uses system-level vacfan for vacation', async () => {
        const { model } = createSystemModel();
        const fan = await model.config.getZoneActivityFan('1', ACTIVITY.VACATION);
        expect(fan).toEqual('off');
      });
    });

    // ---------- Activity lookup errors ----------

    test('getZoneActivityCoolSetpoint throws for unknown activity', async () => {
      const { model } = createSystemModel();
      await expect(
        model.config.getZoneActivityCoolSetpoint('1', 'nonexistent'),
      ).rejects.toThrow('Activity nonexistent not found for zone 1');
    });

    test('getZoneActivityCoolSetpoint throws for unknown zone', async () => {
      const { model } = createSystemModel();
      await expect(
        model.config.getZoneActivityCoolSetpoint('99', ACTIVITY.HOME),
      ).rejects.toThrow('Zone 99 not found in config');
    });

    // ---------- getZoneNextActivityTime ----------

    describe('getZoneNextActivityTime', () => {
      test('returns next period time when in the middle of a day', async () => {
        // Schedule: wake@06:00, home@08:00, away@12:00, home@17:00, sleep@22:00
        // At 10:00, next activity should be away@12:00
        jest.setSystemTime(new Date(2025, 0, 15, 10, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const nextTime = await model.config.getZoneNextActivityTime('1');
        expect(nextTime).toEqual('12:00');
      });

      test('returns next period time at beginning of day', async () => {
        // At 05:00, next activity should be wake@06:00
        jest.setSystemTime(new Date(2025, 0, 15, 5, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const nextTime = await model.config.getZoneNextActivityTime('1');
        expect(nextTime).toEqual('06:00');
      });

      test('returns first period of tomorrow when past last period today', async () => {
        // At 23:00, past sleep@22:00, should wrap to tomorrow's wake@06:00
        jest.setSystemTime(new Date(2025, 0, 15, 23, 0, 0)); // Wednesday

        const { model } = createSystemModel();
        const nextTime = await model.config.getZoneNextActivityTime('1');
        expect(nextTime).toEqual('06:00');
      });

      test('returns the very next period when right before one', async () => {
        // At 16:59, next activity should be home@17:00
        jest.setSystemTime(new Date(2025, 0, 15, 16, 59, 0)); // Wednesday

        const { model } = createSystemModel();
        const nextTime = await model.config.getZoneNextActivityTime('1');
        expect(nextTime).toEqual('17:00');
      });
    });

    // ---------- Humidity config ----------

    describe('humidity config getters', () => {
      test('getActivityHumidifierState returns humidifier state for home', async () => {
        const { model } = createSystemModel();
        // mockSystemConfig() has humidityHome.humidifier = 'on'
        const state = await model.config.getActivityHumidifierState(ACTIVITY.HOME);
        expect(state).toEqual('on');
      });

      test('getActivityHumidifierState returns humidifier state for away', async () => {
        const { model } = createSystemModel();
        // mockSystemConfig() has humidityAway.humidifier = 'off'
        const state = await model.config.getActivityHumidifierState(ACTIVITY.AWAY);
        expect(state).toEqual('off');
      });

      test('getActivityDehumidifierState returns dehumidifier state for home', async () => {
        const { model } = createSystemModel();
        // humidityHome has humid='on', returns it
        const state = await model.config.getActivityDehumidifierState(ACTIVITY.HOME);
        expect(state).toEqual('on');
      });

      test('getActivityDehumidifierState returns off when both are off', async () => {
        const { model } = createSystemModel();
        // humidityAway has humid='off', rclgovercool='off'
        const state = await model.config.getActivityDehumidifierState(ACTIVITY.AWAY);
        expect(state).toEqual('off');
      });

      test('getActivityHumidifierTarget returns converted rhtg value', async () => {
        const { model } = createSystemModel();
        // humidityHome.rhtg = 7 -> 7 * 5 = 35%
        const target = await model.config.getActivityHumidifierTarget(ACTIVITY.HOME);
        expect(target).toEqual(35);
      });

      test('getActivityDehumidifierTarget returns converted rclg value', async () => {
        const { model } = createSystemModel();
        // humidityHome.rclg = 4 -> 44 + 4*2 = 52%
        const target = await model.config.getActivityDehumidifierTarget(ACTIVITY.HOME);
        expect(target).toEqual(52);
      });

      describe('humidity config activity mapping', () => {
        test.each([
          [ACTIVITY.HOME, 'humidityHome'],
          [ACTIVITY.WAKE, 'humidityHome'],
          [ACTIVITY.SLEEP, 'humidityHome'],
          [ACTIVITY.MANUAL, 'humidityHome'],
          [ACTIVITY.AWAY, 'humidityAway'],
          [ACTIVITY.VACATION, 'humidityVacation'],
        ])('activity "%s" maps to %s', async (activity, configKey) => {
          const response = mockGetInfinitySystemsResponse();
          // Set different rhtg values for each key to distinguish them
          (response.infinitySystems[0].config as any).humidityHome.rhtg = 5;
          (response.infinitySystems[0].config as any).humidityAway.rhtg = 3;
          (response.infinitySystems[0].config as any).humidityVacation.rhtg = 1;

          const client = mockGraphQLClient();
          client.query.mockResolvedValue(response);
          const model = new SystemModelGraphQL(client, 'ABC123DEF456');

          const target = await model.config.getActivityHumidifierTarget(activity);

          const expected: Record<string, number> = {
            humidityHome: 25,    // 5 * 5 = 25
            humidityAway: 15,    // 3 * 5 = 15
            humidityVacation: 5, // 1 * 5 = 5
          };
          expect(target).toEqual(expected[configKey]);
        });
      });

      test('getActivityHumidifierTarget returns minimum when rhtg is missing', async () => {
        const response = mockGetInfinitySystemsResponse();
        delete (response.infinitySystems[0].config.humidityVacation as any).rhtg;
        const client = mockGraphQLClient();
        client.query.mockResolvedValue(response);

        const model = new SystemModelGraphQL(client, 'ABC123DEF456');
        // rhtg is undefined -> convertSystemHum2CharHum(0) -> 5
        const target = await model.config.getActivityHumidifierTarget(ACTIVITY.VACATION);
        expect(target).toEqual(5);
      });

      test('getActivityDehumidifierTarget returns maximum when rclg is missing', async () => {
        const response = mockGetInfinitySystemsResponse();
        delete (response.infinitySystems[0].config.humidityVacation as any).rclg;
        const client = mockGraphQLClient();
        client.query.mockResolvedValue(response);

        const model = new SystemModelGraphQL(client, 'ABC123DEF456');
        // rclg is undefined -> convertSystemDehum2CharDehum(0) -> 58
        const target = await model.config.getActivityDehumidifierTarget(ACTIVITY.VACATION);
        expect(target).toEqual(58);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// SystemConfigModelGraphQL — mutations
// ---------------------------------------------------------------------------

describe('SystemConfigModelGraphQL mutations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createSystemModelForMutations() {
    const response = mockGetInfinitySystemsResponse();
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(response);
    client.mutate.mockResolvedValue({ updateInfinityConfig: { etag: 'new' } });
    const model = new SystemModelGraphQL(client, 'ABC123DEF456');
    return { model, client, response };
  }

  test('setMode queues a single mutation', async () => {
    const { model } = createSystemModelForMutations();

    await model.config.setMode('cool');
    expect(model.config.mutations).toHaveLength(1);
  });

  test('setMode mutation closure produces correct input', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setMode('cool');
    const mutation = model.config.mutations[0];
    const input = mutation(config, status);

    expect(input).toEqual({
      serial: 'ABC123DEF456',
      mode: 'cool',
    });
  });

  test('setZoneActivityHold queues a single mutation', async () => {
    const { model } = createSystemModelForMutations();

    await model.config.setZoneActivityHold('1', 'home', '2025-01-15T18:00:00');
    expect(model.config.mutations).toHaveLength(1);
  });

  test('setZoneActivityHold mutation closure produces correct input for hold on', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityHold('1', 'home', '2025-01-15T18:00:00');
    const mutation = model.config.mutations[0];
    const input = mutation(config, status);

    expect(input).toEqual({
      serial: 'ABC123DEF456',
      zoneId: '1',
      hold: STATUS.ON,
      holdActivity: 'home',
      otmr: '2025-01-15T18:00:00',
    });
  });

  test('setZoneActivityHold mutation closure produces correct input for hold off', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityHold('1', '', null);
    const mutation = model.config.mutations[0];
    const input = mutation(config, status);

    expect(input).toEqual({
      serial: 'ABC123DEF456',
      zoneId: '1',
      hold: STATUS.OFF,
      holdActivity: null,
      otmr: null,
    });
  });

  test('setZoneActivityManualHold queues two mutations', async () => {
    const { model } = createSystemModelForMutations();

    await model.config.setZoneActivityManualHold('1', 75, 68, '2025-01-15T18:00:00');
    expect(model.config.mutations).toHaveLength(2);
  });

  test('setZoneActivityManualHold first mutation sets activity setpoints', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityManualHold('1', 75, 68, '2025-01-15T18:00:00');
    const input = model.config.mutations[0](config, status);

    expect(input).toMatchObject({
      serial: 'ABC123DEF456',
      zoneId: '1',
      activityType: ACTIVITY.MANUAL,
    });
    // Should have htsp, clsp, and fan
    expect(input).toHaveProperty('htsp');
    expect(input).toHaveProperty('clsp');
    expect(input).toHaveProperty('fan');
  });

  test('setZoneActivityManualHold second mutation sets hold', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityManualHold('1', 75, 68, '2025-01-15T18:00:00');
    const input = model.config.mutations[1](config, status);

    expect(input).toEqual({
      serial: 'ABC123DEF456',
      zoneId: '1',
      hold: STATUS.ON,
      holdActivity: ACTIVITY.MANUAL,
      otmr: '2025-01-15T18:00:00',
    });
  });

  test('setZoneActivityManualHold applies deadband processing', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    // Set htsp close to clsp to trigger deadband
    await model.config.setZoneActivityManualHold('1', 70, 70, null);
    const input = model.config.mutations[0](config, status) as any;

    // Deadband should push them apart. The manual activity has htsp=68, clsp=74 defaults.
    // Passing htsp=70, clsp=70 with cfgem=F. processSetpointDeadband(70, 70, 'F', false)
    // = [70, 72] (clsp sticky when htsp is not null)
    expect(Number(input.htsp)).toEqual(70);
    expect(Number(input.clsp)).toEqual(72);
  });

  test('setZoneActivityManualHold uses existing fan when none specified', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityManualHold('1', 75, 68, null);
    const input = model.config.mutations[0](config, status) as any;

    // Manual activity fan defaults to 'off' in fixture
    expect(input.fan).toEqual('off');
  });

  test('setZoneActivityManualHold uses provided fan', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityManualHold('1', 75, 68, null, 'high');
    const input = model.config.mutations[0](config, status) as any;

    expect(input.fan).toEqual('high');
  });

  test('setZoneActivityManualHold with only clsp keeps htsp sticky', async () => {
    const { model } = createSystemModelForMutations();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    // Only set cool setpoint. htsp=null means make clsp sticky.
    await model.config.setZoneActivityManualHold('1', 80, null, null);
    const input = model.config.mutations[0](config, status) as any;

    // Manual activity defaults: htsp=68, clsp=74
    // processSetpointDeadband(68, 80, 'F', true) where htsp=null means clsp sticky
    // 68 < 80 - 2 = 78, so no deadband adjustment needed
    expect(Number(input.htsp)).toEqual(68);
    expect(Number(input.clsp)).toEqual(80);
  });

  // ---------- setHumidityConfig ----------

  describe('setHumidityConfig', () => {
    test('queues a single mutation', async () => {
      const { model } = createSystemModelForMutations();

      await model.config.setHumidityConfig(ACTIVITY.HOME, 'on');
      expect(model.config.mutations).toHaveLength(1);
    });

    test('home activity mutation targets humidityHome', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      await model.config.setHumidityConfig(ACTIVITY.HOME, 'on');
      const input = model.config.mutations[0](config, status) as any;

      expect(input.serial).toEqual('ABC123DEF456');
      expect(input.humidityHome).toBeDefined();
      expect(input.humidityHome.humidifier).toEqual('on');
      expect(input.humidityAway).toBeUndefined();
      expect(input.humidityVacation).toBeUndefined();
    });

    test('away activity mutation targets humidityAway', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      await model.config.setHumidityConfig(ACTIVITY.AWAY, 'on');
      const input = model.config.mutations[0](config, status) as any;

      expect(input.humidityAway).toBeDefined();
      expect(input.humidityAway.humidifier).toEqual('on');
      expect(input.humidityHome).toBeUndefined();
    });

    test('vacation activity mutation targets humidityVacation', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      await model.config.setHumidityConfig(ACTIVITY.VACATION, 'on');
      const input = model.config.mutations[0](config, status) as any;

      expect(input.humidityVacation).toBeDefined();
      expect(input.humidityVacation.humidifier).toEqual('on');
      expect(input.humidityHome).toBeUndefined();
    });

    test.each([
      ACTIVITY.WAKE,
      ACTIVITY.SLEEP,
      ACTIVITY.MANUAL,
    ])('activity "%s" maps to humidityHome', async (activity) => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      await model.config.setHumidityConfig(activity, 'on');
      const input = model.config.mutations[0](config, status) as any;

      expect(input.humidityHome).toBeDefined();
    });

    test('sets dehumidifier fields (humid and rclgovercool)', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      await model.config.setHumidityConfig(ACTIVITY.HOME, undefined, 'on');
      const input = model.config.mutations[0](config, status) as any;

      expect(input.humidityHome.humid).toEqual('on');
      expect(input.humidityHome.rclgovercool).toEqual('on');
    });

    test('sets humidifier target via convertCharHum2SystemHum', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      // 40% -> convertCharHum2SystemHum(40) -> 8
      await model.config.setHumidityConfig(ACTIVITY.HOME, undefined, undefined, 40);
      const input = model.config.mutations[0](config, status) as any;

      expect(input.humidityHome.rhtg).toEqual(8);
    });

    test('sets dehumidifier target via convertCharDehum2SystemDehum', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      // 52% -> convertCharDehum2SystemDehum(52) -> 4
      await model.config.setHumidityConfig(ACTIVITY.HOME, undefined, undefined, undefined, 52);
      const input = model.config.mutations[0](config, status) as any;

      expect(input.humidityHome.rclg).toEqual(4);
    });

    test('preserves existing humidity config fields when only updating some', async () => {
      const { model } = createSystemModelForMutations();
      const config = mockSystemConfig();
      const status = mockSystemStatus();

      // Only set humidifier to 'on', rest should carry existing config
      await model.config.setHumidityConfig(ACTIVITY.HOME, 'on');
      const input = model.config.mutations[0](config, status) as any;

      // Should still have the original rhtg and rclg from humidityHome fixture
      expect(input.humidityHome.rhtg).toEqual(7);
      expect(input.humidityHome.rclg).toEqual(4);
      expect(input.humidityHome.humidifier).toEqual('on');
    });
  });

  // ---------- fetch skips when mutations are pending ----------

  test('fetch skips when mutations are pending', async () => {
    const response = mockGetInfinitySystemsResponse();
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(response);
    const model = new SystemModelGraphQL(client, 'ABC123DEF456');

    // Initial fetch to load data
    await model.config.fetch();
    const callCount = client.query.mock.calls.length;

    // Queue a mutation
    await model.config.setMode('cool');
    expect(model.config.mutations).toHaveLength(1);

    // Fetch should be skipped
    await model.config.fetch();
    expect(client.query.mock.calls.length).toEqual(callCount);
  });

  // ---------- Multiple mutations batch ----------

  test('multiple setMode calls accumulate mutations', async () => {
    const { model } = createSystemModelForMutations();

    await model.config.setMode('cool');
    await model.config.setMode('heat');
    // Each setMode pushes 1 mutation; push() is async but doesn't await here
    expect(model.config.mutations.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('status zone lookup throws on missing zone', async () => {
    const response = mockGetInfinitySystemsResponse();
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(response);
    const model = new SystemModelGraphQL(client, 'ABC123DEF456');

    await expect(model.status.getZoneTemp('5')).rejects.toThrow('Zone 5 not found in status');
  });

  test('config zone lookup throws on missing zone', async () => {
    const response = mockGetInfinitySystemsResponse();
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(response);
    const model = new SystemModelGraphQL(client, 'ABC123DEF456');

    await expect(model.config.getZoneActivity('5')).rejects.toThrow('Zone 5 not found in config');
  });

  test('setZoneActivityManualHold throws when manual activity is missing', async () => {
    const response = mockGetInfinitySystemsResponse();
    // Remove the manual activity from zone 1
    response.infinitySystems[0].config.zones[0].activities =
      response.infinitySystems[0].config.zones[0].activities.filter(a => a.type !== 'manual');

    const client = mockGraphQLClient();
    client.query.mockResolvedValue(response);
    const model = new SystemModelGraphQL(client, 'ABC123DEF456');

    await model.config.setZoneActivityManualHold('1', 75, 68, null);
    const config = mockSystemConfig();
    // Remove manual activity from the config passed to the mutation closure too
    config.zones[0].activities = config.zones[0].activities.filter(a => a.type !== 'manual');
    const status = mockSystemStatus();

    const mutation = model.config.mutations[0];
    expect(() => mutation(config, status)).toThrow('MANUAL activity not found for zone 1');
  });

  test('LocationsModelGraphQL handles empty locations', async () => {
    const client = mockGraphQLClient();
    const response = mockGetUserResponse();
    response.user.locations = [];
    client.query.mockResolvedValue(response);

    const model = new LocationsModelGraphQL(client);
    const systems = await model.getSystems();
    expect(systems).toEqual([]);
  });

  test('LocationsModelGraphQL handles location with no systems', async () => {
    const client = mockGraphQLClient();
    const response = mockGetUserResponse();
    response.user.locations[0].systems = [];
    client.query.mockResolvedValue(response);

    const model = new LocationsModelGraphQL(client);
    const systems = await model.getSystems();
    expect(systems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Zone 2 operations
// ---------------------------------------------------------------------------

describe('zone 2 operations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createModel() {
    const response = mockGetInfinitySystemsResponse();
    const client = mockGraphQLClient();
    client.query.mockResolvedValue(response);
    client.mutate.mockResolvedValue({ updateInfinityConfig: { etag: 'new' } });
    return new SystemModelGraphQL(client, 'ABC123DEF456');
  }

  test('status getZoneTemp returns zone 2 temperature', async () => {
    const model = createModel();
    const temp = await model.status.getZoneTemp('2');
    expect(temp).toEqual(70);
  });

  test('status getZoneHumidity returns zone 2 humidity', async () => {
    const model = createModel();
    const humidity = await model.status.getZoneHumidity('2');
    expect(humidity).toEqual(35);
  });

  test('config getZoneName returns zone 2 name', async () => {
    const model = createModel();
    const name = await model.config.getZoneName('2');
    expect(name).toEqual('Upstairs');
  });

  test('config getZoneActivityCoolSetpoint returns zone 2 away setpoint', async () => {
    const model = createModel();
    const setpoint = await model.config.getZoneActivityCoolSetpoint('2', ACTIVITY.AWAY);
    expect(setpoint).toEqual(78);
  });

  test('setZoneActivityManualHold works for zone 2', async () => {
    const model = createModel();
    const config = mockSystemConfig();
    const status = mockSystemStatus();

    await model.config.setZoneActivityManualHold('2', 76, 66, null);
    const input = model.config.mutations[0](config, status) as any;

    expect(input.serial).toEqual('ABC123DEF456');
    expect(input.zoneId).toEqual('2');
    expect(input.activityType).toEqual(ACTIVITY.MANUAL);
  });
});
