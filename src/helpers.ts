import { CharacteristicValue } from 'homebridge';
import { FAN_MODE } from './api/constants';

export function convertSystemTemp2CharTemp(temp: number, units: string): CharacteristicValue {
  if (units === 'F') {
    return 5.0 / 9.0 * (temp - 32);
  } else {
    return temp;
  }
}

export function convertCharTemp2SystemTemp(temp: CharacteristicValue, units: string): number {
  temp = Number(temp);
  if (units === 'F') {
    // HK keeps track in C, but infinity can be either C or F. Convert to F if
    // needed, then round to degree for infinity.
    return Math.round((9.0 / 5.0 * temp) + 32);
  } else {
    // Round C to half degree for infinity.
    return Math.round(temp * 2) / 2;
  }
}

export function areCharTempsClose(t1: CharacteristicValue | null, t2: CharacteristicValue | null): boolean {
  if (t1 && t2) {
    return Math.abs( Number(t1) - Number(t2) ) < .1;
  } else {
    return false;
  }
}

export function convertSystemFan2CharFan(fan: string): CharacteristicValue {
  switch(fan) {
    case FAN_MODE.LOW:
      return 1;
    case FAN_MODE.MED:
      return 2;
    case FAN_MODE.HIGH:
      return 3;
    default:
      return 0;
  }
}

export function convertCharFan2SystemFan(fan: CharacteristicValue): string {
  switch (fan) {
    case 1:
      return FAN_MODE.LOW;
    case 2:
      return FAN_MODE.MED;
    case 3:
      return FAN_MODE.HIGH;
    default:
      return FAN_MODE.OFF;
  }
}

export function processSetpointDeadband(
  htsp: number,
  clsp: number,
  units: string,
  sticky_clsp: boolean,
): [number, number]{
  const deadband = units === 'F' ? 2 : 1;
  if (clsp - htsp < deadband) {
    if (sticky_clsp) {
      htsp = clsp - deadband;
    } else {
      clsp = htsp + deadband;
    }
  }
  return [htsp, clsp];
}