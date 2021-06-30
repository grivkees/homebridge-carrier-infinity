import {
  InfinityEvolutionApi,
  InfinityEvolutionSystemConfig,
  InfinityEvolutionSystemProfile,
  InfinityEvolutionSystemStatus,
} from './infinityApi';
import { Characteristic, Service } from 'hap-nodejs';
import { CharacteristicValue, UnknownContext, WithUUID } from 'homebridge';

/*
* Helpers to add handlers to the HAP Service and Characteristic objects.
*/

class Wrapper {
  protected system_status: InfinityEvolutionSystemStatus;
  protected system_config: InfinityEvolutionSystemConfig;
  protected system_profile: InfinityEvolutionSystemProfile;

  constructor(
        protected readonly InfinityEvolutionApi: InfinityEvolutionApi,
        protected readonly context: UnknownContext,
  ) {
    this.system_status = new InfinityEvolutionSystemStatus(
      InfinityEvolutionApi,
      this.context.serialNumber,
    );
    this.system_config = new InfinityEvolutionSystemConfig(
      InfinityEvolutionApi,
      this.context.serialNumber,
    );
    this.system_profile = new InfinityEvolutionSystemProfile(
      InfinityEvolutionApi,
      this.context.serialNumber,
    );
  }

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
        this.InfinityEvolutionApi,
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
    this.system_profile.fetch().then(async () => {
      service
        .setCharacteristic(Characteristic.SerialNumber, this.context.serialNumber)
        .setCharacteristic(Characteristic.Manufacturer, `${await this.system_profile.getBrand()} Home`)
        .setCharacteristic(Characteristic.Model, await this.system_profile.getModel());
    });
  }
}