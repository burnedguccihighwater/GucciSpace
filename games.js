import { formatHours, loopPosition } from './lib/games-view.js';

const $ = id => document.getElementById(id);
const reel = $('gamesReel'), track = $('gamesTrack');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let library = null, pending = false, signature = '';
let cycleWidth = 0, position = 0, lastFrame = 0, frameId = null;
let inView = false, hovered = false, pressed = false, focused = false, pauseUntil = 0;
const messages = {
  not_configured: ['Подключение Steam готовится', 'Библиотека появится после подключения профиля. Пока её можно открыть в Steam.'],
  private_library: ['Библиотека скрыта в Steam', 'Для синхронизации список игр должен быть доступен в настройках приватности Steam.'],
  invalid_key: ['Связь со Steam требует настройки', 'Сейчас библиотеку можно посмотреть в профиле Steam.'],
  steam_unavailable: ['Steam сейчас не ответил', 'Витрина обновится, когда связь восстановится.']
};

function showMessage(title, detail) {
  $('gamesEmptyTitle').textContent = title;
  $('gamesEmptyDetail').textContent = detail;
  $('gamesEmpty').hidden = false;
}

function makeGroup(games, duplicate = false) {
  const group = document.createElement('div');
  group.className = 'games-group';
  if (duplicate) group.setAttribute('aria-hidden', 'true');
  else { group.id = 'gamesGroup'; group.setAttribute('role', 'list'); group.setAttribute('aria-label', 'Все игры Steam'); }
  for (const game of games) {
    const item = document.createElement('article'); item.className = 'game-tile';
    if (!duplicate) item.setAttribute('role', 'listitem');
    const card = document.createElement('a'); card.className = 'game-card';
    card.href = `https://store.steampowered.com/app/${game.appid}/`;
    card.target = '_blank'; card.rel = 'noopener noreferrer'; card.dataset.appid = game.appid;
    if (duplicate) card.tabIndex = -1;
    const art = document.createElement('div'); art.className = 'game-art';
    const fallback = document.createElement('span'); fallback.textContent = 'GAME'; fallback.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`;
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.width = 460; img.height = 215;
    img.addEventListener('error', () => img.remove(), { once: true });
    art.append(fallback, img);
    const name = document.createElement('strong'); name.className = 'game-name';
    name.textContent = game.name; name.title = game.name;
    card.append(art, name); item.append(card); group.append(item);
  }
  return group;
}

function measureReel() {
  const group = $('gamesGroup');
  const nextWidth = group?.getBoundingClientRect().width || 0;
  if (!nextWidth) { cycleWidth = 0; return; }
  const phase = cycleWidth > 0 ? loopPosition(reel.scrollLeft, cycleWidth) / cycleWidth : 0;
  cycleWidth = nextWidth;
  const copies = library.games.length > 1 ? Math.max(2, Math.ceil(reel.clientWidth / cycleWidth) + 1) : 1;
  while (track.children.length < copies) track.append(makeGroup(library.games, true));
  while (track.children.length > copies) track.lastElementChild.remove();
  position = phase * cycleWidth;
  reel.scrollLeft = position; lastFrame = 0;
}

function renderShowcase() {
  const games = library.games;
  $('gamesEmpty').hidden = games.length > 0;
  $('gamesShowcase').hidden = games.length === 0;
  if (!games.length) {
    showMessage('Библиотека пока пуста', 'Steam не вернул игр для этого профиля.');
    track.replaceChildren(); signature = ''; cycleWidth = 0; return;
  }
  const nextSignature = games.map(game => game.appid + ':' + game.name).join('|');
  // A routine sync must not restart the reel before it reaches the later games.
  if (signature === nextSignature) return;
  const previousScroll = reel.scrollLeft;
  signature = nextSignature;
  track.replaceChildren(makeGroup(games));
  measureReel();
  position = loopPosition(previousScroll, cycleWidth);
  reel.scrollLeft = position; lastFrame = 0;
}

function frame(now) {
  frameId = requestAnimationFrame(frame);
  const paused = hovered || pressed || focused || now < pauseUntil || !cycleWidth || library?.games.length < 2;
  if (paused) { lastFrame = 0; return; }
  if (!lastFrame) { lastFrame = now; position = loopPosition(reel.scrollLeft, cycleWidth); return; }
  const elapsed = Math.min(now - lastFrame, 64); lastFrame = now;
  position = loopPosition(position + elapsed * 0.032, cycleWidth);
  reel.scrollLeft = position;
}

function updatePlayback() {
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null; lastFrame = 0;
  if (inView && !document.hidden && !reducedMotion.matches) frameId = requestAnimationFrame(frame);
}

function pauseAfterInput() { pauseUntil = performance.now() + 2500; lastFrame = 0; }
reel.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hovered = true; });
reel.addEventListener('pointerleave', () => { hovered = false; lastFrame = 0; });
reel.addEventListener('pointerdown', () => { pressed = true; pauseAfterInput(); });
const release = () => { if (pressed) { pressed = false; pauseAfterInput(); } };
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
reel.addEventListener('wheel', pauseAfterInput, { passive: true });
reel.addEventListener('touchmove', pauseAfterInput, { passive: true });
reel.addEventListener('keydown', pauseAfterInput);
reel.addEventListener('focusin', event => { focused = event.target.matches(':focus-visible'); lastFrame = 0; });
reel.addEventListener('focusout', event => { if (!reel.contains(event.relatedTarget)) { focused = false; pauseAfterInput(); } });
new ResizeObserver(measureReel).observe(reel);
new IntersectionObserver(entries => { inView = entries[0].isIntersecting; updatePlayback(); }, { rootMargin: '40px' }).observe($('gamesShowcase'));
document.addEventListener('visibilitychange', updatePlayback);
reducedMotion.addEventListener('change', updatePlayback);

function setOwnerStatus(reason) {
  const statuses = {
    not_configured: 'Раздел готов. Для подключения добавь STEAM_API_KEY в настройки проекта на Vercel и выполни Redeploy.',
    private_library: 'Steam скрывает список игр. В настройках приватности профиля открой «Доступ к игровой информации».',
    invalid_key: 'Steam отклонил ключ. Проверь STEAM_API_KEY в настройках проекта на Vercel.',
    steam_unavailable: 'Steam временно недоступен. Последняя загруженная витрина остаётся на странице.'
  };
  $('steamOwnerStatus').textContent = statuses[reason] || 'Подключено. Игры и часы обновляются автоматически. Программы исключаются по категории Steam.';
}

async function loadGames() {
  if (pending) return;
  pending = true; $('gamesPanelBody').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/steam?v=showcase-1', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || !data.connected) throw new Error(messages[data.reason] ? data.reason : 'steam_unavailable');
    if (data.library_kind !== 'games' || !Array.isArray(data.games) || !data.games.every(game => Number.isSafeInteger(game.appid) && game.appid > 0 && typeof game.name === 'string')) throw new Error('steam_unavailable');
    data.games.sort((a, b) => (b.playtime_minutes ?? -1) - (a.playtime_minutes ?? -1) || a.name.localeCompare(b.name));
    library = data;
    $('gamesCount').textContent = `${data.games.length} games`;
    $('gamesTotal').textContent = String(data.games.length);
    $('gamesHours').textContent = data.total_minutes === null ? '—' : formatHours(data.total_minutes);
    $('steamProfileName').textContent = data.profile?.name || 'bleed4gucci';
    $('gamesSyncStatus').textContent = 'Обновлено ' + new Date(data.synced_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    setOwnerStatus(); renderShowcase();
  } catch (error) {
    const reason = messages[error.message] ? error.message : 'steam_unavailable';
    setOwnerStatus(reason);
    if (library) $('gamesSyncStatus').textContent = 'Steam не ответил · витрина обновится позже';
    else {
      $('gamesCount').textContent = 'Steam';
      $('gamesSyncStatus').textContent = reason === 'not_configured' ? 'Ожидает подключения' : 'Нет связи со Steam';
      showMessage(...messages[reason]);
    }
  } finally {
    pending = false; $('gamesPanelBody').setAttribute('aria-busy', 'false');
  }
}

loadGames();
setInterval(() => { if (!document.hidden) loadGames(); }, 300000);
