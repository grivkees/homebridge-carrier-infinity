/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockService, MockCharacteristic, MockService, MockHapStatusError } from './__mocks__/homebridge';
import { mockSystemModel } from './__mocks__/system_model';
import { ACService } from './characteristics_ac';
import { SYSTEM_MODE, FAN_MODE } from './api/constants';
import { convertSystemTemp2CharTemp, convertCharTemp2SystemTemp } from './helpers';

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

/**
 * Helper: wrap a mock service with ACService, return the mock service and a
 * function to retrieve characteristics by their MockCharacteristic constant.
 */
function wrapACService(platform: any, context: any) {
  const service = mockService();
  new ACService(platform, context).wrap(service);
  return service;
}

/**
 * Helper: get the onGet handler registered on a characteristic.
 */
function getOnGetHandler(service: any, charConst: any): () => any {
  const char = service.getCharacteristic(charConst);
  expect(char.onGet).toHaveBeenCalled();
  return char.onGet.mock.calls[0][0];
}

/**
 * Helper: get the onSet handler registered on a characteristic.
 */
function getOnSetHandler(service: any, charConst: any): (value: any) => Promise<void> {
  const char = service.getCharacteristic(charConst);
  expect(char.onSet).toHaveBeenCalled();
  return char.onSet.mock.calls[0][0];
}

/**
 * Flush the event loop: process.nextTick and promise resolution.
 * Repeating ensures nested async chains have fully settled.
 */
async function flushAsync() {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => process.nextTick(resolve));
    await new Promise(resolve => setImmediate(resolve));
  }
}

/**
 * Helper: invoke onGet handler and flush the event loop to capture the
 * async updateValue call. Returns the value passed to updateValue.
 */
async function getAsyncValue(service: any, charConst: any): Promise<any> {
  const handler = getOnGetHandler(service, charConst);
  handler(); // triggers process.nextTick
  await flushAsync();
  const char = service.getCharacteristic(charConst);
  const calls = char.updateValue.mock.calls;
  if (calls.length === 0) {
    throw new Error(`updateValue was never called for ${charConst.UUID}`);
  }
  return calls[calls.length - 1][0];
}

