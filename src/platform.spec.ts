/* eslint-disable @typescript-eslint/no-explicit-any */

import { mockLogger, mockAPI, mockPlatformAccessory } from './__mocks__/homebridge';
import { mockSystemModel } from './__mocks__/system_model';

// Mock the GraphQL client module
jest.mock('./api/graphql_client', () => ({
  InfinityGraphQLClient: jest.fn().mockImplementation(() => ({
    refreshToken: jest.fn().mockResolvedValue(undefined),
    username: 'testuser',
    log: mockLogger(),
  })),
}));

// Mock the models module
const mockGetSystems = jest.fn().mockResolvedValue(['ABC123DEF456']);
const MockSystemModelGraphQL = jest.fn().mockImplementation((_client: any, serial: string) => {
  return mockSystemModel(serial);
});
jest.mock('./api/models_graphql', () => {
  return {
    LocationsModelGraphQL: jest.fn().mockImplementation(() => ({
      getSystems: mockGetSystems,
    })),
    SystemModelGraphQL: MockSystemModelGraphQL,
  };
});

// Mock accessory modules to prevent them from setting up real characteristic wrappers.
// The constructors call into BaseAccessory which registers accessories and uses
// system models. We mock them so we only test platform-level orchestration.
jest.mock('./accessory_thermostat', () => ({
  ThermostatAccessory: jest.fn().mockImplementation((platform: any, context: any) => {
    const uuid = platform.api.hap.uuid.generate(`${context.serialNumber}:${Number(context.zone) - 1}`);
    let accessory = platform.restored_accessories[uuid];
    if (!accessory) {
      accessory = new platform.api.platformAccessory(context.name, uuid);
      accessory.context = context;
      platform.api.registerPlatformAccessories('homebridge-carrier-infinity', 'CarrierInfinity', [accessory]);
    } else {
      accessory.context = context;
      platform.api.updatePlatformAccessories([accessory]);
    }
    platform.accessories[uuid] = { accessory };
  }),
}));

jest.mock('./accessory_oat', () => ({
  OutdoorTemperatureAccessory: jest.fn().mockImplementation((platform: any, context: any) => {
    const uuid = platform.api.hap.uuid.generate(`OAT:${context.serialNumber}`);
    let accessory = platform.restored_accessories[uuid];
    if (!accessory) {
      accessory = new platform.api.platformAccessory(context.name, uuid);
      accessory.context = context;
      platform.api.registerPlatformAccessories('homebridge-carrier-infinity', 'CarrierInfinity', [accessory]);
    } else {
      accessory.context = context;
      platform.api.updatePlatformAccessories([accessory]);
    }
    platform.accessories[uuid] = { accessory };
  }),
}));

jest.mock('./accessory_envsensor', () => ({
  EnvSensorAccessory: jest.fn().mockImplementation((platform: any, context: any) => {
    const uuid = platform.api.hap.uuid.generate(`ENVSENSOR:${context.serialNumber}:${Number(context.zone) - 1}`);
    let accessory = platform.restored_accessories[uuid];
    if (!accessory) {
      accessory = new platform.api.platformAccessory(context.name, uuid);
      accessory.context = context;
      platform.api.registerPlatformAccessories('homebridge-carrier-infinity', 'CarrierInfinity', [accessory]);
    } else {
      accessory.context = context;
      platform.api.updatePlatformAccessories([accessory]);
    }
    platform.accessories[uuid] = { accessory };
  }),
}));

jest.mock('./accessory_comfort_activity', () => ({
  ComfortActivityAccessory: jest.fn().mockImplementation((platform: any, context: any) => {
    const uuid = platform.api.hap.uuid.generate(`ComfortActivity:${context.serialNumber}:${context.zone}`);
    let accessory = platform.restored_accessories[uuid];
    if (!accessory) {
      accessory = new platform.api.platformAccessory(context.name, uuid);
      accessory.context = context;
      platform.api.registerPlatformAccessories('homebridge-carrier-infinity', 'CarrierInfinity', [accessory]);
    } else {
      accessory.context = context;
      platform.api.updatePlatformAccessories([accessory]);
    }
    platform.accessories[uuid] = { accessory };
  }),
}));

