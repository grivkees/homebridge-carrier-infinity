import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, ThermostatCharacteristicWrapper } from './characteristics_base';
import { BaseAccessory } from './accessory_base';
import { ACTIVITY } from './api/constants';
import { CharacteristicValue, UnknownContext } from 'homebridge';

class WholeHouseActivity extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.On;

  constructor(
    public readonly platform: CarrierInfinityHomebridgePlatform,
    protected readonly context: UnknownContext,
    protected readonly activity_name: string,
  ) {
    super(platform, context);
  }

  get = async () => {
    // Check if ALL enabled zones have this activity and a hold is set
    return await this.system.config.getAllZonesActivityHoldStatus(this.activity_name);
  };

  set = async (value: CharacteristicValue) => {
    return await this.system.config.setAllZonesActivityHold(
      // Turning on sets activity, turning off removes hold
      value ? this.activity_name : '',
      await this.getHoldTime(),
    );
  };
}

export class WholeHouseActivityAccessory extends BaseAccessory {

  protected ID(context: Record<string, string>): string {
    return `WholeHouseActivity:${context.serialNumber}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);

    // Create switches for Away and Home activities
    [
      ACTIVITY.AWAY,
      ACTIVITY.HOME,
    ].forEach(
      (activity) => {
        const switchName = `All Zones ${activity[0].toUpperCase()}${activity.slice(1)}`;
        new WholeHouseActivity(
          this.platform,
          this.accessory.context,
          activity,
        ).wrap(
          this.useService(
            this.platform.Service.Switch,
            switchName,
            activity,
          ).setCharacteristic(
            this.platform.Characteristic.ConfiguredName,
            switchName,
          ),
        );
      },
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
