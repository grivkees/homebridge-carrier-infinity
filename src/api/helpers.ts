import {Zone as CZone} from './interface_config';
import {Zone as SZone} from './interface_status';

export function find_zone_by_id<T extends CZone | SZone>(data: T[], zone: string | number): T {
  // TODO: remove ! and add an error if zone out of bounds
  return data.find(
    (z) => z['$'].id === zone.toString(),
  )!;
}