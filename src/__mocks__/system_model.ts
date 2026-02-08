/**
 * Mock factory for SystemModelGraphQL and its facade models.
 *
 * Usage in tests:
 *   const system = mockSystemModel();
 *   system.status.getOutdoorTemp.mockResolvedValue(31);
 */

import EventEmitter from 'events';
import { mockLogger } from './homebridge';

export function mockSystemModel(serialNumber = 'ABC123DEF456') {
  const events = new EventEmitter();
  events.setMaxListeners(100);
  const log = mockLogger();

  const status = {
    fetch: jest.fn().mockResolvedValue(undefined),
    getUnits: jest.fn().mockResolvedValue('F'),
    getOutdoorTemp: jest.fn().mockResolvedValue(31),
    getFilterUsed: jest.fn().mockResolvedValue(25),
    getMode: jest.fn().mockResolvedValue('auto'),
    getZoneConditioning: jest.fn().mockResolvedValue('idle'),
    getZoneFan: jest.fn().mockResolvedValue('off'),
    getZoneOpen: jest.fn().mockResolvedValue(true),
    getZoneTemp: jest.fn().mockResolvedValue(72),
    getZoneHumidity: jest.fn().mockResolvedValue(38),
    getZoneActivity: jest.fn().mockResolvedValue('home'),
    getZoneCoolSetpoint: jest.fn().mockResolvedValue(74),
    getZoneHeatSetpoint: jest.fn().mockResolvedValue(68),
    getHumidifier: jest.fn().mockResolvedValue('off'),
    getDehumidifier: jest.fn().mockResolvedValue('off'),
  };

  const config = {
    fetch: jest.fn().mockResolvedValue(undefined),
    getUnits: jest.fn().mockResolvedValue('F'),
    getTempBounds: jest.fn().mockResolvedValue([50, 90]),
    getMode: jest.fn().mockResolvedValue('auto'),
    getZoneName: jest.fn().mockResolvedValue('Zone 1'),
    getZoneHoldStatus: jest.fn().mockResolvedValue(['off', '']),
    getZoneActivity: jest.fn().mockResolvedValue('home'),
    getZoneActivityFan: jest.fn().mockResolvedValue('off'),
    getZoneActivityCoolSetpoint: jest.fn().mockResolvedValue(74),
    getZoneActivityHeatSetpoint: jest.fn().mockResolvedValue(68),
    getZoneNextActivityTime: jest.fn().mockResolvedValue('17:00'),
    getActivityHumidifierState: jest.fn().mockResolvedValue('off'),
    getActivityDehumidifierState: jest.fn().mockResolvedValue('off'),
    getActivityHumidifierTarget: jest.fn().mockResolvedValue(35),
    getActivityDehumidifierTarget: jest.fn().mockResolvedValue(52),
    setMode: jest.fn().mockResolvedValue(undefined),
    setZoneActivityHold: jest.fn().mockResolvedValue(undefined),
    setZoneActivityManualHold: jest.fn().mockResolvedValue(undefined),
    setHumidityConfig: jest.fn().mockResolvedValue(undefined),
  };

  const profile = {
    fetch: jest.fn().mockResolvedValue(undefined),
    getName: jest.fn().mockResolvedValue('My Home'),
    getBrand: jest.fn().mockResolvedValue('Bryant'),
    getModel: jest.fn().mockResolvedValue('24VNA936A003'),
    getFirmware: jest.fn().mockResolvedValue('15.03'),
    getZones: jest.fn().mockResolvedValue(['1']),
  };

  return {
    serialNumber,
    log,
    events,
    status,
    config,
    profile,
  };
}
