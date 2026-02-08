/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockSystemModel } from './__mocks__/system_model';
import { MockCharacteristic, MockService, MockHapStatusError, mockService } from './__mocks__/homebridge';
import { SYSTEM_MODE, FAN_MODE } from './api/constants';
import { FanService } from './characteristics_fan';

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

function createContext() {
  return {
    serialNumber: 'ABC123DEF456',
    name: 'Test Thermostat',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
  };
}

describe('FanService', () => {
  let system: any;
  let platform: any;
  let context: any;
  let service: any;

  beforeEach(() => {
    system = mockSystemModel();
    platform = createMockPlatform(system);
    context = createContext();
    service = mockService('Fanv2');
  });

  function wrapService() {
    new FanService(platform as any, context).wrap(service);
  }

  function flushAsync(): Promise<void> {
    return new Promise(r => setTimeout(r, 0));
  }

  async function callOnGet(charConst: any): Promise<any> {
    const char = service.getCharacteristic(charConst);
    const onGetCb = char.onGet.mock.calls[0][0];
    onGetCb();
    await flushAsync();
    return char.updateValue;
  }

  describe('FanStatus', () => {
    describe('get', () => {
      test('returns INACTIVE when system mode is off', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.Active);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.Active.INACTIVE);
      });

      test('returns ACTIVE when zone fan is not off and zone is open', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.MED);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
        system.status.getZoneOpen.mockResolvedValue(true);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.Active);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.Active.ACTIVE);
      });

      test('returns ACTIVE when zone is conditioning and zone is open', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.COOL);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.COOL);
        system.status.getZoneOpen.mockResolvedValue(true);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.Active);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.Active.ACTIVE);
      });

      test('returns INACTIVE when fan/conditioning active but zone is closed', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.HIGH);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.HIGH);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
        system.status.getZoneOpen.mockResolvedValue(false);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.Active);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.Active.INACTIVE);
      });

      test('returns INACTIVE when all fan/conditioning are off', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
        system.status.getZoneOpen.mockResolvedValue(true);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.Active);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.Active.INACTIVE);
      });
    });

    describe('set', () => {
      test('calls setMode(fanonly) when system is OFF and setting ACTIVE', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.Active);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(MockCharacteristic.Active.ACTIVE);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.FAN_ONLY);
      });

      test('calls setZoneActivityManualHold with fan=off when setting INACTIVE', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.Active);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(MockCharacteristic.Active.INACTIVE);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.OFF,
        );
      });
    });
  });

  describe('FanState', () => {
    describe('get', () => {
      test('returns INACTIVE when system is off', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.CurrentFanState);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.CurrentFanState.INACTIVE);
      });

      test('returns BLOWING_AIR when fan active and zone open', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.MED);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.MED);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
        system.status.getZoneOpen.mockResolvedValue(true);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.CurrentFanState);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.CurrentFanState.BLOWING_AIR);
      });

      test('returns IDLE when fan active but zone closed', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.HIGH);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.HIGH);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
        system.status.getZoneOpen.mockResolvedValue(false);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.CurrentFanState);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.CurrentFanState.IDLE);
      });

      test('returns IDLE when all quiet', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneFan.mockResolvedValue(FAN_MODE.OFF);
        system.status.getZoneConditioning.mockResolvedValue(SYSTEM_MODE.OFF);
        system.status.getZoneOpen.mockResolvedValue(true);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.CurrentFanState);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.CurrentFanState.IDLE);
      });
    });
  });

  describe('FanSpeed', () => {
    describe('get', () => {
      test('returns 0 for fan off', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.OFF);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.RotationSpeed);
        expect(updateValue).toHaveBeenCalledWith(0);
      });

      test('returns 1 for fan low', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.LOW);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.RotationSpeed);
        expect(updateValue).toHaveBeenCalledWith(1);
      });

      test('returns 2 for fan med', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.MED);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.RotationSpeed);
        expect(updateValue).toHaveBeenCalledWith(2);
      });

      test('returns 3 for fan high', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.HIGH);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.RotationSpeed);
        expect(updateValue).toHaveBeenCalledWith(3);
      });
    });

    describe('set', () => {
      test('calls setZoneActivityManualHold with converted fan mode', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.RotationSpeed);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(2);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.MED,
        );
      });

      test('calls setZoneActivityManualHold with low fan', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.RotationSpeed);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(1);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.LOW,
        );
      });

      test('calls setZoneActivityManualHold with high fan', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.RotationSpeed);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(3);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.HIGH,
        );
      });

      test('also calls setMode(fanonly) when system is OFF', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.RotationSpeed);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(2);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.FAN_ONLY);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.MED,
        );
      });
    });
  });

  describe('TargetFanState', () => {
    describe('get', () => {
      test('returns AUTO when fan is off', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.OFF);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.TargetFanState);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.TargetFanState.AUTO);
      });

      test('returns MANUAL when fan is not off', async () => {
        system.config.getZoneActivityFan.mockResolvedValue(FAN_MODE.MED);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.TargetFanState);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.TargetFanState.MANUAL);
      });
    });

    describe('set', () => {
      test('calls setZoneActivityManualHold with fan=off when setting AUTO', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.TargetFanState);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(MockCharacteristic.TargetFanState.AUTO);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.OFF,
        );
      });

      test('calls setZoneActivityManualHold with fan=med when setting MANUAL', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.AUTO);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.TargetFanState);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(MockCharacteristic.TargetFanState.MANUAL);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.MED,
        );
      });

      test('also calls setMode(fanonly) when system is OFF', async () => {
        system.config.getMode.mockResolvedValue(SYSTEM_MODE.OFF);
        wrapService();
        const char = service.getCharacteristic(MockCharacteristic.TargetFanState);
        const onSetCb = char.onSet.mock.calls[0][0];
        await onSetCb(MockCharacteristic.TargetFanState.MANUAL);
        expect(system.config.setMode).toHaveBeenCalledWith(SYSTEM_MODE.FAN_ONLY);
        expect(system.config.setZoneActivityManualHold).toHaveBeenCalledWith(
          '1', null, null, '', FAN_MODE.MED,
        );
      });
    });
  });
});
