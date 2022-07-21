import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation } from './characteristics_base';
import { ThermostatRHService } from './characteristics_humidity';
import { BaseAccessory } from './accessory_base';

export class EnvSensorAccessory extends BaseAccessory {
  protected ID(context: Record<string, string>): string {
    return `ENVSENSOR:${context.serialNumber}:${Number(context.zone)-1}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);

    new ThermostatRHService(
      this.platform,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor),
    );

    new AccessoryInformation(
      this.platform,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.AccessoryInformation) ||
      this.accessory.addService(this.platform.Service.AccessoryInformation),
    );

  }
}