describe('ACService', () => {
  let system: ReturnType<typeof mockSystemModel>;
  let platform: any;
  let context: any;

  beforeEach(() => {
    system = mockSystemModel();
    platform = createMockPlatform(system);
    context = createContext();
  });

  describe('CurrentACStatus', () => {
    test('returns OFF when zone conditioning is off', async () => {
      system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentHeatingCoolingState);
      expect(value).toBe(MockCharacteristic.CurrentHeatingCoolingState.OFF);
    });

    test('returns OFF when zone conditioning is fanonly', async () => {
      system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.FAN_ONLY);
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentHeatingCoolingState);
      expect(value).toBe(MockCharacteristic.CurrentHeatingCoolingState.OFF);
    });

    test('returns HEAT when zone conditioning is heat', async () => {
      system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.HEAT);
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentHeatingCoolingState);
      expect(value).toBe(MockCharacteristic.CurrentHeatingCoolingState.HEAT);
    });

    test('returns COOL when zone conditioning is cool', async () => {
      system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.COOL);
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentHeatingCoolingState);
      expect(value).toBe(MockCharacteristic.CurrentHeatingCoolingState.COOL);
    });

    test('returns OFF and logs error for unknown state', async () => {
      system.status.getZoneConditioning.mockResolvedValue('unknown_mode');
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentHeatingCoolingState);
      expect(value).toBe(MockCharacteristic.CurrentHeatingCoolingState.OFF);
    });
  });

  describe('TargetACState', () => {
    describe('get', () => {
      test('returns OFF when mode is off', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetHeatingCoolingState);
        expect(value).toBe(MockCharacteristic.TargetHeatingCoolingState.OFF);
      });

      test('returns OFF when mode is fanonly', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.FAN_ONLY);
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetHeatingCoolingState);
        expect(value).toBe(MockCharacteristic.TargetHeatingCoolingState.OFF);
      });

      test('returns COOL when mode is cool', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.COOL);
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetHeatingCoolingState);
        expect(value).toBe(MockCharacteristic.TargetHeatingCoolingState.COOL);
      });

      test('returns HEAT when mode is heat', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.HEAT);
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetHeatingCoolingState);
        expect(value).toBe(MockCharacteristic.TargetHeatingCoolingState.HEAT);
      });

      test('returns AUTO when mode is auto', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetHeatingCoolingState);
        expect(value).toBe(MockCharacteristic.TargetHeatingCoolingState.AUTO);
      });

      test('returns OFF and logs error for unknown mode', async () => {
        system.config.getMode.mockResolvedValue('mystery');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetHeatingCoolingState);
        expect(value).toBe(MockCharacteristic.TargetHeatingCoolingState.OFF);
      });
    });

    describe('set', () => {
      test('SET OFF calls setMode(off) when fan is off', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.OFF);
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.OFF);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.OFF);
      });

      test('SET OFF calls setMode(fanonly) when fan is active', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.LOW);
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.OFF);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.FAN_ONLY);
      });

      test('SET OFF calls setMode(fanonly) when fan is med', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.MED);
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.OFF);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.FAN_ONLY);
      });

      test('SET OFF calls setMode(fanonly) when fan is high', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.HIGH);
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.OFF);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.FAN_ONLY);
      });

      test('SET COOL calls setMode(cool)', async () => {
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.COOL);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.COOL);
      });

      test('SET HEAT calls setMode(heat)', async () => {
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.HEAT);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.HEAT);
      });

      test('SET AUTO calls setMode(auto)', async () => {
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await onSet(MockCharacteristic.TargetHeatingCoolingState.AUTO);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.AUTO);
      });

      test('SET unknown value throws HapStatusError', async () => {
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetHeatingCoolingState);
        await expect(onSet(99)).rejects.toThrow(MockHapStatusError);
      });
    });
  });

  describe('DisplayUnits', () => {
    test('returns FAHRENHEIT when units are F', async () => {
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.TemperatureDisplayUnits);
      expect(value).toBe(MockCharacteristic.TemperatureDisplayUnits.FAHRENHEIT);
    });

    test('returns CELSIUS when units are C', async () => {
      system.config.getUnits.mockResolvedValue('C');
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.TemperatureDisplayUnits);
      expect(value).toBe(MockCharacteristic.TemperatureDisplayUnits.CELSIUS);
    });
  });

  describe('CurrentTemp', () => {
    test('returns converted temperature for Fahrenheit system (72F -> 22.2C)', async () => {
      system.status.getZoneTemp.mockResolvedValue(72);
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentTemperature);
      expect(value).toBe(convertSystemTemp2CharTemp(72, 'F'));
      expect(value).toBeCloseTo(22.2, 1);
    });

    test('returns converted temperature for Celsius system', async () => {
      system.status.getZoneTemp.mockResolvedValue(25);
      system.config.getUnits.mockResolvedValue('C');
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentTemperature);
      expect(value).toBe(25);
    });

    test('returns converted temperature for 32F (freezing point -> 0C)', async () => {
      system.status.getZoneTemp.mockResolvedValue(32);
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const value = await getAsyncValue(service, MockCharacteristic.CurrentTemperature);
      expect(value).toBe(0);
    });
  });

  describe('CoolSetpoint', () => {
    describe('get', () => {
      test('returns converted cool setpoint for Fahrenheit', async () => {
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(74);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.CoolingThresholdTemperature);
        expect(value).toBe(convertSystemTemp2CharTemp(74, 'F'));
        expect(value).toBeCloseTo(23.3, 1);
      });

      test('returns converted cool setpoint for Celsius', async () => {
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(24);
        system.config.getUnits.mockResolvedValue('C');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.CoolingThresholdTemperature);
        expect(value).toBe(24);
      });

      test('uses vacation activity when status reports vacation', async () => {
        system.status.getZoneActivity.mockResolvedValue('vacation');
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(78);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        await getAsyncValue(service, MockCharacteristic.CoolingThresholdTemperature);
        expect(system.config.getZoneActivityCoolSetpoint).toHaveBeenCalledWith('1', 'vacation');
      });

      test('uses config activity when status is not vacation', async () => {
        system.status.getZoneActivity.mockResolvedValue('home');
        system.config.getZoneActivity.mockResolvedValue('home');
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(74);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        await getAsyncValue(service, MockCharacteristic.CoolingThresholdTemperature);
        expect(system.config.getZoneActivityCoolSetpoint).toHaveBeenCalledWith('1', 'home');
      });
    });

    describe('set', () => {
      test('calls setZoneActivityManualHold with cool setpoint in Fahrenheit', async () => {
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
        // 23.3C -> ~74F
        const charTemp = convertSystemTemp2CharTemp(74, 'F');
        await onSet(charTemp);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          convertCharTemp2SystemTemp(charTemp, 'F'),
          null,
          '', // forever hold returns empty string
        );
      });

      test('calls setZoneActivityManualHold with cool setpoint in Celsius', async () => {
        system.config.getUnits.mockResolvedValue('C');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
        await onSet(24);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          24,
          null,
          '',
        );
      });

      test('passes null for heat setpoint', async () => {
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
        await onSet(25);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          expect.any(Number),
          null,
          '',
        );
      });
    });
  });

  describe('HeatSetpoint', () => {
    describe('get', () => {
      test('returns converted heat setpoint for Fahrenheit', async () => {
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(68);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.HeatingThresholdTemperature);
        expect(value).toBe(convertSystemTemp2CharTemp(68, 'F'));
        expect(value).toBeCloseTo(20, 0);
      });

      test('returns converted heat setpoint for Celsius', async () => {
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(20);
        system.config.getUnits.mockResolvedValue('C');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.HeatingThresholdTemperature);
        expect(value).toBe(20);
      });

      test('uses vacation activity when status reports vacation', async () => {
        system.status.getZoneActivity.mockResolvedValue('vacation');
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(65);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        await getAsyncValue(service, MockCharacteristic.HeatingThresholdTemperature);
        expect(system.config.getZoneActivityHeatSetpoint).toHaveBeenCalledWith('1', 'vacation');
      });
    });

    describe('set', () => {
      test('calls setZoneActivityManualHold with heat setpoint in Fahrenheit', async () => {
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.HeatingThresholdTemperature);
        const charTemp = convertSystemTemp2CharTemp(68, 'F');
        await onSet(charTemp);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          null,
          convertCharTemp2SystemTemp(charTemp, 'F'),
          '',
        );
      });

      test('calls setZoneActivityManualHold with heat setpoint in Celsius', async () => {
        system.config.getUnits.mockResolvedValue('C');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.HeatingThresholdTemperature);
        await onSet(20);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          null,
          20,
          '',
        );
      });

      test('passes null for cool setpoint', async () => {
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.HeatingThresholdTemperature);
        await onSet(20);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          null,
          expect.any(Number),
          '',
        );
      });
    });
  });

  describe('GeneralSetpoint', () => {
    describe('get', () => {
      test('returns cool setpoint when mode is COOL', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.COOL);
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(74);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetTemperature);
        expect(value).toBe(convertSystemTemp2CharTemp(74, 'F'));
      });

      test('returns heat setpoint when mode is HEAT', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.HEAT);
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(68);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetTemperature);
        expect(value).toBe(convertSystemTemp2CharTemp(68, 'F'));
      });

      test('returns average of cool and heat setpoints when mode is AUTO', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(74);
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(68);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetTemperature);
        // Average of 74 and 68 is 71, then convert
        expect(value).toBe(convertSystemTemp2CharTemp(71, 'F'));
      });

      test('returns average for OFF mode (default case)', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(76);
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(66);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetTemperature);
        // Average of 76 and 66 is 71
        expect(value).toBe(convertSystemTemp2CharTemp(71, 'F'));
      });

      test('returns average for FAN_ONLY mode (default case)', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.FAN_ONLY);
        system.config.getZoneActivityCoolSetpoint.mockResolvedValue(74);
        system.config.getZoneActivityHeatSetpoint.mockResolvedValue(68);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const value = await getAsyncValue(service, MockCharacteristic.TargetTemperature);
        expect(value).toBe(convertSystemTemp2CharTemp(71, 'F'));
      });
    });

    describe('set', () => {
      test('SET in COOL mode calls setZoneActivityManualHold with cool setpoint', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.COOL);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetTemperature);
        const charTemp = convertSystemTemp2CharTemp(76, 'F');
        await onSet(charTemp);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          convertCharTemp2SystemTemp(charTemp, 'F'),
          null,
          '',
        );
      });

      test('SET in HEAT mode calls setZoneActivityManualHold with heat setpoint', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.HEAT);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetTemperature);
        const charTemp = convertSystemTemp2CharTemp(70, 'F');
        await onSet(charTemp);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1',
          null,
          convertCharTemp2SystemTemp(charTemp, 'F'),
          '',
        );
      });

      test('SET in AUTO mode returns early (no-op)', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetTemperature);
        await onSet(22);
        expect(system.config.setZoneActivityManualHold).not.toHaveBeenCalled();
      });

      test('SET in unknown mode throws HapStatusError', async () => {
        system.config.getMode.mockResolvedValue('mystery');
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetTemperature);
        await expect(onSet(22)).rejects.toThrow(MockHapStatusError);
      });

      test('SET in OFF mode throws HapStatusError', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        system.config.getUnits.mockResolvedValue('F');
        const service = wrapACService(platform, context);
        const onSet = getOnSetHandler(service, MockCharacteristic.TargetTemperature);
        await expect(onSet(22)).rejects.toThrow(MockHapStatusError);
      });
    });
  });

  describe('hold behavior', () => {
    test('forever hold passes empty string as hold time', async () => {
      context = createContext({ holdBehavior: 'forever' });
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
      await onSet(25);
      expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
        '1',
        expect.any(Number),
        null,
        '',
      );
    });

    test('activity hold passes next activity time', async () => {
      context = createContext({ holdBehavior: 'activity' });
      system.config.getZoneNextActivityTime.mockResolvedValue('17:00');
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
      await onSet(25);
      expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
        '1',
        expect.any(Number),
        null,
        '17:00',
      );
    });

    test('until_x hold passes the configured time', async () => {
      context = createContext({ holdBehavior: 'until_x', holdArgument: '22:30' });
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
      await onSet(25);
      expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
        '1',
        expect.any(Number),
        null,
        '22:30',
      );
    });
  });

  describe('zone selection', () => {
    test('uses the zone from context', async () => {
      context = createContext({ zone: '2' });
      system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.COOL);
      const service = wrapACService(platform, context);
      const handler = getOnGetHandler(service, MockCharacteristic.CurrentHeatingCoolingState);
      handler();
      await flushAsync();
      expect(system.status.getZoneConditioning).toHaveBeenCalledWith('2');
    });

    test('cool setpoint set uses the correct zone', async () => {
      context = createContext({ zone: '3' });
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const onSet = getOnSetHandler(service, MockCharacteristic.CoolingThresholdTemperature);
      await onSet(25);
      expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
        '3',
        expect.any(Number),
        null,
        '',
      );
    });

    test('heat setpoint set uses the correct zone', async () => {
      context = createContext({ zone: '3' });
      system.config.getUnits.mockResolvedValue('F');
      const service = wrapACService(platform, context);
      const onSet = getOnSetHandler(service, MockCharacteristic.HeatingThresholdTemperature);
      await onSet(20);
      expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
        '3',
        null,
        expect.any(Number),
        '',
      );
    });
  });

  describe('wrap registration', () => {
    test('registers onGet for all readable characteristics', () => {
      const service = wrapACService(platform, context);
      const readableChars = [
        MockCharacteristic.CurrentHeatingCoolingState,
        MockCharacteristic.TargetHeatingCoolingState,
        MockCharacteristic.TemperatureDisplayUnits,
        MockCharacteristic.CurrentTemperature,
        MockCharacteristic.TargetTemperature,
        MockCharacteristic.CoolingThresholdTemperature,
        MockCharacteristic.HeatingThresholdTemperature,
      ];
      for (const charConst of readableChars) {
        const char = service.getCharacteristic(charConst);
        expect(char.onGet).toHaveBeenCalledTimes(1);
      }
    });

    test('registers onSet for writable characteristics', () => {
      const service = wrapACService(platform, context);
      const writableChars = [
        MockCharacteristic.TargetHeatingCoolingState,
        MockCharacteristic.TargetTemperature,
        MockCharacteristic.CoolingThresholdTemperature,
        MockCharacteristic.HeatingThresholdTemperature,
      ];
      for (const charConst of writableChars) {
        const char = service.getCharacteristic(charConst);
        expect(char.onSet).toHaveBeenCalledTimes(1);
      }
    });

    test('does not register onSet for read-only characteristics', () => {
      const service = wrapACService(platform, context);
      const readOnlyChars = [
        MockCharacteristic.CurrentHeatingCoolingState,
        MockCharacteristic.TemperatureDisplayUnits,
        MockCharacteristic.CurrentTemperature,
      ];
      for (const charConst of readOnlyChars) {
        const char = service.getCharacteristic(charConst);
        expect(char.onSet).not.toHaveBeenCalled();
      }
    });

    test('onGet returns stale value synchronously', () => {
      system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.HEAT);
      const service = wrapACService(platform, context);
      const char = service.getCharacteristic(MockCharacteristic.CurrentHeatingCoolingState);
      // Initial value is null (mock default)
      const handler = getOnGetHandler(service, MockCharacteristic.CurrentHeatingCoolingState);
      const syncResult = handler();
      // Sync result is the stale/default value, not the async result
      expect(syncResult).toBe(char.value);
    });
  });
});
