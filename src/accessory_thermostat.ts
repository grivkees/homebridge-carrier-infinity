import { Service } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import { FilterService } from './characteristics_filter';
import { ThermostatRHService } from './characteristics_humidity';
import { FanService } from './characteristics_fan';
import { ACService } from './characteristics_ac';
import { BaseAccessory } from './accessory_base';
import { AccessoryInformation } from './characteristics_base';

export class ThermostatAccessory extends BaseAccessory {
  private service: Service;
  private fan_service?: Service;

  protected ID(context: Record<string, string>): string {
    return `${context.serialNumber}:${Number(context.zone)-1}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);
    // Create services
    this.service = this.accessory.getService(
      this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat,
    );
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.context.name);

    // Accessory service handler
    new AccessoryInformation(
      this.platform,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.AccessoryInformation) ||
      this.accessory.addService(this.platform.Service.AccessoryInformation),
    );

    // Create handlers
    new ACService(
      this.platform,
      this.accessory.context,
    ).wrap(this.service);

    // Fan Control
    this.fan_service = this.accessory.getService(this.platform.Service.Fanv2);
    if (this.platform.config['showFanControl']) {
      this.setupFanService();
    } else if (this.fan_service) {
      this.accessory.removeService(this.fan_service);
    }

    // Filter Control
    new FilterService(
      this.platform,
      this.accessory.context,
    ).wrap(this.service);

    // Humidity Control
    new ThermostatRHService(
      this.platform,
      this.accessory.context,
    ).wrap(this.service);
  }

  setupFanService(): void {
    this.fan_service = this.fan_service || this.accessory.addService(this.platform.Service.Fanv2);
    this.fan_service.setCharacteristic(
      this.platform.Characteristic.Name,
      `${this.context.zone_name} Fan`,
    );

    new FanService(
      this.platform,
      this.accessory.context,
    ).wrap(this.fan_service);
  }
}
