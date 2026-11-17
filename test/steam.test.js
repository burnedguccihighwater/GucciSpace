import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSteamLibrary, normalizeLibrary, STEAM_ID } from '../lib/steam.js';
import { selectGames, formatHours } from '../lib/games-view.js';
import handler from '../api/steam.js';

const rawGame = (appid, extra = {}) => ({ appid, name: `Game ${appid}`, playtime_forever: appid * 10, ...extra });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('retrieves every owned game, including played free games, without exposing the key', async () => {
  const calls = [], games = Array.from({ length: 175 }, (_, i) => rawGame(i + 1));
  const library = await loadSteamLibrary('private-test-key', async (url, options) => {
    calls.push({ url, options });
    if (url.pathname.includes('GetOwnedGames')) return response({ response: { game_count: games.length, games } });
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
  assert.deepEqual(selectGames(library.games, { filter: 'unplayed' }), []);
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

test('searches and sorts the full library before pagination, without mutating it', () => {
  const games = normalizeLibrary({ game_count: 3, games: [
    rawGame(1, { name: 'Game 10', rtime_last_played: 100 }),
    rawGame(2, { name: 'GAME 2', playtime_forever: 0, rtime_last_played: 300 }),
    rawGame(3, { name: 'Игра', rtime_last_played: 200 })
  ] }).games;
  assert.deepEqual(selectGames(games, { query: '  game ', sort: 'name' }).map(g => g.appid), [2, 1]);
  assert.deepEqual(selectGames(games, { sort: 'recent' }).map(g => g.appid), [2, 3, 1]);
  assert.deepEqual(selectGames(games, { filter: 'unplayed' }).map(g => g.appid), [2]);
  assert.deepEqual(games.map(g => g.appid), [1, 2, 3]);
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
