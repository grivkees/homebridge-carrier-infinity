import { Service } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import {
  InfinityEvolutionSystemStatus,
  InfinityEvolutionSystemConfig,
  InfinityEvolutionSystemProfile,
} from './infinityApi';
import { FilterService } from './characteristics_filter';
import {
  convertSystemTemp2CharTemp,
} from './helpers';
import { ThermostatRHService } from './characteristics_humidity';
import { FanService } from './characteristics_fan';
import { ACService } from './characteristics_ac';
import { BaseAccessory } from './accessory_base';

export class ThermostatAccessory extends BaseAccessory {
  private service: Service;
  private fan_service?: Service;
  private system_status: InfinityEvolutionSystemStatus;
  private system_config: InfinityEvolutionSystemConfig;
  private system_profile: InfinityEvolutionSystemProfile;

  protected ID(context: Record<string, string>): string {
    return `${context.serialNumber}:${Number(context.zone)-1}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);
    const system = this.platform.systems[this.accessory.context.serialNumber];
    // Create services
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.serialNumber);

    this.service = this.accessory.getService(
      this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat,
    );

    // Create accessory api bridge
    this.system_status = system.status;
    this.system_status.fetch().then();
    this.system_config = system.config;
    this.system_config.fetch().then(async () => {
      this.service.setCharacteristic(this.platform.Characteristic.Name, await this.system_config.getZoneName(this.accessory.context.zone));
      const temp_bounds = await this.system_config.getTempBounds();
      const bound_props = {
        minValue: Number(convertSystemTemp2CharTemp(temp_bounds[0], await this.system_config.getUnits())),
        maxValue: Number(convertSystemTemp2CharTemp(temp_bounds[1], await this.system_config.getUnits())),
      };
      this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps(bound_props);
      this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).setProps(bound_props);
      this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).setProps(bound_props);
      this.service.setCharacteristic(
        this.platform.Characteristic.Name,
        await this.system_config.getZoneName(this.accessory.context.zone) + ' Thermostat',
      );
    });
    this.system_profile = system.profile;
    this.system_profile.fetch().then(async () => {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, `${await this.system_profile.getBrand()} Home`)
        .setCharacteristic(this.platform.Characteristic.Model, await this.system_profile.getModel());
    });

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

    this.system_config.fetch().then(async () => {
      this.fan_service?.setCharacteristic(
        this.platform.Characteristic.Name,
        await this.system_config.getZoneName(this.accessory.context.zone) + ' Fan',
      );
    });

    new FanService(
      this.platform,
      this.accessory.context,
    ).wrap(this.fan_service);
  }
}