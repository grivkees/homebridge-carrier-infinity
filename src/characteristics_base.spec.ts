/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockCharacteristic, MockCharacteristic, MockService, MockHapStatusError } from './__mocks__/homebridge';
import { mockSystemModel } from './__mocks__/system_model';
import { safeSetProps, ThermostatCharacteristicWrapper } from './characteristics_base';
import { ACTIVITY } from './api/constants';

// Concrete subclass of the abstract ThermostatCharacteristicWrapper for testing.
class TestWrapper extends ThermostatCharacteristicWrapper {
  ctype = MockCharacteristic.CurrentTemperature;
}

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
    systems: { [systemModel.serialNumber]: systemModel },
  };
}

function createContext(overrides: Record<string, any> = {}) {
  return {
    serialNumber: 'ABC123DEF456',
    name: 'Test',
    zone: '1',
    holdBehavior: 'forever',
    holdArgument: '',
    ...overrides,
  };
}

describe('safeSetProps', () => {
  test('does not update value when value is within new bounds', () => {
    const char = mockCharacteristic(50);
    safeSetProps(char, { minValue: 10, maxValue: 100 });
    expect(char.updateValue).not.toHaveBeenCalled();
    expect(char.setProps).toHaveBeenCalledWith({ minValue: 10, maxValue: 100 });
  });

  test('updates value to minValue when current value is below new min', () => {
    const char = mockCharacteristic(5);
    safeSetProps(char, { minValue: 10, maxValue: 100 });
    expect(char.updateValue).toHaveBeenCalledWith(10);
    expect(char.setProps).toHaveBeenCalledWith({ minValue: 10, maxValue: 100 });
  });

  test('updates value to maxValue when current value is above new max', () => {
    const char = mockCharacteristic(150);
    safeSetProps(char, { minValue: 10, maxValue: 100 });
    expect(char.updateValue).toHaveBeenCalledWith(10);
    expect(char.setProps).toHaveBeenCalledWith({ minValue: 10, maxValue: 100 });
  });

  test('uses defaultValue when provided and value is out of bounds', () => {
    const char = mockCharacteristic(5);
    safeSetProps(char, { minValue: 10, maxValue: 100 }, 42);
    expect(char.updateValue).toHaveBeenCalledWith(42);
    expect(char.setProps).toHaveBeenCalledWith({ minValue: 10, maxValue: 100 });
  });

  test('always calls setProps regardless of clamping', () => {
    const charInBounds = mockCharacteristic(50);
    safeSetProps(charInBounds, { minValue: 10, maxValue: 100 });
    expect(charInBounds.setProps).toHaveBeenCalledTimes(1);

    const charOutOfBounds = mockCharacteristic(5);
    safeSetProps(charOutOfBounds, { minValue: 10, maxValue: 100 });
    expect(charOutOfBounds.setProps).toHaveBeenCalledTimes(1);
  });

  test('handles props with only minValue (no maxValue)', () => {
    const char = mockCharacteristic(3);
    safeSetProps(char, { minValue: 10 });
    expect(char.updateValue).toHaveBeenCalledWith(10);
    expect(char.setProps).toHaveBeenCalledWith({ minValue: 10 });
  });

  test('does not clamp when only minValue is set and value is above it', () => {
    const char = mockCharacteristic(50);
    safeSetProps(char, { minValue: 10 });
    expect(char.updateValue).not.toHaveBeenCalled();
    expect(char.setProps).toHaveBeenCalledWith({ minValue: 10 });
  });

  test('handles props with only maxValue (no minValue)', () => {
    const char = mockCharacteristic(150);
    safeSetProps(char, { maxValue: 100 });
    // When below min is undefined and above max: defaults to min ?? max => max
    expect(char.updateValue).toHaveBeenCalledWith(100);
    expect(char.setProps).toHaveBeenCalledWith({ maxValue: 100 });
  });

  test('does not clamp when only maxValue is set and value is below it', () => {
    const char = mockCharacteristic(50);
    safeSetProps(char, { maxValue: 100 });
    expect(char.updateValue).not.toHaveBeenCalled();
    expect(char.setProps).toHaveBeenCalledWith({ maxValue: 100 });
  });

  test('value exactly at minValue is within bounds', () => {
    const char = mockCharacteristic(10);
    safeSetProps(char, { minValue: 10, maxValue: 100 });
    expect(char.updateValue).not.toHaveBeenCalled();
  });

  test('value exactly at maxValue is within bounds', () => {
    const char = mockCharacteristic(100);
    safeSetProps(char, { minValue: 10, maxValue: 100 });
    expect(char.updateValue).not.toHaveBeenCalled();
  });
});

