export const STEAM_ID = '76561198855975484';
export const STEAM_PROFILE = 'https://steamcommunity.com/id/bleed4gucci/';

export class SteamError extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

const minutes = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

export function normalizeLibrary(response, softwareIds = new Set()) {
  if (!response || typeof response !== 'object' || !Number.isInteger(response.game_count) || response.game_count < 0) {
    throw new SteamError('private_library');
  }
  if (response.game_count > 0 && !Array.isArray(response.games)) throw new SteamError('steam_unavailable');
  const games = [], seen = new Set();
  for (const game of response.games || []) {
    if (!Number.isSafeInteger(game.appid) || game.appid <= 0 || seen.has(game.appid)) continue;
    seen.add(game.appid);
    games.push({
      appid: game.appid,
      name: String(game.name || `Steam game #${game.appid}`).slice(0, 240),
      playtime_minutes: minutes(game.playtime_forever),
      recent_minutes: minutes(game.playtime_2weeks) ?? 0,
      last_played: minutes(game.rtime_last_played) ?? 0,
      cover: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`,
      url: `https://store.steampowered.com/app/${game.appid}/`
    });
  }
  if (games.length !== response.game_count) throw new SteamError('steam_unavailable');
  const playable = games.filter(game => !softwareIds.has(game.appid));
  const allHoursVisible = playable.every(game => game.playtime_minutes !== null);
  return {
    games: playable,
    game_count: playable.length,
    software_excluded: games.length - playable.length,
    total_minutes: allHoursVisible ? playable.reduce((sum, game) => sum + game.playtime_minutes, 0) : null
  };
}

async function steamRequest(path, params, key, fetcher) {
  const url = new URL(path, 'https://api.steampowered.com');
  url.search = new URLSearchParams({ key, ...params }).toString();
  let response;
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(8000)
    });
  } catch { throw new SteamError('steam_unavailable'); }
  if (response.status === 401 || response.status === 403) throw new SteamError('invalid_key');
  if (!response.ok) throw new SteamError('steam_unavailable');
  try { return await response.json(); } catch { throw new SteamError('steam_unavailable'); }
}

// Steam's own software category handles new programs without guessing from names.
// The catalogue is public and shared by all profile requests in this process.
const softwareCaches = new WeakMap();
const SOFTWARE_CACHE_MS = 6 * 60 * 60 * 1000;

export async function loadSoftwareIds(key, fetcher = fetch) {
  let cache = softwareCaches.get(fetcher);
  if (!cache) { cache = {}; softwareCaches.set(fetcher, cache); }
  if (cache.ids && cache.until > Date.now()) return cache.ids;
  if (cache.pending) return cache.pending;
  cache.pending = (async () => {
    const ids = new Set();
    let cursor = 0;
    for (let page = 0; page < 10; page++) {
      const json = await steamRequest('/IStoreService/GetAppList/v1/', {
        input_json: JSON.stringify({
          include_games: false, include_dlc: false, include_software: true,
          include_videos: false, include_hardware: false,
          max_results: 50000, last_appid: cursor
        })
      }, key, fetcher);
      const data = json?.response;
      if (!Array.isArray(data?.apps) || data.apps.some(app => !Number.isSafeInteger(app.appid) || app.appid <= 0)) throw new SteamError('steam_unavailable');
      for (const app of data.apps) ids.add(app.appid);
      if (!data.have_more_results && data.apps.length < 50000) {
        cache.ids = ids; cache.until = Date.now() + SOFTWARE_CACHE_MS;
        return ids;
      }
      const next = data.last_appid || data.apps.at(-1)?.appid;
      if (!Number.isSafeInteger(next) || next <= cursor) throw new SteamError('steam_unavailable');
      cursor = next;
    }
    throw new SteamError('steam_unavailable');
  })();
  try { return await cache.pending; } finally { cache.pending = null; }
}

export async function loadSteamLibrary(key, fetcher = fetch) {
  if (!key?.trim()) throw new SteamError('not_configured');
  const [owned, summary, software] = await Promise.allSettled([
    steamRequest('/IPlayerService/GetOwnedGames/v1/', {
      steamid: STEAM_ID, include_appinfo: '1', include_played_free_games: '1', format: 'json'
    }, key.trim(), fetcher),
    steamRequest('/ISteamUser/GetPlayerSummaries/v2/', { steamids: STEAM_ID, format: 'json' }, key.trim(), fetcher),
    loadSoftwareIds(key.trim(), fetcher)
  ]);
  if (owned.status === 'rejected') throw owned.reason;
  if (software.status === 'rejected') throw software.reason;
  const library = normalizeLibrary(owned.value?.response, software.value);
  const player = summary.status === 'fulfilled' ? summary.value?.response?.players?.find(p => p.steamid === STEAM_ID) : null;
  return {
    connected: true, library_kind: 'games', ...library,
    profile: { steam_id: STEAM_ID, name: String(player?.personaname || 'bleed4gucci').slice(0, 120), url: STEAM_PROFILE },
    synced_at: new Date().toISOString()
  };
}
