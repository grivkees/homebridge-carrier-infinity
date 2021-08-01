import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import {
  ACTIVITY,
  FAN_MODE,
  InfinityEvolutionSystemStatus,
  InfinityEvolutionSystemConfig,
  InfinityEvolutionSystemProfile,
  SYSTEM_MODE,
} from './infinityApi';
import { FilterService } from './characteristics_filter';
import { CharTempsAreClose } from './helpers';
import { ThermostatRHService } from './characteristics_humidity';
import { FanService } from './characteristics_fan';

export class InfinityEvolutionPlatformAccessory {
  private service: Service;
  private fan_service?: Service;
  private system_status: InfinityEvolutionSystemStatus;
  private system_config: InfinityEvolutionSystemConfig;
  private system_profile: InfinityEvolutionSystemProfile;

  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const system = this.platform.systems[this.accessory.context.serialNumber];
    // Create services
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serialNumber);

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
        minValue: Number(await this.convertSystemTemp2CharTemp(temp_bounds[0])),
        maxValue: Number(await this.convertSystemTemp2CharTemp(temp_bounds[1])),
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
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(async () => {
        const current_state = await this.system_status.getMode();
        switch(current_state) {
          case SYSTEM_MODE.OFF:
          case SYSTEM_MODE.FAN_ONLY:
            return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
          case SYSTEM_MODE.COOL:
            return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
          case SYSTEM_MODE.HEAT:
            return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
          default:
            this.platform.log.error(`Unknown current state '${current_state}'. Defaulting to off.`);
            return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
        }
      });

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(async () => {
        const target_state = await this.system_config.getMode();
        switch(target_state) {
          case SYSTEM_MODE.OFF:
          case SYSTEM_MODE.FAN_ONLY:
            return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
          case SYSTEM_MODE.COOL:
            return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
          case SYSTEM_MODE.HEAT:
            return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
          case SYSTEM_MODE.AUTO:
            return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
          default:
            this.platform.log.error(`Unknown target state '${target_state}'. Defaulting to off.`);
            return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
        }
      })
      .onSet(async (value) => {
        if (value === this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value) {
          return;
        }
        switch(value) {
          case this.platform.Characteristic.TargetHeatingCoolingState.OFF: {
            // If manual fan is set, go to fan only mode
            if (await this.system_config.getZoneActivityFan(
              this.accessory.context.zone,
              await this.getZoneActvity(this.accessory.context.zone),
            ) !== FAN_MODE.OFF) {
              return await this.system_config.setMode(SYSTEM_MODE.FAN_ONLY);
            // If no manual fan, go to full off
            } else {
              return await this.system_config.setMode(SYSTEM_MODE.OFF);
            }
          }
          case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
            return await this.system_config.setMode(SYSTEM_MODE.COOL);
          case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
            return await this.system_config.setMode(SYSTEM_MODE.HEAT);
          case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
            return await this.system_config.setMode(SYSTEM_MODE.AUTO);
          default:
            this.platform.log.error(`Don't know how to set target state '${value}'. Making no change.`);
        }
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(async () => {
        return await this.system_config.getUnits() === 'F' ?
          this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
          this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
      });    

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(async () => {
        return await this.convertSystemTemp2CharTemp(await this.system_status.getZoneTemp(this.accessory.context.zone)); 
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(async () => {
        const cmode = await this.system_config.getMode();
        const activity = await this.getZoneActvity(this.accessory.context.zone);
        switch (cmode) {
          case SYSTEM_MODE.COOL:
            return await this.convertSystemTemp2CharTemp(await this.system_config.getZoneActivityCoolSetpoint(
              this.accessory.context.zone, activity,
            ));
          case SYSTEM_MODE.HEAT:
            return await this.convertSystemTemp2CharTemp(await this.system_config.getZoneActivityHeatSetpoint(
              this.accessory.context.zone, activity,
            ));
          default:
            return await this.convertSystemTemp2CharTemp((
              await this.system_config.getZoneActivityCoolSetpoint(this.accessory.context.zone, activity) +
                await this.system_config.getZoneActivityHeatSetpoint(this.accessory.context.zone, activity)
            ) / 2);
        }
      })
      .onSet(async (value) => {
        if (CharTempsAreClose(value, this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).value)) {
          return;
        }
        const svalue = await this.convertCharTemp2SystemTemp(value);
        const cmode = await this.system_config.getMode();
        switch (cmode) {
          case SYSTEM_MODE.COOL:
          case SYSTEM_MODE.HEAT:
            return await this.system_config.setZoneActivity(
              this.accessory.context.zone,
              svalue,
              svalue,
              await this.getHoldTime(),
            );
          default:
            return;
        }
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(async () => {
        return this.convertSystemTemp2CharTemp(
          await this.system_config.getZoneActivityCoolSetpoint(
            this.accessory.context.zone,
            await this.getZoneActvity(this.accessory.context.zone),
          ),
        );
      })
      .onSet(async (value) => {
        if (CharTempsAreClose(value, this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value)) {
          return;
        }
        return await this.system_config.setZoneActivity(
          this.accessory.context.zone,
          await this.convertCharTemp2SystemTemp(value),
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value,
          ),
          await this.getHoldTime(),
        );
      });

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(async () => {
        return this.convertSystemTemp2CharTemp(
          await this.system_config.getZoneActivityHeatSetpoint(
            this.accessory.context.zone,
            await this.getZoneActvity(this.accessory.context.zone),
          ),
        );
      })
      .onSet(async (value) => {
        if (CharTempsAreClose(value, this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value)) {
          return;
        }
        return await this.system_config.setZoneActivity(
          this.accessory.context.zone,
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value,
          ),
          await this.convertCharTemp2SystemTemp(value),
          await this.getHoldTime(),
        );
      });

    // Fan Control
    this.fan_service = this.accessory.getService(this.platform.Service.Fanv2);
    if (this.platform.config['showFanControl']) {
      this.setupFanService();
    } else if (this.fan_service) {
      this.accessory.removeService(this.fan_service);
    }

    // Filter Control
    new FilterService(
      this.platform.api,
      system,
      this.accessory.context,
    ).wrap(this.service);

    // Humidity Control
    new ThermostatRHService(
      this.platform.api,
      system,
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
      this.platform.api,
      this.platform.systems[this.accessory.context.serialNumber],
      this.accessory.context,
    ).wrap(this.service);

    this.fan_service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({minValue: 0, maxValue: 3, minStep: 1})
      .onGet(async () => {
        return this.convertSystemFan2CharFan(
          await this.system_config.getZoneActivityFan(this.accessory.context.zone, await this.getZoneActvity(this.accessory.context.zone)),
        );
      })
      .onSet(async (value) => {
        // Make sure system mode is right for manual fan settings
        if (
          await this.system_config.getMode() === SYSTEM_MODE.OFF &&
        this.convertCharFan2SystemFan(value) !== FAN_MODE.OFF
        ) {
          await this.system_config.setMode(SYSTEM_MODE.FAN_ONLY);
        } else if (
          await this.system_config.getMode() === SYSTEM_MODE.FAN_ONLY &&
        this.convertCharFan2SystemFan(value) === FAN_MODE.OFF
        ) {
          await this.system_config.setMode(SYSTEM_MODE.OFF);
        }
        // Set zone activity
        return await this.system_config.setZoneActivity(
          this.accessory.context.zone,
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value,
          ),
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value,
          ),
          await this.getHoldTime(),
          this.convertCharFan2SystemFan(value),
        );
      });
  }

  async getZoneActvity(zone: string): Promise<string> {
    // Vacation scheduling is weird, and changes infrequently. Just get it from status.
    if (await this.system_status.getZoneActivity(zone) === ACTIVITY.VACATION) {
      return ACTIVITY.VACATION;
    }
    // Config has more up to date activity settings.
    return await this.system_config.getZoneActivity(zone);
  }

  async getHoldTime(): Promise<string> {
    switch (this.platform.config['holdBehavior']) {
      case 'activity':
        return await this.system_config.getZoneNextActivityTime(this.accessory.context.zone);
      case 'for_x': {
        const arg = this.platform.config['holdArgument'].split(':');
        let target_ms = (new Date()).getTime();
        target_ms += Number(arg[0]) * 60 * 60 * 1000;
        target_ms += Number(arg[1]) * 60 * 1000;
        const target_date = new Date(target_ms);
        return `${target_date.getHours()}:${target_date.getMinutes()}`.padStart(5, '0');
      }
      case 'until_x':
        return this.platform.config['holdArgument'];
      case 'forever':
        return '';
      default:
        this.platform.log.error('Invalid hold behavior setting. Defaulting to forever.');
        return '';
    }
  }

  async convertSystemTemp2CharTemp(temp: number): Promise<CharacteristicValue> {
    if (await this.system_config.getUnits() === 'F') {
      return 5.0 / 9.0 * (temp - 32);
    } else {
      return temp;
    }
  }

  async convertCharTemp2SystemTemp(temp: CharacteristicValue | null): Promise<number | null> {
    if (temp === null) {
      return temp;
    }
    temp = Number(temp);
    if (await this.system_config.getUnits() === 'F') {
      return (9.0 / 5.0 * temp) + 32;
    } else {
      return temp;
    }
  }

  convertSystemFan2CharFan(fan: string): CharacteristicValue {
    switch(fan) {
      case FAN_MODE.LOW:
        return 1;
      case FAN_MODE.MED:
        return 2;
      case FAN_MODE.HIGH:
        return 3;
      default:
        return 0;
    }
  }

  convertCharFan2SystemFan(fan: CharacteristicValue): string {
    switch (fan) {
      case 1:
        return FAN_MODE.LOW;
      case 2:
        return FAN_MODE.MED;
      case 3:
        return FAN_MODE.HIGH;
      default:
        return FAN_MODE.OFF;
    }
  }
}
