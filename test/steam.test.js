import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSteamLibrary, loadSoftwareIds, normalizeLibrary, STEAM_ID } from '../lib/steam.js';
import { loopPosition, formatHours } from '../lib/games-view.js';
import handler from '../api/steam.js';

const rawGame = (appid, extra = {}) => ({ appid, name: `Game ${appid}`, playtime_forever: appid * 10, ...extra });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('retrieves every owned game, including played free games, without exposing the key', async () => {
  const calls = [], games = Array.from({ length: 175 }, (_, i) => rawGame(i + 1));
  const library = await loadSteamLibrary('private-test-key', async (url, options) => {
    calls.push({ url, options });
    if (url.pathname.includes('GetOwnedGames')) return response({ response: { game_count: games.length, games } });
    if (url.pathname.includes('GetAppList')) return response({ response: { apps: [] } });
    return response({ response: { players: [{ steamid: STEAM_ID, personaname: 'blonde supremacy' }] } });
  });
  assert.equal(library.games.length, 175);
  assert.equal(library.games.at(-1).appid, 175);
  assert.equal(library.profile.name, 'blonde supremacy');
  const owned = calls.find(call => call.url.pathname.includes('GetOwnedGames'));
  assert.equal(owned.url.searchParams.get('include_played_free_games'), '1');
  assert.equal(owned.url.searchParams.get('steamid'), STEAM_ID);
  assert.equal(owned.options.redirect, 'error');
  assert.equal(JSON.stringify(library).includes('private-test-key'), false);
});

test('hidden hours remain unknown and are not misrepresented as unplayed or a partial total', () => {
  const library = normalizeLibrary({ game_count: 2, games: [rawGame(1), { appid: 2, name: 'Private time' }] });
  assert.equal(library.games[1].playtime_minutes, null);
  assert.equal(library.total_minutes, null);
  assert.equal(formatHours(library.games[1].playtime_minutes), 'часы скрыты');
});

test('distinguishes an empty library from unavailable private game details', () => {
  assert.equal(normalizeLibrary({ game_count: 0 }).game_count, 0);
  assert.throws(() => normalizeLibrary({}), { reason: 'private_library' });
  assert.throws(() => normalizeLibrary({ game_count: 3 }), { reason: 'steam_unavailable' });
});

test('rejects incomplete library data rather than displaying it as the complete library', () => {
  assert.throws(() => normalizeLibrary({ game_count: 2, games: [rawGame(1)] }), { reason: 'steam_unavailable' });
  assert.throws(() => normalizeLibrary({ game_count: 1, games: [rawGame(-3)] }), { reason: 'steam_unavailable' });
});

test('game synchronization works if the optional profile-summary call fails', async () => {
  const library = await loadSteamLibrary('test', async url => {
    if (url.pathname.includes('GetPlayerSummaries')) throw Error('network');
    if (url.pathname.includes('GetAppList')) return response({ response: { apps: [] } });
    return response({ response: { game_count: 1, games: [rawGame(730)] } });
  });
  assert.equal(library.game_count, 1);
  assert.equal(library.profile.name, 'bleed4gucci');
});

test('does not call Steam without a configured key', async () => {
  let called = false;
  await assert.rejects(loadSteamLibrary('', async () => { called = true; }), { reason: 'not_configured' });
  assert.equal(called, false);
});

test('classifies upstream key rejection and malformed data', async () => {
  await assert.rejects(loadSteamLibrary('test', async () => response({}, 403)), { reason: 'invalid_key' });
  await assert.rejects(loadSteamLibrary('test', async () => ({ ok: true, status: 200, json: async () => { throw Error('not JSON'); } })), { reason: 'steam_unavailable' });
});

test('software is excluded from both the showcase and the total hours using Steam category ids', () => {
  const library = normalizeLibrary({ game_count: 4, games: [
    rawGame(730, { name: 'Counter-Strike 2', playtime_forever: 90 }),
    rawGame(431960, { name: 'Wallpaper Engine', playtime_forever: 24000 }),
    rawGame(365670, { name: 'Blender', playtime_forever: 400 }),
    rawGame(42, { name: 'Blender: the game', playtime_forever: 10 })
  ] }, new Set([431960, 365670]));
  assert.deepEqual(library.games.map(g => g.appid), [730, 42]);
  assert.equal(library.game_count, 2);
  assert.equal(library.total_minutes, 100);
  assert.equal(library.software_excluded, 2);
});

test('unknown hours in an excluded program do not hide the game-hours total', () => {
  const library = normalizeLibrary({ game_count: 2, games: [
    rawGame(730, { playtime_forever: 60 }), { appid: 431960, name: 'Software' }
  ] }, new Set([431960]));
  assert.equal(library.total_minutes, 60);
});

test('software catalogue requests the software category and follows every page, sharing the cache', async () => {
  const cursors = [];
  const fetcher = async url => {
    const params = JSON.parse(url.searchParams.get('input_json'));
    assert.equal(params.include_games, false);
    assert.equal(params.include_software, true);
    assert.equal(params.include_dlc, false);
    cursors.push(params.last_appid);
    return params.last_appid === 0
      ? response({ response: { apps: [{ appid: 100 }], have_more_results: true, last_appid: 100 } })
      : response({ response: { apps: [{ appid: 200 }] } });
  };
  const [first, concurrent] = await Promise.all([loadSoftwareIds('test', fetcher), loadSoftwareIds('test', fetcher)]);
  assert.deepEqual([...first], [100, 200]); assert.equal(first, concurrent);
  assert.equal(await loadSoftwareIds('test', fetcher), first);
  assert.deepEqual(cursors, [0, 100]);
});

test('does not publish a mixed game/software library when classification is unavailable', async () => {
  await assert.rejects(loadSteamLibrary('test', async url => {
    if (url.pathname.includes('GetAppList')) return response({}, 503);
    if (url.pathname.includes('GetOwnedGames')) return response({ response: { game_count: 1, games: [rawGame(431960)] } });
    return response({ response: { players: [] } });
  }), { reason: 'steam_unavailable' });
});

test('continuous reel wraps at the cycle boundary while preserving fractional progress', () => {
  const width = 176 * 260;
  assert.equal(loopPosition(width + 0.25, width), 0.25);
  assert.equal(loopPosition(width * 4 + 137, width), 137);
  assert.equal(loopPosition(-1, width), width - 1);
  assert.equal(loopPosition(10, 0), 0);
});

test('formats small playtimes without rounding played games to zero hours', () => {
  assert.equal(formatHours(0), '0 ч');
  assert.equal(formatHours(1), '< 0,1 ч');
  assert.equal(formatHours(90), '1,5 ч');
  assert.equal(formatHours(null), 'часы скрыты');
});

function fakeResponse() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('API rejects writes and returns an uncached setup state when not connected', async () => {
  const write = fakeResponse(); await handler({ method: 'POST' }, write);
  assert.equal(write.code, 405); assert.equal(write.headers.Allow, 'GET');
  const previous = process.env.STEAM_API_KEY; delete process.env.STEAM_API_KEY;
  try {
    const read = fakeResponse(); await handler({ method: 'GET' }, read);
    assert.equal(read.code, 503); assert.equal(read.body.reason, 'not_configured');
    assert.equal(read.headers['Cache-Control'], 'no-store');
  } finally {
    if (previous === undefined) delete process.env.STEAM_API_KEY; else process.env.STEAM_API_KEY = previous;
  }
});
