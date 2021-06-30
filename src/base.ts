import { InfinityEvolutionSystemModel } from './infinityApi';
import { Characteristic, Service } from 'hap-nodejs';
import { CharacteristicValue, UnknownContext, WithUUID } from 'homebridge';

/*
* Helpers to add handlers to the HAP Service and Characteristic objects.
*/

class Wrapper {
  constructor(
        protected readonly system: InfinityEvolutionSystemModel,
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
        this.system,
        this.context,
      ).wrap(service);
    }
  }
}

export abstract class CharacteristicWrapper extends Wrapper {
  public abstract ctype: WithUUID<new () => Characteristic>;
  protected get: (() => Promise<CharacteristicValue>) | undefined;
  protected set: ((value: CharacteristicValue) => Promise<void>) | undefined;

  wrap(service: Service): void {
    const characteristic = service.getCharacteristic(this.ctype);
    if (this.get) {
      characteristic.onGet(this.get.bind(this));
    }
    if (this.set) {
      characteristic.onSet(this.set.bind(this));
    }
  }
}

export class AccessoryInformation extends Wrapper {
  wrap(service: Service): void {
    this.system.profile.fetch().then(async () => {
      service
        .setCharacteristic(Characteristic.SerialNumber, this.system.serialNumber)
        .setCharacteristic(Characteristic.Manufacturer, `${await this.system.profile.getBrand()} Home`)
        .setCharacteristic(Characteristic.Model, await this.system.profile.getModel());
    });
  }
}