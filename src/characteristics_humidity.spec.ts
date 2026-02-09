/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockService, MockCharacteristic, MockService, MockHapStatusError } from './__mocks__/homebridge';
import { mockSystemModel } from './__mocks__/system_model';
import { HumidifierService, ThermostatRHService } from './characteristics_humidity';
import { STATUS } from './api/constants';

function createMockPlatform(systemModel: any) {
  return {
    api: {
      hap: {
        Service: MockService,
        Characteristic: MockCharacteristic,
        HapStatusError: MockHapStatusError,
        HAPStatus: { INVALID_VALUE_IN_REQUEST: -70409 },
      },
    },
    systems: { 'ABC123DEF456': systemModel },
  };
}

function createContext(overrides: Record<string, any> = {}) {
  return {
    serialNumber: 'ABC123DEF456',
    name: 'Test Thermostat',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
    ...overrides,
  };
}

function wrapThermostatRHService(platform: any, context: any) {
  const service = mockService();
  new ThermostatRHService(platform, context).wrap(service);
  return service;
}

function wrapHumidifierService(platform: any, context: any) {
  const service = mockService();
  new HumidifierService(platform, context).wrap(service);
  return service;
}

function getOnGetHandler(service: any, charConst: any): () => any {
  const char = service.getCharacteristic(charConst);
  expect(char.onGet).toHaveBeenCalled();
  return char.onGet.mock.calls[0][0];
}

function getOnSetHandler(service: any, charConst: any): (value: any) => Promise<void> {
  const char = service.getCharacteristic(charConst);
  expect(char.onSet).toHaveBeenCalled();
  return char.onSet.mock.calls[0][0];
}

async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => setImmediate(resolve));
  }
}

async function getAsyncValue(service: any, charConst: any): Promise<any> {
  const handler = getOnGetHandler(service, charConst);
  handler();
  await flushAsync();
  const char = service.getCharacteristic(charConst);
  const calls = char.updateValue.mock.calls;
  if (calls.length === 0) {
    throw new Error(`updateValue was never called for ${charConst.UUID}`);
  }
  return calls[calls.length - 1][0];
}

describe('ThermostatRHService', () => {
  let system: ReturnType<typeof mockSystemModel>;
  let platform: any;
  let context: any;

  beforeEach(() => {
    system = mockSystemModel();
    platform = createMockPlatform(system);
    context = createContext();
  });

  describe('CurrentRH', () => {
    test('returns humidity from status', async () => {
      system.status.getZoneHumidity.mockResolvedValue(38);
      const service = wrapThermostatRHService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentRelativeHumidity);
      expect(value).toBe(38);
    });

    test('uses the correct zone', async () => {
      context = createContext({ zone: '2' });
      system.status.getZoneHumidity.mockResolvedValue(55);
      const service = wrapThermostatRHService(platform, context);
      const handler = getOnGetHandler(service, MockCharacteristic.CurrentRelativeHumidity);
      handler();
      await flushAsync();
      expect(system.status.getZoneHumidity).toHaveBeenCalledWith('2');
    });
  });
});

