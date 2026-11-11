# Sleeve

A Spotify library viewer where album artwork is the whole point. Saved albums and top tracks show up as a wall of sleeves, with tilt, spotlight-on-hover, and a shared-element zoom into a detail view.

Built with Vite, React, TypeScript and Framer Motion. There's no backend: login uses Spotify's Authorization Code + PKCE flow.

## Setup

1. **Create a Spotify app** at https://developer.spotify.com/dashboard
   - Redirect URI: `http://127.0.0.1:5173/callback` (Spotify rejects `localhost`, so use the loopback IP)
   - APIs used: **Web API**
   - Development Mode apps need the app owner to have Spotify Premium and are limited to 5 users. Add any other accounts under *User Management*.
2. **Add your Client ID**
   ```sh
   cp .env.example .env.local
   # then paste the Client ID into VITE_SPOTIFY_CLIENT_ID
   ```
3. **Run**
   ```sh
   npm install
   npm run dev
   ```
   Open **http://127.0.0.1:5173**. Use the IP, not localhost, or the redirect won't match.

## Scopes

`user-library-read` (saved albums) and `user-top-read` (top tracks).

## Layout

```
src/
  spotify/auth.ts        PKCE login, token storage + refresh
  spotify/api.ts         fetch wrapper (401/429 handling), paging, normalizes into ArtItem
  hooks/useLibrary.ts    streams saved albums in; caches top tracks per time range
  hooks/useDominantColor.ts  samples artwork for the overlay's ambient light
  components/
    Login.tsx            drifting colour wall + connect button
    Header.tsx           tabs (gliding pill), tile-size slider, avatar/sign-out
    ArtGrid.tsx / ArtTile.tsx   grid + per-tile 3D tilt, glare, blur-up load
    DetailOverlay.tsx    shared-layout zoom, ←/→ to browse, esc to close
```

## Ideas for next passes

- Drag to rearrange (Framer `Reorder`) or a free-form canvas "crate"
- Group liked songs by album
- Hovering a tile tints the whole page with its colour
- Infinite pannable wall (like a physical record wall)
- Artist images view
