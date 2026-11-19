import {
  SITE_ORIGIN, SESSION_COOKIE, LOGIN_COOKIE, SESSION_AGE, configuredSecret,
  cookie, createOwnerSession, isOwner, sameOrigin, startLogin, verifySteamCallback
} from '../lib/gallery-auth.js';

export function createAuthHandler({
  secret = () => process.env.GALLERY_SESSION_SECRET,
  ready = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  now = Date.now, fetcher = fetch, origin = SITE_ORIGIN
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, origin), action = url.searchParams.get('action');
    const enabled = configuredSecret(secret()) && ready();
    const redirect = location => {
      res.setHeader('Location', location);
      res.statusCode = 303;
      return res.end();
    };
    if (req.method === 'POST' && action === 'logout') {
      if (!sameOrigin(req, origin)) return res.status(403).json({ error: 'forbidden' });
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
      return res.status(200).json({ owner: false, enabled });
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    if (!action) return res.status(200).json({ owner: enabled && isOwner(req, secret(), now()), enabled });
    if (!enabled) return res.status(503).json({ error: 'gallery_not_configured' });
    if (action === 'login') {
      const login = startLogin(secret(), now(), origin);
      res.setHeader('Set-Cookie', login.cookie);
      return redirect(login.url);
    }
    if (action === 'callback') {
      res.setHeader('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
      const valid = await verifySteamCallback(req, url.searchParams, secret(), { now: now(), origin, fetcher });
      if (!valid) return redirect(`${origin}/?gallery=login-failed#gallery`);
      res.setHeader('Set-Cookie', [cookie(LOGIN_COOKIE, '', 0), cookie(SESSION_COOKIE, createOwnerSession(secret(), now()), SESSION_AGE)]);
      return redirect(`${origin}/#gallery`);
    }
    return res.status(400).json({ error: 'invalid_action' });
  };
}

// The public site no longer supports owner login or changes.
export default function retiredAuth(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'authorization_removed' });
}
