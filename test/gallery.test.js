import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAuthHandler } from '../api/gallery-auth.js';
import { createGalleryHandler, MAX_PHOTO_BYTES } from '../api/gallery.js';
import {
  SITE_ORIGIN, STEAM_OPENID, OPENID_NS, SESSION_COOKIE, LOGIN_COOKIE,
  createOwnerSession, signToken, isOwner, startLogin, verifySteamCallback
} from '../lib/gallery-auth.js';
import { STEAM_ID } from '../lib/steam.js';

const secret = 'test-only-secret-that-never-authenticates-production';
const now = Date.UTC(2026, 10, 18, 23);
const id = '1795042800000-1ec572dc-59f9-41d0-9d06-c4fc2418a816.jpg';
const base = 'https://teststore.public.blob.vercel-storage.com/';
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
const session = () => `${SESSION_COOKIE}=${createOwnerSession(secret, now)}`;
const req = (method = 'GET', url = '/api/gallery', headers = {}, body) => ({ method, url, headers, body });
function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}
const ownerHeaders = () => ({ cookie: session(), origin: SITE_ORIGIN, 'content-type': 'application/octet-stream' });
const blob = (photoId = id) => ({ pathname: `gallery/${photoId}`, url: `${base}gallery/${photoId}`, uploadedAt: new Date(now) });

function callback() {
  const login = startLogin(secret, now);
  const loginURL = new URL(login.url);
  const returnTo = new URL(loginURL.searchParams.get('openid.return_to'));
  const params = new URLSearchParams(returnTo.search);
  for (const [key, value] of Object.entries({
    ns: OPENID_NS, mode: 'id_res', op_endpoint: STEAM_OPENID,
    claimed_id: `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    identity: `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    return_to: returnTo.href, response_nonce: new Date(now).toISOString().replace('.000', '') + 'random-nonce',
    assoc_handle: 'association', sig: 'provider-signature',
    signed: 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'
  })) params.set(`openid.${key}`, value);
  return { params, request: req('GET', `/api/gallery-auth?${params}`, { cookie: login.cookie.split(';')[0] }) };
}

test('only an unexpired signed session for the linked Steam account is accepted', () => {
  assert.equal(isOwner(req('GET', '/', { cookie: session() }), secret, now), true);
  const claims = { v: 1, steamId: '76561198000000000', iat: now / 1000, exp: now / 1000 + 100 };
  for (const token of [
    signToken(claims, 'session', secret),
    createOwnerSession(secret, now - 100000, 50),
    createOwnerSession(secret, now) + 'x',
    signToken({ ...claims, steamId: STEAM_ID }, 'login', secret),
    'bad.token'
  ]) assert.equal(isOwner(req('GET', '/', { cookie: `${SESSION_COOKIE}=${token}` }), secret, now), false);
  assert.equal(isOwner(req('GET', '/', { cookie: `${session()}; ${session()}` }), secret, now), false);
  assert.equal(isOwner(req(), undefined, now), false);
});

test('owner status is private and login uses a Secure HttpOnly state cookie and pinned realm', async () => {
  const handler = createAuthHandler({ secret: () => secret, ready: () => true, now: () => now });
  const status = response();
  await handler(req('GET', '/api/gallery-auth', { cookie: session() }), status);
  assert.deepEqual(status.body, { owner: true, enabled: true });
  assert.equal(status.headers['cache-control'], 'private, no-store');
  const login = response();
  await handler(req('GET', '/api/gallery-auth?action=login', { host: 'attacker.test' }), login);
  const location = new URL(login.headers.location);
  assert.equal(location.origin + location.pathname, STEAM_OPENID);
  assert.equal(location.searchParams.get('openid.realm'), SITE_ORIGIN + '/');
  assert.match(login.headers['set-cookie'], /^__Host-gucci-gallery-login=.*; Path=\/; HttpOnly; Secure; SameSite=Lax;/);
});

test('Steam callback verifies the assertion at Steam before creating an owner session', async () => {
  const fixture = callback();
  let checked = false;
  const handler = createAuthHandler({ secret: () => secret, ready: () => true, now: () => now,
    fetcher: async (url, options) => {
      checked = true;
      assert.equal(url, STEAM_OPENID);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.body.get('openid.mode'), 'check_authentication');
      assert.equal(options.body.get('openid.sig'), 'provider-signature');
      return new Response('ns:' + OPENID_NS + '\nis_valid:true\n');
    }
  });
  const res = response();
  await handler(fixture.request, res);
  assert.equal(checked, true);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, SITE_ORIGIN + '/#gallery');
  const cookies = res.headers['set-cookie'];
  assert.equal(cookies.length, 2);
  assert.equal(isOwner(req('GET', '/', { cookie: cookies[1].split(';')[0] }), secret, now), true);
  assert.match(cookies[0], /Max-Age=0/);
});

