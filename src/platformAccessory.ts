import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import { InfinityEvolutionSystemStatus, InfinityEvolutionSystemConfig, SYSTEM_MODE } from './infinityApi';

export class InfinityEvolutionPlatformAccessory {
  private service: Service;
  private system_status: InfinityEvolutionSystemStatus;
  private system_config: InfinityEvolutionSystemConfig;

  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer') // TODO
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model') // TODO
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serialNumber);

    this.service = this.accessory.getService(
      this.platform.Service.Thermostat) || this.accessory.addService(this.platform.Service.Thermostat,
    );
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.displayName);

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
    this.system_config.fetch().then();
        
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
        return await this.system_status.getUnits() === 'F' ?
          this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
          this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS;
      });    

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(async () => {
        return await this.convertSystemTemp2CharTemp(await this.system_status.getZoneTemp()); 
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(async () => {
        const cmode = await this.system_config.getMode();
        switch (cmode) {
          case SYSTEM_MODE.COOL:
            return await this.convertSystemTemp2CharTemp(await this.system_status.getZoneCoolSetpoint());
          case SYSTEM_MODE.HEAT:
            return await this.convertSystemTemp2CharTemp(await this.system_status.getZoneHeatSetpoint());
          default:
            return await this.convertSystemTemp2CharTemp(
              (await this.system_status.getZoneCoolSetpoint() + await this.system_status.getZoneHeatSetpoint()) / 2,
            );
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
            return await this.system_config.setZoneSetpoints(0, svalue, svalue); 
          default:
            return;
        }
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(async () => {
        return this.convertSystemTemp2CharTemp(await this.system_status.getZoneCoolSetpoint());
      })
      .onSet(async (value) => {
        if (value === this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value) {
          return;
        }
        return await this.system_config.setZoneSetpoints(
          0,
          await this.convertCharTemp2SystemTemp(value),
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value,
          ),
        ); 
      });

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(async () => {
        return this.convertSystemTemp2CharTemp(await this.system_status.getZoneHeatSetpoint());
      })
      .onSet(async (value) => {
        if (value === this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature).value) {
          return;
        }
        return await this.system_config.setZoneSetpoints(
          0,
          await this.convertCharTemp2SystemTemp(
            this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature).value,
          ),
          await this.convertCharTemp2SystemTemp(value),
        ); 
      });
  }

  async convertSystemTemp2CharTemp(temp: number): Promise<CharacteristicValue> {
    if (await this.system_status.getUnits() === 'F') {
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
