

# SleepingAgent

> **Status:** Confirmed. Disclosed to Chrome Security Team 18 February 2026. Public disclosure in 90 days.

## What is this

Web Push notifications are delivered by the OS even when the browser is completely closed. Chrome's spec has one safeguard: every push event **must** result in a visible notification shown to the user.

We tested whether that safeguard is enforced.

It isn't.

## Finding

A Service Worker can receive a push event, execute code, and suppress the mandatory notification by calling `showNotification()` immediately followed by `notification.close()`. Zero notifications appear on screen.

Combined with the persistent nature of Service Workers this creates a covert channel that:

- Operates with Chrome completely closed
- Survives browser restarts and cache clears
- Routes through Google's own FCM infrastructure
- Produces zero visible indicators to the user
- Requires only a single "Allow" click from the victim

## Confirmed results

Tested on Chrome, macOS, February 2026.

- Push delivered: yes
- Notification visible: no
- Persistent with browser closed: yes
- Exfil received by C2: yes

## This repo

Contains only the notification suppression test. One research question: does the notification appear or not?

Not a tool. Not for deployment. For reproducing the finding.

## Setup

```bash
npm install
node -e "const wp = require('web-push'); const k = wp.generateVAPIDKeys(); console.log(JSON.stringify(k, null, 2))"
```

Paste the keys into `server.js` and `public/index.html` where marked. Then:

```bash
node server.js
```

Open `http://localhost:3000` in Chrome. Click Accept All. Allow notifications. Then:

```bash
curl -X POST http://localhost:3000/c2/send \
  -H "Content-Type: application/json" \
  -d '{"command":"beacon"}'
```

Watch your screen. Watch your terminal.

## Disclosure

Reported to `security@chromium.org` on 18 February 2026.

90 day disclosure window. Full writeup and LinkedIn post dropping May 2026 or earlier if patched.

## Research by

[Bountyy Oy](https://bountyy.fi) - offensive security research

Mihalis Haatainen | 130+ bug bounty findings | CVE-2019-1568
