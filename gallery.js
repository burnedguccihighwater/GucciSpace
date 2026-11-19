const $ = id => document.getElementById(id);
let pending = false, signature = null;
function render(photos) {
  $('galleryEmpty').hidden = photos.length > 0;
  const next = JSON.stringify(photos.map(p => [p.id, p.src]));
  if (next === signature) return;
  const items = photos.map((photo, i) => {
    const item = document.createElement('div'); item.className = 'gallery-item';
    const link = document.createElement('a'); link.href = photo.src; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Открыть фотографию Gucci ' + (i+1));
    const img = document.createElement('img'); img.src = photo.src; img.alt = 'Фотография Gucci ' + (i+1); img.loading = 'lazy'; img.decoding = 'async';
    link.append(img); item.append(link); return item;
  });
  $('galleryGrid').replaceChildren(...items); signature = next;
}
async function refresh() {
  if (pending) return; pending = true;
  try {
    const r = await fetch('/api/gallery', { signal: AbortSignal.timeout(20000) });
    const data = await r.json(); if (!r.ok || !Array.isArray(data.photos)) throw Error('gallery_unavailable');
    render(data.photos.filter(p => typeof p?.src === 'string' && /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/gallery\//i.test(p.src)));
    $('galleryFeedback').textContent = ''; $('galleryFeedback').classList.remove('gallery-error');
  } catch {
    $('galleryFeedback').textContent = 'Фотографии временно недоступны.'; $('galleryFeedback').classList.add('gallery-error');
    if (signature === null) $('galleryEmpty').hidden = true;
  } finally { pending = false; }
}
refresh();
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, 30000);
