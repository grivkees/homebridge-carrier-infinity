/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable spellcheck/spell-checker */

export default interface RootObject {
  system_profile: Systemprofile;
}

export interface Systemprofile {
  '$': _;
  'atom:link': Atomlink[];
  timestamp: string[];
  pin: string[];
  name: string[];
  serial: string[];
  brand: string[];
  indoorModel: string[];
  indoorSerial: string[];
  outdoorModel: string[];
  outdoorSerial: string[];
  samType: string[];
  firmware: string[];
  model: string[];
  iduversion: string[];
  idutype: string[];
  idusource: string[];
  idustages: string[];
  iducapacity: string[];
  pwmblower: string[];
  oduversion: string[];
  odutype: string[];
  oducapacity: string[];
  ventpresent: string[];
  sampresent: string[];
  sammodel: string[];
  samserial: string[];
  samversion: string[];
  nimpresent: string[];
  nimmodel: string[];
  nimserial: string[];
  nimversion: string[];
  routerMac: string[];
  vfdModel: string[];
  vfdSerial: string[];
  vfdVersion: string[];
  ewtsensorpresent: string[];
  zoneboards: Zoneboard[];
  zones: Zone2[];
}

export interface Zone2 {
  zone: Zone[];
}

export interface Zone {
  '$': _3;
  present: string[];
  sensortype: string[];
  ssmodel: string[];
  ssserial: string[];
  ssversion: string[];
}

export interface Zoneboard {
  board: Board[];
}

export interface Board {
  '$': _3;
  present: string[];
  model: string[];
  serial: string[];
  version: string[];
}

export interface _3 {
  id: string;
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

