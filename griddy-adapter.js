/**
 * griddy-adapter.js - Griddy adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

var request = require('request');

const {
  Adapter,
  Device,
  Property,
} = require('gateway-addon');

const MIN_POLL_INTERVAL = (1000 * 60);

class GriddyProperty extends Property {
  constructor(device, name, propertyDescription) {
    super(device, name, propertyDescription);
    this.setCachedValue(propertyDescription.value);
    this.device.notifyPropertyChanged(this);
  }

  /**
   * Set the value of the property.
   *
   * @param {*} value The new value to set
   * @returns a promise which resolves to the updated value.
   *
   * @note it is possible that the updated value doesn't match
   * the value passed in.
   */
  setValue(value) {
    return new Promise((resolve, reject) => {
      super.setValue(value).then((updatedValue) => {
        resolve(updatedValue);
        this.device.notifyPropertyChanged(this);
      }).catch((err) => {
        reject(err);
      });
    });
  }
}

class GriddyDevice extends Device {
  constructor(adapter, id, deviceDescription, config) {
    super(adapter, id);
    this.name = deviceDescription.name;
    this.type = deviceDescription.type;
    this['@type'] = deviceDescription['@type'];
    this.description = deviceDescription.description;

    this.pollType = "auto";

    if (this.pollType == "auto") {
      // Default to 5 minutes then use returned value
      this.pollInterval = 5000;
    } else {
      this.pollInterval = deviceDescription.pollInterval;
    }

    this.properties.set(
      'cost',
      new GriddyProperty(
        this,
        'cost',
        {
          '@type': 'LevelProperty',
          label: 'Energy Cost',
          type: 'number',
          minimum: -1000,
          maximum: 1000,
          readOnly: true,
          unit: '¢',
          multipleOf: 0.1
        }
      )
    );

    this.meterId = config.meterId;
    this.memberId = config.memberId;
    this.settlementPoint = config.settilement_point;

    console.log("meterId: " + this.meterId, " memberId: " + this.memberId + " settlementPoint: " + this.settlementPoint);

    this.poll();
  }

    /**
   * Update price data
   */
  poll() {
    var self = this;
    request.post(
      'https://app.gogriddy.com/api/v1/insights/getnow',
      { json: {meterID: this.meterId, memberID: this.memberId, settlement_point: this.settlementPoint} },
      function (error, response, body) {
          if (!error && response.statusCode == 200) {
              console.log("Griddy: " + body["now"]["price_display"] + body["now"]["price_display_sign"]);
              const prop = self.properties.get('cost');
              prop.setCachedValue(body["now"]["price_display"] + body["now"]["price_display_sign"] + "/kWh");
              self.notifyPropertyChanged(prop);
          } else {
            console.log("Error getting value from Griddy status code: " + response.statusCode);
            console.log(error);
          }
      }
    );

    if (this.pollInterval < MIN_POLL_INTERVAL) {
      this.pollInterval = MIN_POLL_INTERVAL;
    }

    console.log("Running this function again in " + this.pollInterval);
    setTimeout(this.poll.bind(this), this.pollInterval);
  }

}

class GriddyAdapter extends Adapter {
  constructor(addonManager, packageName) {
    super(addonManager, 'GriddyAdapter', packageName);
    addonManager.addAdapter(this);
  }

  /**
   * Griddy process to add a new device to the adapter.
   *
   * The important part is to call: `this.handleDeviceAdded(device)`
   *
   * @param {String} deviceId ID of the device to add.
   * @param {String} deviceDescription Description of the device to add.
   * @return {Promise} which resolves to the device added.
   *
  addDevice(deviceId, deviceDescription) {
    return new Promise((resolve, reject) => {
      if (deviceId in this.devices) {
        reject(`Device: ${deviceId} already exists.`);
      } else {
        const device = new GriddyDevice(this, deviceId, deviceDescription);
        this.handleDeviceAdded(device);
        resolve(device);
      }
    });
  }
  */

  /**
   * Griddy process ro remove a device from the adapter.
   *
   * The important part is to call: `this.handleDeviceRemoved(device)`
   *
   * @param {String} deviceId ID of the device to remove.
   * @return {Promise} which resolves to the device removed.
   */
  removeDevice(deviceId) {
    return new Promise((resolve, reject) => {
      const device = this.devices[deviceId];
      if (device) {
        this.handleDeviceRemoved(device);
        resolve(device);
      } else {
        reject(`Device: ${deviceId} not found.`);
      }
    });
  }

  /**
   * Unpair the provided the device from the adapter.
   *
   * @param {Object} device Device to unpair with
   */
  removeThing(device) {
    console.log('GriddyAdapter:', this.name, 'id', this.id,
                'removeThing(', device.id, ') started');

    this.removeDevice(device.id).then(() => {
      console.log('GriddyAdapter: device:', device.id, 'was unpaired.');
    }).catch((err) => {
      console.error('GriddyAdapter: unpairing', device.id, 'failed');
      console.error(err);
    });
  }

  /**
   * Cancel unpairing process.
   *
   * @param {Object} device Device that is currently being paired
   */
  cancelRemoveThing(device) {
    console.log('GriddyAdapter:', this.name, 'id', this.id,
                'cancelRemoveThing(', device.id, ')');
  }
}

function loadGriddyAdapter(addonManager, manifest, _errorCallback) {
  const adapter = new GriddyAdapter(addonManager, manifest.name);
  const device = new GriddyDevice(adapter, 'griddy-adapter', {
    name: 'Griddy Price',
    '@type': ['MultiLevelSensor'],
    type: 'MultiLevelSensor',
    description: 'Griddy Price',
  }, manifest.moziot.config);
  adapter.handleDeviceAdded(device);
}

module.exports = loadGriddyAdapter;
