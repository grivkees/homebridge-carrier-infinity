/**
 * GraphQL Operations for Carrier Infinity API
 *
 * This file contains all GraphQL queries and mutations used to interact with
 * the Carrier Infinity GraphQL API at dataservice.infinity.iot.carrier.com
 */

/**
 * Authentication mutation - used to obtain OAuth tokens
 * Endpoint: https://dataservice.infinity.iot.carrier.com/graphql-no-auth
 * No authentication required (this IS the authentication)
 */
export const ASSISTED_LOGIN = `
  mutation assistedLogin($input: AssistedLoginInput!) {
    assistedLogin(input: $input) {
      success
      status
      errorMessage
      data {
        token_type
        expires_in
        access_token
        scope
        refresh_token
      }
    }
  }
`;

/**
 * User information query - fetches user profile and location data
 * Used to discover systems associated with a user account
 */
export const GET_USER = `
  query getUser($userName: String!, $appVersion: String, $brand: String, $os: String, $osVersion: String) {
    user(
      userName: $userName
      appVersion: $appVersion
      brand: $brand
      os: $os
      osVersion: $osVersion
    ) {
      username
      identityId
      first
      last
      email
      emailVerified
      postal
      locations {
        locationId
        name
        systems {
          config {
            zones {
              id
              enabled
            }
          }
          profile {
            serial
            name
          }
          status {
            isDisconnected
          }
        }
        devices {
          deviceId
          type
          thingName
          name
          connectionStatus
        }
      }
    }
  }
`;

/**
 * Infinity Systems query - fetches complete system data (profile + status + config)
 * This single query replaces the old REST API's separate profile, status, and config endpoints
 */
export const GET_INFINITY_SYSTEMS = `
  query getInfinitySystems($userName: String!) {
    infinitySystems(userName: $userName) {
      profile {
        serial
        name
        firmware
        model
        brand
        indoorModel
        indoorSerial
        idutype
        idusource
        outdoorModel
        outdoorSerial
        odutype
      }
      status {
        localTime
        localTimeOffset
        utcTime
        wcTime
        isDisconnected
        cfgem
        mode
        vacatrunning
        oat
        odu {
          type
          opstat
        }
        filtrlvl
        idu {
          type
          opstat
          cfm
          statpress
          blwrpm
        }
        vent
        ventlvl
        humid
        humlvl
        uvlvl
        zones {
          id
          rt
          rh
          fan
          htsp
          clsp
          hold
          enabled
          currentActivity
          zoneconditioning
        }
      }
      config {
        etag
        mode
        cfgem
        cfgdead
        cfgvent
        cfghumid
        cfguv
        cfgfan
        heatsource
        vacat
        vacstart
        vacend
        vacmint
        vacmaxt
        vacfan
        fueltype
        gasunit
        filtertype
        filterinterval
        humidityVacation {
          rclgovercool
          ventspdclg
          ventclg
          rhtg
          humidifier
          humid
          venthtg
          rclg
          ventspdhtg
        }
        zones {
          id
          name
          enabled
          hold
          holdActivity
          otmr
          occEnabled
          program {
            id
            day {
              id
              zoneId
              period {
                id
                zoneId
                dayId
                activity
                time
                enabled
              }
            }
          }
          activities {
            id
            zoneId
            type
            fan
            htsp
            clsp
          }
        }
        humidityAway {
          humid
          humidifier
          rhtg
          rclg
          rclgovercool
        }
        humidityHome {
          humid
          humidifier
          rhtg
          rclg
          rclgovercool
        }
      }
    }
  }
`;

/**
 * Energy data query - fetches energy usage and efficiency data
 * This is new functionality not available in the old REST API
 */
export const GET_INFINITY_ENERGY = `
  query getInfinityEnergy($serial: String!) {
    infinityEnergy(serial: $serial) {
      energyConfig {
        cooling {
          display
          enabled
        }
        eheat {
          display
          enabled
        }
        fan {
          display
          enabled
        }
        fangas {
          display
          enabled
        }
        gas {
          display
          enabled
        }
        hpheat {
          display
          enabled
        }
        looppump {
          display
          enabled
        }
        reheat {
          display
          enabled
        }
        hspf
        seer
      }
      energyPeriods {
        energyPeriodType
        eHeatKwh
        coolingKwh
        fanGasKwh
        fanKwh
        hPHeatKwh
        loopPumpKwh
        gasKwh
        reheatKwh
      }
    }
  }
`;

/**
 * Update system configuration mutation
 * Used for system-level settings like mode, humidity, heat source, etc.
 *
 * Example inputs:
 * - Set mode: { serial, mode: "cool" }
 * - Set humidity: { serial, humidityHome: { humidifier: "on", rhtg: 8 } }
 * - Set heat source: { serial, heatsource: "system" }
 */
export const UPDATE_INFINITY_CONFIG = `
  mutation updateInfinityConfig($input: InfinityConfigInput!) {
    updateInfinityConfig(input: $input) {
      etag
    }
  }
`;

/**
 * Update zone activity mutation
 * Used for changing zone activity type, setpoints, and fan mode
 *
 * Example inputs:
 * - Set manual activity: { serial, zoneId, activityType: "manual", clsp: "75", htsp: "68", fan: "med" }
 * - Update fan: { serial, zoneId, activityType: "manual", fan: "high" }
 */
export const UPDATE_INFINITY_ZONE_ACTIVITY = `
  mutation updateInfinityZoneActivity($input: InfinityZoneActivityInput!) {
    updateInfinityZoneActivity(input: $input) {
      etag
    }
  }
`;

/**
 * Update zone configuration mutation
 * Used for zone-level settings like hold status, schedule, etc.
 *
 * Example inputs:
 * - Set hold: { serial, zoneId, hold: "on", holdActivity: "manual", otmr: "2024-01-30T18:00:00" }
 * - Cancel hold: { serial, zoneId, hold: "off", holdActivity: null, otmr: null }
 */
export const UPDATE_INFINITY_ZONE_CONFIG = `
  mutation updateInfinityZoneConfig($input: InfinityZoneConfigInput!) {
    updateInfinityZoneConfig(input: $input) {
      etag
    }
  }
`;
