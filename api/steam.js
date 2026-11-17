import { loadSteamLibrary, SteamError, STEAM_PROFILE } from '../lib/steam.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ connected: false, reason: 'method_not_allowed' });
  }
  try {
    const library = await loadSteamLibrary(process.env.STEAM_API_KEY);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(library);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    const reason = error instanceof SteamError ? error.reason : 'steam_unavailable';
    return res.status(503).json({ connected: false, reason, profile_url: STEAM_PROFILE });
  }
}
