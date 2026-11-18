import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { STEAM_ID } from './steam.js';

export const SITE_ORIGIN = 'https://gucci-space.vercel.app';
export const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
export const OPENID_NS = 'http://specs.openid.net/auth/2.0';
export const SESSION_COOKIE = '__Host-gucci-gallery';
export const LOGIN_COOKIE = '__Host-gucci-gallery-login';
const SESSION_AGE = 30 * 24 * 60 * 60;
const LOGIN_AGE = 10 * 60;

export function configuredSecret(secret) {
  return typeof secret === 'string' && secret.length >= 32;
}

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signToken(payload, purpose, secret) {
  if (!configuredSecret(secret)) throw new Error('gallery_not_configured');
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${purpose}.${data}`).digest('base64url');
  return `${data}.${signature}`;
}

function readToken(token, purpose, secret, now) {
  if (!configuredSecret(secret) || typeof token !== 'string' || token.length > 1200) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  const signature = createHmac('sha256', secret).update(`${purpose}.${parts[0]}`).digest('base64url');
  if (!equal(signature, parts[1])) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const seconds = Math.floor(now / 1000);
    const maxAge = purpose === 'session' ? SESSION_AGE : LOGIN_AGE;
    if (payload.v !== 1 || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
        payload.iat > seconds + 60 || payload.exp <= seconds || payload.exp <= payload.iat ||
        payload.exp - payload.iat > maxAge) return null;
    return payload;
  } catch { return null; }
}

export function cookieValue(req, name) {
  const raw = req.headers?.cookie;
  if (typeof raw !== 'string' || raw.length > 16000) return null;
  const values = raw.split(';').map(c => c.trim()).filter(c => c.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}

export function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function createOwnerSession(secret, now = Date.now(), age = SESSION_AGE) {
  const iat = Math.floor(now / 1000);
  return signToken({ v: 1, steamId: STEAM_ID, iat, exp: iat + Math.min(age, SESSION_AGE) }, 'session', secret);
}

export function isOwner(req, secret, now = Date.now()) {
  return readToken(cookieValue(req, SESSION_COOKIE), 'session', secret, now)?.steamId === STEAM_ID;
}

export function sameOrigin(req, origin = SITE_ORIGIN) {
  return req.headers?.origin === origin;
}

export function startLogin(secret, now = Date.now(), origin = SITE_ORIGIN) {
  const state = randomBytes(32).toString('base64url');
  const iat = Math.floor(now / 1000);
  const proof = signToken({ v: 1, state, iat, exp: iat + LOGIN_AGE }, 'login', secret);
  const callback = new URL('/api/gallery-auth', origin);
  callback.search = new URLSearchParams({ action: 'callback', state }).toString();
  const url = new URL(STEAM_OPENID);
  url.search = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': callback.href,
    'openid.realm': `${origin}/`,
    'openid.identity': `${OPENID_NS}/identifier_select`,
    'openid.claimed_id': `${OPENID_NS}/identifier_select`
  }).toString();
  return { url: url.href, cookie: cookie(LOGIN_COOKIE, proof, LOGIN_AGE) };
}

function ownerIdentifier(value) {
  // Valve still documents HTTP claimed identifiers; verification always uses HTTPS.
  return /^https?:\/\/steamcommunity\.com\/openid\/id\/\d{17}$/.test(value || '') &&
    value.split('/').at(-1) === STEAM_ID;
}

export async function verifySteamCallback(req, params, secret, {
  now = Date.now(), origin = SITE_ORIGIN, fetcher = fetch
} = {}) {
  const proof = readToken(cookieValue(req, LOGIN_COOKIE), 'login', secret, now);
  if (!proof || !equal(proof.state, params.get('state'))) return false;
  for (const key of params.keys()) if (params.getAll(key).length !== 1) return false;
  const returnTo = new URL('/api/gallery-auth', origin);
  returnTo.search = new URLSearchParams({ action: 'callback', state: proof.state }).toString();
  const identity = params.get('openid.claimed_id');
  if (params.get('openid.ns') !== OPENID_NS || params.get('openid.mode') !== 'id_res' ||
      params.get('openid.op_endpoint') !== STEAM_OPENID ||
      params.get('openid.return_to') !== returnTo.href || !ownerIdentifier(identity) ||
      params.get('openid.identity') !== identity) return false;
  const signed = (params.get('openid.signed') || '').split(',');
  if (!['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']
    .every(field => signed.includes(field))) return false;
  const nonce = params.get('openid.response_nonce') || '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z.{1,160}$/.test(nonce)) return false;
  const time = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(time) || now - time > 300000 || time - now > 60000) return false;
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  try {
    const response = await fetcher(STEAM_OPENID, {
      method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    if (!response.ok) return false;
    const result = await response.text();
    return result.length < 4096 && /^is_valid:true\r?$/m.test(result);
  } catch { return false; }
}

export { SESSION_AGE };
