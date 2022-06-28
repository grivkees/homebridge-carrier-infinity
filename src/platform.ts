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
      this.discoverSystems().then().catch(error => {
        this.log.error('Could not discover devices: ' + error.message);
      });
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
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

  async discoverSystems(): Promise<void> {
    const found_accessories: PlatformAccessory[] = [];

    const systems = await new InfinityEvolutionLocations(this.api_connection).getSystems();
    for (const serialNumber of systems) {
      // Create system api object, and save for later reference
      const system = new InfinityEvolutionSystemModel(this.api_connection, serialNumber);
      this.systems[serialNumber] = system;

      // Add system based accessories
      const context_system = {serialNumber: system.serialNumber};
      this.log.info(`Discovered system ${JSON.stringify(context_system)}}`);
      // -> System Accessory: Outdoor Temp Sensor
      if (this.config['showOutdoorTemperatureSensor']) {
        found_accessories.push(await this.registerOutdoorTempAccessory(system));
      }

      // Add system+zone based accessories
      const zones = await system.profile.getZones();
      for (const zone of zones) {  // 'of' makes sure we go through zone ids, not index
        const context_zone = {...context_system, zone: zone};
        this.log.info(`Discovered zone ${JSON.stringify(context_zone)}`);
        // -> Zone Accessory: Thermostat
        const accessory = new ThermostatAccessory(
          this,
          {
            ...context_zone,
            name: await system.config.getZoneName(zone),
            holdBehavior: this.config['holdBehavior'],
            holdArgument: this.config['holdArgument'],
          },
        );
        found_accessories.push(accessory.accessory);
        // -> Zone Accessory: Env Sensor
        if (this.config['showIndoorHumiditySensors']) {
          found_accessories.push(await this.registerEnvSensorAccessory(system, zone));
        }
      }
    }



    const missing_accessories = this.accessories.filter(
      accessory => !found_accessories.includes(accessory),
    );
    missing_accessories.forEach(accessory => {
      this.log.info(
        `Removing old device "${accessory.displayName}" (serial:${accessory.context.serialNumber} zone:${accessory.context.zone})`,
      );
    });
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, missing_accessories);
  }
}
