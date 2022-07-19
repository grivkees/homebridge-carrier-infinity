import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, ThermostatCharacteristicWrapper } from './base';
import { BaseAccessory } from './accessory_base';
import { ACTIVITY } from './infinityApi';
import { CharacteristicValue, UnknownContext } from 'homebridge';

class Activity extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.On;

  constructor(
    public readonly platform: CarrierInfinityHomebridgePlatform,
    protected readonly context: UnknownContext,
    protected readonly activity_name: string,
  ) {
    super(platform, context);
  }

  get = async () => {
    return (
      await this.getActivity()
    ) === this.activity_name;
  };

  set = async (value: CharacteristicValue) => {
    // Turning off an activity is only allowed for the active activity
    // (otherwise an off on one activity could remove a hold of another)
    if (!value && await this.getActivity() !== this.activity_name) {
      return;
    }

    return await this.system.config.setZoneActivityHold(
      this.context.zone,
      // Turning on sets activity, turning off removes hold
      value ? this.activity_name : '',
      await this.getHoldTime(),
    );
  };
}

export class ComfortActivityAccessory extends BaseAccessory {

  protected ID(context: Record<string, string>): string {
    return `ComfortActivity:${context.serialNumber}:${context.zone}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);

    [
      ACTIVITY.MANUAL,
      ACTIVITY.WAKE,
      ACTIVITY.AWAY,
      ACTIVITY.HOME,
      ACTIVITY.SLEEP,
    ].forEach(
      (activity) => {
        new Activity(
          this.platform,
          this.accessory.context,
          activity,
        ).wrap(
          this.useService(
            this.platform.Service.Switch,
            `${activity[0].toUpperCase()}${activity.slice(1)}`,
            activity,
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