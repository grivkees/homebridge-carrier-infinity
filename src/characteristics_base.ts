import { ACTIVITY, SUBSCRIPTION } from './api/constants';
import { SystemModelGraphQL } from './api/models_graphql';
import { Service, Characteristic, Logger } from 'homebridge';
import { CharacteristicValue, UnknownContext, WithUUID } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';
import { PrefixLogger } from './helper_logging';

/*
* Helpers to add handlers to the HAP Service and Characteristic objects.
*/

// Safely set props on a characteristic, initializing the value first if it
// would be out of bounds for the new min/max constraints.
export function safeSetProps(
  characteristic: Characteristic,
  props: Record<string, number>,
  defaultValue?: CharacteristicValue,
): void {
  const val = characteristic.value as number;
  const min = props.minValue;
  const max = props.maxValue;
  if ((min !== undefined && val < min) || (max !== undefined && val > max)) {
    characteristic.updateValue(defaultValue ?? min ?? max);
  }
  characteristic.setProps(props);
}

class Wrapper {
  public readonly Service: typeof Service = this.platform.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.platform.api.hap.Characteristic;
  protected readonly system: SystemModelGraphQL = this.platform.systems[this.context.serialNumber];
  protected readonly log: Logger = new PrefixLogger(this.system.log, this.context.name);

  constructor(
    public readonly platform: CarrierInfinityHomebridgePlatform,
    protected readonly context: UnknownContext,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  wrap(service: Service): void {
    return;
  }
}

export abstract class MultiWrapper extends Wrapper {
  protected WRAPPERS: typeof Wrapper[] = [];

  wrap(service: Service): void {
    for (const ctype of this.WRAPPERS) {
      new ctype(
        this.platform,
        this.context,
      ).wrap(service);
    }
  }
}

export abstract class CharacteristicWrapper extends Wrapper {
  public abstract ctype: WithUUID<new () => Characteristic>;
  protected props = {};
  protected get: (() => Promise<CharacteristicValue>) | undefined;
  protected set: ((value: CharacteristicValue) => Promise<void>) | undefined;
  // used exclusively if no char value is set yet (first accessory load)
  protected default_value: CharacteristicValue | null = null;

  wrap(service: Service): void {
    const characteristic = service.getCharacteristic(this.ctype);
    if (this.props) {
      safeSetProps(characteristic, this.props as Record<string, number>, this.default_value ?? undefined);
    }
    if (this.get) {
      // This magic callback schedules another async callback to actually fetch
      // and update the characteristic. This lets us convert a sync callback to
      // an async callback.
      const callback = () => {
        // Schedule async update to HK characteristic.
        // Wrapped in try/catch to prevent unhandled rejections from crashing
        // Homebridge when the API is unavailable (#397)
        process.nextTick(async () => {
          try {
            if (this.get) {
              characteristic.updateValue(await this.get());
            }
          } catch (e) {
            this.log.debug('Failed to update characteristic:', String(e));
          }
        });
        // Return immediately with the current, stale value. This is needed for
        // this to be a valid callback to onGet.
        // try 1) existing value, if falsy, 2) default value, if null, 3) keep existing value
        return characteristic.value || this.default_value || characteristic.value;
      };

      // Listen for HK 'get' requests. Schedule async update push to HK.
      characteristic.onGet(callback);
      // Listen for api updates. Schedule async update push to HK.
      this.system.events.on(SUBSCRIPTION.CONFIG, callback);
      this.system.events.on(SUBSCRIPTION.CONFIG_MUTATE, callback);
      this.system.events.on(SUBSCRIPTION.STATUS, callback);
    }
    if (this.set) {
      characteristic.onSet(this.set.bind(this));
    }
  }
}

export abstract class ThermostatCharacteristicWrapper extends CharacteristicWrapper {
  // TODO: check in constructor that context has zone and hold settings

  async getActivity(): Promise<string> {
    // Vacation scheduling is weird, and changes infrequently. Just get it from status.
    if (await this.system.status.getZoneActivity(this.context.zone) === ACTIVITY.VACATION) {
      return ACTIVITY.VACATION;
    }
    // Config has more up to date activity settings.
    return await this.system.config.getZoneActivity(this.context.zone);
  }

  async getHoldTime(): Promise<string> {
    // OTMR setting to say when manual hold should end
    switch (this.context.holdBehavior) {
      case 'activity':
        return await this.system.config.getZoneNextActivityTime(this.context.zone);
      case 'for_x': {
        const arg = this.context.holdArgument.split(':');
        let target_ms = (new Date()).getTime();
        target_ms += Number(arg[0]) * 60 * 60 * 1000;
        target_ms += Number(arg[1]) * 60 * 1000;
        const target_date = new Date(target_ms);
        return `${target_date.getHours()}:${target_date.getMinutes()}`.padStart(5, '0');
      }
      case 'until_x':
        return this.context.holdArgument;
      case 'forever':
        return '';
      default:
        return '';
    }
  }
}

export class AccessoryInformation extends Wrapper {
  wrap(service: Service): void {
    this.system.profile.fetch().then(async () => {
      service
        .setCharacteristic(this.Characteristic.SerialNumber, this.system.serialNumber)
        .setCharacteristic(this.Characteristic.Manufacturer, `${await this.system.profile.getBrand()} Home`)
        .setCharacteristic(this.Characteristic.Model, await this.system.profile.getModel());
    }).catch(e => {
      this.log.debug('Failed to set accessory information:', String(e));
    });
  }
}