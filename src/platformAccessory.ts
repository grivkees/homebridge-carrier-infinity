import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import { InfinityEvolutionSystem } from './infinityApi';

export class InfinityEvolutionPlatformAccessory {
  private service: Service;
  private system: InfinityEvolutionSystem;

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
    this.system = new InfinityEvolutionSystem(
      this.platform.InfinityEvolutionOpenApi,
      this.accessory.context.serialNumber,
    );
        
    // create handlers
    // TODO: alot of dup here, can we refactor?
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(async () => {
        return await this.handleTempGet('current_temp');
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(async () => {
        return await this.handleTempGet('target_temp');
      })
      .onSet(async (value) => {
        return await this.handleTempSet(value, 'target_temp');
      });
    
    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(async () => {
        return await this.handleTempGet('target_cool');
      })
      .onSet(async (value) => {
        return await this.handleTempSet(value, 'target_cool');
      });

    this.service.getCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature)
      .onGet(async () => {
        return await this.handleTempGet('target_heat');
      })
      .onSet(async (value) => {
        return await this.handleTempSet(value, 'target_heat');
      });
  }

  cToF(temp: number | string): string {
    return ((9.0 / 5.0 * Number(temp)) + 32).toFixed(0);
  }

  fToC(temp: number | string): string {
    return (5.0 / 9.0 * (Number(temp) - 32)).toFixed(4);
  }

  // TODO: make a true mapping for these conversions
  async handleCurrentHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    const current_state = await this.system.get('current_state');
    switch(current_state) {
      case 'off':
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      case 'cool':
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      // Seems like there are different names for different types of heat?
      case 'heat':
      case 'gasheat':
      case 'electric':
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      default:
        throw Error(`Unknown current state ${current_state}`);
    }
  }

  // TODO: make a true mapping for these conversions
  async handleTargetHeatingCoolingStateGet(): Promise<CharacteristicValue> {
    const target_state = await this.system.get('target_state');
    switch(target_state) {
      case 'off':
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
      case 'cool':
        return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
      case 'heat':
        return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      case 'auto':
        return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
      default:
        throw Error(`Unknown target state ${target_state}`);
    }
  }

  async handleTargetHeatingCoolingStateSet(value: CharacteristicValue): Promise<void> {
    this.platform.log.info('Triggered SET TargetHeatingCoolingState:', value);
    if (typeof value !== 'number') {
      throw new Error(`Invalid target temp state ${value}.`);
    }
    let target_state: string;
    switch(value) {
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
        target_state = 'off'; break;
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        target_state = 'cool'; break;
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        target_state = 'heat'; break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        target_state = 'auto'; break;
      default:
        throw Error(`Unknown target state ${value}`);
    }

    await this.system.set('target_state', target_state);
  }

  async handleTempGet(key: string): Promise<CharacteristicValue> {
    const units = await this.system.get('units');
    const temp = await this.system.get(key);
    return units === 'C' ? temp : this.fToC(temp);
  }

  async handleTempSet(value: CharacteristicValue, key: string): Promise<void> {
    this.platform.log.info(`Set ${key} to ${value}.`);
    const units = await this.system.get('units');
    if (typeof value !== 'number') {
      throw new Error(`Invalid target temp value ${value}.`);
    }
    await this.system.set(
      key,
      units === 'C' ?
        value.toFixed(2) :  // TODO: does carrier api support decimal sets?
        this.cToF(value),
    );
  }

  async handleTemperatureDisplayUnitsGet(): Promise<CharacteristicValue> {
    const units = await this.system.get('units');
    return units === 'C' ?
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS :
      this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
  }
}
