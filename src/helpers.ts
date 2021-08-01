import { CharacteristicValue } from 'homebridge';

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
    return (9.0 / 5.0 * temp) + 32;
  } else {
    return temp;
  }
}

export function areCharTempsClose(t1: CharacteristicValue | null, t2: CharacteristicValue | null): boolean {
  if (t1 && t2) {
    return Math.abs( Number(t1) - Number(t2) ) < .1;
  } else {
    return false;
  }
}