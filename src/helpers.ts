import { CharacteristicValue } from 'homebridge';
import { FAN_MODE } from './api/constants';

export function convertSystemTemp2CharTemp(temp: number, units: string): CharacteristicValue {
  if (units === 'F') {
    return Math.round(5.0 / 9.0 * (temp - 32) * 10) / 10;
  } else {
    return temp;
  }
}

export function convertCharTemp2SystemTemp(temp: CharacteristicValue, units: string): number {
  temp = Number(temp);
  // HK keeps track in C, but carrier can be either C or F. Convert if needed.
  if (units === 'F') {
    // Round to integer degree for carrier.
    const rounded = Math.round((9.0 / 5.0 * temp) + 32);
    return Math.abs(rounded) < Number.EPSILON ? 0 : rounded; // get rid of -0
  } else {
    // Round C to half degree for carrier.
    return Math.round(temp * 2) / 2;
  }
}

export function areCharTempsClose(t1: CharacteristicValue | null, t2: CharacteristicValue | null): boolean {
  if (t1 && t2) {
    return Math.abs( Number(t1) - Number(t2) ) < Number.EPSILON;
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

export function range(start: number, end: number): number[] {
  return Array.from({length: (end - start) + 1}, (_, i) => start + i);
}
