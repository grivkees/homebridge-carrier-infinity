import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { CarrierInfinityHomebridgePlatform } from './platform';

import { InfinityEvolutionSystemStatus, InfinityEvolutionSystemProfile } from './infinityApi';

export class OutdoorTemperatureAccessory {
    private service: Service;
    private system_status: InfinityEvolutionSystemStatus;

    constructor(
        private readonly platform: CarrierInfinityHomebridgePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
      // Create services
      this.service =
        this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor);

      // Create api bridge
      this.system_status = new InfinityEvolutionSystemStatus(
        this.platform.InfinityEvolutionApi,
        this.accessory.context.serialNumber,
      );
      this.system_status.fetch().then();
      const system_profile = new InfinityEvolutionSystemProfile(
        this.platform.InfinityEvolutionApi,
        this.accessory.context.serialNumber,
      );
      system_profile.fetch().then(async () => {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.serialNumber)
          .setCharacteristic(this.platform.Characteristic.Manufacturer, `${await system_profile.getBrand()} Home`)
          .setCharacteristic(this.platform.Characteristic.Model, await system_profile.getModel());
      });

      // Create accessory
      this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .onGet(async () => {
          return this.convertSystemTemp2CharTemp(await this.system_status.getOutdoorTemp());
        });
    }

    async convertSystemTemp2CharTemp(temp: number): Promise<CharacteristicValue> {
      if (await this.system_status.getUnits() === 'F') {
        return 5.0 / 9.0 * (temp - 32);
      } else {
        return temp;
      }
    }
  
}