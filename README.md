# SleepingAgent

> **Status:** Disclosed May 20, 2026. Full writeup: [bountyy.fi/blog/sleeping-agent-web-push](https://bountyy.fi/blog/sleeping-agent-web-push)

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

## Vendor status (as of May 20, 2026)

- **Apple Safari** - Fixed in iOS/macOS 26.5 (May 11, 2026). No bounty. Credit queued.
- **Google Chrome** - Classified Sev-Low. Patch ([CL 7767797](https://chromium-review.googlesource.com/c/chromium/src/+/7767797)) submitted by reporter, CQ+1 from Chromium engineer, full CQ green, moved to backlog. No CVE, no bounty.
- **Microsoft Edge** - Closed March 11, 2026. Reassessed as Security Feature Bypass May 18. Fix timeline tied to Chromium. No CVE, no bounty.
- **Mozilla Firefox** - Closed. Suppression blocked by quota enforcement (the only vendor that enforces the spec).
- **Vivaldi** - Acknowledged February 19 (VB-125289). Ships when Chromium ships.
- **Brave, Opera** - Inherit the Chromium code path. Ship when Chromium ships.

## The patch

The fix is 30 lines. It adds a 500ms delayed check after push event completion. If no notification is visible for the origin at that point, a fallback notification is shown.

- File: `chrome/browser/push_messaging/push_messaging_router.cc`
- CL: <https://chromium-review.googlesource.com/c/chromium/src/+/7767797>
- Status: open, green, CQ+1, backlogged

Anyone with commit access is welcome to take it over. Change-Id and Bug line preserved.

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
90-day embargo expired May 20, 2026.
Full writeup: [bountyy.fi](https://bountyy.fi)

## Research by

[Bountyy Oy](https://bountyy.fi) - offensive security research
