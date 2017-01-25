/* global chrome */

import { createSecureTransport, handleResizeEvents, loadScripts, getBackgroundSeed } from './secureTransport';
import { TRANSPORT_UNINITIALIZED, ACCOUNTS_REQUEST } from '../shared';

if (window.location.protocol === 'chrome-extension:') {
  /**
   * NOTE: This part is executed on embedded Parity Bar
   * TODO [ToDr] Temporary re-using same file to have it processed by webpack
   * (should be split when we move to custom webpack)
   *
   * Since we are executing in context of chrome extension
   * we have access to chrome.* APIs
   */
  window.secureTransport = createSecureTransport();
  getBackgroundSeed(seed => {
    window.backgroundSeed = seed;
  });
  handleResizeEvents();
  loadScripts();
} else {
  /*
   * NOTE: This part is executed in the content script context.
   * So we have access to shared DOM and also to some chrome.* APIs.
   *
   * It relays messages from in-page to background script.
   */
  const script = document.createElement('script');
  script.src = chrome.extension.getURL('web3/inpage.js');
  document.documentElement.insertBefore(script, document.documentElement.childNodes[0]);

  const initPort = () => {
    const port = chrome.runtime.connect({ name: 'web3' });
    if (!port) {
      return;
    }

    port.onMessage.addListener((msg) => {
      const { id, err, payload } = msg;

      // Inject iframe only if the page is using Web3
      if (!payload || payload.id !== ACCOUNTS_REQUEST) {
        if (!err) {
          injectIframe();
        } else {
          removeIframe(err);
        }
      }

      window.postMessage({
        type: 'parity.web3.response',
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
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) {
      return;
    }

    if (!ev.data.type) {
      return;
    }

    const { type } = ev.data;

    if (type === 'parity.web3.request') {
      if (!port || port.isDisconnected) {
        // try to reconnect
        port = initPort();
      }

      // add origin information
      ev.data.origin = window.location.origin;
      port.postMessage(ev.data);
      return;
    }

    if (type === 'parity.token') {
      console.log('Sending token', ev.data.token);
      chrome.runtime.sendMessage({
        token: ev.data.token,
        backgroundSeed: ev.data.backgroundSeed
      });
    }
  });
}

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
  iframe.className = styles.iframe__main;
  iframe.src = chrome.extension.getURL('web3/embed.html');
  iframeInjected = iframe;

  window.addEventListener('message', (ev) => {
    if (ev.source !== iframe.contentWindow) {
      return;
    }
    if (!ev.data.type || ev.data.type !== 'parity.signer.bar') {
      return;
    }
    if (ev.data.opened) {
      iframe.classList.add(styles.iframe__open);
    } else {
      iframe.classList.remove(styles.iframe__open);
    }
  });
  document.body.appendChild(iframe);
}

