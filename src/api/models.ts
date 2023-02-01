import { processSetpointDeadband } from '../helpers';
import { MemoizeExpiring } from 'typescript-memoize';
import { Mutex, tryAcquire, E_ALREADY_LOCKED, E_CANCELED, E_TIMEOUT } from 'async-mutex';
import * as xml2js from 'xml2js';
import { Logger } from 'homebridge';
import hash from 'object-hash';
import { PrefixLogger } from '../helper_logging';
import { InfinityRestClient } from './rest_client';
import Axios from 'axios';

import Config, {Zone as CZone, Activity3 as CActivity} from './interface_config';
import Location from './interface_locations';
import Profile from './interface_profile';
import Status, {Zone as SZone} from './interface_status';
import { ACTIVITY, FAN_MODE, SYSTEM_MODE, STATUS } from './constants';
import { combineLatest, throttleTime, from, fromEvent, interval, merge, Observable, switchMap, of, distinctUntilChanged, mergeAll, map } from 'rxjs';
import EventEmitter from 'events';

export type TempWithUnit = [number, string];

abstract class BaseModel {
  protected data_object!: object;
  // TODO: is there a way to make the 'typeof' below work with the subclasses
  public data$: Observable<typeof this.data_object>;
  protected data_object_hash?: string;
  protected HASH_IGNORE_KEYS = new Set<string>();
  protected write_lock: Mutex;
  protected log: Logger = new PrefixLogger(this.infinity_client.log, 'API');

  public events = new EventEmitter();

  constructor(
    protected readonly infinity_client: InfinityRestClient,
  ) {
    this.write_lock = new Mutex();

    // Set up the triggers for updating our api data
    const ticks = merge(
      // Immediate Fetch
      of(1),
      // Periodic Fetch
      interval(5 * 60 * 1000),
      // On Demand Fetch
      fromEvent(this.events, 'onGet'),
    // Throttle to ignore events in quick succession
    ).pipe(throttleTime(10000));
    // Use trigger to update data model
    this.data$ = ticks.pipe(
      switchMap(
        () => from(this.fetch().then(() => this.data_object)),
      ),
      distinctUntilChanged((prev, cur) => {
        return (
          // TODO reuse excluded keys fxn from below
          hash(prev) === hash(cur)
        );
      }),
    );
  }

  abstract getPath(): string;

  protected hashDataObject(): string {
    return hash(
      this.data_object,
      {excludeKeys: (key) => {
        return this.HASH_IGNORE_KEYS.has(key);
      }},
    );
  }

  @MemoizeExpiring(10 * 1000)
  async fetch(): Promise<void> {
    // If push is ongoing, skip this update fetch. The push will do a fetch.
    try {
      await tryAcquire(this.write_lock).runExclusive(async () => {
        await this.forceFetch();
      });
    } catch (e) {
      if (e === E_ALREADY_LOCKED) {
        return;
      } else if (e === E_TIMEOUT || e === E_CANCELED) {
        this.log.error(`Deadlock on fetch ${e}. Report bug: https://bit.ly/3igbU7D`);
      } else {
        this.log.error(
          'Failed to fetch updates: ',
          Axios.isAxiosError(e) ? e.message : e,
        );
      }
    }
  }

  protected async forceFetch(): Promise<void> {
    await this.infinity_client.refreshToken();
    await this.infinity_client.activate();
    const response = await this.infinity_client.axios.get(this.getPath());
    if (response.data) {
      this.data_object = await xml2js.parseStringPromise(response.data) as object;
      this.data_object_hash = this.hashDataObject();
    } else {
      this.log.debug(response.data);
      throw new Error('Response from API contained errors.');
    }
  }
}

export class LocationsModel extends BaseModel {
  protected data_object!: Location;
  public data$!: Observable<Location>;

  getPath(): string {
    return `/users/${this.infinity_client.username}/locations`;
  }

