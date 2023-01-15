/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable spellcheck/spell-checker */

export default interface RootObject {
  config: Config;
}

export interface Config {
  '$': _;
  'atom:link': Atomlink[];
  timestamp: string[];
  mode: string[];
  previousMode: string[];
  cfgem: string[];
  cfgtype: string[];
  cfgauto: string[];
  cfgdead: string[];
  cfgfan: string[];
  cfgpgm: string[];
  blight: string[];
  screensaver: string[];
  sound: string[];
  filtrrmd: string[];
  uvrmd: string[];
  humrmd: string[];
  ventrmd: string[];
  cfgchgovr: string[];
  cfgsimultheatcool: string[];
  cfgrecovery: string[];
  cfgzoning: string[];
  cfghumid: string[];
  cfgvent: string[];
  cfguv: string[];
  erate: string[];
  grate: string[];
  vacat: string[];
  vacstart: string[];
  vacend: string[];
  vacmint: string[];
  vacmaxt: string[];
  vacfan: string[];
  fueltype: string[];
  gasunit: string[];
  heatsource: string[];
  filtertype: string[];
  filterinterval: string[];
  statpressmon: string[];
  ventinterval: string[];
  uvinterval: string[];
  huminterval: string[];
  humidityfan: string[];
  odtmpoff: string[];
  humoff: string[];
  ducthour: string[];
  weatherPostalCode: string[];
  torqueControl: string[];
  staticPressure: string[];
  calcMinCFM: string[];
  blowerSpeed: string[];
  systemCFM: string[];
  blowerActualCFM: string[];
  blowerCoolingCFM: string[];
  blowerHeatingCFM: string[];
  blowerPower: string[];
  occParameters: string[];
  occSustainTime: string[];
  windowprotect: Windowprotect[];
  humidityHome: HumidityHome[];
  humidityAway: HumidityHome[];
  humidityVacation: HumidityVacation[];
  utilityEvent: UtilityEvent[];
  wholeHouse: WholeHouse[];
  timeAndDate: string[];
  accessoryStatusReset: string[];
  isMqtt: string[];
  zones: Zone2[];
}

export interface Zone2 {
  zone: Zone[];
}

export interface Zone {
  '$': _3;
  name: string[];
  enabled: string[];
  holdActivity: string[];
  hold: string[];
  otmr: string[];
  setback: string[];
  airflowlimit: string[];
  cfmlimit: string[];
  tempoffset: string[];
  occEnabled: string[];
  activities: Activity4[];
  program: Program[];
}

export interface Program {
  day: Day[];
}

export interface Day {
  '$': _3;
  period: Period[];
}

export interface Period {
  '$': _3;
  activity: string[];
  time: string[];
  enabled: string[];
}

export interface Activity4 {
  activity: Activity3[];
}

export interface Activity3 {
  '$': _3;
  htsp: string[];
  clsp: string[];
  fan: string[];
  previousFan: string[];
}

export interface WholeHouse {
  holdActivity: string[];
  hold: string[];
  otmr: string[];
  activities: Activity2[];
}

export interface Activity2 {
  activity: Activity[];
}

export interface Activity {
  '$': _3;
  blight: string[];
}

export interface _3 {
  id: string;
}

export interface UtilityEvent {
  enabled: string[];
  priceResp: string[];
  priceLimit: string[];
  priceOffset: string[];
  priceHtAbs: string[];
  priceClAbs: string[];
  demandResp: string[];
  demandOffset: string[];
  demandHtAbs: string[];
  demandClAbs: string[];
  minLimit: string[];
  maxLimit: string[];
  restoreDefaults: string[];
  venId: string[];
  vtnId: string[];
}

export interface HumidityVacation {
  rhtg: string[];
  rclg: string[];
  rclgovercool: string[];
  humidifier: string[];
  venthtg: string[];
  ventspdhtg: string[];
  ventclg: string[];
  ventspdclg: string[];
}

export interface HumidityHome {
  humid: string[];
  rhtg: string[];
  rclg: string[];
  rclgovercool: string[];
  humidifier: string[];
  venthtg: string[];
  ventspdhtg: string[];
  ventclg: string[];
  ventspdclg: string[];
}

export interface Windowprotect {
  enabled: string[];
  rhtg: string[];
  ventprotect: string[];
}

export interface Atomlink {
  '$': _2;
}

export interface _2 {
  rel: string;
  href: string;
}

export interface _ {
  'xmlns:atom': string;
  version: string;
}

