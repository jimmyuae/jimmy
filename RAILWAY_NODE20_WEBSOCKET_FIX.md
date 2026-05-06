# Railway Node 20 WebSocket Fix

Railway currently runs this app on Node 20. Supabase Realtime expects a WebSocket transport in Node versions without native WebSocket support.

This version includes:

- `ws` package in `package.json`
- `globalThis.WebSocket = WebSocket` in `server.js`
- Supabase client configured with `realtime: { transport: WebSocket }`

If Railway previously crashed with `Node.js 20 detected without native WebSocket support`, upload this version and redeploy.
