/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockSystemModel } from './__mocks__/system_model';
import { MockCharacteristic, MockService, mockAPI } from './__mocks__/homebridge';
import { ComfortActivityAccessory } from './accessory_comfort_activity';

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
    name: 'Comfort Activities',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
  };
}

describe('ComfortActivityAccessory', () => {
  let platform: any;
  let context: any;

  beforeEach(() => {
    platform = createMockPlatform();
    context = createContext();
  });

  describe('ID generation', () => {
    test('generates ID as ComfortActivity:serialNumber:zone', () => {
      new ComfortActivityAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith(
        'ComfortActivity:ABC123DEF456:1',
      );
    });

    test('uses correct zone in ID', () => {
      context.zone = '3';
      new ComfortActivityAccessory(platform as any, context);
      expect(platform.api.hap.uuid.generate).toHaveBeenCalledWith(
        'ComfortActivity:ABC123DEF456:3',
      );
    });
  });

  describe('constructor', () => {
    test('creates 5 Switch services (Manual Hold + 4 activities)', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      expect(switchCalls.length).toBe(5);
    });

    test('creates Manual Hold switch with correct subtype', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      const holdSwitch = switchCalls.find((call: any[]) => call[2] === 'hold');
      expect(holdSwitch).toBeDefined();
      expect(holdSwitch[1]).toBe('Manual Hold');
    });

    test('creates Wake switch with correct subtype', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      const wakeSwitch = switchCalls.find((call: any[]) => call[2] === 'wake');
      expect(wakeSwitch).toBeDefined();
      expect(wakeSwitch[1]).toBe('Wake');
    });

    test('creates Away switch with correct subtype', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      const awaySwitch = switchCalls.find((call: any[]) => call[2] === 'away');
      expect(awaySwitch).toBeDefined();
      expect(awaySwitch[1]).toBe('Away');
    });

    test('creates Home switch with correct subtype', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      const homeSwitch = switchCalls.find((call: any[]) => call[2] === 'home');
      expect(homeSwitch).toBeDefined();
      expect(homeSwitch[1]).toBe('Home');
    });

    test('creates Sleep switch with correct subtype', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      const sleepSwitch = switchCalls.find((call: any[]) => call[2] === 'sleep');
      expect(sleepSwitch).toBeDefined();
      expect(sleepSwitch[1]).toBe('Sleep');
    });

    test('each switch has ConfiguredName set', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      const switchCalls = hap.addService.mock.calls.filter(
        (call: any[]) => call[0] === MockService.Switch,
      );
      expect(switchCalls.length).toBe(5);
      for (const call of switchCalls) {
        const switchType = call[2];
        const key = `${MockService.Switch.UUID}:${switchType}`;
        const service = hap._services[key];
        expect(service.setCharacteristic).toHaveBeenCalledWith(
          MockCharacteristic.ConfiguredName,
          expect.any(String),
        );
      }
    });

    test('wraps AccessoryInformation service', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const hap: any = accessory.accessory;
      expect(hap.addService).toHaveBeenCalledWith(MockService.AccessoryInformation);
    });

    test('registers the accessory with the platform', () => {
      new ComfortActivityAccessory(platform as any, context);
      expect(platform.api.registerPlatformAccessories).toHaveBeenCalled();
    });

    test('stores itself in platform.accessories', () => {
      const accessory = new ComfortActivityAccessory(platform as any, context);
      const uuid = platform.api.hap.uuid.generate.mock.results[0].value;
      expect(platform.accessories[uuid]).toBe(accessory);
    });
  });
});
