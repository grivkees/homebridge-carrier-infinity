import { API, Categories, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ThermostatAccessory } from '././accessory_thermostat';
import { OutdoorTemperatureAccessory } from './accessory_oat';
import {
  InfinityEvolutionApiConnection,
  InfinityEvolutionLocations,
  InfinityEvolutionSystemModel,
} from './infinityApi';
import { EnvSensorAccessory } from './accessory_envsensor';

export class CarrierInfinityHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  // carrier/bryant api
  public api_connection: InfinityEvolutionApiConnection;
  public systems: Record<string, InfinityEvolutionSystemModel> = {};

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    if (!config.username || !config.password) {
      this.log.warn('Username and password do not appear to be set in config. This is not going to work.');
    }

    this.api_connection = new InfinityEvolutionApiConnection(config['username'], config['password'], this.log);
    this.api_connection.refreshToken().then();

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices().then().catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  async registerAccessory(system: InfinityEvolutionSystemModel, zone: string): Promise<PlatformAccessory> {
    this.log.info(`Discovered device serial:${system.serialNumber} zone:${zone}`);

    const accessory = new ThermostatAccessory(
      this,
      {
        name: await system.config.getZoneName(zone),
        serialNumber: system.serialNumber,
        zone: zone,
        holdBehavior: this.config['holdBehavior'],
        holdArgument: this.config['holdArgument'],
      },
    );
    return accessory.accessory;
  }

  async registerEnvSensorAccessory(system: InfinityEvolutionSystemModel, zone: string): Promise<PlatformAccessory> {
    this.log.info(`Discovered environmental sensor device serial:${system.serialNumber}`);
    let is_new = false;
    // UUID is one off from zone id due to old error
    const uuid = this.api.hap.uuid.generate(`ENVSENSOR:${system.serialNumber}:${Number(zone)-1}`);
    let accessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (!accessory) {
      const name = `${await system.config.getZoneName(zone)} Environmental Sensor`;
      this.log.info('Adding new accessory: ', name);
      accessory = new this.api.platformAccessory(name, uuid, Categories.SENSOR);
      is_new = true;
    }
    accessory.context.serialNumber = system.serialNumber;
    accessory.context.zone = zone;
    new EnvSensorAccessory(this, accessory);
    if (is_new) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }
    return accessory;
  }

  async registerOutdoorTempAccessory(system: InfinityEvolutionSystemModel): Promise<PlatformAccessory> {
    this.log.info(`Discovered outdoor temp sensor device serial:${system.serialNumber}`);
    let is_new = false;
    const uuid = this.api.hap.uuid.generate(`OAT:${system.serialNumber}`);
    let accessory = this.accessories.find(accessory => accessory.UUID === uuid);
    if (!accessory) {
      const name = 'Outdoor Temperature';
      this.log.info('Adding new accessory: ', name);
      accessory = new this.api.platformAccessory(name, uuid, Categories.SENSOR);
      is_new = true;
    }
    accessory.context.serialNumber = system.serialNumber;
    new OutdoorTemperatureAccessory(this, accessory);
    if (is_new) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }
    return accessory;
  }

  async discoverDevices(): Promise<void> {
    const systems = await new InfinityEvolutionLocations(this.api_connection).getSystems();
    const accessories: PlatformAccessory[] = [];
    for (const serialNumber of systems) {
      const system = new InfinityEvolutionSystemModel(this.api_connection, serialNumber);
      this.systems[serialNumber] = system;  // save ref for lookup by accessories
      const zones = await system.profile.getZones();
      // go through zone ids themselves, not the index of the zone array
      for (const zone of zones) {
        accessories.push(await this.registerAccessory(system, zone));
        if (this.config['showIndoorHumiditySensors']) {
          accessories.push(await this.registerEnvSensorAccessory(system, zone));
        }
      }
      if (this.config['showOutdoorTemperatureSensor']) {
        accessories.push(await this.registerOutdoorTempAccessory(system));
      }
    }
    const old_accessories = this.accessories.filter(
      accessory => !accessories.includes(accessory),
    );
    old_accessories.forEach(accessory => {
      this.log.info(
        `Removing old device "${accessory.displayName}" (serial:${accessory.context.serialNumber} zone:${accessory.context.zone})`,
      );
    });
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, old_accessories);
  }
}
