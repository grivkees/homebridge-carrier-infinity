import { ACTIVITY } from './constants';
import Config, {Zone as CZone, Activity3 as CActivity} from './interface_config';
import {Zone as SZone} from './interface_status';

function findByID<T extends CZone | SZone | CActivity>(data: T[], id: string): T {
  const zone_obj = data.find(
    (z) => z['$'].id === id,
  );
  if (zone_obj === undefined) {
    throw new RangeError(`Item with id='${id}' not found in list.`);
  }
  return zone_obj;
}

export function findZoneByID<T extends CZone | SZone>(data: T[], zone: string | number): T {
  return findByID(data, zone.toString());
}

export function getZoneActivityConfig(data: Config, zone: string, activity_name: string): CActivity {
  // Vacation is stored somewhere else...
  if (activity_name === ACTIVITY.VACATION) {
    return {
      '$': {id: ACTIVITY.VACATION},
      clsp: data.config.vacmaxt,
      htsp: data.config.vacmint,
      fan: data.config.vacfan,
      previousFan: [],
    };
  }

  const zone_obj = findZoneByID(data.config.zones[0].zone, zone);
  return findByID(zone_obj.activities[0].activity, activity_name);
}
