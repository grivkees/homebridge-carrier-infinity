import { CharacteristicValue } from 'homebridge';

export function convertSystemTemp2CharTemp(temp: number, units: string): CharacteristicValue {
  if (units === 'F') {
    return 5.0 / 9.0 * (temp - 32);
  } else {
    return temp;
  }
}