  // TODO: decide if this should be observable or not, since its used for
  // accessory creation.
  async getSystems(): Promise<string[]> {
    await this.fetch();
    const systems: string[] = [];
    for (const location of this.data_object.locations.location) {
      for (const system of location.systems[0].system || []) {
        const link_parts = system['atom:link'][0]['$']['href'].split('/');
        systems.push(link_parts[link_parts.length - 1]);
      }
    }
    return systems;
  }
}

abstract class BaseSystemModel extends BaseModel {
  private last_updated = 0;  // TODO use this
  protected HASH_IGNORE_KEYS = new Set<string>(['timestamp', 'localTime']);

  constructor(
    protected readonly infinity_client: InfinityRestClient,
    public readonly serialNumber: string,
    protected readonly log: Logger,
  ) {
    super(infinity_client);
  }

  protected async forceFetch(): Promise<void> {
    await super.forceFetch();
    const top_level_key = Object.keys(this.data_object)[0];
    const ts = this.data_object[top_level_key].timestamp[0];
    this.last_updated = Date.parse(ts);
    this.log.debug(`TIMESTAMP ${this.getPath()} reports ${ts} (${this.last_updated})`);
  }
}

export class SystemProfileModel extends BaseSystemModel {
  protected data_object!: Profile;
  public data$!: Observable<Profile>;

  getPath(): string {
    return `/systems/${this.serialNumber}/profile`;
  }

  public name = this.data$.pipe(map(data => data.system_profile.name[0]), distinctUntilChanged());
  public brand = this.data$.pipe(map(data => data.system_profile.brand[0]), distinctUntilChanged());
  public model = this.data$.pipe(map(data => data.system_profile.model[0]), distinctUntilChanged());
  public firmware = this.data$.pipe(map(data => data.system_profile.firmware[0]), distinctUntilChanged());

  // TODO: decide if this should be observable or not, since its used for
  // accessory creation.
  async getZones(): Promise<Array<string>> {
    await this.fetch();
    return this.data_object.system_profile.zones[0].zone.filter(
      (zone: { present: string[] }) => zone['present'][0] === STATUS.ON,
    ).map(
      (zone) => zone['$'].id,
    );
  }
}

export class SystemStatusModel extends BaseSystemModel {
  protected data_object!: Status;
  public data$!: Observable<Status>;

  getPath(): string {
    return `/systems/${this.serialNumber}/status`;
  }

  public outdoor_temp = this.data$.pipe(map(data => Number(data.status.oat[0])), distinctUntilChanged());
  public filter_used = this.data$.pipe(map(data => Number(data.status.filtrlvl[0])), distinctUntilChanged());
  public temp_units = this.data$.pipe(map(data => data.status.cfgem[0]), distinctUntilChanged());

  public mode = this.data$.pipe(map(data => {
    const raw_mode = data.status.mode[0];
    switch(raw_mode) {
      case 'gasheat':
      case 'electric':
      case 'hpheat':
        return SYSTEM_MODE.HEAT;
      case 'dehumidify':
        return SYSTEM_MODE.COOL;
      default:
        return raw_mode;
    }
  }), distinctUntilChanged());

  private raw_zone_data$ = this.data$.pipe(map(data => data.status.zones[0].zone), distinctUntilChanged());

  public getZone(zone: string): SystemStatusZoneModel {
    // TODO assert valid zone
    // TODO save SystemStatusZoneModel to dedup
    return new SystemStatusZoneModel(this.raw_zone_data$.pipe(map(
      data => data.find(
        (z) => z['$'].id === zone.toString(),
      )!,
    )), this.temp_units);
  }
}

export class SystemStatusZoneModel {
  constructor(private zone: Observable<SZone>, private temp_units$: Observable<string>) {}

