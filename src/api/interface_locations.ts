/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable spellcheck/spell-checker */

export default interface RootObject {
  locations: Locations;
}

export interface Locations {
  '$': _;
  'atom:link': Atomlink[];
  location: Location[];
}

export interface Location {
  'atom:link': Atomlink2[];
  name: string[];
  street1: string[];
  street2: string[];
  city: string[];
  state: string[];
  country: string[];
  postal: string[];
  systems: System2[];
}

export interface System2 {
  system: System[];
}

export interface System {
  'atom:link': Atomlink2[];
}

export interface Atomlink2 {
  '$': _3;
}

export interface _3 {
  rel: string;
  href: string;
  title: string;
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

