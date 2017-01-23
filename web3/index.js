import styles from './styles.less';
import { createSecureTransport, handleResizeEvents, loadScripts } from './secureTransport';
import { TRANSPORT_UNINITIALIZED } from '../shared';

// TODO [ToDr] Temporary re-using same file to have it processed by webpack
if (window.location.protocol === 'chrome-extension:') {
  window.secureTransport = createSecureTransport();
  handleResizeEvents();
  loadScripts();
  // TODO [ToDr] Detect if node is not running and display error message!
} else {
  const script = document.createElement('script');
  script.src = chrome.extension.getURL('web3/inpage.js');
  document.head.insertBefore(script, document.head.childNodes[0]);

  const port = chrome.runtime.connect({ name: 'web3' });

  // process requests
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) {
      return;
    }
    if (!ev.data.type) {
      return;
    }
    const { type } = ev.data;

    if (type === 'parity.web3.request') {
      port.postMessage(ev.data);
      return;
    }
    if (type === 'parity.token') {
      console.log('Sending token', ev.data.token);
      chrome.runtime.sendMessage({
        token: ev.data.token
      });
    }
  });

  port.onMessage.addListener((msg) => {
    const { id, err, payload } = msg;

    // Inject iframe only if the page is using Web3
    if (!err) {
      injectIframe();
    } else {
      // remove iframe
      removeIframe(err);
    }

    window.postMessage({
      type: 'parity.web3.response',
      id,
      err,
      payload
    }, '*');
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
}
