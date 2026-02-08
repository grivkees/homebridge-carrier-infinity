/**
 * Mock factories for Homebridge HAP objects used in tests.
 *
 * These provide lightweight stand-ins for the real Homebridge API,
 * Service, Characteristic, and PlatformAccessory objects.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
    prefix: 'test',
  };
}

/**
 * Create a mock Characteristic object that supports onGet/onSet/updateValue/setProps.
 */
export function mockCharacteristic(initialValue: any = null) {
  const char: any = {
    value: initialValue,
    onGet: jest.fn().mockReturnThis(),
    onSet: jest.fn().mockReturnThis(),
    updateValue: jest.fn((v: any) => { char.value = v; return char; }),
    setProps: jest.fn().mockReturnThis(),
    props: {},
  };
  return char;
}

/**
 * Map of characteristic name -> mock characteristic instance.
 * getCharacteristic(name) auto-creates entries so tests don't need pre-setup.
 */
export function mockService(name?: string) {
  const chars: Record<string, any> = {};
  const svc: any = {
    displayName: name || 'MockService',
    UUID: name || 'mock-service-uuid',
    subtype: undefined,
    testCharacteristics: chars,
    getCharacteristic: jest.fn((ctype: any) => {
      const key = typeof ctype === 'string' ? ctype : (ctype?.UUID || String(ctype));
      if (!chars[key]) {
        chars[key] = mockCharacteristic();
      }
      return chars[key];
    }),
    setCharacteristic: jest.fn((_ctype: any, _value: any) => svc),
    addLinkedService: jest.fn(),
    addOptionalCharacteristic: jest.fn(),
  };
  return svc;
}

/**
 * Create a mock PlatformAccessory that supports getService/addService.
 */
export function mockPlatformAccessory(name = 'MockAccessory', uuid = 'mock-uuid') {
  const services: Record<string, any> = {};
  const accessory: any = {
    UUID: uuid,
    displayName: name,
    context: {},
    _services: services,
    getService: jest.fn((type: any) => {
      const key = typeof type === 'string' ? type : (type?.UUID || String(type));
      return services[key] || null;
    }),
    getServiceById: jest.fn((type: any, subtype: string) => {
      const key = `${typeof type === 'string' ? type : (type?.UUID || String(type))}:${subtype}`;
      return services[key] || null;
    }),
    addService: jest.fn((type: any, displayName?: string, subtype?: string) => {
      const typeKey = typeof type === 'string' ? type : (type?.UUID || String(type));
      const key = subtype ? `${typeKey}:${subtype}` : typeKey;
      const svc = mockService(displayName || typeKey);
      svc.subtype = subtype;
      services[key] = svc;
      return svc;
    }),
    removeService: jest.fn((svc: any) => {
      for (const key in services) {
        if (services[key] === svc) {
          delete services[key];
        }
      }
    }),
  };
  return accessory;
}

/**
 * HAP enum constants matching real Homebridge values.
 */
const CurrentHeatingCoolingState = { OFF: 0, HEAT: 1, COOL: 2 };
const TargetHeatingCoolingState = { OFF: 0, HEAT: 1, COOL: 2, AUTO: 3 };
const TemperatureDisplayUnits = { CELSIUS: 0, FAHRENHEIT: 1 };
const CurrentFanState = { INACTIVE: 0, IDLE: 1, BLOWING_AIR: 2 };
const TargetFanState = { MANUAL: 0, AUTO: 1 };
const Active = { INACTIVE: 0, ACTIVE: 1 };
const FilterChangeIndication = { FILTER_OK: 0, CHANGE_FILTER: 1 };
const CurrentHumidifierDehumidifierState = { INACTIVE: 0, IDLE: 1, HUMIDIFYING: 2, DEHUMIDIFYING: 3 };
const TargetHumidifierDehumidifierState = { HUMIDIFIER_OR_DEHUMIDIFIER: 0, HUMIDIFIER: 1, DEHUMIDIFIER: 2 };

