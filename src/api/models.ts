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
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  fromEvent,
  interval,
  lastValueFrom,
  map,
  merge,
  Observable,
  of,
  ReplaySubject,
  Subject,
  Subscription,
  switchMap,
  take,
  takeUntil,
  throttleTime,
  timeout,
} from 'rxjs';
import EventEmitter from 'events';

// TODO: change public to read only
// TODO: make F to C rounding consistent for value deduping
// TODO: add backoff on api errors
// TODO: make getPath a var not method

export type TempWithUnit = [number, string];

abstract class BaseModel<T extends object> {
  // Raw clean api data for use inside class and in children.
  protected clean_data$ = new ReplaySubject<T>(1);
  // Protected form for use outside the class
  public data$ = this.clean_data$.asObservable();

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
    // Use these 'ticks' triggers to update the data.
    ticks.pipe(
      switchMap(
        () => this.fetchObservable(),
      ),
      distinctUntilChanged((prev, cur) => this.isUnchanged(prev, cur)),
    // Send data to the BehaviorSubject/Observable.
    ).subscribe(this.clean_data$);
  }

  abstract getPath(): string;

  protected isUnchanged(x: T, y: T): boolean {
    return this.hash(x) === this.hash(y);
  }

  protected hash(data: T): string {
    return hash(
      data,
      {excludeKeys: (key) => {
        return this.HASH_IGNORE_KEYS.has(key);
      }},
    );
  }

  protected fetchObservable(): Observable<T> {
    return new Observable((observer) => {
      this.forceFetch()
        .then((data) => {
          observer.next(data);
          observer.complete();
        })
        // An observable can never return an error, or it completes.
        // Log errors, swallow them, and send no new value.
        .catch((error) => {
          this.log.error(
            'Failed to fetch updates: ', Axios.isAxiosError(error) ? error.message : error,
          );
          observer.complete();
        });
    });
  }

  protected async forceFetch(): Promise<T> {
    await this.infinity_client.refreshToken();
    await this.infinity_client.activate();
    const response = await this.infinity_client.axios.get(this.getPath());
    if (response.data) {
      // this.log.error(`glenlog fetch: ${response.data}`);
      return await xml2js.parseStringPromise(response.data);
    } else {
      this.log.debug(response.data);
      throw new Error('Response from API contained errors.');
    }
  }
}

export class LocationsModel extends BaseModel<Location> {
  getPath(): string {
    return `/users/${this.infinity_client.username}/locations`;
  }

  public system_serials = this.data$.pipe(map(data => {
    const systems: string[] = [];
    for (const location of data.locations.location) {
      for (const system of location.systems[0].system || []) {
        const link_parts = system['atom:link'][0]['$']['href'].split('/');
        systems.push(link_parts[link_parts.length - 1]);
      }
    }
    return systems;
  }), distinctUntilChanged());
}

abstract class BaseSystemModel<T extends object> extends BaseModel<T> {
  protected last_fetched_ts = 0;
  protected last_fetched_hash = '';
  protected HASH_IGNORE_KEYS = new Set<string>(['timestamp', 'localTime', 'previousMode']);

  constructor(
    protected readonly infinity_client: InfinityRestClient,
    public readonly serialNumber: string,
    protected readonly log: Logger,
  ) {
    super(infinity_client);
  }

  protected async forceFetch(): Promise<T> {
    const data_object = await super.forceFetch();
    const top_level_key = Object.keys(data_object)[0];
    const ts = data_object[top_level_key].timestamp[0];
    // TODO there is something problematic about using these
    this.last_fetched_ts = Date.parse(ts);
    this.last_fetched_hash = this.hash(data_object);
    this.log.debug(`TIMESTAMP ${this.getPath()} reports ${ts} (${this.last_fetched_ts})`);
    this.log.debug(`HASH ${this.getPath()} hashes to (${this.last_fetched_hash})`);
    return data_object;
  }
}

export class SystemProfileModel extends BaseSystemModel<Profile> {
  getPath(): string {
    return `/systems/${this.serialNumber}/profile`;
  }

  public name = this.data$.pipe(map(data => data.system_profile.name[0]), distinctUntilChanged());
  public brand = this.data$.pipe(map(data => data.system_profile.brand[0]), distinctUntilChanged());
  public model = this.data$.pipe(map(data => data.system_profile.model[0]), distinctUntilChanged());
  public firmware = this.data$.pipe(map(data => data.system_profile.firmware[0]), distinctUntilChanged());

  public zone_ids = this.data$.pipe(map(data => {
    return data.system_profile.zones[0].zone.filter(
      (zone: { present: string[] }) => zone['present'][0] === STATUS.ON,
    ).map(
      (zone) => zone['$'].id,
    );
  }), distinctUntilChanged());
}

