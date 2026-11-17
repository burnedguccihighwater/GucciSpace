(() => {
  'use strict';
  const key = 'gucci-space-profile-v1';
  const defaultProfile = {
    name: 'gucci', status: 'lost in the stars...',
    mood: 'dreaming', location: 'internet', music: 'my playlist',
    bio: 'Это моё маленькое место в интернете. Здесь будет всё, что мне нравится: музыка, фотографии, мысли и немного космоса. ♡',
    interests: 'music, design, night skies, 2000s'
  };
  const $ = (id) => document.getElementById(id);
  const safeProfile = (obj = {}) => Object.fromEntries(Object.entries(defaultProfile).map(([k,v]) => [k, typeof obj[k] === 'string' ? obj[k] : v]));
  let profile;
  try { profile = safeProfile(JSON.parse(localStorage.getItem(key) || 'null') || {}); } catch { profile = {...defaultProfile}; }
  let dbPromise;
  let avatarURL = null;
  let galleryURLs = [];
  let toastTimer;
  function toast(message) { const el=$('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3200); }
  let telegramData = null;
  let useTelegramBio = false;
  try { useTelegramBio = localStorage.getItem('gucci-space-use-tg-bio') === 'true'; } catch {}
  function renderBio(){ $('displayBio').textContent=(useTelegramBio && telegramData?.bio) ? String(telegramData.bio).slice(0,1800) : (profile.bio || 'Напиши что-нибудь о себе ♡'); }
  function renderProfile() {
    const nameEl=$('displayName'); const heart=document.createElement('span'); heart.textContent='♡'; nameEl.replaceChildren(document.createTextNode((profile.name || 'gucci')+' '),heart);
    $('heroTitle').textContent=(profile.name || 'gucci').toUpperCase();
    $('footerName').textContent=(profile.name || 'gucci').toUpperCase();
    $('displayStatus').textContent=profile.status || '...';
    $('displayMood').textContent=profile.mood || '—';
    $('displayLocation').textContent=profile.location || '—';
    $('displayMusic').textContent=profile.music || '—';
    $('featuredTrack').textContent=profile.music || 'no tracks yet';
    renderBio();
    $('interestTags').replaceChildren(...profile.interests.split(',').map(i=>i.trim()).filter(Boolean).slice(0,25).map(tag=>{let s=document.createElement('span');s.textContent=tag;return s;}));
    document.title=`${profile.name || 'Gucci'}'s Space ☆`;
  }
  function openDB() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req=indexedDB.open('gucci-space-media-v1',1);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    return dbPromise;
  }
  async function putMedia(item){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put(item);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function getMedia(id){const db=await openDB();return new Promise((res,rej)=>{const req=db.transaction('media').objectStore('media').get(id);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
  async function allMedia(){const db=await openDB();return new Promise((res,rej)=>{const req=db.transaction('media').objectStore('media').getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
  async function deleteMedia(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function clearMedia(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function renderAvatar(){if(avatarURL){URL.revokeObjectURL(avatarURL);avatarURL=null;}const rec=await getMedia('avatar');const el=$('avatarDisplay');el.replaceChildren();if(rec?.blob){avatarURL=URL.createObjectURL(rec.blob);const img=document.createElement('img');img.src=avatarURL;img.alt='Фото профиля';el.append(img);}else if (telegramData?.connected && (telegramData.avatar==='/api/telegram-avatar' || /^assets\/telegram\/[a-zA-Z0-9_.-]+$/.test(telegramData.avatar || ''))) { const img=document.createElement('img');img.src=telegramData.avatar+'?v='+encodeURIComponent(telegramData.synced_at||'');img.alt='Аватар профиля';el.append(img); }else{const img=document.createElement('img');img.src='assets/profile-avatar.jpg';img.alt='Фото профиля';el.append(img);}}
  async function renderGallery(){galleryURLs.forEach(u=>URL.revokeObjectURL(u));galleryURLs=[];const recs=(await allMedia()).filter(o=>o.id!=='avatar').sort((a,b)=>b.created-a.created);$('galleryEmpty').hidden=recs.length>0;$('galleryGrid').replaceChildren(...recs.map(rec=>{
    const article=document.createElement('div');article.className='gallery-item';const img=document.createElement('img');const url=URL.createObjectURL(rec.blob);galleryURLs.push(url);img.src=url;img.alt=rec.name||'Изображение из галереи';img.loading='lazy';const button=document.createElement('button');button.className='gallery-remove';button.type='button';button.textContent='×';button.title='Удалить фотографию';button.setAttribute('aria-label',`Удалить ${rec.name||'фото'}`);button.addEventListener('click',async()=>{if(confirm('Удалить это изображение из галереи?')){await deleteMedia(rec.id);await renderGallery();toast('Изображение удалено');}});article.append(img,button);return article;
  }));}
  function showEditor(){$('syncBioToggle').checked=useTelegramBio;Object.keys(defaultProfile).forEach(k=>{const field=$('edit'+k[0].toUpperCase()+k.slice(1));if(field)field.value=profile[k]||'';});$('editFeedback').textContent='';$('editorBackdrop').hidden=false;document.body.style.overflow='hidden';$('editName').focus();}
  function hideEditor(){$('editorBackdrop').hidden=true;document.body.style.overflow='';}
  async function addImages(files){const arr=[...files].filter(f=>f.type.startsWith('image/'));let added=0;for(const file of arr){try{await putMedia({id:`photo-${Date.now()}-${crypto.randomUUID()}`,name:file.name,created:Date.now()+added,blob:file});added++;}catch(e){console.error(e);toast('Не удалось сохранить часть изображений. Возможно, закончилось место.');break;}}await renderGallery();if(added)toast(`Добавлено фотографий: ${added}`);}
  async function mediaToDataURL(blob){return await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(blob);});}
  function dataURLToBlob(data){const [meta,body]=data.split(',');if(!meta||!body||!/^data:image\//.test(meta))throw Error('Invalid image');const type=meta.match(/^data:([^;]+)/)?.[1]||'image/png';const bin=atob(body);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type});}
  async function exportBackup(){try{const rows=await allMedia();const media=[];for(const rec of rows){media.push({id:rec.id,name:rec.name||'',created:rec.created||0,data:await mediaToDataURL(rec.blob)});}const data=JSON.stringify({version:1,profile,media},null,2);const blob=new Blob([data],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='my-space-backup.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('editFeedback').textContent='Резервная копия скачана ♡';}catch(e){console.error(e);$('editFeedback').textContent='Не удалось создать копию.';}}
  async function importBackup(file){try{if(file.size>80*1024*1024)throw Error('Too big');const data=JSON.parse(await file.text());if(data?.version!==1||!data.profile||!Array.isArray(data.media))throw Error('Invalid backup');const restored=safeProfile(data.profile);const rows=data.media.map(rec=>({id:rec.id,name:String(rec.name||''),created:Number(rec.created)||Date.now(),blob:dataURLToBlob(rec.data)}));await clearMedia();for(const rec of rows)await putMedia(rec);profile=restored;localStorage.setItem(key,JSON.stringify(profile));renderProfile();renderTracks();await Promise.all([renderGallery(),renderAvatar()]);hideEditor();toast('Страничка восстановлена из копии ♡');}catch(e){console.error(e);$('editFeedback').textContent='Не удалось открыть копию. Проверь файл JSON.';}}

  function validAudio(src){return typeof src==='string' && (/^\/api\/telegram-media\?kind=audio&id=[a-f0-9]{32}$/.test(src)||/^assets\/telegram\/[a-zA-Z0-9_.-]+\.(mp3|ogg|m4a|aac|wav)$/i.test(src));}
  function validCover(src){return typeof src==='string' && /^\/api\/telegram-media\?kind=cover&id=[a-f0-9]{32}$/.test(src);}
  let currentTrack=null,playlist=[];
  const timeLabel=s=>Number.isFinite(s)&&s>=0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
  function syncPlayer(){
    const a=$('trackAudio'),active=!!currentTrack,playing=active&&!a.paused;
    $('musicPlayer').hidden=!active;
    $('playerToggle').textContent=playing?'Ⅱ':'▶';$('playerToggle').setAttribute('aria-label',playing?'Пауза':'Воспроизвести');
    $('playerNowTitle').textContent=currentTrack?.title||'';
    $('playerNowArtist').textContent=currentTrack?.artist||'';
    $('playerElapsed').textContent=timeLabel(a.currentTime);$('playerTotal').textContent=timeLabel(Number.isFinite(a.duration)?a.duration:Number(currentTrack?.duration)||0);
    $('playerSeek').value=Number.isFinite(a.duration)&&a.duration>0?String(Math.round(a.currentTime/a.duration*1000)):'0';
    $('playerSeek').disabled=!Number.isFinite(a.duration)||a.duration<=0;
    if(active)$('featuredTrack').textContent=currentTrack.title||'Unknown track';
    document.querySelectorAll('.track-play[data-src]').forEach(b=>{const selected=b.dataset.src===currentTrack?.src;b.textContent=selected&&playing?'Ⅱ':'▶';b.setAttribute('aria-label',selected&&playing?'Пауза':'Воспроизвести');b.closest('.track-row')?.classList.toggle('track-active',selected);});
  }
  function playTrack(t){if(!t||!validAudio(t.src))return;const a=$('trackAudio');
    if(currentTrack?.src===t.src){if(a.paused)a.play().catch(()=>toast('Не удалось воспроизвести трек'));else a.pause();return;}
    currentTrack=t;a.src=t.src;syncPlayer();a.play().catch(()=>toast('Не удалось воспроизвести трек'));
  }
  function moveTrack(dir){const available=playlist.filter(t=>validAudio(t.src));if(!available.length)return;const i=available.findIndex(t=>t.src===currentTrack?.src);const n=i<0?0:i+dir;if(n>=0&&n<available.length)playTrack(available[n]);}
  function renderTracks(){
    const list=$('tracksList');playlist=telegramData?.connected&&Array.isArray(telegramData.tracks)?telegramData.tracks.slice(0,15):[];
    $('trackCount').textContent=playlist.length+' tracks';
    $('featuredTrack').textContent=currentTrack?.title||playlist[0]?.title||profile.music||'no tracks yet';
    $('displayMusic').textContent=playlist[0]?.title||profile.music||'—';
    list.replaceChildren();
    if(!playlist.length){const empty=document.createElement('div');empty.className='music-empty';empty.textContent='✧ Треки появятся после подключения синхронизации с профилем Telegram.';list.append(empty);syncPlayer();return;}
    for(const track of playlist){
      const row=document.createElement('div');row.className='track-row';
      const art=document.createElement('div');art.className='track-cover';art.textContent='♫';
      if(validCover(track.cover)){const img=document.createElement('img');img.src=track.cover;img.alt='';img.loading='lazy';img.addEventListener('error',()=>img.remove());art.append(img);}
      const info=document.createElement('div');info.className='track-info';const title=document.createElement('strong');title.textContent=String(track.title||'Unknown track').slice(0,120);const artist=document.createElement('small');artist.textContent=String(track.artist||'Unknown artist').slice(0,120);info.append(title,artist);row.append(art,info);
      const duration=document.createElement('span');duration.className='track-duration';duration.textContent=timeLabel(Number(track.duration)||0);row.append(duration);
      const play=document.createElement('button');play.type='button';play.className='track-play';play.textContent='▶';play.disabled=!validAudio(track.src);play.title=play.disabled?'Аудиофайл недоступен':'Воспроизвести '+title.textContent;play.setAttribute('aria-label',play.title);
      if(!play.disabled){play.dataset.src=track.src;play.addEventListener('click',()=>playTrack(track));}row.append(play);list.append(row);
    }syncPlayer();
  }
  function initPlayer(){const a=$('trackAudio');for(const event of ['play','pause','timeupdate','durationchange','loadedmetadata'])a.addEventListener(event,syncPlayer);a.addEventListener('ended',()=>{syncPlayer();moveTrack(1);});a.addEventListener('error',()=>{syncPlayer();toast('Этот аудиофайл не удалось загрузить');});$('playerToggle').addEventListener('click',()=>playTrack(currentTrack));$('playerPrev').addEventListener('click',()=>moveTrack(-1));$('playerNext').addEventListener('click',()=>moveTrack(1));$('playerSeek').addEventListener('input',()=>{if(Number.isFinite(a.duration))a.currentTime=Number($('playerSeek').value)*a.duration/1000;});}
  async function loadTelegram() {
    try {
      let json;
      for (const url of ['/api/telegram','telegram-data.json']) {
        try {
          const response=await fetch(url+'?ts='+Date.now(),{cache:'no-store'});
          if(!response.ok) continue;
          const candidate=await response.json();
          if(candidate?.connected===true && Array.isArray(candidate.tracks)){json=candidate;break;}
        } catch (_) {}
      }
      if(!json || json.connected!==true || !Array.isArray(json.tracks)) throw new Error('Invalid data');
      telegramData=json;
      $('musicHint').textContent='✦ Telegram profile music · обновляется автоматически';
      $('syncStatus').textContent='Подключено · последняя синхронизация: '+(json.synced_at ? new Date(json.synced_at).toLocaleString('ru-RU'):'нет данных')+'. Треков: '+json.tracks.length+'.';
      renderBio();renderTracks();await renderAvatar();
    } catch (_) {
      telegramData=null;
      $('musicHint').textContent='Синхронизация треков появится после подключения';
      $('syncStatus').textContent='Не подключено. Для синхронизации нужен серверный модуль Telegram.';
      renderBio();renderTracks();await renderAvatar();
    }
  }

  async function init(){initPlayer();renderProfile();$('year').textContent=new Date().getFullYear();
    $('editOpen').addEventListener('click',showEditor);$('editClose').addEventListener('click',hideEditor);$('editorBackdrop').addEventListener('click',e=>{if(e.target===$('editorBackdrop'))hideEditor();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('editorBackdrop').hidden)hideEditor();});
    $('editForm').addEventListener('submit',e=>{e.preventDefault();const next={};for(const field of Object.keys(defaultProfile)){const input=$('edit'+field[0].toUpperCase()+field.slice(1));next[field]=(input?.value||'').trim();}profile=next;useTelegramBio=$('syncBioToggle').checked;localStorage.setItem('gucci-space-use-tg-bio',String(useTelegramBio));localStorage.setItem(key,JSON.stringify(profile));renderProfile();renderTracks();hideEditor();toast('Изменения сохранены ♡');});
    $('galleryAdd').addEventListener('click',()=>$('galleryInput').click());$('galleryEmptyAdd').addEventListener('click',()=>$('galleryInput').click());$('galleryInput').addEventListener('change',async e=>{await addImages(e.target.files);e.target.value='';});
    $('avatarInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file||!file.type.startsWith('image/'))return;try{await putMedia({id:'avatar',name:file.name,created:Date.now(),blob:file});await renderAvatar();$('editFeedback').textContent='Фото профиля сохранено ♡';}catch(err){console.error(err);$('editFeedback').textContent='Не удалось сохранить фото.';}e.target.value='';});
    $('removeAvatar').addEventListener('click',async()=>{await deleteMedia('avatar');await renderAvatar();$('editFeedback').textContent='Фото профиля удалено.';});
    $('exportBackup').addEventListener('click',exportBackup);$('importBackup').addEventListener('change',async e=>{const file=e.target.files?.[0];if(file)await importBackup(file);e.target.value='';});
    document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
    try{await Promise.all([renderGallery(),renderAvatar()]);await loadTelegram();setInterval(loadTelegram,180000);}catch(e){console.error(e);toast('Браузер не разрешил локальное хранение изображений.');}
  }
  init();
})();