// Build a map that lets getCharacteristic(SomeConst) work via UUID lookup
function makeCharConst(uuid: string, enumVals?: Record<string, number>) {
  const obj: any = { UUID: uuid, ...enumVals };
  return obj;
}

/**
 * Mock Characteristic namespace with all needed enum constants.
 */
export const MockCharacteristic: any = {
  CurrentHeatingCoolingState: makeCharConst('CurrentHeatingCoolingState', CurrentHeatingCoolingState),
  TargetHeatingCoolingState: makeCharConst('TargetHeatingCoolingState', TargetHeatingCoolingState),
  TemperatureDisplayUnits: makeCharConst('TemperatureDisplayUnits', TemperatureDisplayUnits),
  CurrentTemperature: makeCharConst('CurrentTemperature'),
  TargetTemperature: makeCharConst('TargetTemperature'),
  CoolingThresholdTemperature: makeCharConst('CoolingThresholdTemperature'),
  HeatingThresholdTemperature: makeCharConst('HeatingThresholdTemperature'),
  Active: makeCharConst('Active', Active),
  CurrentFanState: makeCharConst('CurrentFanState', CurrentFanState),
  RotationSpeed: makeCharConst('RotationSpeed'),
  TargetFanState: makeCharConst('TargetFanState', TargetFanState),
  FilterLifeLevel: makeCharConst('FilterLifeLevel'),
  FilterChangeIndication: makeCharConst('FilterChangeIndication', FilterChangeIndication),
  CurrentRelativeHumidity: makeCharConst('CurrentRelativeHumidity'),
  CurrentHumidifierDehumidifierState: makeCharConst(
    'CurrentHumidifierDehumidifierState', CurrentHumidifierDehumidifierState,
  ),
  TargetHumidifierDehumidifierState: makeCharConst(
    'TargetHumidifierDehumidifierState', TargetHumidifierDehumidifierState,
  ),
  RelativeHumidityHumidifierThreshold: makeCharConst('RelativeHumidityHumidifierThreshold'),
  RelativeHumidityDehumidifierThreshold: makeCharConst('RelativeHumidityDehumidifierThreshold'),
  On: makeCharConst('On'),
  Name: makeCharConst('Name'),
  SerialNumber: makeCharConst('SerialNumber'),
  Manufacturer: makeCharConst('Manufacturer'),
  Model: makeCharConst('Model'),
  ConfiguredName: makeCharConst('ConfiguredName'),
};

/**
 * Mock Service namespace.
 */
export const MockService: any = {
  Thermostat: { UUID: 'Thermostat' },
  TemperatureSensor: { UUID: 'TemperatureSensor' },
  HumiditySensor: { UUID: 'HumiditySensor' },
  Fanv2: { UUID: 'Fanv2' },
  HumidifierDehumidifier: { UUID: 'HumidifierDehumidifier' },
  Switch: { UUID: 'Switch' },
  AccessoryInformation: { UUID: 'AccessoryInformation' },
};

export const MockHapStatusError = class HapStatusError extends Error {
  constructor(public status: number) { super(`HapStatusError: ${status}`); }
};

/**
 * Create a mock Homebridge API object.
 */
export function mockAPI() {
  const api: any = {
    hap: {
      Service: MockService,
      Characteristic: MockCharacteristic,
      uuid: {
        generate: jest.fn((input: string) => `uuid-${input}`),
      },
      HapStatusError: MockHapStatusError,
      HAPStatus: { INVALID_VALUE_IN_REQUEST: -70409, NOT_ALLOWED_IN_CURRENT_STATE: -70412 },
    },
    platformAccessory: jest.fn((name: string, uuid: string) => mockPlatformAccessory(name, uuid)),
    registerPlatformAccessories: jest.fn(),
    updatePlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
    on: jest.fn(),
  };
  return api;
}