  public mode = this.zone.pipe(map(zone => {
    if (zone.damperposition[0] === '0') {
      return SYSTEM_MODE.OFF;
    }
    const raw_mode = zone.zoneconditioning[0];
    switch(raw_mode) {
      case 'active_heat':
      case 'prep_heat':
      case 'pending_heat':
        return SYSTEM_MODE.HEAT;
      case 'active_cool':
      case 'prep_cool':
      case 'pending_cool':
        return SYSTEM_MODE.COOL;
      case 'idle':
        return SYSTEM_MODE.OFF;
      default:
        return raw_mode;
    }
  }));

  public fan = this.zone.pipe(map(zone => {
    if (zone.damperposition[0] === '0') {
      return FAN_MODE.OFF;
    } else {
      return zone.fan[0];
    }
  }));

  public activity = this.zone.pipe(map(zone => zone.currentActivity[0]));
  // The zone is blowing if the mode is on or the fan is on
  public blowing = combineLatest([this.mode, this.fan]).pipe(map(([mode, fan]) => mode !== SYSTEM_MODE.OFF || fan !== FAN_MODE.OFF));
  // This helps with some edge cases around zoned systems
  public closed = this.zone.pipe(map(zone => zone.damperposition[0] === '0'));

  public temp = combineLatest([this.zone, this.temp_units$]).pipe(map(
    ([zone, temp_units]) => [Number(zone.rt[0]), temp_units] as TempWithUnit),
  );

  public cool_setpoint = combineLatest([this.zone, this.temp_units$]).pipe(map(
    ([zone, temp_units]) => [Number(zone.clsp[0]), temp_units] as TempWithUnit),
  );

  public heat_setpoint = combineLatest([this.zone, this.temp_units$]).pipe(map(
    ([zone, temp_units]) => [Number(zone.htsp[0]), temp_units] as TempWithUnit),
  );

  public humidity = this.zone.pipe(map(zone => Number(zone.rh[0])));
}

export class SystemConfigModel extends BaseSystemModel {
  protected data_object!: Config;
  public data$!: Observable<Config>;

  getPath(): string {
    return `/systems/${this.serialNumber}/config`;
  }

  // TODO: DELETE ME
  async getUnits(): Promise<string> {
    await this.fetch();
    return this.data_object.config.cfgem[0];
  }

  public mode = this.data$.pipe(map(data => data.config.mode[0]), distinctUntilChanged());
  public temp_units = this.data$.pipe(map(data => data.config.cfgem[0]), distinctUntilChanged());
  public temp_bounds = this.data$.pipe(map(data => [
    [Number(data.config.utilityEvent[0].minLimit[0]), data.config.cfgem[0]] as TempWithUnit,
    [Number(data.config.utilityEvent[0].maxLimit[0]), data.config.cfgem[0]] as TempWithUnit,
  ]), distinctUntilChanged());

  private raw_zone_data$ = this.data$.pipe(map(data => data.config.zones[0].zone), distinctUntilChanged());

  public getZone(zone: string): SystemConfigZoneModel {
    // TODO assert valid zone
    // TODO save SystemConfigZoneModel to dedup
    return new SystemConfigZoneModel(this.raw_zone_data$.pipe(map(
      data => data.find(
        (z) => z['$'].id === zone.toString(),
      )!,
    )), this.temp_units);
  }

  // TODO: DELETE ME
  async getZoneName(zone: string): Promise<string> {
    await this.fetch();
    const zone_obj = this.data_object.config.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;

    return zone_obj['name'][0];
  }

  // TODO: DELETE ME
  async getZoneActivity(zone: string): Promise<string> {
    await this.fetch();
    const zone_obj = this.data_object.config.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;

    if (zone_obj.hold[0] === STATUS.ON) {
      return zone_obj.holdActivity![0];
    } else {
      const now = new Date();
      const program_obj = zone_obj.program![0];
      const today_schedule = program_obj.day[now.getDay()].period.filter(period => period.enabled[0] === STATUS.ON).reverse();
      for (const i in today_schedule) {
        const time = today_schedule[i].time[0];
        const split = time.split(':');
        if (
          // The hour is past
          Number(split[0]) < now.getHours() ||
          // The hour is now, the minute is past
          (Number(split[0]) === now.getHours() && Number(split[1]) < now.getMinutes())
        ) {
          return today_schedule[i].activity[0];
        }
      }
      // If we got to the end without finding the next activity, it means the activity is the last from yesterday
      const yesterday_schedule = program_obj['day'][(now.getDay() + 8) % 7].period.filter(
        period => period.enabled[0] === STATUS.ON,
      ).reverse();
      return yesterday_schedule[0].activity[0];
    }
  }

