/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockSystemModel } from './__mocks__/system_model';
import { MockCharacteristic, MockService, mockAPI } from './__mocks__/homebridge';
import { OutdoorTemperatureAccessory } from './accessory_oat';

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

function createMockPlatform(overrides: any = {}) {
  const system = mockSystemModel();
  const api = mockAPI();

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
    name: 'Outdoor Temperature',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
  };
}

describe('OutdoorTemperatureAccessory', () => {
  let platform: any;
  let context: any;

  beforeEach(() => {
    platform = createMockPlatform();
    context = createContext();
  });

  describe('ID generation', () => {
    test('generates ID as OAT:serialNumber', () => {
      new OutdoorTemperatureAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('OAT:ABC123DEF456');
    });

    test('uses correct serial number in ID', () => {
      const customSerial = 'XYZ789';
      const system = mockSystemModel(customSerial);
      platform.systems[customSerial] = system;
      context.serialNumber = customSerial;
      new OutdoorTemperatureAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('OAT:XYZ789');
    });
  });

  describe('constructor', () => {
    test('creates a TemperatureSensor service', () => {
      const accessory = new OutdoorTemperatureAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.TemperatureSensor);
    });

    test('wraps OutdoorTempSensorService on the TemperatureSensor service', () => {
      const accessory = new OutdoorTemperatureAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const tempService = hap.getService(MockService.TemperatureSensor);
      const currentTemp = tempService.getCharacteristic(MockCharacteristic.CurrentTemperature);
      expect(currentTemp.onGet).toHaveBeenCalled();
    });

    test('wraps AccessoryInformation service', () => {
      const accessory = new OutdoorTemperatureAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.AccessoryInformation);
    });

    test('registers the accessory with the platform', () => {
      new OutdoorTemperatureAccessory(platform as any, context);
      expect(platform.api.registerPlatformAccessories).toHaveBeenCalled();
    });

    test('stores itself in platform.accessories', () => {
      const accessory = new OutdoorTemperatureAccessory(platform as any, context);
      const uuid = platform.api.hap.uuid.generate.mock.results[0].value;
      expect(platform.accessories[uuid]).toBe(accessory);
    });
  });
});
