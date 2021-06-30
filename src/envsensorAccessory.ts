import { PlatformAccessory } from 'homebridge';
import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation } from './base';
import { ThermostatRHService } from './humidifierService';

export class EnvSensorAccessory {
  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const system = this.platform.systems[this.accessory.context.serialNumber];
    new ThermostatRHService(
      this.platform.api,
      system,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.HumiditySensor) ||
      this.accessory.addService(this.platform.Service.HumiditySensor),
    );

    new AccessoryInformation(
      this.platform.api,
      system,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.AccessoryInformation) ||
      this.accessory.addService(this.platform.Service.AccessoryInformation),
    );

  }
}