  // TODO: DELETE ME
  private async getZoneActivityConfig(zone: string, activity_name: string): Promise<CActivity> {
    await this.fetch();
    // Vacation is stored somewhere else...
    if (activity_name === ACTIVITY.VACATION) {
      return {
        '$': {id: ACTIVITY.VACATION},
        clsp: this.data_object.config.vacmaxt,
        htsp: this.data_object.config.vacmint,
        fan: this.data_object.config.vacfan,
        previousFan: [],
      };
    }

    const zone_obj = this.data_object.config.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;
    const activities_obj = zone_obj.activities![0];
    return activities_obj['activity'].find(
      (activity: CActivity) => activity['$'].id === activity_name,
    )!;
  }


  /* Write APIs */
  mutations: (() => Promise<void>)[] = [];

  private async push(): Promise<void> {
    // Wait a bit so we can catch other mutations that came in around the
    // same time.
    await new Promise(r => setTimeout(r, 2000));
    // We only ever need 2 pushes ongoing at a time. One active, and one pending.
    // The first one will handle mutations available at its start, and the next
    // one will cover mutations that arrived during the previous's run.
    // First, to make sure we only ever have one 'pending' push, cancel any other
    // possible 'pending' pushes, and make this one become the 'pending' push.
    this.write_lock.cancel();
    // Then, grab the lock. so this push can move from 'pending' to 'active'.
    try {
      await this.write_lock.runExclusive(async () => {
      // 1. Do mutations
        const mutated_hash = await this.mutate();
        if (mutated_hash === null) {
          return;
        }
        // 2. Push
        await this.forcePush();
        this.log.info('... pushing changes complete.');
        // 3. Confirm
        await new Promise(r => setTimeout(r, 5000));
        await this.forceFetch();
        if (mutated_hash === this.data_object_hash) {
          this.log.debug('Successful propagation to carrier api is confirmed.');
        } else {
          this.log.warn('Changes do not (yet?) appear to have propagated to the carrier api.');
        }
      });
    } catch (e) {
      if (e === E_CANCELED) {
        return;
      } else if (e === E_TIMEOUT || e === E_ALREADY_LOCKED) {
        this.log.error(`Deadlock on push ${e}. Report bug: https://bit.ly/3igbU7D`);
      } else {
        this.log.error(
          'Failed to push updates: ',
          Axios.isAxiosError(e) ? e.message : e,
        );
      }
    }
  }

  private async mutate(): Promise<string | null> {
    // short circuit if no mutations in queue
    if (this.mutations.length === 0) {
      return null;
    }

    // Refresh config.
    const old_hash = this.data_object_hash;
    await this.forceFetch();
    if (old_hash !== this.data_object_hash) {
      this.log.warn('Cached config was stale before mutation and push.');
    }

    // Take config mutations of the queue and run them.
    // TODO make mutations non-async. these need to happen in order. and async
    // in a loop is an anti-pattern.
    while(this.mutations.length > 0) {
      const m = this.mutations.shift();
      if (m) {
        await m();
      }
    }
    const mutated_hash = this.hashDataObject();

    // If nothing actually changed, no need to push.
    if (old_hash === mutated_hash) {
      this.log.warn('Config doesn\'t appear to have changed. No changes sent.');
      return null;
    }

    return mutated_hash;
  }

