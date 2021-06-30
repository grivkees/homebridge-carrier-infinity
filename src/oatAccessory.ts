import { PlatformAccessory } from 'homebridge';
import { Characteristic } from 'hap-nodejs';
import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, CharacteristicWrapper, MultiWrapper } from './base';
import { convertSystemTemp2CharTemp } from './helpers';

class OATSensorTemp extends CharacteristicWrapper {
  ctype = Characteristic.CurrentTemperature;
  get = async () => {
    return convertSystemTemp2CharTemp(
      await this.system_status.getOutdoorTemp(),
      await this.system_status.getUnits(),
    );
  };
}

export class OutdoorTempSensorService extends MultiWrapper {
  WRAPPERS = [OATSensorTemp];
}

export class OutdoorTemperatureAccessory {
  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    new OutdoorTempSensorService(
      this.platform.InfinityEvolutionApi,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor),
    );
  
    new AccessoryInformation(
      this.platform.InfinityEvolutionApi,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.AccessoryInformation) ||
      this.accessory.addService(this.platform.Service.AccessoryInformation),
    );

  }
}