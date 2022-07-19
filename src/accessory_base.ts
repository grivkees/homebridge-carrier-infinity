import { PlatformAccessory, Service, WithUUID } from 'homebridge';
import { CarrierInfinityHomebridgePlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export abstract class BaseAccessory {
  public readonly accessory: PlatformAccessory;

  constructor(
    protected readonly platform: CarrierInfinityHomebridgePlatform,
    context: Record<string, string>,
  ) {
    const uuid = this.platform.api.hap.uuid.generate(this.ID(context));
    let accessory = this.platform.restored_accessories[uuid];
    if (!accessory) {
      this.platform.log.info(`[${context.name}] Added`);
      accessory = new this.platform.api.platformAccessory(context.name, uuid);
      accessory.context = context;
      this.platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.platform.log.info(`[${context.name}] Loaded`);
      accessory.context = context;
      this.platform.api.updatePlatformAccessories([accessory]);
    }
    this.accessory = accessory;
    this.platform.accessories[uuid] = this;
  }

  protected abstract ID(context: Record<string, string>): string;

  protected useService(type: WithUUID<typeof Service>, name: string, sub_type?: string): Service {
    // Find existing cached service
    let service: Service | undefined;
    if (sub_type) {
      service = this.accessory.getServiceById(type, sub_type);
    } else {
      service = this.accessory.getService(type);
    }
    // Or create a new instance
    return service || this.accessory.addService(type, name, sub_type);
  }
}
