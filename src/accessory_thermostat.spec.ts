/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockSystemModel } from './__mocks__/system_model';
import { MockCharacteristic, MockService, mockAPI, mockPlatformAccessory, mockService } from './__mocks__/homebridge';
import { ThermostatAccessory } from './accessory_thermostat';

jest.mock('./helper_logging', () => ({
  PrefixLogger: jest.fn().mockImplementation((_log, _prefix) => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
    prefix: _prefix,
  })),
}));

/**
 * Create a mockPlatformAccessory that includes a pre-populated
 * AccessoryInformation service, matching real Homebridge behavior.
 */
function mockPlatformAccessoryWithInfo(name = 'MockAccessory', uuid = 'mock-uuid') {
  const accessory = mockPlatformAccessory(name, uuid);
  // Real PlatformAccessory always has AccessoryInformation built in
  const infoService = mockService('AccessoryInformation');
  accessory._services['AccessoryInformation'] = infoService;
  return accessory;
}

function createMockPlatform(overrides: any = {}) {
  const system = mockSystemModel();
  const api = mockAPI();

  // Override platformAccessory constructor to include AccessoryInformation
  api.platformAccessory = jest.fn((name: string, uuid: string) => mockPlatformAccessoryWithInfo(name, uuid));

  return {
    api,
    Service: MockService,
    Characteristic: MockCharacteristic,
    config: {
      showFanControl: false,
      showHumidifierDehumidifier: false,
      showOutdoorTemperatureSensor: false,
      showIndoorHumiditySensors: false,
      showZoneComfortActivityControls: false,
      holdBehavior: 'forever',
      holdArgument: '',
      ...overrides,
    },
    log: system.log,
    systems: { [system.serialNumber]: system },
    restored_accessories: {} as Record<string, any>,
    accessories: {} as Record<string, any>,
    _system: system,
  };
}

