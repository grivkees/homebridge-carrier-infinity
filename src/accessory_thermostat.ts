import { Service } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import { FilterService } from './characteristics_filter';
import {
  convertSystemTemp2CharTemp,
} from './helpers';
import { ThermostatRHService, HumidifierService } from './characteristics_humidity';
import { FanService } from './characteristics_fan';
import { ACService } from './characteristics_ac';
import { BaseAccessory } from './accessory_base';

export class ThermostatAccessory extends BaseAccessory {
  private service: Service;
  private fan_service?: Service;
  private humidifier_service?: Service;

  protected ID(context: Record<string, string>): string {
    return `${context.serialNumber}:${Number(context.zone)-1}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);
    // Create services
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.serialNumber);

    this.service = this.accessory.getService(
      this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat,
    );

    // Create accessory api bridge
    this.system.status.fetch().then();
    this.system.config.fetch().then(async () => {
      this.service.setCharacteristic(this.platform.Characteristic.Name, await this.system.config.getZoneName(this.accessory.context.zone));
      const temp_bounds = await this.system.config.getTempBounds();
      const bound_props = {
        minValue: Number(convertSystemTemp2CharTemp(temp_bounds[0], await this.system.config.getUnits())),
        maxValue: Number(convertSystemTemp2CharTemp(temp_bounds[1], await this.system.config.getUnits())),
      };
      this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).setProps(bound_props);
      this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).setProps(bound_props);
      this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).setProps(bound_props);
      // setting name explicitly is needed to not lose the word 'thermostat'
      this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.displayName);
    });
    this.system.profile.fetch().then(async () => {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, `${await this.system.profile.getBrand()} Home`)
        .setCharacteristic(this.platform.Characteristic.Model, await this.system.profile.getModel());
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

    // Humidity Sensor (on thermostat service)
    new ThermostatRHService(
      this.platform,
      this.accessory.context,
    ).wrap(this.service);

    // Humidifier/Dehumidifier Control
    this.humidifier_service = this.accessory.getService(this.platform.Service.HumidifierDehumidifier);
    if (this.platform.config['showHumidifierDehumidifier']) {
      this.setupHumidifierService();
    } else if (this.humidifier_service) {
      this.accessory.removeService(this.humidifier_service);
    }
  }

  setupFanService(): void {
    this.fan_service = this.fan_service || this.accessory.addService(this.platform.Service.Fanv2);

    this.system.config.fetch().then(async () => {
      this.fan_service?.setCharacteristic(
        this.platform.Characteristic.Name,
        await this.system.config.getZoneName(this.accessory.context.zone) + ' Fan',
      );
    });

    new FanService(
      this.platform,
      this.accessory.context,
    ).wrap(this.fan_service);
  }

  setupHumidifierService(): void {
    this.humidifier_service = this.humidifier_service || this.accessory.addService(
      this.platform.Service.HumidifierDehumidifier,
    );

    this.system.config.fetch().then(async () => {
      this.humidifier_service?.setCharacteristic(
        this.platform.Characteristic.Name,
        await this.system.config.getZoneName(this.accessory.context.zone) + ' Humidity',
      );
    });

    new HumidifierService(
      this.platform,
      this.accessory.context,
    ).wrap(this.humidifier_service);
  }
}
