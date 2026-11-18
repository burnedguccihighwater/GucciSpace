# Shared photo gallery

Published photos are stored in a public Vercel Blob store, not in a visitor's browser or in Git. Everyone can view the gallery without signing in. New photos appear on other open pages within about 30 seconds.

Only Steam account `76561198855975484` (`bleed4gucci`) can publish or delete photos. The **Вход владельца** link starts Steam OpenID authentication. The server verifies Steam's signature and the exact account, then sets a signed, Secure, HttpOnly owner cookie. A successful login lasts up to 30 days. Photos stay public after logout.

Required server environment variables:

- `BLOB_READ_WRITE_TOKEN` from the connected public Vercel Blob store (or `BLOB_STORE_ID` with Vercel OIDC).
- `GALLERY_SESSION_SECRET`: a random secret of at least 32 characters, stored as a sensitive production environment variable.

The trusted origin is pinned to `https://gucci-space.vercel.app` in `lib/gallery-auth.js`. Update it deliberately if the production domain changes. Preview deployments do not grant production owner sessions.

The browser converts uploads to JPEG, corrects decoded image orientation, strips original metadata, and reduces the longest edge to 3200 pixels. Original inputs can be up to 30 MB; processed uploads are limited to 3 MiB. HEIC requires a browser able to decode it, such as Safari on iPhone. Published photos open at their full processed size when clicked.

An owner who has old IndexedDB gallery photos on the current device gets an explicit **Опубликовать локальные фото** button. Local photos are never published automatically. Successful imports keep the original local backup and record the published ID to avoid repeat imports. Profile text and manually selected profile avatars retain their existing local behavior.

`npm test` covers session validation, Steam callback verification, cross-origin and unauthenticated write rejection, paginated public listing, upload size/type limits, streamed bodies, and constrained deletion. Tests use injected providers and do not access Steam, production storage, or production credentials.