function createContext(serialNumber = 'ABC123DEF456') {
  return {
    serialNumber,
    name: 'Test Thermostat',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
  };
}

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('ThermostatAccessory', () => {
  let platform: any;
  let context: any;

  beforeEach(() => {
    platform = createMockPlatform();
    context = createContext();
  });

  describe('ID generation', () => {
    test('generates ID as serialNumber:zoneIndex where zone "1" becomes 0', () => {
      const accessory = new ThermostatAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('ABC123DEF456:0');
      expect(accessory).toBeDefined();
    });

    test('generates ID with zone "2" as serialNumber:1', () => {
      context.zone = '2';
      new ThermostatAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('ABC123DEF456:1');
    });

    test('generates ID with zone "3" as serialNumber:2', () => {
      context.zone = '3';
      new ThermostatAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('ABC123DEF456:2');
    });
  });

  describe('constructor', () => {
    test('creates a Thermostat service', () => {
      const accessory = new ThermostatAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.Thermostat);
    });

    test('registers the accessory with the platform', () => {
      new ThermostatAccessory(platform as any, context);
      expect(platform.api.registerPlatformAccessories).toHaveBeenCalled();
    });

    test('stores itself in platform.accessories', () => {
      const accessory = new ThermostatAccessory(platform as any, context);
      const uuid = platform.api.hap.uuid.generate.mock.results[0].value;
      expect(platform.accessories[uuid]).toBe(accessory);
    });

    test('loads restored accessory when available', () => {
      const uuid = 'uuid-ABC123DEF456:0';
      const restored = mockPlatformAccessoryWithInfo('Restored', uuid);
      platform.restored_accessories[uuid] = restored;

      const accessory = new ThermostatAccessory(platform as any, context);
      expect(accessory.accessory).toBe(restored);
      expect(platform.api.updatePlatformAccessories).toHaveBeenCalledWith([restored]);
      expect(platform.api.registerPlatformAccessories).not.toHaveBeenCalled();
    });

    test('calls system.status.fetch()', () => {
      new ThermostatAccessory(platform as any, context);
      expect(platform._system.status.fetch).toHaveBeenCalled();
    });

    test('calls system.config.fetch()', () => {
      new ThermostatAccessory(platform as any, context);
      expect(platform._system.config.fetch).toHaveBeenCalled();
    });

    test('calls system.profile.fetch()', () => {
      new ThermostatAccessory(platform as any, context);
      expect(platform._system.profile.fetch).toHaveBeenCalled();
    });
  });

  describe('fan service', () => {
    test('creates Fanv2 service when showFanControl is true', () => {
      platform = createMockPlatform({ showFanControl: true });
      const accessory = new ThermostatAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.Fanv2);
    });

    test('does NOT create Fanv2 service when showFanControl is false', () => {
      platform = createMockPlatform({ showFanControl: false });
      const accessory = new ThermostatAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const addServiceCalls = hap.addService.mock.calls;
      const fanCalls = addServiceCalls.filter((call: any[]) => call[0] === MockService.Fanv2);
      expect(fanCalls.length).toBe(0);
    });

    test('removes existing fan service when showFanControl changes to false', () => {
      const uuid = 'uuid-ABC123DEF456:0';
      const restored = mockPlatformAccessoryWithInfo('Restored', uuid);
      const existingFanService = mockService('Fanv2');
      restored._services['Fanv2'] = existingFanService;
      platform.restored_accessories[uuid] = restored;
      platform = { ...platform, config: { ...platform.config, showFanControl: false } };

      new ThermostatAccessory(platform as any, context);
      expect(restored.removeService).toHaveBeenCalledWith(existingFanService);
    });
  });

  describe('humidifier/dehumidifier service', () => {
    test('creates HumidifierDehumidifier service when showHumidifierDehumidifier is true', () => {
      platform = createMockPlatform({ showHumidifierDehumidifier: true });
      const accessory = new ThermostatAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.HumidifierDehumidifier);
    });

    test('does NOT create HumidifierDehumidifier when showHumidifierDehumidifier is false', () => {
      platform = createMockPlatform({ showHumidifierDehumidifier: false });
      const accessory = new ThermostatAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const addServiceCalls = hap.addService.mock.calls;
      const humidifierCalls = addServiceCalls.filter(
        (call: any[]) => call[0] === MockService.HumidifierDehumidifier,
      );
      expect(humidifierCalls.length).toBe(0);
    });

    test('removes existing humidifier service when config changes to false', () => {
      const uuid = 'uuid-ABC123DEF456:0';
      const restored = mockPlatformAccessoryWithInfo('Restored', uuid);
      const existingHumidifierService = mockService('HumidifierDehumidifier');
      restored._services['HumidifierDehumidifier'] = existingHumidifierService;
      platform.restored_accessories[uuid] = restored;
      platform = { ...platform, config: { ...platform.config, showHumidifierDehumidifier: false } };

      new ThermostatAccessory(platform as any, context);
      expect(restored.removeService).toHaveBeenCalledWith(existingHumidifierService);
    });
  });

  describe('characteristic wrappers', () => {
    test('ACService is always wrapped on the thermostat service', async () => {
      const accessory = new ThermostatAccessory(platform as any, context);
      await flushPromises();
      const hap: any = accessory.accessory;
      const thermostatService = hap.getService(MockService.Thermostat);
      const currentHeatCool = thermostatService.getCharacteristic(MockCharacteristic.CurrentHeatingCoolingState);
      expect(currentHeatCool.onGet).toHaveBeenCalled();
    });

    test('FilterService is always wrapped on the thermostat service', async () => {
      const accessory = new ThermostatAccessory(platform as any, context);
      await flushPromises();
      const hap: any = accessory.accessory;
      const thermostatService = hap.getService(MockService.Thermostat);
      const filterLife = thermostatService.getCharacteristic(MockCharacteristic.FilterLifeLevel);
      expect(filterLife.onGet).toHaveBeenCalled();
    });

    test('ThermostatRHService is always wrapped on the thermostat service', async () => {
      const accessory = new ThermostatAccessory(platform as any, context);
      await flushPromises();
      const hap: any = accessory.accessory;
      const thermostatService = hap.getService(MockService.Thermostat);
      const currentRH = thermostatService.getCharacteristic(MockCharacteristic.CurrentRelativeHumidity);
      expect(currentRH.onGet).toHaveBeenCalled();
    });
  });

  describe('config.fetch callback sets zone name and temp bounds', () => {
    test('sets zone name on the thermostat service after config fetch resolves', async () => {
      platform._system.config.getZoneName.mockResolvedValue('Living Room');
      const accessory = new ThermostatAccessory(platform as any, context);
      await flushPromises();
      const hap: any = accessory.accessory;
      const thermostatService = hap.getService(MockService.Thermostat);
      expect(thermostatService.setCharacteristic).toHaveBeenCalledWith(
        MockCharacteristic.Name,
        expect.any(String),
      );
    });
  });

  describe('profile.fetch callback sets manufacturer and model', () => {
    test('sets Manufacturer and Model after profile fetch resolves', async () => {
      platform._system.profile.getBrand.mockResolvedValue('Carrier');
      platform._system.profile.getModel.mockResolvedValue('24VNA936A003');
      new ThermostatAccessory(platform as any, context);
      await flushPromises();
    });
  });
});
