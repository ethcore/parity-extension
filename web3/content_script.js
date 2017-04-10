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
 * NOTE: This part is executed in the content script context.
 * So we have access to shared DOM and also to some chrome.* APIs.
 *
 * It relays messages from in-page to background script.
 */

import {
  TRANSPORT_UNINITIALIZED,
  EV_WEB3_REQUEST, EV_WEB3_RESPONSE,
  EV_WEB3_ACCOUNTS_REQUEST, EV_WEB3_ACCOUNTS_RESPONSE,
  EV_TOKEN, EV_SIGNER_BAR, EV_NODE_URL,
  getUI, isIntegrationEnabled
} from '../shared';

isIntegrationEnabled()
  .then((enabled) => {
    if (enabled) {
      main();
    }
  });

function main () {
  const script = document.createElement('script');
  script.src = chrome.extension.getURL('web3/inpage.js');
  document.documentElement.insertBefore(script, document.documentElement.childNodes[0]);

  // Fetch UI details, but dispatch when script is loaded
  const scriptLoaded = new Promise((resolve, reject) => {
    script.addEventListener('load', resolve);
    script.addEventListener('error', reject);
  });

  Promise.all([getUI(), scriptLoaded]).then(([UI]) => {
    window.postMessage({
      type: EV_NODE_URL,
      value: UI
    }, '*');
  });

  const initPort = () => {
    const port = chrome.runtime.connect({ name: 'web3' });

    if (!port) {
      return;
    }

    port.onMessage.addListener((msg) => {
      const { id, err, payload } = msg;

      // Inject iframe only if the page is using Web3
      if (!err) {
        injectIframe();
      } else {
        removeIframe(err);
      }

      window.postMessage({
        type: EV_WEB3_RESPONSE,
        id,
        err,
        payload
      }, '*');
    });

    port.onDisconnect.addListener(() => {
      port.isDisconnected = true;
    });

    return port;
  };

  // process requests
  let port = initPort();

  window.addEventListener('message', function retry (ev) {
    if (ev.source !== window) {
      return;
    }

    if (!ev.data.type) {
      return;
    }

    const { type } = ev.data;

    if (type === EV_WEB3_REQUEST) {
      if (!port || port.isDisconnected) {
        // Reload page
        window.location.reload();
        return;
      }

      // add origin information
      ev.data.origin = window.location.origin;
      port.postMessage(ev.data);
      return;
    }

    if (type === EV_WEB3_ACCOUNTS_REQUEST) {
      const origin = window.location.origin;
      chrome.runtime.sendMessage({
        type,
        origin
      }, (result) => {
        if (!result) {
          retry(ev);
          return;
        }

        const { err, payload } = result;
        window.postMessage({
          type: EV_WEB3_ACCOUNTS_RESPONSE,
          err,
          payload
        }, '*');
      });
      return;
    }

    if (type === EV_TOKEN) {
      console.log('Sending token', ev.data.token);
      chrome.runtime.sendMessage({
        type,
        token: ev.data.token,
        backgroundSeed: ev.data.backgroundSeed
      });
    }
  });

  let iframeInjected = null;
  function removeIframe (err) {
    if (err === TRANSPORT_UNINITIALIZED && iframeInjected) {
      iframeInjected.parentNode.removeChild(iframeInjected);
      iframeInjected = null;
    }
  }

  function injectIframe () {
    if (iframeInjected) {
      return;
    }

    // lazy load styles
    const styles = require('./styles.css');
    const iframe = document.createElement('iframe');
    iframe.className = [ styles.iframe__main, styles.iframe__open ].join(' ');
    iframe.src = chrome.extension.getURL('web3/embed.html');
    iframeInjected = iframe;

    window.addEventListener('message', (ev) => {
      if (ev.source !== iframe.contentWindow) {
        return;
      }

      if (!ev.data.type) {
        return;
      }

      if (ev.data.type === EV_SIGNER_BAR) {
        const { opened, style } = ev.data;

        if (style) {
          Object.keys(style).forEach((styleKey) => {
            iframe.style[styleKey] = style[styleKey];
          });
        }

        if (opened) {
          iframe.classList.add(styles.iframe__open);
        } else {
          iframe.classList.remove(styles.iframe__open);
        }

        return;
      }
    });

    document.body.appendChild(iframe);
  }
}
