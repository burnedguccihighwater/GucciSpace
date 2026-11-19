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
  let currentTrack=null,playlist=[],radioQueue=[],radioHistory=[],historyAt=-1,radioSignature='';
  const timeLabel=s=>Number.isFinite(s)&&s>=0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
  function syncPlayer(){
    const a=$('trackAudio'),active=!!currentTrack,playing=active&&!a.paused&&!a.ended;
    document.querySelector('.music-sidebar')?.classList.toggle('is-playing',playing);
    $('musicPlayer').hidden=!active;const start=$('radioStart');if(start){start.disabled=!active&&!playlist.some(t=>validAudio(t.src));start.textContent=playing?'Ⅱ Pause':'▶ Play Radio';}
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
  let audioContext,analyser,visualFrame=0;
  function activateVisualizer(){
    const canvas=$('radioWave'),audio=$('trackAudio'),Ctx=window.AudioContext||window.webkitAudioContext;
    if(!canvas||!Ctx)return;
    try{
      if(!audioContext){audioContext=new Ctx();analyser=audioContext.createAnalyser();analyser.fftSize=256;const source=audioContext.createMediaElementSource(audio);source.connect(analyser);analyser.connect(audioContext.destination);}
      if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
      if(visualFrame)return;
      const ctx=canvas.getContext('2d'),data=new Uint8Array(analyser.fftSize);
      const draw=()=>{visualFrame=0;if(audio.paused||audio.ended||document.hidden||$('music').hidden)return;
        analyser.getByteTimeDomainData(data);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#66caff';ctx.lineWidth=1.7;ctx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*canvas.width,y=data[i]/255*canvas.height;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();visualFrame=requestAnimationFrame(draw);};
      visualFrame=requestAnimationFrame(draw);
    }catch{}
  }
  function refillQueue(exclude){
    radioQueue=playlist.filter(t=>validAudio(t.src)&&t.src!==exclude).map(t=>t.src);
    for(let i=radioQueue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[radioQueue[i],radioQueue[j]]=[radioQueue[j],radioQueue[i]];}
  }
  function randomTrack(){
    const available=playlist.filter(t=>validAudio(t.src));
    if(!available.length)return null;
    if(!radioQueue.length)refillQueue(currentTrack?.src);
    const src=radioQueue.shift()||available[0].src;
    return available.find(t=>t.src===src)||null;
  }
  function startRadio(){if(currentTrack)playTrack(currentTrack);else{const t=randomTrack();if(t)playTrack(t);}}
  function playTrack(t,fromHistory=false){if(!t||!validAudio(t.src))return;const a=$('trackAudio');
    activateVisualizer();
    if(!fromHistory&&currentTrack?.src!==t.src){radioQueue=radioQueue.filter(s=>s!==t.src);radioHistory=radioHistory.slice(0,historyAt+1);radioHistory.push(t.src);historyAt=radioHistory.length-1;}
    if(currentTrack?.src===t.src){if(a.paused)a.play().catch(()=>toast('Не удалось воспроизвести трек'));else a.pause();return;}
    currentTrack=t;a.src=t.src;syncPlayer();a.play().catch(()=>toast('Не удалось воспроизвести трек'));
  }
  function moveTrack(dir){if(dir<0){if(historyAt>0){const t=playlist.find(x=>x.src===radioHistory[historyAt-1]);if(t){historyAt--;playTrack(t,true);return;}}if(currentTrack)$('trackAudio').currentTime=0;return;}
    if(historyAt+1<radioHistory.length){const t=playlist.find(x=>x.src===radioHistory[historyAt+1]);if(t){historyAt++;playTrack(t,true);return;}}
    const t=randomTrack();if(!t)return;if(t.src===currentTrack?.src){const a=$('trackAudio');a.currentTime=0;a.play().catch(()=>{});}else playTrack(t);
  }
  function renderTracks(){
    const list=$('tracksList');playlist=telegramData?.connected&&Array.isArray(telegramData.tracks)?telegramData.tracks:[];
    const nextSignature=playlist.map(t=>t.src||t.id).join('|');if(nextSignature!==radioSignature){radioSignature=nextSignature;refillQueue(currentTrack?.src);}
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
      const music=hash==='#music',gallery=hash==='#gallery',exit=hash==='#exit-galaxy';
      const standalone=gallery||exit;
      document.body.classList.toggle('exit-mode',exit);
      document.body.classList.toggle('gallery-mode',gallery);
      document.querySelector('.layout').hidden=standalone;
      document.querySelector('.marquee-bar').hidden=standalone;
      $('gallery').hidden=!gallery;$('exitGalaxy').hidden=!exit;
      panel.hidden=!music;siblings.forEach(el=>{el.hidden=music;});
      if(standalone)window.scrollTo(0,0);
      if(music)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');
      document.querySelectorAll('.nav-link').forEach(a=>a.classList.toggle('active',!music&&(a.getAttribute('href')===(hash==='#top'||!hash?'#profile':hash))));
    }
    document.addEventListener('click',e=>{
      const a=e.target.closest('a[href^="#"]');if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      const hash=a.getAttribute('href');if(['#music','#gallery','#exit-galaxy'].includes(hash)||!panel.hidden||document.body.classList.contains('exit-mode')||document.body.classList.contains('gallery-mode'))route(hash);
    });
    window.addEventListener('hashchange',()=>route(location.hash));
    $('sidebarPlay')?.addEventListener('click',startRadio);$('radioStart')?.addEventListener('click',startRadio);
    route(location.hash);
    window.addEventListener('hashchange',()=>{if(!document.getElementById('music').hidden&&!$('trackAudio').paused)activateVisualizer();});
    $('trackAudio').addEventListener('playing',activateVisualizer);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('trackAudio').paused)activateVisualizer();});
  }
  async function init(){initPlayer();initMusicTab();renderProfile();$('year').textContent=new Date().getFullYear();
    document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
    renderAvatar().catch(console.error);await loadTelegram();setInterval(loadTelegram,180000);
  }
  init();
})();
