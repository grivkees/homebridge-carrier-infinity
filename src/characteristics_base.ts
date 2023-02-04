import { ACTIVITY } from './api/constants';
import { SystemModel } from './api/models';
import { Service, Characteristic, Logger } from 'homebridge';
import { CharacteristicValue, UnknownContext, WithUUID } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';
import { PrefixLogger } from './helper_logging';

import { firstValueFrom, map, Observable, of } from 'rxjs';
/*
* Helpers to add handlers to the HAP Service and Characteristic objects.
*/

class Wrapper {
  public readonly Service: typeof Service = this.platform.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.platform.api.hap.Characteristic;
  protected readonly system: SystemModel = this.platform.systems[this.context.serialNumber];
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
  protected set: ((value: CharacteristicValue) => Promise<void>) | undefined;
  // Holds an observable of the system/api-based value
  protected abstract value: Observable<CharacteristicValue>;
  protected props?: Observable<object>;

  wrap(service: Service): void {
    const characteristic = service.getCharacteristic(this.ctype);
    if (this.props) {
      this.props.subscribe(async data => {
        characteristic.setProps(data);
      });
    }
    // Push updates from the system-based value observable to HK
    this.value.subscribe(
      async data => {
        if (characteristic.value == data) {
          this.log.warn(`BADPUSH Updating ${this.ctype.name} from ${characteristic.value} to ${data}`); // TODO REMOVE
        } else {
          this.log.warn(`PUSH Updating ${this.ctype.name} from ${characteristic.value} to ${data}`); // TODO REMOVE
        }
        characteristic.updateValue(data);
      },
    );
    // Make HK get requests initiate an observable update
    characteristic.onGet(async () => {
      // Tell the system model it should update ...
      this.system.status.events.emit('onGet');
      this.system.config.events.emit('onGet');
      // ... and return immediately the last seen api value.
      const data = await firstValueFrom(this.value);
      if (characteristic.value != data) {
        this.log.warn(`GET Updating ${this.ctype.name} from ${characteristic.value} to ${data}`); // TODO REMOVE
      }
      return data;
    });
    // Sets call set helper which calls system model
    if (this.set) {
      characteristic.onSet(this.set.bind(this));
    }
  }
}

export abstract class ThermostatCharacteristicWrapper extends CharacteristicWrapper {
  // TODO: check in constructor that context has zone and hold settings

  // async getActivity(): Promise<string> {
  //   // Vacation scheduling is weird, and changes infrequently. Just get it from status.
  //   if (await this.system.status.getZoneActivity(this.context.zone) === ACTIVITY.VACATION) {
  //     return ACTIVITY.VACATION;
  //   }
  //   // Config has more up to date activity settings.
  //   return await this.system.config.getZoneActivity(this.context.zone);
  // }

  async getHoldTime(): Promise<string> {
    // OTMR setting to say when manual hold should end
    switch (this.context.holdBehavior) {
      case 'activity':
        return firstValueFrom(this.system.config.getZone(this.context.zone).next_activity_time);
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

class AccessorySerial extends CharacteristicWrapper {
  ctype = this.Characteristic.SerialNumber;
  value = of(this.system.serialNumber);
}

class AccessoryModel extends CharacteristicWrapper {
  ctype = this.Characteristic.Model;
  value = this.system.profile.model;
}

class AccessoryManufacturer extends CharacteristicWrapper {
  ctype = this.Characteristic.Manufacturer;
  value = this.system.profile.brand.pipe(map(x => `${x} Home`));
}

export class AccessoryInformation extends MultiWrapper {
  WRAPPERS = [
    AccessorySerial,
    AccessoryModel,
    AccessoryManufacturer,
  ];
}