import { CarrierInfinityHomebridgePlatform } from './platform';
import { ThermostatAccessory } from './accessory_thermostat';
import { OutdoorTemperatureAccessory } from './accessory_oat';
import { EnvSensorAccessory } from './accessory_envsensor';
import { ComfortActivityAccessory } from './accessory_comfort_activity';
import { InfinityGraphQLClient } from './api/graphql_client';

function createPlatform(configOverrides: any = {}) {
  const log = mockLogger();
  const api = mockAPI();
  const config = {
    platform: 'CarrierInfinity',
    username: 'testuser',
    password: 'testpass',
    showOutdoorTemperatureSensor: false,
    showIndoorHumiditySensors: false,
    showZoneComfortActivityControls: false,
    showFanControl: false,
    showHumidifierDehumidifier: false,
    holdBehavior: 'forever',
    holdArgument: '',
    ...configOverrides,
  };

  const platform = new CarrierInfinityHomebridgePlatform(log as any, config as any, api as any);
  return { platform, log, api, config };
}

/**
 * Retrieve the didFinishLaunching callback registered on the mock API.
 */
function getDidFinishLaunchingCallback(api: any): () => void {
  const call = api.on.mock.calls.find((c: any[]) => c[0] === 'didFinishLaunching');
  expect(call).toBeDefined();
  return call[1];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSystems.mockResolvedValue(['ABC123DEF456']);
  MockSystemModelGraphQL.mockImplementation((_client: any, serial: string) => {
    return mockSystemModel(serial);
  });
});

