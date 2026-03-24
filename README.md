# SleepingAgent

> **Status:** Confirmed across 7 browsers and 4 push backends. Coordinated multi-vendor disclosure in progress. Public disclosure May 20, 2026.

## What is this

Web Push notifications are delivered by the OS even when the browser is completely closed. The W3C Push API spec has one safeguard: every push event **must** result in a visible notification shown to the user.

We tested whether that safeguard is enforced.

It isn't. Across every major browser.

## Finding

A Service Worker can receive a push event, execute code, and suppress the mandatory notification by calling `showNotification()` immediately followed by `notification.close()`. Zero notifications appear on screen.

Combined with the persistent nature of Service Workers this creates a covert channel that:

- Operates with the browser completely closed
- Survives browser restarts and cache clears
- Routes through vendor push infrastructure (FCM, APNs, WNS)
- Produces zero visible indicators to the user
- Requires only a single "Allow" click from the victim

## Confirmed results

Tested February-March 2026.

| Browser | Push Backend | Suppression | Persistent | Exfil |
|---------|-------------|-------------|------------|-------|
| Chrome | FCM | yes | yes | yes |
| Safari (macOS) | APNs | yes | yes | yes |
| Safari (iOS) | APNs | yes | yes | yes |
| Edge | FCM / WNS | yes | yes | yes |
| Brave | FCM | yes | yes | yes |
| Vivaldi | FCM | yes | yes | yes |
| Firefox | FCM | Blocked by quota | - | - |

## Vendor status

- **Apple** - Confirmed, fix in progress
- **Google Chrome** - S3/P3, under review
- **Microsoft Edge** - Closed, no bounty (by design)
- **Mozilla Firefox** - Closed - Blocked by quota

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

Coordinated multi-vendor disclosure initiated February 18, 2026.  
90-day embargo expires **May 20, 2026**.  
Full writeup and public disclosure at embargo end.

## Research by

[Bountyy Oy](https://bountyy.fi) - offensive security research  
Mihalis Haatainen | 130+ bug bounty findings | CVE-2019-1568

