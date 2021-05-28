import { API, Categories, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { InfinityEvolutionPlatformAccessory } from './platformAccessory';
import { OutdoorTemperatureAccessory } from './oatAccessory';
import {
  InfinityEvolutionApi,
  InfinityEvolutionLocations,
  InfinityEvolutionSystemProfile,
  InfinityEvolutionSystemConfig,
} from './infinityApi';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // carrier/bryant api
  public InfinityEvolutionApi: InfinityEvolutionApi;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config.username || !config.password) {
      this.log.warn('Username and password do not appear to be set in config. This is not going to work.');
    }

    this.InfinityEvolutionApi = new InfinityEvolutionApi(config['username'], config['password'], this.log);
    this.InfinityEvolutionApi.refreshToken()
      .then(() => {
        this.log.info('Login success!');
      })
      .catch(error => {
        this.log.error('Login error: ', error.message);
      });

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices().then().catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  async registerAccessory(serialNumber: string, zone: string): Promise<PlatformAccessory> {
    this.log.info(`Discovered device serial:${serialNumber} zone:${zone}`);
    let is_new = false;
    const uuid = this.api.hap.uuid.generate(`${serialNumber}:${zone}`);
    let accessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (!accessory) {
      const name = await new InfinityEvolutionSystemConfig(this.InfinityEvolutionApi, serialNumber).getZoneName(zone);
      this.log.info('Adding new accessory:', name);
      accessory = new this.api.platformAccessory(name, uuid);
      is_new = true;
    }
    accessory.context.serialNumber = serialNumber;
    accessory.context.zone = zone;
    new InfinityEvolutionPlatformAccessory(this, accessory);
    if (is_new) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }
    return accessory;
  }

  async registerOutdoorTempAccessory(serialNumber: string): Promise<PlatformAccessory> {
    this.log.info(`Discovered temp sensor device serial:${serialNumber}`);
    let is_new = false;
    const uuid = this.api.hap.uuid.generate(`OAT:${serialNumber}`);
    let accessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (!accessory) {
      const name = 'Outdoor Temperature';
      this.log.info('Adding new accessory: ', name);
      accessory = new this.api.platformAccessory(name, uuid, Categories.SENSOR);
      is_new = true;
    }
    accessory.context.serialNumber = serialNumber;
    new OutdoorTemperatureAccessory(this, accessory);
    if (is_new) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }
    return accessory;
  }

  async discoverDevices(): Promise<void> {
    const systems = await new InfinityEvolutionLocations(this.InfinityEvolutionApi).getSystems();
    const accessories: PlatformAccessory[] = [];
    for (const serialNumber of systems) {
      const zones = await new InfinityEvolutionSystemProfile(this.InfinityEvolutionApi, serialNumber).getZones();
      // TODO: messed up here. This is the zone index, not the zone id. index = id - 1
      for (const zone in zones) {
        accessories.push(await this.registerAccessory(serialNumber, zone));
      }
      if (this.config['showOutdoorTemperatureSensor']) {
        accessories.push(await this.registerOutdoorTempAccessory(serialNumber));
      }
    }
    const old_accessories = this.accessories.filter(
      accesory => !accessories.includes(accesory),
    );
    old_accessories.forEach(accessory => {
      this.log.info(
        `Removing old device "${accessory.displayName}" (serial:${accessory.context.serialNumber} zone:${accessory.context.zone})`,
      );
    });
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, old_accessories);
  }
}
