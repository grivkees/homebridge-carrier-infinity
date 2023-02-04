import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, ThermostatCharacteristicWrapper } from './characteristics_base';
import { BaseAccessory } from './accessory_base';
import { ACTIVITY, STATUS } from './api/constants';
import { CharacteristicValue, UnknownContext } from 'homebridge';
import { distinctUntilChanged, firstValueFrom, map } from 'rxjs';

class Activity extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.On;
  value = this.system.getZoneActivity(this.context.zone).pipe(map(a => a === this.activity_name), distinctUntilChanged());

  constructor(
    public readonly platform: CarrierInfinityHomebridgePlatform,
    protected readonly context: UnknownContext,
    protected readonly activity_name: string,
  ) {
    super(platform, context);
  }

  set = async (value: CharacteristicValue) => {
    // Turning off an activity is only allowed for the active activity
    // (otherwise an off on one activity could remove a hold of another)
    if (
      value === false
      && await firstValueFrom(this.system.getZoneActivity(this.context.zone)) !== this.activity_name
    ) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }

    return await this.system.config.setZoneActivityHold(
      this.context.zone,
      // Turning on sets activity, turning off removes hold
      value ? this.activity_name : '',
      await this.getHoldTime(),
    );
  };
}

// HoldActivity works a bit differently. It indicates that a hold of some
// kind is active. This could be an activity hold, or the 'manual'
// psudo-activity. To match thermostat behavior, you can't switch directly to
// the manual activity. Instead activating this switch turns on a hold for the
// current activity. To hold to the manual activity, just change the temp.
class HoldActivity extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.On;
  value = this.system.config.getZone(this.context.zone).hold_status.pipe(map(data => data[0] === STATUS.ON));

  set = async (value: CharacteristicValue) => {
    return await this.system.config.setZoneActivityHold(
      this.context.zone,
      // Turning on sets hold for current activity, turning off removes any hold
      value ? await firstValueFrom(this.system.getZoneActivity(this.context.zone)) : '',
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

    // Make this first to make it the primary service and show up first
    new HoldActivity(this.platform, this.accessory.context).wrap(
      this.useService(
        this.platform.Service.Switch,
        'Manual Hold',
        'hold',
      ),
    );

    [
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