describe('CarrierInfinityHomebridgePlatform', () => {

  describe('constructor', () => {
    test('logs error when username is missing', () => {
      const { log } = createPlatform({ username: '', password: 'testpass' });
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Username and password do not appear to be set'),
      );
    });

    test('logs error when password is missing', () => {
      const { log } = createPlatform({ username: 'testuser', password: '' });
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Username and password do not appear to be set'),
      );
    });

    test('logs error when both username and password are missing', () => {
      const { log } = createPlatform({ username: undefined, password: undefined });
      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Username and password do not appear to be set'),
      );
    });

    test('does not log error when credentials are provided', () => {
      const { log } = createPlatform();
      expect(log.error).not.toHaveBeenCalled();
    });

    test('creates InfinityGraphQLClient with credentials', () => {
      createPlatform({ username: 'myuser', password: 'mypass' });
      expect(InfinityGraphQLClient).toHaveBeenCalledWith(
        'myuser',
        'mypass',
        expect.anything(),
      );
    });

    test('calls refreshToken immediately to speed up init', () => {
      const { platform } = createPlatform();
      expect(platform.infinity_client.refreshToken).toHaveBeenCalled();
    });

    test('registers didFinishLaunching listener on api', () => {
      const { api } = createPlatform();
      expect(api.on).toHaveBeenCalledWith('didFinishLaunching', expect.any(Function));
    });
  });

  describe('configureAccessory', () => {
    test('caches accessory by UUID in restored_accessories', () => {
      const { platform } = createPlatform();
      const accessory = mockPlatformAccessory('TestAccessory', 'uuid-123');

      platform.configureAccessory(accessory as any);

      expect(platform.restored_accessories['uuid-123']).toBe(accessory);
    });

    test('can cache multiple accessories', () => {
      const { platform } = createPlatform();
      const firstAccessory = mockPlatformAccessory('First', 'uuid-aaa');
      const secondAccessory = mockPlatformAccessory('Second', 'uuid-bbb');

      platform.configureAccessory(firstAccessory as any);
      platform.configureAccessory(secondAccessory as any);

      expect(platform.restored_accessories['uuid-aaa']).toBe(firstAccessory);
      expect(platform.restored_accessories['uuid-bbb']).toBe(secondAccessory);
      expect(Object.keys(platform.restored_accessories)).toHaveLength(2);
    });
  });

  describe('discoverSystems', () => {
    test('creates thermostat accessory for each zone', async () => {
      const { platform } = createPlatform();

      await platform.discoverSystems();

      expect(ThermostatAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({
          serialNumber: 'ABC123DEF456',
          zone: '1',
          name: expect.stringContaining('Thermostat'),
          holdBehavior: 'forever',
          holdArgument: '',
        }),
      );
    });

    test('creates outdoor temp accessory when showOutdoorTemperatureSensor is true', async () => {
      const { platform } = createPlatform({ showOutdoorTemperatureSensor: true });

      await platform.discoverSystems();

      expect(OutdoorTemperatureAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({
          serialNumber: 'ABC123DEF456',
          name: 'Outdoor Temperature',
        }),
      );
    });

    test('does NOT create outdoor temp accessory when config is false', async () => {
      const { platform } = createPlatform({ showOutdoorTemperatureSensor: false });

      await platform.discoverSystems();

      expect(OutdoorTemperatureAccessory).not.toHaveBeenCalled();
    });

    test('creates env sensor accessory when showIndoorHumiditySensors is true', async () => {
      const { platform } = createPlatform({ showIndoorHumiditySensors: true });

      await platform.discoverSystems();

      expect(EnvSensorAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({
          serialNumber: 'ABC123DEF456',
          zone: '1',
          name: expect.stringContaining('Environmental Sensor'),
        }),
      );
    });

    test('does NOT create env sensor when config is false', async () => {
      const { platform } = createPlatform({ showIndoorHumiditySensors: false });

      await platform.discoverSystems();

      expect(EnvSensorAccessory).not.toHaveBeenCalled();
    });

    test('creates comfort activity accessory when showZoneComfortActivityControls is true', async () => {
      const { platform } = createPlatform({ showZoneComfortActivityControls: true });

      await platform.discoverSystems();

      expect(ComfortActivityAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({
          serialNumber: 'ABC123DEF456',
          zone: '1',
          name: expect.stringContaining('Comfort Activity'),
          holdBehavior: 'forever',
          holdArgument: '',
        }),
      );
    });

    test('does NOT create comfort activity when config is false', async () => {
      const { platform } = createPlatform({ showZoneComfortActivityControls: false });

      await platform.discoverSystems();

      expect(ComfortActivityAccessory).not.toHaveBeenCalled();
    });

    test('filters systems by serial number when config.systems array is provided', async () => {
      mockGetSystems.mockResolvedValue(['ABC123DEF456', 'XYZ789GHI012']);
      const { platform, log } = createPlatform({ systems: ['ABC123DEF456'] });

      await platform.discoverSystems();

      // Should only create thermostat for the allowed system
      expect(ThermostatAccessory).toHaveBeenCalledTimes(1);
      expect(ThermostatAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ serialNumber: 'ABC123DEF456' }),
      );
      // Should log that the skipped system was filtered
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining('XYZ789GHI012'),
      );
    });

    test('does not filter systems when config.systems is empty', async () => {
      mockGetSystems.mockResolvedValue(['ABC123DEF456', 'XYZ789GHI012']);
      const { platform } = createPlatform({ systems: [] });

      await platform.discoverSystems();

      expect(ThermostatAccessory).toHaveBeenCalledTimes(2);
    });

    test('removes stale restored accessories that are not rediscovered', async () => {
      const { platform, api } = createPlatform();
      const staleAccessory = mockPlatformAccessory('StaleAccessory', 'uuid-stale');
      staleAccessory.context = { serialNumber: 'OLD_SERIAL', name: 'Old Device' };
      platform.restored_accessories['uuid-stale'] = staleAccessory as any;

      await platform.discoverSystems();

      expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(
        'homebridge-carrier-infinity',
        'CarrierInfinity',
        [staleAccessory],
      );
      expect(platform.restored_accessories['uuid-stale']).toBeUndefined();
    });

    test('does not remove restored accessories that are rediscovered', async () => {
      const { platform, api } = createPlatform();
      // Pre-populate a restored accessory with the UUID that the thermostat would generate
      const thermostatUuid = 'uuid-ABC123DEF456:0';
      const restoredAccessory = mockPlatformAccessory('Restored Thermostat', thermostatUuid);
      restoredAccessory.context = { serialNumber: 'ABC123DEF456', name: 'Restored' };
      platform.restored_accessories[thermostatUuid] = restoredAccessory as any;

      await platform.discoverSystems();

      expect(api.unregisterPlatformAccessories).not.toHaveBeenCalled();
    });

    test('handles API errors during discovery gracefully', async () => {
      const { platform, log } = createPlatform();
      // Make the refreshToken call inside discoverSystems reject
      platform.infinity_client.refreshToken = jest.fn().mockRejectedValue(new Error('Network failure'));

      // discoverSystems will throw, but when called from the didFinishLaunching callback it is caught
      const callback = getDidFinishLaunchingCallback(platform.api as any);
      await new Promise<void>((resolve) => {
        // The callback calls discoverSystems().catch() which logs and resolves
        callback();
        // Allow async tasks to settle
        setImmediate(resolve);
      });

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not discover devices'),
      );
    });

    test('stores discovered systems in platform.systems by serial number', async () => {
      const { platform } = createPlatform();

      await platform.discoverSystems();

      expect(platform.systems['ABC123DEF456']).toBeDefined();
      expect(platform.systems['ABC123DEF456'].serialNumber).toBe('ABC123DEF456');
    });

    test('creates all optional accessories when all options enabled', async () => {
      const { platform } = createPlatform({
        showOutdoorTemperatureSensor: true,
        showIndoorHumiditySensors: true,
        showZoneComfortActivityControls: true,
      });

      await platform.discoverSystems();

      expect(ThermostatAccessory).toHaveBeenCalledTimes(1);
      expect(OutdoorTemperatureAccessory).toHaveBeenCalledTimes(1);
      expect(EnvSensorAccessory).toHaveBeenCalledTimes(1);
      expect(ComfortActivityAccessory).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-zone', () => {
    test('creates one thermostat per zone when profile returns multiple zones', async () => {
      MockSystemModelGraphQL.mockImplementation((_client: any, serial: string) => {
        const model = mockSystemModel(serial);
        model.profile.getZones.mockResolvedValue(['1', '2', '3']);
        return model;
      });

      const { platform } = createPlatform();

      await platform.discoverSystems();

      expect(ThermostatAccessory).toHaveBeenCalledTimes(3);
      expect(ThermostatAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ zone: '1' }),
      );
      expect(ThermostatAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ zone: '2' }),
      );
      expect(ThermostatAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ zone: '3' }),
      );
    });

    test('creates env sensor per zone when enabled with multiple zones', async () => {
      MockSystemModelGraphQL.mockImplementation((_client: any, serial: string) => {
        const model = mockSystemModel(serial);
        model.profile.getZones.mockResolvedValue(['1', '2']);
        return model;
      });

      const { platform } = createPlatform({ showIndoorHumiditySensors: true });

      await platform.discoverSystems();

      expect(EnvSensorAccessory).toHaveBeenCalledTimes(2);
      expect(EnvSensorAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ zone: '1' }),
      );
      expect(EnvSensorAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ zone: '2' }),
      );
    });

    test('creates comfort activity per zone when enabled with multiple zones', async () => {
      MockSystemModelGraphQL.mockImplementation((_client: any, serial: string) => {
        const model = mockSystemModel(serial);
        model.profile.getZones.mockResolvedValue(['1', '2']);
        return model;
      });

      const { platform } = createPlatform({ showZoneComfortActivityControls: true });

      await platform.discoverSystems();

      expect(ComfortActivityAccessory).toHaveBeenCalledTimes(2);
    });

    test('creates only one outdoor temp accessory regardless of zone count', async () => {
      MockSystemModelGraphQL.mockImplementation((_client: any, serial: string) => {
        const model = mockSystemModel(serial);
        model.profile.getZones.mockResolvedValue(['1', '2', '3']);
        return model;
      });

      const { platform } = createPlatform({ showOutdoorTemperatureSensor: true });

      await platform.discoverSystems();

      // OAT is system-level, not zone-level
      expect(OutdoorTemperatureAccessory).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-system', () => {
    test('creates accessories for multiple systems', async () => {
      mockGetSystems.mockResolvedValue(['ABC123DEF456', 'XYZ789GHI012']);

      const { platform } = createPlatform({ showOutdoorTemperatureSensor: true });

      await platform.discoverSystems();

      // One thermostat per system (each has 1 zone by default)
      expect(ThermostatAccessory).toHaveBeenCalledTimes(2);
      // One OAT per system
      expect(OutdoorTemperatureAccessory).toHaveBeenCalledTimes(2);
    });

    test('prefixes outdoor temp name with system name when multiple systems exist', async () => {
      mockGetSystems.mockResolvedValue(['SYS1', 'SYS2']);

      const { platform } = createPlatform({ showOutdoorTemperatureSensor: true });

      await platform.discoverSystems();

      // With 2 systems, OAT name should include system name
      expect(OutdoorTemperatureAccessory).toHaveBeenCalledWith(
        platform,
        expect.objectContaining({ name: 'My Home Outdoor Temperature' }),
      );
    });
  });
});
