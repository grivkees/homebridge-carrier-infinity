import { PlatformAccessory } from 'homebridge';
import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation } from './base';
import { ThermostatRHService } from './characteristics_humidity';

export class EnvSensorAccessory {
  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
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