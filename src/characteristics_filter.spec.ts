/* eslint-disable @typescript-eslint/no-explicit-any */
import { mockSystemModel } from './__mocks__/system_model';
import { MockCharacteristic, MockService, MockHapStatusError, mockService } from './__mocks__/homebridge';
import { FilterService } from './characteristics_filter';

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

describe('FilterService', () => {
  let system: any;
  let platform: any;
  let context: any;
  let service: any;

  beforeEach(() => {
    system = mockSystemModel();
    platform = createMockPlatform(system);
    context = createContext();
    service = mockService('FilterMaintenance');
  });

  function wrapService() {
    new FilterService(platform as any, context).wrap(service);
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

  describe('FilterLife', () => {
    describe('get', () => {
      test('returns 75 when filter used is 25', async () => {
        system.status.getFilterUsed.mockResolvedValue(25);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterLifeLevel);
        expect(updateValue).toHaveBeenCalledWith(75);
      });

      test('returns 0 when filter used is 100', async () => {
        system.status.getFilterUsed.mockResolvedValue(100);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterLifeLevel);
        expect(updateValue).toHaveBeenCalledWith(0);
      });

      test('returns 100 when filter used is 0', async () => {
        system.status.getFilterUsed.mockResolvedValue(0);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterLifeLevel);
        expect(updateValue).toHaveBeenCalledWith(100);
      });
    });
  });

  describe('FilterChange', () => {
    describe('get', () => {
      test('returns FILTER_OK when used is 25', async () => {
        system.status.getFilterUsed.mockResolvedValue(25);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterChangeIndication);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.FilterChangeIndication.FILTER_OK);
      });

      test('returns FILTER_OK when used is 95 (boundary)', async () => {
        system.status.getFilterUsed.mockResolvedValue(95);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterChangeIndication);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.FilterChangeIndication.FILTER_OK);
      });

      test('returns CHANGE_FILTER when used is 96', async () => {
        system.status.getFilterUsed.mockResolvedValue(96);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterChangeIndication);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.FilterChangeIndication.CHANGE_FILTER);
      });

      test('returns CHANGE_FILTER when used is 100', async () => {
        system.status.getFilterUsed.mockResolvedValue(100);
        wrapService();
        const updateValue = await callOnGet(MockCharacteristic.FilterChangeIndication);
        expect(updateValue).toHaveBeenCalledWith(MockCharacteristic.FilterChangeIndication.CHANGE_FILTER);
      });
    });
  });
});
