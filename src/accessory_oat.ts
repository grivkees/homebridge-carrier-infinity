import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, CharacteristicWrapper, MultiWrapper } from './characteristics_base';
import { convertSystemTemp2CharTemp } from './helpers';
import { BaseAccessory } from './accessory_base';
import { map } from 'rxjs';

class OATSensorTemp extends CharacteristicWrapper {
  ctype = this.Characteristic.CurrentTemperature;
  value = this.system.status.outdoor_temp.pipe(
    // The oat from the api is always in F (#97)
    map(data => convertSystemTemp2CharTemp(data, 'F')),
  );
}

export class OutdoorTempSensorService extends MultiWrapper {
  WRAPPERS = [OATSensorTemp];
}

export class OutdoorTemperatureAccessory extends BaseAccessory {

  protected ID(context: Record<string, string>): string {
    return `OAT:${context.serialNumber}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);

    new OutdoorTempSensorService(
      this.platform,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor),
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