  private async forcePush(): Promise<void> {
    this.log.info('Pushing changes to carrier api...');
    const builder = new xml2js.Builder();
    const new_xml = builder.buildObject(this.data_object);
    const data = `data=${encodeURIComponent(new_xml)}`;
    await this.infinity_client.axios.post(
      this.getPath(),
      data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
  }

  async setMode(mode: string): Promise<void> {
    this.mutations.push(async () => {
      this.mutateMode(mode);
    });
    // Schedule the push event, but don't wait for it to return.
    this.push();
  }

  private mutateMode(mode: string): void {
    this.log.debug('Setting mode to ' + mode);
    this.data_object.config.mode[0] = mode;
  }

  async setZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.mutations.push(async () => {
      await this.mutateZoneActivityHold(zone, activity, hold_until);
    });
    // Schedule the push event, but don't wait for it to return.
    this.push();
  }

  private async mutateZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.log.debug(`Setting zone ${zone} activity to ${activity} until ${hold_until}`);
    const zone_obj = await this.getZone(zone);
    zone_obj['holdActivity']![0] = activity;
    zone_obj['hold'][0] = activity ? STATUS.ON : STATUS.OFF;
    zone_obj['otmr'][0] = activity ? hold_until || '' : '';
  }

  async setZoneActivityManualHold(
    zone: string,
    clsp: number | null,
    htsp: number | null,
    hold_until: string | null,
    fan: string | null = null,
  ): Promise<void> {
    // Modify MANUAL activity to the requested setpoints
    this.mutations.push(async () => {
      await this.mutateZoneActivityManualHold(zone, clsp, htsp, fan);
    });
    // Set hold to MANUAL activity
    this.mutations.push(async () => {
      await this.mutateZoneActivityHold(zone, ACTIVITY.MANUAL, hold_until);
    });
    // Schedule the push event, but don't wait for it to return.
    this.push();
  }

  private async mutateZoneActivityManualHold(
    zone: string,
    clsp: number | null,
    htsp: number | null,
    fan: string | null = null,
  ): Promise<void> {
    this.log.debug(
      `Setting zone ${zone} to`,
      clsp ? `clsp=${clsp}` : '',
      htsp ? `htsp=${htsp}` : '',
      fan ? `fan=${fan}` : '',
      '.',
    );
    const zone_obj = await this.getZone(zone);
    // When moving to manual activity, default to prev activity settings.
    const manual_activity_obj = await this.getZoneActivityConfig(zone, ACTIVITY.MANUAL);
    if (zone_obj['holdActivity']![0] !== ACTIVITY.MANUAL) {
      const prev_activity_obj = await this.getZoneActivityConfig(
        zone,
        await this.getZoneActivity(zone),
      );
      manual_activity_obj['clsp'][0] = prev_activity_obj['clsp'][0];
      manual_activity_obj['htsp'][0] = prev_activity_obj['htsp'][0];
      manual_activity_obj['fan'][0] = prev_activity_obj['fan'][0];
    }
    // Set setpoints on manual activity
    [htsp, clsp] = processSetpointDeadband(
      htsp || parseFloat(manual_activity_obj['htsp'][0]),
      clsp || parseFloat(manual_activity_obj['clsp'][0]),
      await this.getUnits(),
      // when setpoints are too close, make clsp sticky when no change made to htsp
      htsp === null,
    );
    manual_activity_obj['htsp'][0] = htsp.toFixed(1);
    manual_activity_obj['clsp'][0] = clsp.toFixed(1);
    // Set fan on manual activity
    if (fan) {
      manual_activity_obj['fan'][0] = fan;
    }
  }
}

export class SystemConfigZoneModel {
  constructor(private zone: Observable<CZone>, private temp_units$: Observable<string>) {}

  public name = this.zone.pipe(map(zone => zone.name[0]));
  public hold_status = this.zone.pipe(map(zone => [zone.hold[0], zone.otmr[0]] as [string, string]));

