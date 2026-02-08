import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, CharacteristicWrapper } from './characteristics_base';
import { BaseAccessory } from './accessory_base';
import { HEAT_SOURCE } from './api/constants';
import { CharacteristicValue, UnknownContext } from 'homebridge';

const HEAT_SOURCE_LABELS: Record<string, string> = {
  [HEAT_SOURCE.SYSTEM]: 'System In Control',
  [HEAT_SOURCE.IDU_ONLY]: 'Gas Heat Only',
  [HEAT_SOURCE.ODU_ONLY]: 'Heat Pump Only',
};

class HeatSource extends CharacteristicWrapper {
  ctype = this.Characteristic.On;

  constructor(
    public readonly platform: CarrierInfinityHomebridgePlatform,
    protected readonly context: UnknownContext,
    protected readonly source: string,
  ) {
    super(platform, context);
  }

  get = async () => {
    return (
      await this.system.config.getHeatSource()
    ) === this.source;
  };

  set = async (value: CharacteristicValue) => {
    if (!value && await this.system.config.getHeatSource() !== this.source) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }

    if (value) {
      return await this.system.config.setHeatSource(this.source);
    }
  };
}

export class HeatSourceAccessory extends BaseAccessory {

  protected ID(context: Record<string, string>): string {
    return `HeatSource:${context.serialNumber}`;
  }

  constructor(
    platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    super(platform, context);

    [
      HEAT_SOURCE.SYSTEM,
      HEAT_SOURCE.IDU_ONLY,
      HEAT_SOURCE.ODU_ONLY,
    ].forEach(
      (source) => {
        const switch_name = HEAT_SOURCE_LABELS[source];
        new HeatSource(
          this.platform,
          this.accessory.context,
          source,
        ).wrap(
          this.useService(
            this.platform.Service.Switch,
            switch_name,
            source,
          ).setCharacteristic(
            this.platform.Characteristic.ConfiguredName,
            switch_name,
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
