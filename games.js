import { formatHours, selectGames } from './lib/games-view.js';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 12;
let library = null, visibleCount = PAGE_SIZE, filter = 'all', pending = false;
const controls = () => document.querySelectorAll('#gamesControls input, #gamesControls select, #gamesControls button');
const messages = {
  not_configured: ['Подключение Steam готовится', 'Библиотека появится после подключения профиля. Пока её можно открыть в Steam.'],
  private_library: ['Библиотека скрыта в Steam', 'Для синхронизации список игр должен быть доступен в настройках приватности Steam.'],
  invalid_key: ['Связь со Steam требует настройки', 'Сейчас библиотеку можно посмотреть в профиле Steam.'],
  steam_unavailable: ['Steam сейчас не ответил', 'Попробуй обновить список немного позже.']
};

function showMessage(title, detail) {
  $('gamesEmptyTitle').textContent = title;
  $('gamesEmptyDetail').textContent = detail;
  $('gamesEmpty').hidden = false;
}

function renderGames() {
  if (!library) return;
  const results = selectGames(library.games, { query: $('gamesSearch').value, sort: $('gamesSort').value, filter });
  $('gamesGrid').replaceChildren(...results.slice(0, visibleCount).map(game => {
    const card = document.createElement('a'); card.className = 'game-card';
    card.href = `https://store.steampowered.com/app/${game.appid}/`; card.target = '_blank'; card.rel = 'noopener noreferrer';
    const art = document.createElement('div'); art.className = 'game-art';
    const fallback = document.createElement('span'); fallback.textContent = 'GAME'; fallback.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`;
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true }); art.append(fallback, img);
    const body = document.createElement('div'); body.className = 'game-info';
    const name = document.createElement('strong'); name.textContent = game.name; name.title = game.name;
    const time = document.createElement('span'); time.className = 'game-time';
    time.textContent = game.playtime_minutes === 0 ? 'Не запускал' : formatHours(game.playtime_minutes);
    body.append(name, time);
    if (game.recent_minutes > 0) {
      const recent = document.createElement('small'); recent.textContent = `${formatHours(game.recent_minutes)} за 2 недели`; body.append(recent);
    }
    card.append(art, body); return card;
  }));
  $('gamesEmpty').hidden = results.length > 0;
  if (!results.length) showMessage(library.games.length ? 'Ничего не нашлось' : 'Библиотека пока пуста', library.games.length ? 'Попробуй другое название или фильтр.' : 'Steam не вернул игр для этого профиля.');
  $('gamesVisibleCount').textContent = `Показано ${Math.min(results.length, visibleCount)} из ${results.length}`;
  $('gamesMore').hidden = results.length <= visibleCount;
  $('gamesMore').textContent = `Показать ещё ${Math.min(PAGE_SIZE, Math.max(0, results.length - visibleCount))}`;
}

function setOwnerStatus(reason) {
  const statuses = {
    not_configured: 'Раздел готов. Для подключения добавь STEAM_API_KEY в настройки проекта на Vercel и выполни Redeploy.',
    private_library: 'Steam скрывает список игр. В настройках приватности профиля открой «Доступ к игровой информации».',
    invalid_key: 'Steam отклонил ключ. Проверь STEAM_API_KEY в настройках проекта на Vercel.',
    steam_unavailable: 'Steam временно недоступен. Последние полученные данные сохраняются на экране до следующей успешной синхронизации.'
  };
  $('steamOwnerStatus').textContent = statuses[reason] || 'Подключено. Библиотека и часы обновляются автоматически при открытии страницы.';
}

async function loadGames() {
  if (pending) return;
  pending = true; $('gamesRefresh').disabled = true; $('gamesRefresh').textContent = 'Обновляю…';
  $('gamesPanelBody').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('/api/steam', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok || !data.connected) throw new Error(messages[data.reason] ? data.reason : 'steam_unavailable');
    if (!Array.isArray(data.games) || !data.games.every(game => Number.isSafeInteger(game.appid) && game.appid > 0 && typeof game.name === 'string')) throw new Error('steam_unavailable');
    library = data;
    controls().forEach(control => { control.disabled = false; });
    $('gamesCount').textContent = `${data.games.length} games`;
    $('gamesTotal').textContent = String(data.games.length);
    $('gamesHours').textContent = data.total_minutes === null ? '—' : formatHours(data.total_minutes);
    $('steamProfileName').textContent = data.profile?.name || 'bleed4gucci';
    $('gamesSyncStatus').textContent = 'Обновлено ' + new Date(data.synced_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    setOwnerStatus(); renderGames();
  } catch (error) {
    const reason = messages[error.message] ? error.message : 'steam_unavailable';
    setOwnerStatus(reason);
    if (library) $('gamesSyncStatus').textContent = 'Steam не ответил · показана последняя загруженная библиотека';
    else {
      $('gamesCount').textContent = 'Steam';
      $('gamesSyncStatus').textContent = reason === 'not_configured' ? 'Ожидает подключения' : 'Нет связи со Steam';
      showMessage(...messages[reason]);
    }
  } finally {
    pending = false; $('gamesRefresh').disabled = false; $('gamesRefresh').textContent = '↻ Обновить';
    $('gamesPanelBody').setAttribute('aria-busy', 'false');
  }
}

function resetView() { visibleCount = PAGE_SIZE; renderGames(); }
$('gamesSearch').addEventListener('input', resetView);
$('gamesSort').addEventListener('change', resetView);
document.querySelectorAll('[data-games-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.gamesFilter;
  document.querySelectorAll('[data-games-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  resetView();
}));
$('gamesMore').addEventListener('click', () => { visibleCount += PAGE_SIZE; renderGames(); });
$('gamesRefresh').addEventListener('click', loadGames);
loadGames();
setInterval(() => { if (!document.hidden) loadGames(); }, 300000);
