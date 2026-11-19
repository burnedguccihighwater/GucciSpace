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
  async function getMedia(id){const db=await openDB();return new Promise((res,rej)=>{const req=db.transaction('media').objectStore('media').get(id);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
  async function renderAvatar(){if(avatarURL){URL.revokeObjectURL(avatarURL);avatarURL=null;}const rec=await getMedia('avatar').catch(()=>null);const el=$('avatarDisplay');el.replaceChildren();if(rec?.blob){avatarURL=URL.createObjectURL(rec.blob);const img=document.createElement('img');img.src=avatarURL;img.alt='Фото профиля';el.append(img);}else if (telegramData?.connected && (telegramData.avatar==='/api/telegram-avatar' || /^assets\/telegram\/[a-zA-Z0-9_.-]+$/.test(telegramData.avatar || ''))) { const img=document.createElement('img');img.src=telegramData.avatar+'?v='+encodeURIComponent(telegramData.synced_at||'');img.alt='Аватар профиля';el.append(img); }else{const img=document.createElement('img');img.src='assets/profile-avatar.jpg';img.alt='Фото профиля';el.append(img);}}
  function validAudio(src){return typeof src==='string' && (/^\/api\/telegram-media\?kind=audio&id=[a-f0-9]{32}$/.test(src)||/^assets\/telegram\/[a-zA-Z0-9_.-]+\.(mp3|ogg|m4a|aac|wav)$/i.test(src));}
  function validCover(src){return typeof src==='string' && /^\/api\/telegram-media\?kind=cover&id=[a-f0-9]{32}$/.test(src);}
  let currentTrack=null,playlist=[];
  const timeLabel=s=>Number.isFinite(s)&&s>=0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
  function syncPlayer(){
    const a=$('trackAudio'),active=!!currentTrack,playing=active&&!a.paused&&!a.ended;
    document.querySelector('.music-sidebar')?.classList.toggle('is-playing',playing);
    $('musicPlayer').hidden=!active;
    const mini=$('sidebarPlay');if(mini){mini.disabled=!active&&!playlist.some(t=>validAudio(t.src));mini.textContent=playing?'Ⅱ':'▶';mini.setAttribute('aria-label',playing?'Пауза':'Воспроизвести');}
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
    if($('sidebarTrackCount'))$('sidebarTrackCount').textContent=playlist.length+' tracks';
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
      renderBio();renderTracks();await renderAvatar();
    } catch (_) {
      telegramData=null;
      $('musicHint').textContent='Синхронизация треков появится после подключения';
      renderBio();renderTracks();await renderAvatar();
    }
  }

  function initMusicTab(){
    const panel=$('music'),tab=$('musicTab');if(!panel||!tab)return;
    const siblings=Array.from(panel.parentElement.children).filter(el=>el!==panel);
    function route(hash){
      const music=hash==='#music';
      panel.hidden=!music;siblings.forEach(el=>{el.hidden=music;});
      if(music)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
      document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active',!music&&(a.getAttribute('href')===(hash==='#top'||!hash?'#profile':hash))));
    }
    document.addEventListener('click',e=>{
      const a=e.target.closest('a[href^="#"]');if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const hash=a.getAttribute('href');if(hash==='#music'||!panel.hidden)route(hash);
    });
    window.addEventListener('hashchange',()=>route(location.hash));
    $('sidebarPlay')?.addEventListener('click',()=>playTrack(currentTrack||playlist.find(t=>validAudio(t.src))));
    route(location.hash);
  }
  async function init(){initPlayer();initMusicTab();renderProfile();$('year').textContent=new Date().getFullYear();
    document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
    renderAvatar().catch(console.error);await loadTelegram();setInterval(loadTelegram,180000);
  }
  init();
})();
