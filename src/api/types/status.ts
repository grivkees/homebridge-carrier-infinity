/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable spellcheck/spell-checker */

export default interface RootObject {
  status: Status;
}

export interface Status {
  '$': _;
  'atom:link': Atomlink[];
  timestamp: string[];
  pingRate: string[];
  iduStatusPingRate: string[];
  iduFaultsPingRate: string[];
  oduStatusPingRate: string[];
  oduFaultsPingRate: string[];
  historyPingRate: string[];
  equipEventsPingRate: string[];
  rootCausePingRate: string[];
  serverHasChanges: string[];
  configHasChanges: string[];
  dealerHasChanges: string[];
  dealerLogoHasChanges: string[];
  oduConfigHasChanges: string[];
  iduConfigHasChanges: string[];
  utilityEventsHasChanges: string[];
  sensorConfigHasChanges: string[];
  sensorProfileHasChanges: string[];
  sensorDiagnosticHasChanges: string[];
  name: string[];
  oat: string[];
  mode: string[];
  cfgem: string[];
  cfgtype: string[];
  vacatrunning: string[];
  filtrlvl: string[];
  uvlvl: string[];
  humlvl: string[];
  ventlvl: string[];
  humid: string[];
  vent: string[];
  localTime: string[];
  oprstsmsg: string[];
  isDisconnected: string[];
  idu: Idu[];
  odu: Odu[];
  isActive: string[];
  zones: Zone2[];
}

export interface Zone2 {
  zone: Zone[];
}

export interface Zone {
  '$': _3;
  name: string[];
  enabled: string[];
  currentActivity: string[];
  rt: string[];
  rh: string[];
  fan: string[];
  hold: string[];
  htsp: string[];
  clsp: string[];
  otmr: string[];
  zoneconditioning: string[];
  damperposition: string[];
  occupancy: string[];
  occupancyOverride: string[];
}

export interface _3 {
  id: string;
}

export interface Odu {
  type: string[];
  opstat: string[];
  opmode: string[];
}

export interface Idu {
  type: string[];
  opstat: string[];
  cfm: string[];
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

