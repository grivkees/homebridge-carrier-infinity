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

/**
 * Convert system humidifier target (rhtg) to HomeKit characteristic value
 * System stores values as actual_percent / 5 (e.g., 40% = 8)
 * HomeKit expects actual percentage 5-45%
 */
export function convertSystemHum2CharHum(rhtg: number): number {
  // rhtg=0, undefined, or NaN means "off" or minimum, treat as 5%
  if (!rhtg || rhtg <= 0 || !Number.isFinite(rhtg)) {
    return 5;
  }
  return Math.min(45, Math.max(5, rhtg * 5));
}

/**
 * Convert HomeKit humidifier target to system value (rhtg)
 */
export function convertCharHum2SystemHum(percent: number): number {
  // Handle NaN/undefined by defaulting to minimum
  if (!Number.isFinite(percent)) {
    return 1;
  }
  return Math.round(Math.min(45, Math.max(5, percent)) / 5);
}

/**
 * Convert system dehumidifier target (rclg) to HomeKit characteristic value
 * Valid API range is 1-7 (46-58% in 2% increments)
 * Formula: percentage = 44 + (rclg * 2)
 * HomeKit expects actual percentage 46-58%
 */
export function convertSystemDehum2CharDehum(rclg: number): number {
  // rclg=0, undefined, or NaN means "off" or maximum (least dehumidification), treat as 58%
  if (!rclg || rclg <= 0 || !Number.isFinite(rclg)) {
    return 58;
  }
  return Math.min(58, Math.max(46, 44 + rclg * 2));
}

/**
 * Convert HomeKit dehumidifier target to system value (rclg)
 * Valid API range is 1-7 (46-58% in 2% increments)
 * Formula: rclg = (percentage - 44) / 2
 */
export function convertCharDehum2SystemDehum(percent: number): number {
  // Handle NaN/undefined by defaulting to maximum (least dehumidification)
  if (!Number.isFinite(percent)) {
    return 7;
  }
  return Math.round((Math.min(58, Math.max(46, percent)) - 44) / 2);
}
