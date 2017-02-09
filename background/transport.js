// Copyright 2015, 2016 Parity Technologies (UK) Ltd.
// This file is part of Parity.

// Parity is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Parity is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Parity.  If not, see <http://www.gnu.org/licenses/>.

import { Api } from '@parity/parity.js';

import Ws from './ws';
import State from './state';
import { TRANSPORT_UNINITIALIZED, EV_WEB3_ACCOUNTS_REQUEST, EV_TOKEN, getRetryTimeout } from '../shared';
import Config, { DEFAULT_CONFIG } from './config';

export default class Transport {

  accountsCache = {};
  extractTokenRetries = 0;
  openedTabId = null;
  transport = null;
  UI = DEFAULT_CONFIG.UI;

  store = null;

  get api () {
    return new Api(this.transport);
  }

  get isConnected () {
    return this.transport.isConnected;
  }

  get status () {
    if (this.transport.isConnected) {
      return 'connected';
    }

    if (this.transport.isConnecting) {
      return 'connecting';
    }

    return 'disconnected';
  }

  get url () {
    return this.transport.url;
  }

  constructor (store) {
    this.store = store;

    // Attempt to extract token on start
    this.extractToken();

    chrome.runtime.onMessage.addListener((request, sender, callback) => {
      return this.handleMessage(request, sender, callback);
    });
  }

  attachListener (port) {
    return this.secureApiMessage(port);
  }

  setIcon (status) {
    console.log('setting icon to ', status);
    const ctx = document.createElement('canvas').getContext('2d');
    const image = new Image();

    const size = 76;

    image.onload = () => {
      ctx.drawImage(image, 0, 0);

      switch (status) {
        case 'connected':
          ctx.fillStyle = 'rgba(46, 204, 113, 0.95)';
          break;

        case 'disconnected':
        default:
          ctx.fillStyle = 'rgba(231, 76, 60, 0.75)';
          break;
      }

      ctx.strokeStyle = 'white';
      ctx.beginPath();
      ctx.arc(15, 20, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      const pixels = ctx.getImageData(0, 0, size, size);

      chrome.browserAction.setIcon({ imageData: pixels });
    };

    image.src = chrome.extension.getURL(`$assets/icon-${size}.png`);
  }

  initiate (token) {
    const transport = new Ws(`ws://${this.UI}`, token, true);

    this.setIcon('disconnected');

    transport.on('open', () => {
      this.setIcon('connected');

      const oldOrigins = Object.keys(this.accountsCache);

      this.accountsCache = {};

      // re-populate cache (for new network)
      oldOrigins.forEach(origin => {
        this.fetchAccountsForCache(origin);
      });

      // fetch version
      transport.execute('web3_clientVersion')
        .then(version => {
          State.version = version;
        });
    });

    transport.on('close', () => {
      this.setIcon('disconnected');
      State.version = null;
    });

    this.transport = transport;
  }

  close () {
    this.transport && this.transport.close();
  }

  extractToken () {
    return Config.get()
      .then((config) => {
        if (config.UI) {
          this.UI = config.UI;
        }

        if (config.authToken) {
          if (this.transport) {
            this.close();
          }

          this.initiate(config.authToken);
          return;
        }

        return fetch(`http://${this.UI}`)
          .then(() => {
            // Open a UI to extract the token from it
            chrome.tabs.create({
              url: `http://${this.UI}/#/?from=` + chrome.runtime.id,
              active: false
            }, (tab) => {
              this.openedTabId = tab.id;
            });

            this.extractTokenRetries = 0;
          })
          .catch(err => {
            console.error('Node seems down, will re-try', err);
            this.extractTokenRetries += 1;

            setTimeout(() => {
              return this.extractToken();
            }, getRetryTimeout(this.extractTokenRetries));
          });
      });
  }

  fetchAccountsForCache (origin) {
    return this.transport.execute('parity_getDappsAddresses', origin)
      .then(accounts => {
        this.accountsCache[origin] = accounts;
        return accounts;
      });
  }

  secureApiMessage (port) {
    return (msg) => {
      const { id, payload } = msg;

      if (!this.transport || !this.transport.isConnected) {
        console.error('Transport uninitialized!');

        port.postMessage({
          id, err: TRANSPORT_UNINITIALIZED,
          payload: null,
          connected: false
        });

        return;
      }

      this.transport.executeRaw(payload)
        .then((response) => {
          port.postMessage({
            id,
            err: null,
            payload: response,
            connected: true
          });
        })
        .catch((err) => {
          port.postMessage({
            id,
            err,
            payload: null
          });
        });
    };
  }

  handleMessage (request, sender, callback) {
    const isTransportReady = this.transport && this.transport.isConnected;

    if (request.type === EV_WEB3_ACCOUNTS_REQUEST) {
      if (!isTransportReady) {
        return callback({
          err: TRANSPORT_UNINITIALIZED
        });
      }

      const { origin } = request;
      if (this.accountsCache[origin]) {
        return callback({
          err: null,
          payload: this.accountsCache[origin]
        });
      }

      this.fetchAccountsForCache(origin)
        .then(accounts => {
          return callback({
            err: null,
            payload: accounts
          });
        })
        .catch(err => callback({
          err,
          payload: null
        }));
    }

    if (request.type !== EV_TOKEN) {
      return;
    }

    if (!isTransportReady && request.token) {
      if (this.transport) {
        this.transport.close();
      }

      if (this.openedTabId) {
        chrome.tabs.remove(this.openedTabId);
        this.openedTabId = null;
      }

      console.log('Extracted a token: ', request.token);
      console.log('Extracted backgroundSeed: ', request.backgroundSeed);

      Config.set({
        'authToken': request.token,
        'backgroundSeed': request.backgroundSeed
      });

      this.initiate(request.token);
      return;
    }
  }

}
