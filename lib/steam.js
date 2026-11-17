export const STEAM_ID = '76561198855975484';
export const STEAM_PROFILE = 'https://steamcommunity.com/id/bleed4gucci/';

export class SteamError extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

const minutes = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

export function normalizeLibrary(response) {
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
  const allHoursVisible = games.every(game => game.playtime_minutes !== null);
  return {
    games,
    game_count: games.length,
    total_minutes: allHoursVisible ? games.reduce((sum, game) => sum + game.playtime_minutes, 0) : null
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

export async function loadSteamLibrary(key, fetcher = fetch) {
  if (!key?.trim()) throw new SteamError('not_configured');
  const [owned, summary] = await Promise.allSettled([
    steamRequest('/IPlayerService/GetOwnedGames/v1/', {
      steamid: STEAM_ID, include_appinfo: '1', include_played_free_games: '1', format: 'json'
    }, key.trim(), fetcher),
    steamRequest('/ISteamUser/GetPlayerSummaries/v2/', { steamids: STEAM_ID, format: 'json' }, key.trim(), fetcher)
  ]);
  if (owned.status === 'rejected') throw owned.reason;
  const library = normalizeLibrary(owned.value?.response);
  const player = summary.status === 'fulfilled' ? summary.value?.response?.players?.find(p => p.steamid === STEAM_ID) : null;
  return {
    connected: true, ...library,
    profile: { steam_id: STEAM_ID, name: String(player?.personaname || 'bleed4gucci').slice(0, 120), url: STEAM_PROFILE },
    synced_at: new Date().toISOString()
  };
}
