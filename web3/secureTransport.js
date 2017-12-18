// Copyright 2015-2017 Parity Technologies (UK) Ltd.
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

/*
 * NOTE: Executed in extension context
 */
import { TRANSPORT_UNINITIALIZED, EV_WEB3_REQUEST, getUI, browser } from '../shared';

/**
 * Creates a secureTransport, that can be used by injected ParityBar
 */
export function createSecureTransport () {
  let id = 0;
  let isConnected = true;
  let uiUrl = null;
  const data = {};
  const subscriptionData = {};
  const listeners = {};
  const port = browser.runtime.connect({ name: 'secureApi' });

  getUI().then(UI => {
    uiUrl = UI;
  });

  port.onMessage.addListener((msg) => {
    const { id, subscription, err, payload } = msg;
    if (!data[id] && !subscriptionData[subscription]) {
      console.warn('Unexpected response received: ', id, msg);
      return;
    }

    let resolve = null;
    let reject = null;

    if (data[id]) {
      resolve = data[id].resolve;
      reject = data[id].reject;
      delete data[id];
    }

    if (subscriptionData[subscription]) {
      resolve = subscriptionData[subscription].resolve;
      reject = subscriptionData[subscription].reject;
    }

    if (err || payload.error) {
      let wasConnected = isConnected;
      isConnected = err !== TRANSPORT_UNINITIALIZED;
      if (wasConnected && !isConnected) {
        listeners['close'].forEach(listener => listener());
        // remove all subscriptions
        Object.keys(subscriptionData).forEach(key => {
          delete subscriptionData[key];
        });
      }
      reject(err || payload.error);
    } else {
      isConnected = true;
      resolve(payload.result);
    }
  });

  return {
    ready: Promise.resolve(null),
    subscribe (api, callback, params) {
      const { subscribe, unsubscribe, subscription } = methodsFromApi(api);
      const sub = {
        id: null,
        subscribe,
        unsubscribe,
        subscription,
        resolve: (data) => callback(null, data),
        reject: (err) => callback(err, null)
      };

      return this.execute(subscribe, ...params)
        .then(subscriptionId => {
          sub.id = subscriptionId;
          subscriptionData[subscriptionId] = sub;
          return subscriptionId;
        });
    },
    unsubscribe (subscriptionId) {
      const subscription = subscriptionData[subscriptionId];

      if (!subscription) {
        return Promise.resolve(false);
      }

      const { unsubscribe } = subscription;
      return this.execute(unsubscribe, [subscriptionId])
        .then(done => {
          delete subscriptionData[subscriptionId];
          return done;
        });
    },
    send (method, params, callback) {
      return this.execute(method, ...params)
        .then(res => callback(null, res))
        .catch(err => callback(err, null));
    },
    execute (method, ...params) {
      return new Promise((resolve, reject) => {
        id++;
        data[id] = { resolve, reject, method, params };
        const request = {
          jsonrpc: '2.0',
          id,
          method,
          params
        };

        port.postMessage({
          id,
          type: EV_WEB3_REQUEST,
          payload: request
        });
      });
    },
    on (event, callback, context) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback.bind(context));
    },
    addMiddleware (middleware) {
      console.log('Trying to add a middleware, but it is not supported.', middleware);
    },
    get isConnected () {
      return isConnected;
    },
    get uiUrl () {
      return uiUrl;
    },
    set uiUrl (url) {
      uiUrl = url;
    }
  };
}

function methodsFromApi (api) {
  if (api.subscription) {
    const { subscribe, unsubscribe, subscription } = api;

    return { subscribe, unsubscribe, subscription };
  }

  const subscribe = `${api}_subscribe`;
  const unsubscribe = `${api}_unsubscribe`;
  const subscription = `${api}_subscription`;

  return { subscribe, unsubscribe, subscription };
}
