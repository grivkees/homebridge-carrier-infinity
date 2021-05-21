import { Service } from 'homebridge';
import { InfinityEvolutionSystemStatus } from './infinityApi';
import { CarrierInfinityHomebridgePlatform } from './platform';

abstract class InfinityServiceDecorator {
  constructor(
    protected readonly platform: CarrierInfinityHomebridgePlatform,
    protected readonly system_status: InfinityEvolutionSystemStatus,
  ) {}

  abstract add_handlers(service: Service): Service;
}

export class InfinityFilterServiceDecorator extends InfinityServiceDecorator {
  add_handlers(service: Service): Service {
    service.getCharacteristic(this.platform.Characteristic.FilterLifeLevel)
      .onGet(async () => {
        return 100 - (await this.system_status.getFilterUsed());
      });

    service.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
      .onGet(async () => {
        return (await this.system_status.getFilterUsed()) > 95 ?
          this.platform.Characteristic.FilterChangeIndication.CHANGE_FILTER :
          this.platform.Characteristic.FilterChangeIndication.FILTER_OK;
      });
    return service;
  }
}