test('callback accepts Valve HTTP identifiers but never sends verification over HTTP', async () => {
  const { params, request } = callback();
  params.set('openid.claimed_id', `http://steamcommunity.com/openid/id/${STEAM_ID}`);
  params.set('openid.identity', params.get('openid.claimed_id'));
  assert.equal(await verifySteamCallback(request, params, secret, { now, fetcher: async url => {
    assert.equal(url, STEAM_OPENID); return new Response('is_valid:true\n');
  } }), true);
});

test('invalid state, identifiers, return URL, nonce and unsigned required fields fail before network access', async () => {
  const attacks = [
    params => params.set('state', 'another-state'),
    params => params.set('openid.op_endpoint', 'https://attacker.test/login'),
    params => params.set('openid.return_to', 'https://attacker.test/callback'),
    params => params.set('openid.signed', 'identity,return_to'),
    params => params.set('openid.response_nonce', '2026-11-17T23:00:00Zold'),
    params => params.set('openid.response_nonce', '2026-11-19T23:00:00Zfuture'),
    params => params.set('openid.claimed_id', 'https://steamcommunity.com.attacker.test/openid/id/' + STEAM_ID),
    params => params.set('openid.identity', 'https://steamcommunity.com/openid/id/76561198000000000'),
    params => { params.set('openid.claimed_id', 'https://steamcommunity.com/openid/id/76561198000000000'); params.set('openid.identity', params.get('openid.claimed_id')); },
    params => params.append('openid.mode', 'id_res')
  ];
  for (const mutate of attacks) {
    const { params, request } = callback();
    mutate(params);
    const valid = await verifySteamCallback(request, params, secret, { now, fetcher: () => assert.fail('must not contact an untrusted provider') });
    assert.equal(valid, false);
  }
  const { params } = callback();
  assert.equal(await verifySteamCallback(req(), params, secret, { now }), false);
});

test('Steam rejects invalid provider signatures and expired login state', async () => {
  const { params, request } = callback();
  for (const answer of ['is_valid:false\n', 'x-is_valid:true\n', 'is_valid:true-extra\n']) {
    assert.equal(await verifySteamCallback(request, params, secret, { now, fetcher: async () => new Response(answer) }), false);
  }
  assert.equal(await verifySteamCallback(request, params, secret, { now: now + 700000 }), false);
});

test('failed Steam login clears the state without issuing a session', async () => {
  const { request } = callback();
  const handler = createAuthHandler({ secret: () => secret, ready: () => true, now: () => now,
    fetcher: async () => new Response('is_valid:false\n') });
  const res = response();
  await handler(request, res);
  assert.equal(res.headers.location, SITE_ORIGIN + '/?gallery=login-failed#gallery');
  assert.equal(typeof res.headers['set-cookie'], 'string');
  assert.match(res.headers['set-cookie'], new RegExp('^' + LOGIN_COOKIE));
});

test('logout requires same-origin POST and expires only the session cookie', async () => {
  const handler = createAuthHandler({ secret: () => secret, ready: () => true });
  const denied = response();
  await handler(req('POST', '/api/gallery-auth?action=logout', { origin: 'https://attacker.test' }), denied);
  assert.equal(denied.statusCode, 403);
  const allowed = response();
  await handler(req('POST', '/api/gallery-auth?action=logout', { origin: SITE_ORIGIN }), allowed);
  assert.match(allowed.headers['set-cookie'], /Max-Age=0/);
  assert.deepEqual(allowed.body, { owner: false, enabled: true });
});