export class SystemStatusModel extends BaseSystemModel<Status> {
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
  }), distinctUntilChanged());

  public fan = this.zone.pipe(map(zone => {
    if (zone.damperposition[0] === '0') {
      return FAN_MODE.OFF;
    } else {
      return zone.fan[0];
    }
  }), distinctUntilChanged());

  public activity = this.zone.pipe(map(zone => zone.currentActivity[0]), distinctUntilChanged());
  // The zone is blowing if the mode is on or the fan is on
  public blowing = combineLatest([this.mode, this.fan]).pipe(
    debounceTime(50),
    map(([mode, fan]) => mode !== SYSTEM_MODE.OFF || fan !== FAN_MODE.OFF),
    distinctUntilChanged(),
  );

  // This helps with some edge cases around zoned systems
  public closed = this.zone.pipe(map(zone => zone.damperposition[0] === '0'), distinctUntilChanged());

  public temp = combineLatest([this.zone, this.temp_units$]).pipe(
    debounceTime(50),
    map(([zone, temp_units]) => [Number(zone.rt[0]), temp_units] as TempWithUnit),
    distinctUntilChanged(),
    // TODO: this maybe is bouncing because of floating point differences?
  );

  public cool_setpoint = combineLatest([this.zone, this.temp_units$]).pipe(
    debounceTime(50),
    map(([zone, temp_units]) => [Number(zone.clsp[0]), temp_units] as TempWithUnit),
    distinctUntilChanged(),
  );

  public heat_setpoint = combineLatest([this.zone, this.temp_units$]).pipe(
    debounceTime(50),
    map(([zone, temp_units]) => [Number(zone.htsp[0]), temp_units] as TempWithUnit),
    distinctUntilChanged(),
  );

  public humidity = this.zone.pipe(map(zone => Number(zone.rh[0])), distinctUntilChanged());
}

export class SystemConfigModel extends BaseSystemModel<Config> {
  // This will always hold the 'dirty' version of the config. This is what is
  // changed by set methods.
  private dirty_data$ = new ReplaySubject<Config>(1);

  // This combines the clean and dirty data and is what is used by api observers.
  public data$ = merge(
    this.clean_data$.pipe(
      // When a push is active, do not pass clean data unless it is from after
      // the push.
      filter(() => this.last_fetched_ts >= this.last_pushed_ts),
    ),
    this.dirty_data$,
  );

  // Indicates the local data$ has been modified, and clean_data$ should only be
  // used after if it is from after this time.
  private last_pushed_ts = 0;

  constructor(
    protected readonly infinity_client: InfinityRestClient,
    public readonly serialNumber: string,
    protected readonly log: Logger,
  ) {
    super(infinity_client, serialNumber, log);

    // Send changes from the dirty Subject back to the carrier api.
    this.dirty_data$.pipe(
      // Wait x seconds after last change before sending.
      debounceTime(3 * 1000),
    ).subscribe(async data => this.push(data));
  }

  getPath(): string {
    return `/systems/${this.serialNumber}/config`;
  }

  public mode = this.data$.pipe(map(data => data.config.mode[0]), distinctUntilChanged());
  public temp_units = this.data$.pipe(map(data => data.config.cfgem[0]), distinctUntilChanged());
  public temp_bounds = this.data$.pipe(map(data => [
    [Number(data.config.utilityEvent[0].minLimit[0]), data.config.cfgem[0]] as TempWithUnit,
    [Number(data.config.utilityEvent[0].maxLimit[0]), data.config.cfgem[0]] as TempWithUnit,
  ]), distinctUntilChanged());

