# Jimmy logo setup

This project now uses a new SVG Jimmy logo and full app-icon setup.

## Main logo files

- `public/assets/jimmy-logo.svg` - primary SVG wordmark used across the app.
- `public/assets/jimmy-logo-mask.svg` - alternate SVG file for pinned/icon usage.
- `public/assets/jimmy-logo.png` - PNG fallback.
- `public/assets/jimmy-logo-square.png` - square logo asset.

## App icons and home-screen icons

- `public/assets/icons/apple-touch-icon.png` - iOS Add to Home Screen icon.
- `public/assets/icons/icon-192.png` - Android / Chrome icon.
- `public/assets/icons/icon-512.png` - Android / Chrome large icon.
- `public/assets/icons/maskable-512.png` - Android maskable icon.
- `public/assets/icons/favicon-32.png` and `favicon-16.png` - browser favicon PNGs.

## Where the logo is used

- Login page header
- Staff dashboard sidebar and mobile header
- Admin dashboard sidebar and mobile header
- Splash screen shown while the app loads
- Browser tab favicon
- Android Add to Home Screen via `manifest.webmanifest`
- iOS Add to Home Screen via `apple-touch-icon`

## PWA / installation files

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/browserconfig.xml`

## Important hosting note

The app no longer auto-deletes attendance, sales, or selfie records.
However, free hosts like Render Free use ephemeral local storage. If the host restarts or redeploys, local SQLite/files can still disappear.
For real long-term storage, use a persistent disk or external database/storage service.