test('all public photos are listed across pages, newest first, without leaking other objects', async () => {
  const older = '1795042700000-1ec572dc-59f9-41d0-9d06-c4fc2418a816.jpg';
  const storage = { list: async options => {
    assert.equal(options.prefix, 'gallery/');
    return options.cursor ? { blobs: [blob(id)], hasMore: false } :
      { blobs: [blob(older), { ...blob(), pathname: 'private/file.jpg' }, { ...blob(), url: 'https://attacker.test/image' }], hasMore: true, cursor: 'page-two' };
  } };
  const handler = createGalleryHandler({ storage, ready: () => true });
  const res = response();
  await handler(req(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.photos.map(p => p.id), [id, older]);
  assert.match(res.headers['cache-control'], /public/);
  assert.deepEqual(Object.keys(res.body.photos[0]), ['id', 'src', 'createdAt']);
});

test('unauthenticated and cross-origin clients cannot upload or delete photos', async () => {
  const storage = { put: () => assert.fail(), del: () => assert.fail() };
  const handler = createGalleryHandler({ storage, secret: () => secret, ready: () => true, now: () => now });
  for (const method of ['POST', 'DELETE']) {
    const visitor = response();
    await handler(req(method, '/api/gallery', { origin: SITE_ORIGIN }, jpg), visitor);
    assert.equal(visitor.statusCode, 401);
    for (const headers of [
      { ...ownerHeaders(), origin: 'https://attacker.test' },
      { cookie: session(), 'x-forwarded-host': 'gucci-space.vercel.app' }
    ]) {
      const cross = response();
      await handler(req(method, '/api/gallery', headers, jpg), cross);
      assert.equal(cross.statusCode, 403);
    }
  }
});

test('published photo is immediately readable by an independent public client', async () => {
  const rows = [];
  const storage = {
    async put(pathname, bytes, options) {
      assert.deepEqual(bytes, jpg);
      assert.equal(options.access, 'public');
      assert.equal(options.contentType, 'image/jpeg');
      assert.equal(options.allowOverwrite, false);
      const item = { pathname, url: base + pathname, uploadedAt: new Date(now) };
      rows.push(item); return item;
    },
    async list() { return { blobs: rows, hasMore: false }; }
  };
  const handler = createGalleryHandler({ storage, secret: () => secret, ready: () => true, now: () => now,
    uuid: () => '1ec572dc-59f9-41d0-9d06-c4fc2418a816' });
  const uploaded = response();
  await handler(req('POST', '/api/gallery', ownerHeaders(), jpg), uploaded);
  assert.equal(uploaded.statusCode, 201);
  const visitor = response();
  await handler(req(), visitor);
  assert.deepEqual(visitor.body.photos, [uploaded.body.photo]);
  const fresh = response();
  await handler(req('GET', '/api/gallery?owner=1', { cookie: session() }), fresh);
  assert.equal(fresh.headers['cache-control'], 'private, no-store');
});

test('raw streamed uploads work as well as Vercel pre-parsed buffers', async () => {
  const stream = Readable.from([jpg.subarray(0, 4), jpg.subarray(4)]);
  Object.assign(stream, { method: 'POST', url: '/api/gallery', headers: ownerHeaders() });
  const storage = { put: async (pathname, bytes) => {
    assert.deepEqual(bytes, jpg); return { ...blob(), pathname, url: base + pathname };
  } };
  const res = response();
  await createGalleryHandler({ storage, secret: () => secret, ready: () => true, now: () => now })(stream, res);
  assert.equal(res.statusCode, 201);
});

test('gallery rejects SVG, fake images, wrong upload types and oversized files', async () => {
  const handler = createGalleryHandler({ storage: { put: () => assert.fail() },
    secret: () => secret, ready: () => true, now: () => now });
  for (const [bytes, headers, status] of [
    [Buffer.from('<svg onload="alert(1)"></svg>'), ownerHeaders(), 415],
    [Buffer.from('fake JPEG'), ownerHeaders(), 415],
    [jpg, { ...ownerHeaders(), 'content-type': 'text/html' }, 415],
    [Buffer.alloc(MAX_PHOTO_BYTES + 1), ownerHeaders(), 413],
    [jpg, { ...ownerHeaders(), 'content-length': String(MAX_PHOTO_BYTES + 1) }, 413]
  ]) {
    const res = response();
    await handler(req('POST', '/api/gallery', headers, bytes), res);
    assert.equal(res.statusCode, status);
  }
});

test('deletion cannot target files outside the photo gallery', async () => {
  let deleted;
  const handler = createGalleryHandler({ storage: { del: async path => { deleted = path; } },
    secret: () => secret, ready: () => true, now: () => now });
  for (const value of ['../avatar.jpg', 'gallery/' + id, 'https://attacker.test/file', '']) {
    const res = response();
    await handler(req('DELETE', '/api/gallery?id=' + encodeURIComponent(value), ownerHeaders()), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(deleted, undefined);
  const res = response();
  await handler(req('DELETE', '/api/gallery?id=' + id, ownerHeaders()), res);
  assert.equal(res.statusCode, 204);
  assert.equal(deleted, 'gallery/' + id);
});

test('failed or looping storage listing returns a private generic error without partial data', async () => {
  for (const list of [
    async () => { throw new Error('secret provider URL'); },
    async () => ({ blobs: [blob()], hasMore: true, cursor: 'same' })
  ]) {
    const res = response();
    await createGalleryHandler({ storage: { list }, ready: () => true })(req(), res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'gallery_unavailable' });
    assert.equal(res.headers['cache-control'], 'no-store');
  }
});