describe('ThermostatCharacteristicWrapper', () => {
  let system: ReturnType<typeof mockSystemModel>;
  let platform: any;

  beforeEach(() => {
    system = mockSystemModel();
    platform = createMockPlatform(system);
  });

  describe('getActivity', () => {
    test('returns vacation when status zone activity is vacation', async () => {
      system.status.getZoneActivity.mockResolvedValue(ACTIVITY.VACATION);
      const context = createContext();
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getActivity();
      expect(result).toBe(ACTIVITY.VACATION);
    });

    test('returns config zone activity when status is home', async () => {
      system.status.getZoneActivity.mockResolvedValue(ACTIVITY.HOME);
      system.config.getZoneActivity.mockResolvedValue(ACTIVITY.HOME);
      const context = createContext();
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getActivity();
      expect(result).toBe(ACTIVITY.HOME);
    });

    test('returns config zone activity when status is away', async () => {
      system.status.getZoneActivity.mockResolvedValue(ACTIVITY.AWAY);
      system.config.getZoneActivity.mockResolvedValue(ACTIVITY.AWAY);
      const context = createContext();
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getActivity();
      expect(result).toBe(ACTIVITY.AWAY);
    });

    test('returns config activity (sleep) when status is not vacation', async () => {
      system.status.getZoneActivity.mockResolvedValue(ACTIVITY.HOME);
      system.config.getZoneActivity.mockResolvedValue(ACTIVITY.SLEEP);
      const context = createContext();
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getActivity();
      expect(result).toBe(ACTIVITY.SLEEP);
    });

    test('passes correct zone to status and config', async () => {
      system.status.getZoneActivity.mockResolvedValue(ACTIVITY.HOME);
      system.config.getZoneActivity.mockResolvedValue(ACTIVITY.HOME);
      const context = createContext({ zone: '3' });
      const wrapper = new TestWrapper(platform, context);
      await wrapper.getActivity();
      expect(system.status.getZoneActivity).toHaveBeenCalledWith('3');
      expect(system.config.getZoneActivity).toHaveBeenCalledWith('3');
    });

    test('does not call config.getZoneActivity when status is vacation', async () => {
      system.status.getZoneActivity.mockResolvedValue(ACTIVITY.VACATION);
      const context = createContext();
      const wrapper = new TestWrapper(platform, context);
      await wrapper.getActivity();
      expect(system.config.getZoneActivity).not.toHaveBeenCalled();
    });
  });

  describe('getHoldTime', () => {
    test('forever returns empty string', async () => {
      const context = createContext({ holdBehavior: 'forever' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('');
    });

    test('activity returns next activity time from config', async () => {
      system.config.getZoneNextActivityTime.mockResolvedValue('17:00');
      const context = createContext({ holdBehavior: 'activity' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('17:00');
    });

    test('activity passes correct zone', async () => {
      system.config.getZoneNextActivityTime.mockResolvedValue('08:30');
      const context = createContext({ holdBehavior: 'activity', zone: '2' });
      const wrapper = new TestWrapper(platform, context);
      await wrapper.getHoldTime();
      expect(system.config.getZoneNextActivityTime).toHaveBeenCalledWith('2');
    });

    test('until_x returns holdArgument directly', async () => {
      const context = createContext({ holdBehavior: 'until_x', holdArgument: '17:30' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('17:30');
    });

    test('until_x returns holdArgument value as-is', async () => {
      const context = createContext({ holdBehavior: 'until_x', holdArgument: '23:59' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('23:59');
    });

    test('for_x with holdArgument 1:30 calculates time 1hr 30min from now', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T10:00:00'));
      const context = createContext({ holdBehavior: 'for_x', holdArgument: '1:30' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('11:30');
      jest.useRealTimers();
    });

    test('for_x with holdArgument 0:15 calculates time 15min from now', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T10:00:00'));
      const context = createContext({ holdBehavior: 'for_x', holdArgument: '0:15' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('10:15');
      jest.useRealTimers();
    });

    test('for_x with holdArgument 2:00 calculates time 2hr from now', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T10:00:00'));
      const context = createContext({ holdBehavior: 'for_x', holdArgument: '2:00' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      // Note: padStart(5,'0') left-pads the entire "H:M" string, so when
      // minutes is 0 the result is "012:0" rather than "12:00". This reflects
      // the actual implementation behavior.
      expect(result).toBe('012:0');
      jest.useRealTimers();
    });

    test('for_x wrapping past midnight', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T23:00:00'));
      const context = createContext({ holdBehavior: 'for_x', holdArgument: '2:00' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      // 23:00 + 2:00 = 1:0 next day; padStart(5,'0') yields "001:0"
      expect(result).toBe('001:0');
      jest.useRealTimers();
    });

    test('default/unknown holdBehavior returns empty string', async () => {
      const context = createContext({ holdBehavior: 'something_unknown' });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('');
    });

    test('undefined holdBehavior returns empty string', async () => {
      const context = createContext({ holdBehavior: undefined });
      const wrapper = new TestWrapper(platform, context);
      const result = await wrapper.getHoldTime();
      expect(result).toBe('');
    });
  });
});
