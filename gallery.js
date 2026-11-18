const $ = id => document.getElementById(id);
const MAX_BYTES = 3 * 1024 * 1024;
let owner = false, enabled = false, busy = false, loading = false;
let photos = [], drafts = [], rendered = '', dbPromise, revision = 0;

function message(text, error = false) {
  $('galleryFeedback').textContent = text;
  $('galleryFeedback').classList.toggle('gallery-error', error);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(45000), ...options
  });
  if (response.status === 401) {
    owner = false;
    render();
    throw new Error('Сессия закончилась. Войди через Steam и повтори загрузку.');
  }
  if (!response.ok) {
    const code = (await response.json().catch(() => ({}))).error;
    throw new Error(code === 'image_too_large' ? 'Фотография слишком большая.' :
      code === 'invalid_image' ? 'Не удалось прочитать изображение. Выбери JPEG, PNG или WebP.' :
      'Не удалось связаться с галереей. Попробуй ещё раз чуть позже.');
  }
  return response.status === 204 ? null : response.json();
}

function render() {
  $('galleryLogin').hidden = owner || !enabled;
  $('galleryAdd').hidden = !owner;
  $('galleryEmptyAdd').hidden = !owner;
  $('galleryOwner').hidden = !owner;
  $('galleryDrafts').hidden = !owner || !drafts.length;
  $('galleryDraftCount').textContent = `На этом устройстве есть локальные фото: ${drafts.length}. Их можно опубликовать для всех.`;
  for (const id of ['galleryAdd', 'galleryEmptyAdd', 'galleryPublishDrafts', 'galleryLogout']) $(id).disabled = busy;
  $('galleryEmpty').hidden = photos.length > 0;
  const signature = JSON.stringify([owner, busy, photos.map(p => [p.id, p.src])]);
  if (signature === rendered) return;
  rendered = signature;
  $('galleryGrid').replaceChildren(...photos.map((photo, index) => {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const link = document.createElement('a');
    link.href = photo.src;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Открыть фотографию Gucci ${index + 1}`);
    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = `Фотография Gucci ${index + 1}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    link.append(img);
    item.append(link);
    if (owner) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'gallery-remove';
      remove.textContent = '×';
      remove.title = 'Удалить фотографию';
      remove.setAttribute('aria-label', `Удалить фотографию ${index + 1}`);
      remove.disabled = busy;
      remove.addEventListener('click', () => removePhoto(photo.id));
      item.append(remove);
    }
    return item;
  }));
}

async function refresh() {
  if (loading || busy) return;
  loading = true;
  const version = revision;
  try {
    const data = await request(`/api/gallery${owner ? '?owner=1' : ''}`);
    if (busy || version !== revision) return;
    photos = data.photos;
    render();
    if ($('galleryFeedback').classList.contains('gallery-error')) message('');
  } catch (error) { message(error.message, true); }
  finally { loading = false; }
}

function localDB() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open('gucci-space-media-v1', 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('media')) open.result.createObjectStore('media', { keyPath: 'id' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('local_storage_unavailable'));
  });
  return dbPromise;
}

async function findDrafts() {
  if (!owner) return;
  try {
    const db = await localDB();
    const rows = await new Promise((resolve, reject) => {
      const read = db.transaction('media').objectStore('media').getAll();
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    drafts = rows.filter(row => row.id !== 'avatar' && row.blob instanceof Blob && !row.publishedId);
    render();
  } catch { /* Local drafts are optional; public photos do not depend on IndexedDB. */ }
}

async function markPublished(id, publishedId) {
  const db = await localDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('media', 'readwrite'), store = tx.objectStore('media');
    const read = store.get(id);
    read.onsuccess = () => { if (read.result) store.put({ ...read.result, publishedId }); };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function prepareImage(file) {
  if (!file.size || file.size > 30 * 1024 * 1024) throw new Error('Выбери фотографию размером до 30 МБ.');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) {
      throw new Error('Фотография слишком большая. Сохрани её в меньшем размере.');
    }
    const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не удалось обработать фотографию в этом браузере.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.8, 0.68, 0.5]) {
        const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (jpeg && jpeg.size <= MAX_BYTES) return jpeg;
      }
      throw new Error('Не удалось уменьшить фото. Сохрани его в меньшем размере.');
    } finally { canvas.width = canvas.height = 1; }
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('Браузер не открыл фото. Для HEIC попробуй Safari на iPhone или сохрани фото как JPEG.');
    throw error;
  } finally { image.src = ''; URL.revokeObjectURL(url); }
}

async function publish(items) {
  if (!owner || busy || !items.length) return;
  revision++;
  busy = true;
  render();
  let added = 0;
  const failed = [];
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      message(`Публикую фото ${i + 1} из ${items.length}…`);
      try {
        const body = await prepareImage(item.blob);
        const data = await request('/api/gallery', {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body
        });
        photos = [data.photo, ...photos];
        added++;
        if (item.id) {
          // Keep the local original as a backup, but do not offer it for import twice.
          drafts = drafts.filter(d => d.id !== item.id);
          await markPublished(item.id, data.photo.id).catch(() => {});
        }
      } catch (error) {
        failed.push(`${item.name || 'Фото'}: ${error.message}`);
        if (!owner) break;
      }
      render();
    }
    message(failed.length ? `Опубликовано: ${added}. ${failed.join(' ')}` :
      `Опубликовано фото: ${added}. Теперь их видят все ♡`, failed.length > 0);
  } finally {
    busy = false;
    render();
  }
}

async function removePhoto(id) {
  if (!owner || busy || !confirm('Удалить фотографию с сайта для всех посетителей?')) return;
  revision++;
  busy = true;
  render();
  try {
    await request(`/api/gallery?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    photos = photos.filter(photo => photo.id !== id);
    message('Фотография удалена с сайта.');
  } catch (error) { message(error.message, true); }
  finally { busy = false; render(); }
}

$('galleryAdd').addEventListener('click', () => $('galleryInput').click());
$('galleryEmptyAdd').addEventListener('click', () => $('galleryInput').click());
$('galleryInput').addEventListener('change', async event => {
  const items = [...event.target.files].map(file => ({ blob: file, name: file.name }));
  event.target.value = '';
  await publish(items);
});
$('galleryPublishDrafts').addEventListener('click', () => publish([...drafts]));
$('galleryLogout').addEventListener('click', async () => {
  if (busy) return;
  try {
    await request('/api/gallery-auth?action=logout', { method: 'POST' });
    owner = false;
    drafts = [];
    render();
    message('Ты вышел из управления фотографиями.');
  } catch (error) { message(error.message, true); }
});
window.addEventListener('gucci:gallery-drafts', findDrafts);
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden) { await loadOwner(); await refresh(); }
});

async function loadOwner() {
  try {
    const state = await request('/api/gallery-auth');
    owner = state.owner === true;
    enabled = state.enabled === true;
    render();
    await findDrafts();
  } catch { /* Published photos remain readable if the owner session check fails. */ }
}

render();
await Promise.all([loadOwner(), refresh()]);
if (new URL(location.href).searchParams.get('gallery') === 'login-failed') {
  message('Войти может только владелец — Steam bleed4gucci. Если это ты, попробуй войти ещё раз.', true);
  const clean = new URL(location.href);
  clean.searchParams.delete('gallery');
  history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
}
setInterval(() => { if (!document.hidden) refresh(); }, 30000);