  // TODO Add a unit test to this
  public activity = this.zone.pipe(map(zone => {
    if (zone.hold[0] === STATUS.ON) {
      return zone.holdActivity![0];
    } else {
      const now = new Date();
      const program_obj = zone.program![0];
      const today_schedule = program_obj.day[now.getDay()].period.filter(period => period.enabled[0] === STATUS.ON).reverse();
      for (const i in today_schedule) {
        const time = today_schedule[i].time[0];
        const split = time.split(':');
        if (
          // The hour is past
          Number(split[0]) < now.getHours() ||
          // The hour is now, the minute is past
          (Number(split[0]) === now.getHours() && Number(split[1]) < now.getMinutes())
        ) {
          return today_schedule[i].activity[0];
        }
      }
      // If we got to the end without finding the next activity, it means the activity is the last from yesterday
      const yesterday_schedule = program_obj['day'][(now.getDay() + 8) % 7].period.filter(
        period => period.enabled[0] === STATUS.ON,
      ).reverse();
      return yesterday_schedule[0].activity[0];
    }
  }));

  // TODO this could be made better, and more similar to above.
  // maybe merge into one fxn?
  public next_activity_time = this.zone.pipe(map(zone => {
    const now = new Date();
    const program_obj = zone.program![0];
    const day_obj = program_obj['day'][now.getDay()];
    for (const i in day_obj['period']) {
      const time = day_obj['period'][i].time[0];
      const split = time.split(':');
      if (
        // The hour is nigh
        Number(split[0]) > now.getHours() ||
        // The hour is now, the minute is nigh
        (Number(split[0]) === now.getHours() && Number(split[1]) > now.getMinutes())
      ) {
        return time;
      }
    }
    // If we got to the end without finding the next activity, it means the next activity is the first from tomorrow
    const tomorrow_obj = program_obj['day'][(now.getDay() + 1) % 7];
    return tomorrow_obj['period'][0].time[0];
  }));

  private current_activity_config$ = combineLatest([
    this.zone,
    this.activity],
  ).pipe(map(
    ([zone, activity_name]) => {
      return zone.activities[0].activity.find(
        (a) => a['$'].id === activity_name,
      )!;
    },
  ));

  public fan = this.current_activity_config$.pipe(map(activity => activity.fan[0]));

  public cool_setpoint = combineLatest([this.current_activity_config$, this.temp_units$]).pipe(map(
    ([activity, temp_units]) => [Number(activity.clsp[0]), temp_units] as TempWithUnit),
  );

  public heat_setpoint = combineLatest([this.current_activity_config$, this.temp_units$]).pipe(map(
    ([activity, temp_units]) => [Number(activity.htsp[0]), temp_units] as TempWithUnit),
  );
}

export class SystemModel {
  public status: SystemStatusModel;
  public config: SystemConfigModel;
  public profile: SystemProfileModel;
  public log: Logger = new PrefixLogger(this.infinity_client.log, this.serialNumber);
  public data$!: Observable<[Status, Config, Profile]>;

  constructor(
    protected readonly infinity_client: InfinityRestClient,
    public readonly serialNumber: string,
  ) {
    const api_logger = new PrefixLogger(this.log, 'API');
    this.status = new SystemStatusModel(
      infinity_client,
      serialNumber,
      api_logger,
    );
    this.config = new SystemConfigModel(
      infinity_client,
      serialNumber,
      api_logger,
    );
    this.profile = new SystemProfileModel(
      infinity_client,
      serialNumber,
      api_logger,
    );
    this.data$ = combineLatest([
      this.status.data$,
      this.config.data$,
      this.profile.data$,
    ]);
  }

  public getZoneActivity(zone: string): Observable<string> {
    return combineLatest([
      this.status.getZone(zone).activity,
      this.config.getZone(zone).activity,
    ]).pipe(map(([s_activity, c_activity]) => {
      // Vacation scheduling is weird, and changes infrequently. Just get it from status.
      if (s_activity === ACTIVITY.VACATION) {
        return ACTIVITY.VACATION;
      }
      // Config has more up to date activity settings.
      return c_activity;
    }));
  }
}