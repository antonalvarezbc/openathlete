# Installable web app (PWA)

The web app can be installed on a phone, tablet or computer from the browser
of any HTTPS installation, without an app store. The installed app opens full
screen from its own icon and updates with each deploy. The Capacitor apps
(Android/iOS) are unchanged and never register the service worker.

## Installing

- **Android, Chrome/Edge on a computer:** the account menu shows **Install
  app**, which opens the browser's install dialog. The browser menu entry
  (*Install app* / *Add to Home screen*) does the same.
- **iPhone/iPad:** browsers there only install through *Share → Add to Home
  Screen*. **Install app** explains these steps.
- The entry is hidden once the app runs installed, inside the Capacitor apps
  and in browsers that cannot install web apps.

Service workers require HTTPS (or `localhost`). A phone opening a development
server through a LAN address over HTTP can use the site but cannot install it.

## Caching

[`public/sw.js`](../apps/web/public/sw.js) is deliberately small:

- Page loads always go to the network first, so a deploy is visible on the next
  load; there is no "new version" prompt. A copy of `index.html` is kept only
  to open the app without a connection.
- Vite build files under `/assets/` carry content hashes and are served from
  the cache once fetched (up to 300 files). An open tab from a previous deploy
  can still load its own chunks.
- API requests, Socket.IO, other origins and non-GET requests are not
  intercepted. Training data is never cached by the service worker; without a
  connection the app opens but cannot load data.

Bump `VERSION` in `sw.js` to discard every cache of earlier versions.

## Files

- [`public/manifest.webmanifest`](../apps/web/public/manifest.webmanifest):
  name, standalone display, colors and icons.
- `public/icons/`: 192 and 512 px icons, a 512 px maskable icon with the logo
  inside the safe zone, and the 180 px Apple touch icon. They are generated
  from `assets/icon-only.png`, the Capacitor icon source.
- [`index.html`](../apps/web/index.html): manifest link, theme colors for light
  and dark system themes, and the Apple web app tags.
- [`src/utils/pwa.ts`](../apps/web/src/utils/pwa.ts): registers the service
  worker in production web builds and keeps the browser install prompt.
- [`nginx.conf`](../apps/web/nginx.conf): `sw.js` and the manifest are served
  with `Cache-Control: no-cache`, not with the one-year rule for static files.

## Not included

Push notifications (they need VAPID keys and a server-side sender) and offline
reading or editing of training data.

## Verification

`node --test scripts/tests/pwa-service-worker.test.mjs` exercises the caching
rules with in-memory caches and a fake network. Installation, standalone
display and safe areas must be checked on a real device after deploying over
HTTPS.