  private raw_zone_data$ = this.data$.pipe(map(data => data.config.zones[0].zone), distinctUntilChanged());
  // TODO: make this zone filter common between here, status, and setters below
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
  async getZoneActivity(zone: string): Promise<string> {
    const data = await firstValueFrom(this.data$);
    const zone_obj = data.config.zones[0].zone.find(
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
    const data = await firstValueFrom(this.data$);
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

    const zone_obj = data.config.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;
    const activities_obj = zone_obj.activities![0];
    return activities_obj['activity'].find(
      (activity: CActivity) => activity['$'].id === activity_name,
    )!;
  }


  /* Write APIs */
  // mutations: (() => Promise<void>)[] = [];

  // private async push(): Promise<void> {
  //   // Wait a bit so we can catch other mutations that came in around the
  //   // same time.
  //   await new Promise(r => setTimeout(r, 2000));
  //   // We only ever need 2 pushes ongoing at a time. One active, and one pending.
  //   // The first one will handle mutations available at its start, and the next
  //   // one will cover mutations that arrived during the previous's run.
  //   // First, to make sure we only ever have one 'pending' push, cancel any other
  //   // possible 'pending' pushes, and make this one become the 'pending' push.
  //   this.write_lock.cancel();
  //   // Then, grab the lock. so this push can move from 'pending' to 'active'.
  //   try {
  //     await this.write_lock.runExclusive(async () => {
  //     // 1. Do mutations
  //       const mutated_hash = await this.mutate();
  //       if (mutated_hash === null) {
  //         return;
  //       }
  //       // 2. Push
  //       await this.forcePush();
  //       this.log.info('... pushing changes complete.');
  //       // 3. Confirm
  //       await new Promise(r => setTimeout(r, 5000));
  //       await this.forceFetch();
  //       if (mutated_hash === this.hash(await firstValueFrom(this.data$))) {
  //         this.log.debug('Successful propagation to carrier api is confirmed.');
  //       } else {
  //         this.log.warn('Changes do not (yet?) appear to have propagated to the carrier api.');
  //       }
  //     });
  //   } catch (e) {
  //     if (e === E_CANCELED) {
  //       return;
  //     } else if (e === E_TIMEOUT || e === E_ALREADY_LOCKED) {
  //       this.log.error(`Deadlock on push ${e}. Report bug: https://bit.ly/3igbU7D`);
  //     } else {
  //       this.log.error(
  //         'Failed to push updates: ',
  //         Axios.isAxiosError(e) ? e.message : e,
  //       );
  //     }
  //   }
  // }

  private async push(data: Config): Promise<void> {
    // Pause clean data use until we see an update from after now.
    this.last_pushed_ts = Date.now();

    // If nothing actually changed, no need to push.
    const dirty_hash = this.hash(data);
    if (this.last_fetched_hash === dirty_hash) {
      this.log.warn(`Config (hash=${dirty_hash}) doesn't appear to have changed. No changes sent.`);
      this.last_pushed_ts = 0;  // revert to clean config
      return;
    }

    // Make sure the config base revision is not outdated
    // TODO explicitly track and check base rev of dirty
    // TODO use old config directly, instead of these vars?
    const prev_last_fetched_hash = this.last_fetched_hash;
    const prev_last_fetched_ts = this.last_fetched_ts;
    const new_clean_data = await this.forceFetch();
    if (
      this.last_fetched_hash !== prev_last_fetched_hash ||
      this.last_fetched_ts !== prev_last_fetched_ts
    ) {
      this.log.error('Aborting Push: API shows a newer, modified config.');
      this.last_pushed_ts = 0;  // revert to clean config
      this.clean_data$.next(new_clean_data); // share new config
      return;
    }

    // Send the update
    await this.forcePush(data);

    // Wait for a bit, and confirm if we see the api update on the server
    this.clean_data$.pipe(
      // Check for the next x seconds
      timeout(15 * 1000),
      // Stop looking when we see the first successful update appear
      filter((new_clean_data) => dirty_hash === this.hash(new_clean_data)),
      take(1),
    ).subscribe({
      next: () => {
        this.log.info('Successful propagation to carrier api is confirmed.');
        this.events.emit('onGet'); // TODO: pick different event
      },
      // As a fail-safe, revert to clean config if update failed
      error: () => {
        this.log.error('Changes do not (yet?) appear to have propagated to the carrier api.');
        this.last_pushed_ts = 0; // revert to clean config
        this.events.emit('onGet'); // TODO: pick different event
      },
    });

    // Poll for updates for the verification above
    this.events.emit('onGet');
  }

  private async forcePush(data: Config): Promise<void> {
    this.log.info('Pushing changes to carrier api...');

    const builder = new xml2js.Builder();
    const new_xml = builder.buildObject(data);
    // this.log.error(`glenlog push: ${new_xml.replace(/(\r\n|\n)/g, '')}`);
    const post_data = `data=${encodeURIComponent(new_xml)}`;
    await this.infinity_client.axios.post(
      this.getPath(),
      post_data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    this.log.debug(`TIMESTAMP UPDATED CONFIG reports \${ts} (${this.last_pushed_ts})`);
    this.log.debug(`HASH UPDATED CONFIG hashes to (${this.hash(data)})`);
  }

  async setMode(mode: string): Promise<void> {
    this.log.debug('Setting mode to ' + mode);
    const data = await firstValueFrom(this.data$);
    data.config.mode[0] = mode;
    this.dirty_data$.next(data);
  }

  async setZoneActivityHold(
    zone: string,
    activity: string,
    hold_until: string | null,
  ): Promise<void> {
    this.log.debug(`Setting zone ${zone} activity to ${activity} until ${hold_until}`);

    // Get data from zone object and make changes
    const data = await firstValueFrom(this.data$);
    const zone_obj = data.config.zones[0].zone.find(
      (z) => z['$'].id === zone.toString(),
    )!;
    zone_obj['holdActivity']![0] = activity;
    zone_obj['hold'][0] = activity ? STATUS.ON : STATUS.OFF;
    zone_obj['otmr'][0] = activity ? hold_until || '' : '';

    // Push changes
    this.dirty_data$.next(data);
  }

  // async setZoneActivityManualHold(
  //   zone: string,
  //   clsp: number | null,
  //   htsp: number | null,
  //   hold_until: string | null,
  //   fan: string | null = null,
  // ): Promise<void> {
  //   // Modify MANUAL activity to the requested setpoints
  //   this.mutations.push(async () => {
  //     await this.mutateZoneActivityManualHold(zone, clsp, htsp, fan);
  //   });
  //   // Set hold to MANUAL activity
  //   this.mutations.push(async () => {
  //     await this.mutateZoneActivityHold(zone, ACTIVITY.MANUAL, hold_until);
  //   });
  //   // Schedule the push event, but don't wait for it to return.
  //   this.push();
  // }

  // private async mutateZoneActivityManualHold(
  //   zone: string,
  //   clsp: number | null,
  //   htsp: number | null,
  //   fan: string | null = null,
  // ): Promise<void> {
  //   this.log.debug(
  //     `Setting zone ${zone} to`,
  //     clsp ? `clsp=${clsp}` : '',
  //     htsp ? `htsp=${htsp}` : '',
  //     fan ? `fan=${fan}` : '',
  //     '.',
  //   );
  //   const zone_obj = await this.getZone(zone);
  //   // When moving to manual activity, default to prev activity settings.
  //   const manual_activity_obj = await this.getZoneActivityConfig(zone, ACTIVITY.MANUAL);
  //   if (zone_obj['holdActivity']![0] !== ACTIVITY.MANUAL) {
  //     const prev_activity_obj = await this.getZoneActivityConfig(
  //       zone,
  //       await this.getZoneActivity(zone),
  //     );
  //     manual_activity_obj['clsp'][0] = prev_activity_obj['clsp'][0];
  //     manual_activity_obj['htsp'][0] = prev_activity_obj['htsp'][0];
  //     manual_activity_obj['fan'][0] = prev_activity_obj['fan'][0];
  //   }
  //   // Set setpoints on manual activity
  //   [htsp, clsp] = processSetpointDeadband(
  //     htsp || parseFloat(manual_activity_obj['htsp'][0]),
  //     clsp || parseFloat(manual_activity_obj['clsp'][0]),
  //     await firstValueFrom(this.temp_units),
  //     // when setpoints are too close, make clsp sticky when no change made to htsp
  //     htsp === null,
  //   );
  //   manual_activity_obj['htsp'][0] = htsp.toFixed(1);
  //   manual_activity_obj['clsp'][0] = clsp.toFixed(1);
  //   // Set fan on manual activity
  //   if (fan) {
  //     manual_activity_obj['fan'][0] = fan;
  //   }
  // }
}

export class SystemConfigZoneModel {
  constructor(private zone: Observable<CZone>, private temp_units$: Observable<string>) {}

  public name = this.zone.pipe(map(zone => zone.name[0]), distinctUntilChanged());
  public hold_status = this.zone.pipe(map(zone => [zone.hold[0], zone.otmr[0]] as [string, string]), distinctUntilChanged());

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
  }), distinctUntilChanged());

  // TODO this could be made better, and more similar to above.
  // maybe merge into one fxn?
  // TODO: this doesnt seem to work right, add tests
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
  }), distinctUntilChanged());

  private current_activity_config$ = combineLatest([
    this.zone,
    this.activity],
  ).pipe(
    debounceTime(50),
    map(
      ([zone, activity_name]) => {
        return zone.activities[0].activity.find(
          (a) => a['$'].id === activity_name,
        )!;
      },
    ),
    distinctUntilChanged(),
  );

  public fan = this.current_activity_config$.pipe(map(activity => activity.fan[0]), distinctUntilChanged());

  public cool_setpoint = combineLatest([this.current_activity_config$, this.temp_units$]).pipe(
    debounceTime(50),
    map(([activity, temp_units]) => [Number(activity.clsp[0]), temp_units] as TempWithUnit),
    distinctUntilChanged(),
  );

  public heat_setpoint = combineLatest([this.current_activity_config$, this.temp_units$]).pipe(
    debounceTime(50),
    map(([activity, temp_units]) => [Number(activity.htsp[0]), temp_units] as TempWithUnit),
    distinctUntilChanged(),
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
  }

  public getZoneActivity(zone: string): Observable<string> {
    return combineLatest([
      this.status.getZone(zone).activity,
      this.config.getZone(zone).activity,
    ]).pipe(
      debounceTime(50),
      map(([s_activity, c_activity]) => {
        // Vacation scheduling is weird, and changes infrequently. Just get it from status.
        if (s_activity === ACTIVITY.VACATION) {
          return ACTIVITY.VACATION;
        }
        // Config has more up to date activity settings.
        return c_activity;
      }),
      distinctUntilChanged(),
    );
  }
}