describe('HumidifierService', () => {
  let system: ReturnType<typeof mockSystemModel>;
  let platform: any;
  let context: any;

  beforeEach(() => {
    system = mockSystemModel();
    platform = createMockPlatform(system);
    context = createContext();
  });

  describe('CurrentRH (via HumidifierService)', () => {
    test('returns humidity from status', async () => {
      system.status.getZoneHumidity.mockResolvedValue(42);
      const service = wrapHumidifierService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentRelativeHumidity);
      expect(value).toBe(42);
    });
  });

  describe('HumidifierActive', () => {
    describe('get', () => {
      test('returns INACTIVE when both humidifier and dehumidifier config are OFF', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.Active);
        expect(value).toBe(MockCharacteristic.Active.INACTIVE);
      });

      test('returns ACTIVE when humidifier is ON', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.Active);
        expect(value).toBe(MockCharacteristic.Active.ACTIVE);
      });

      test('returns ACTIVE when dehumidifier is ON', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.ON);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.Active);
        expect(value).toBe(MockCharacteristic.Active.ACTIVE);
      });

      test('returns ACTIVE when both are ON', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.ON);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.Active);
        expect(value).toBe(MockCharacteristic.Active.ACTIVE);
      });
    });

    describe('set', () => {
      test('SET ACTIVE calls setHumidityConfig with humidifier on', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.Active);
        await onSet(MockCharacteristic.Active.ACTIVE);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          STATUS.ON,
          undefined,
        );
      });

      test('SET INACTIVE calls setHumidityConfig with both off', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.Active);
        await onSet(MockCharacteristic.Active.INACTIVE);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          STATUS.OFF,
          STATUS.OFF,
        );
      });
    });
  });

  describe('HumidifierCurrentState', () => {
    test('returns HUMIDIFYING when status humidifier is ON', async () => {
      system.status.getHumidifier.mockResolvedValue(STATUS.ON);
      system.status.getDehumidifier.mockResolvedValue(STATUS.OFF);
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
      const service = wrapHumidifierService(platform, context);
      const value = await getAsyncValue(
        service, MockCharacteristic.CurrentHumidifierDehumidifierState,
      );
      expect(value).toBe(MockCharacteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING);
    });

    test('returns DEHUMIDIFYING when status dehumidifier is ON', async () => {
      system.status.getHumidifier.mockResolvedValue(STATUS.OFF);
      system.status.getDehumidifier.mockResolvedValue(STATUS.ON);
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.ON);
      const service = wrapHumidifierService(platform, context);
      const value = await getAsyncValue(
        service, MockCharacteristic.CurrentHumidifierDehumidifierState,
      );
      expect(value).toBe(MockCharacteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING);
    });

    test('returns IDLE when config has them on but status says off', async () => {
      system.status.getHumidifier.mockResolvedValue(STATUS.OFF);
      system.status.getDehumidifier.mockResolvedValue(STATUS.OFF);
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
      const service = wrapHumidifierService(platform, context);
      const value = await getAsyncValue(
        service, MockCharacteristic.CurrentHumidifierDehumidifierState,
      );
      expect(value).toBe(MockCharacteristic.CurrentHumidifierDehumidifierState.IDLE);
    });

    test('returns IDLE when config dehumidifier is on but status says off', async () => {
      system.status.getHumidifier.mockResolvedValue(STATUS.OFF);
      system.status.getDehumidifier.mockResolvedValue(STATUS.OFF);
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.ON);
      const service = wrapHumidifierService(platform, context);
      const value = await getAsyncValue(
        service, MockCharacteristic.CurrentHumidifierDehumidifierState,
      );
      expect(value).toBe(MockCharacteristic.CurrentHumidifierDehumidifierState.IDLE);
    });

    test('returns INACTIVE when both config states are OFF', async () => {
      system.status.getHumidifier.mockResolvedValue(STATUS.OFF);
      system.status.getDehumidifier.mockResolvedValue(STATUS.OFF);
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
      const service = wrapHumidifierService(platform, context);
      const value = await getAsyncValue(
        service, MockCharacteristic.CurrentHumidifierDehumidifierState,
      );
      expect(value).toBe(MockCharacteristic.CurrentHumidifierDehumidifierState.INACTIVE);
    });
  });

  describe('HumidifierTargetState', () => {
    describe('get', () => {
      test('returns HUMIDIFIER when humidifier ON, dehumidifier OFF', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.TargetHumidifierDehumidifierState,
        );
        expect(value).toBe(MockCharacteristic.TargetHumidifierDehumidifierState.HUMIDIFIER);
      });

      test('returns DEHUMIDIFIER when humidifier OFF, dehumidifier ON', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.ON);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.TargetHumidifierDehumidifierState,
        );
        expect(value).toBe(MockCharacteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);
      });

      test('returns HUMIDIFIER_OR_DEHUMIDIFIER when both ON', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.ON);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.TargetHumidifierDehumidifierState,
        );
        expect(value).toBe(
          MockCharacteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER,
        );
      });

      test('returns HUMIDIFIER_OR_DEHUMIDIFIER when both OFF', async () => {
        system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
        system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.TargetHumidifierDehumidifierState,
        );
        expect(value).toBe(
          MockCharacteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER,
        );
      });
    });

    describe('set', () => {
      test('SET HUMIDIFIER calls setHumidityConfig with humidifier on, dehumidifier off', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHumidifierDehumidifierState);
        await onSet(MockCharacteristic.TargetHumidifierDehumidifierState.HUMIDIFIER);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          STATUS.ON,
          STATUS.OFF,
        );
      });

      test('SET DEHUMIDIFIER calls setHumidityConfig with humidifier off, dehumidifier on', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHumidifierDehumidifierState);
        await onSet(MockCharacteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          STATUS.OFF,
          STATUS.ON,
        );
      });

      test('SET AUTO calls setHumidityConfig with both on', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHumidifierDehumidifierState);
        await onSet(MockCharacteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          STATUS.ON,
          STATUS.ON,
        );
      });
    });
  });

  describe('TargetHumidifyPoint', () => {
    describe('get', () => {
      test('returns value already on a 5% step unchanged', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(35);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(35);
      });

      test('rounds 37 down to 35 (nearest 5% step)', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(37);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(35);
      });

      test('rounds 38 up to 40 (nearest 5% step)', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(38);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(40);
      });

      test('clamps value below 5 to minimum (5)', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(2);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(5);
      });

      test('clamps value above 45 to maximum (45)', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(50);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(45);
      });

      test('returns 5 for minimum boundary value', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(5);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(5);
      });

      test('returns 45 for maximum boundary value', async () => {
        system.config.getActivityHumidifierTarget.mockResolvedValue(45);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        expect(value).toBe(45);
      });
    });

    describe('set', () => {
      test('rounds to 5% steps and calls setHumidityConfig', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        await onSet(35);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          35,
        );
      });

      test('rounds 37 to 35 on set', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        await onSet(37);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          35,
        );
      });

      test('rounds 38 to 40 on set', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        await onSet(38);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          40,
        );
      });

      test('clamps and rounds values below minimum', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        await onSet(2);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          5,
        );
      });

      test('clamps and rounds values above maximum', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityHumidifierThreshold,
        );
        await onSet(50);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          45,
        );
      });
    });
  });

  describe('TargetDehumidifyPoint', () => {
    describe('get', () => {
      test('returns value already on a 2% step unchanged', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(52);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(52);
      });

      test('rounds 53 up to 54 (nearest 2% step)', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(53);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(54);
      });

      test('rounds 51 up to 52 (nearest 2% step)', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(51);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(52);
      });

      test('rounds 47 up to 48 (nearest 2% step)', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(47);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(48);
      });

      test('clamps value below 46 to minimum (46)', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(40);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(46);
      });

      test('clamps value above 58 to maximum (58)', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(65);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(58);
      });

      test('returns 46 for minimum boundary value', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(46);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(46);
      });

      test('returns 58 for maximum boundary value', async () => {
        system.config.getActivityDehumidifierTarget.mockResolvedValue(58);
        const service = wrapHumidifierService(platform, context);
        const value = await getAsyncValue(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        expect(value).toBe(58);
      });
    });

    describe('set', () => {
      test('rounds to 2% steps and calls setHumidityConfig', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        await onSet(52);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          undefined,
          52,
        );
      });

      test('rounds 53 to 54 on set', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        await onSet(53);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          undefined,
          54,
        );
      });

      test('rounds 51 to 52 on set', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        await onSet(51);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          undefined,
          52,
        );
      });

      test('clamps and rounds values below minimum', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        await onSet(40);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          undefined,
          46,
        );
      });

      test('clamps and rounds values above maximum', async () => {
        const service = wrapHumidifierService(platform, context);
        const onSet = getOnSetHandler(
          service, MockCharacteristic.RelativeHumidityDehumidifierThreshold,
        );
        await onSet(65);
        expect(system.config.setHumidityConfig).toHaveBeenCalledWith(
          'home',
          undefined,
          undefined,
          undefined,
          58,
        );
      });
    });
  });

  describe('activity resolution', () => {
    test('uses vacation activity when status reports vacation', async () => {
      system.status.getZoneActivity.mockResolvedValue('vacation');
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.ON);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
      const service = wrapHumidifierService(platform, context);
      await getAsyncValue(service, MockCharacteristic.Active);
      expect(system.config.getActivityHumidifierState).toHaveBeenCalledWith('vacation');
    });

    test('uses config activity when status is not vacation', async () => {
      system.status.getZoneActivity.mockResolvedValue('home');
      system.config.getZoneActivity.mockResolvedValue('away');
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
      const service = wrapHumidifierService(platform, context);
      await getAsyncValue(service, MockCharacteristic.Active);
      expect(system.config.getActivityHumidifierState).toHaveBeenCalledWith('away');
    });
  });

  describe('zone selection', () => {
    test('uses the zone from context for activity resolution', async () => {
      context = createContext({ zone: '3' });
      system.config.getActivityHumidifierState.mockResolvedValue(STATUS.OFF);
      system.config.getActivityDehumidifierState.mockResolvedValue(STATUS.OFF);
      const service = wrapHumidifierService(platform, context);
      await getAsyncValue(service, MockCharacteristic.Active);
      expect(system.status.getZoneActivity).toHaveBeenCalledWith('3');
    });
  });

  describe('wrap registration', () => {
    test('registers onGet for all readable characteristics', () => {
      const service = wrapHumidifierService(platform, context);
      const readableChars = [
        MockCharacteristic.CurrentRelativeHumidity,
        MockCharacteristic.Active,
        MockCharacteristic.CurrentHumidifierDehumidifierState,
        MockCharacteristic.TargetHumidifierDehumidifierState,
        MockCharacteristic.RelativeHumidityHumidifierThreshold,
        MockCharacteristic.RelativeHumidityDehumidifierThreshold,
      ];
      for (const charConst of readableChars) {
        const char = service.getCharacteristic(charConst);
        expect(char.onGet).toHaveBeenCalledTimes(1);
      }
    });

    test('registers onSet for writable characteristics', () => {
      const service = wrapHumidifierService(platform, context);
      const writableChars = [
        MockCharacteristic.Active,
        MockCharacteristic.TargetHumidifierDehumidifierState,
        MockCharacteristic.RelativeHumidityHumidifierThreshold,
        MockCharacteristic.RelativeHumidityDehumidifierThreshold,
      ];
      for (const charConst of writableChars) {
        const char = service.getCharacteristic(charConst);
        expect(char.onSet).toHaveBeenCalledTimes(1);
      }
    });

    test('does not register onSet for read-only characteristics', () => {
      const service = wrapHumidifierService(platform, context);
      const readOnlyChars = [
        MockCharacteristic.CurrentRelativeHumidity,
        MockCharacteristic.CurrentHumidifierDehumidifierState,
      ];
      for (const charConst of readOnlyChars) {
        const char = service.getCharacteristic(charConst);
        expect(char.onSet).not.toHaveBeenCalled();
      }
    });
  });
});
