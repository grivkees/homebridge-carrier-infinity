import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import { InfinityEvolutionSystemStatus, InfinityEvolutionSystemConfig, InfinityEvolutionSystemProfile, SYSTEM_MODE } from './infinityApi';

export class InfinityEvolutionPlatformAccessory {
  private service: Service;
  private system_status: InfinityEvolutionSystemStatus;
  private system_config: InfinityEvolutionSystemConfig;
  private system_profile: InfinityEvolutionSystemProfile;

  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Create services
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serialNumber);

    this.service = this.accessory.getService(
      this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat,
    );

    // Create accessory api bridge
    this.system_status = new InfinityEvolutionSystemStatus(
      this.platform.InfinityEvolutionApi,
      this.accessory.context.serialNumber,
    );
    this.system_status.fetch().then();
    this.system_config = new InfinityEvolutionSystemConfig(
      this.platform.InfinityEvolutionApi,
      this.accessory.context.serialNumber,
    );
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
    });
    this.system_profile = new InfinityEvolutionSystemProfile(
      this.platform.InfinityEvolutionApi,
      this.accessory.context.serialNumber,
    );
    this.system_profile.fetch().then(async () => {
      this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, await this.system_profile.getBrand())
        .setCharacteristic(this.platform.Characteristic.Model, await this.system_profile.getModel())
        .setCharacteristic(this.platform.Characteristic.FirmwareRevision, await this.system_profile.getFirmware());
    });
        
    // Create handlers
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(async () => {
        const current_state = await this.system_status.getMode();
        switch(current_state) {
          case SYSTEM_MODE.OFF:
            return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
          case SYSTEM_MODE.COOL:
            return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
          case SYSTEM_MODE.HEAT:
            return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
          default:
            throw Error(`Unknown current state '${current_state}'`);
        }
      });

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(async () => {
        const target_state = await this.system_config.getMode();
        switch(target_state) {
          case SYSTEM_MODE.OFF:
            return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
          case SYSTEM_MODE.COOL:
            return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
          case SYSTEM_MODE.HEAT:
            return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
          case SYSTEM_MODE.AUTO:
            return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
          default:
            throw Error(`Unknown target state '${target_state}'`);
        }
      })
      .onSet(async (value) => {
        if (value === this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value) {
          return;
        }
        switch(value) {
          case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
            return await this.system_config.setMode(SYSTEM_MODE.OFF);
          case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
            return await this.system_config.setMode(SYSTEM_MODE.COOL);
          case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
            return await this.system_config.setMode(SYSTEM_MODE.HEAT);
          case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
            return await this.system_config.setMode(SYSTEM_MODE.AUTO);
          default:
            throw Error(`Unknown target state ${value}`);
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
        if (value === this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature).value) {
          return;
        }
        const svalue = await this.convertCharTemp2SystemTemp(value);
        const cmode = await this.system_config.getMode();
        switch (cmode) {
          case SYSTEM_MODE.COOL:
          case SYSTEM_MODE.HEAT:
            return await this.system_config.setZoneSetpoints(this.accessory.context.zone, svalue, svalue, await this.getHoldTime()); 
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
        if (value === this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value) {
          return;
        }
        return await this.system_config.setZoneSetpoints(
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
        if (value === this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value) {
          return;
        }
        return await this.system_config.setZoneSetpoints(
          this.accessory.context.zone,
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value,
          ),
          await this.convertCharTemp2SystemTemp(value),
          await this.getHoldTime(),
        ); 
      });

    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(async () => {
        return await this.system_status.getZoneHumidity(this.accessory.context.zone);
      });
  }

  async getZoneActvity(zone: string): Promise<string> {
    // Prefer config activity name, since that updates more often. Fallback to status activity name, to pick up schedules.
    // TODO: Always compute activity name via config. Using status activity name when no hold means removing hold takes a while to show up.
    return await this.system_config.getZoneActivity(zone) || this.system_status.getZoneActivity(zone);
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
        throw new Error('Unknown hold behavior.');
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
    if (typeof temp !== 'number') {
      throw new Error(`Invalid target temp value ${temp}.`);
    }
    if (await this.system_config.getUnits() === 'F') {
      return (9.0 / 5.0 * temp) + 32;
    } else {
      return temp;
    }
  }
}
