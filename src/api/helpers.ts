import { ACTIVITY } from './constants';
import Config, {Zone as CZone, Activity3 as CActivity} from './interface_config';
import {Zone as SZone} from './interface_status';

export function findZoneByID<T extends CZone | SZone>(data: T[], zone: string | number): T {
  // TODO: remove ! and add an error if zone out of bounds
  return data.find(
    (z) => z['$'].id === zone.toString(),
  )!;
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
  const activities_obj = zone_obj.activities[0];
  // TODO add assert valid zone name to remove !
  return activities_obj['activity'].find(
    (activity: CActivity) => activity['$'].id === activity_name,
  )!;
}
