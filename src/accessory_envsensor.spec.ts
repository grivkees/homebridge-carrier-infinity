/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockSystemModel } from './__mocks__/system_model';
import { MockCharacteristic, MockService, mockAPI } from './__mocks__/homebridge';
import { EnvSensorAccessory } from './accessory_envsensor';

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
    name: 'Indoor Humidity',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
  };
}

describe('EnvSensorAccessory', () => {
  let platform: any;
  let context: any;

  beforeEach(() => {
    platform = createMockPlatform();
    context = createContext();
  });

  describe('ID generation', () => {
    test('generates ID as ENVSENSOR:serialNumber:zoneIndex where zone "1" becomes 0', () => {
      new EnvSensorAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('ENVSENSOR:ABC123DEF456:0');
    });

    test('generates ID with zone "2" as ENVSENSOR:serialNumber:1', () => {
      context.zone = '2';
      new EnvSensorAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith('ENVSENSOR:ABC123DEF456:1');
    });
  });

  describe('constructor', () => {
    test('creates a HumiditySensor service', () => {
      const accessory = new EnvSensorAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.HumiditySensor);
    });

    test('wraps ThermostatRHService on the HumiditySensor service', () => {
      const accessory = new EnvSensorAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const humidityService = hap.getService(MockService.HumiditySensor);
      const currentRH = humidityService.getCharacteristic(MockCharacteristic.CurrentRelativeHumidity);
      expect(currentRH.onGet).toHaveBeenCalled();
    });

    test('wraps AccessoryInformation service', () => {
      const accessory = new EnvSensorAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.AccessoryInformation);
    });
  });
});
