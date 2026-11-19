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
    if(active){$('featuredTrack').textContent=currentTrack.title||'Unknown track';$('displayMusic').textContent=currentTrack.title||'Unknown track';}
    document.querySelectorAll('.track-play[data-src]').forEach(b=>{const selected=b.dataset.src===currentTrack?.src;b.textContent=selected&&playing?'Ⅱ':'▶';b.setAttribute('aria-label',selected&&playing?'Пауза':'Воспроизвести');b.closest('.track-row')?.classList.toggle('track-active',selected);});
  }
  // Real octave / logarithmic spectrum, with separate peak histories for both displays.
  let audioContext=null,analyser=null,visualFrame=0,frequencyData=null,mediaSource=null;
  let spectrumMode=10,visualLast=0;
  const monitors=new Map();
  const octaveCenters=[31.5,63,125,250,500,1000,2000,4000,8000,16000];
  const octaveLabels=['31','62','125','250','500','1K','2K','4K','8K','16K'];
  function bandBounds(count){
    if(count===10)return octaveCenters.map(f=>[f/Math.SQRT2,f*Math.SQRT2]);
    return Array.from({length:count},(_,i)=>[25*Math.pow(20000/25,i/count),25*Math.pow(20000/25,(i+1)/count)]);
  }
  function bandLevels(count,live){
    if(!live)return Array(count).fill(0);
    const binHz=audioContext.sampleRate/analyser.fftSize;
    return bandBounds(count).map(([low,high])=>{
      const from=Math.max(1,Math.min(frequencyData.length-1,Math.ceil(low/binHz)));
      const to=Math.max(from,Math.min(frequencyData.length-1,Math.floor(high/binHz)));
      let power=0;
      for(let i=from;i<=to;i++){const db=frequencyData[i];if(Number.isFinite(db))power+=Math.pow(10,db/10);}
      const db=10*Math.log10(Math.max(1e-12,power/(to-from+1)));
      return Math.max(0,Math.min(1,(db+88)/68));
    });
  }
  function drawRadio(canvas,live,dt){
    if(!canvas||!canvas.getClientRects().length)return;
    const rect=canvas.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const g=canvas.getContext('2d');if(!g)return;
    g.clearRect(0,0,w,h);
    const mini=canvas.id==='sidebarWave',count=mini?18:spectrumMode,segments=mini?7:20;
    let memory=monitors.get(canvas.id);
    if(!memory||memory.count!==count){memory={count,levels:Array(count).fill(0),peaks:Array(count).fill(0),hold:Array(count).fill(0)};monitors.set(canvas.id,memory);}
    const levels=bandLevels(count,live);
    const pad=mini?3*dpr:Math.min(13*dpr,w*.055),top=mini?3*dpr:10*dpr;
    const bottom=mini?h-3*dpr:h*.74,step=(w-2*pad)/count,barWidth=Math.max(1,step*(count===10?.64:.72));
    const pitch=Math.max(1,(bottom-top)/segments),gap=Math.min(pitch*.29,mini?1*dpr:2*dpr),segHeight=Math.max(.6,pitch-gap);
    const colors=['#46e969','#62fa72','#87ff8a','#bcffd0','#e4ffe2'];
    for(let i=0;i<count;i++){
      const target=levels[i],previous=memory.levels[i];
      const level=live?previous+(target-previous)*(1-Math.exp(-dt*(target>previous?24:8))):0;
      memory.levels[i]=level;
      if(!live){memory.peaks[i]=0;memory.hold[i]=0;}
      else if(level>=memory.peaks[i]){memory.peaks[i]=level;memory.hold[i]=.40;}
      else if(memory.hold[i]>0)memory.hold[i]-=dt;
      else memory.peaks[i]=Math.max(level,memory.peaks[i]-dt*.57);
      const x=pad+i*step+(step-barWidth)/2,active=Math.round(level*segments);
      for(let j=0;j<segments;j++){
        const y=bottom-(j+1)*pitch;
        g.fillStyle='#10271b';g.fillRect(x,y,barWidth,segHeight);
        if(j>=active)continue;
        const color=colors[Math.min(4,Math.floor(j/segments*5))];
        g.fillStyle=color;g.shadowColor='#35ff6c';g.shadowBlur=mini?1.6*dpr:3*dpr;g.fillRect(x,y,barWidth,segHeight);g.shadowBlur=0;
        if(!mini){g.fillStyle='#ecffe7';g.globalAlpha=.24;g.fillRect(x,y,barWidth,Math.max(.6,segHeight*.18));g.globalAlpha=1;
          const reflectedY=bottom+3*dpr+j*pitch*.26;
          if(reflectedY<h-12*dpr){g.globalAlpha=.17*(1-j/segments);g.fillStyle=color;g.fillRect(x,reflectedY,barWidth,Math.max(.5,segHeight*.26));g.globalAlpha=1;}
        }
      }
      if(live&&memory.peaks[i]>.025){
        const peak=Math.min(segments-1,Math.max(0,Math.ceil(memory.peaks[i]*segments)-1));
        const y=bottom-(peak+1)*pitch;g.fillStyle='#d9ffe1';g.shadowColor='#a1ff9e';g.shadowBlur=3*dpr;g.fillRect(x,y,barWidth,Math.max(1,segHeight*.38));g.shadowBlur=0;
      }
    }
    if(!mini){g.fillStyle='#9ecbab';g.font=Math.min(10*dpr,step*.43)+'px monospace';g.textAlign='center';g.textBaseline='bottom';
      if(count===10)octaveLabels.forEach((label,i)=>g.fillText(label,pad+(i+.5)*step,h-3*dpr));
      else ['31','125','500','2K','8K','16K'].forEach((label,i)=>{const f=[31,125,500,2000,8000,16000][i];g.fillText(label,pad+Math.log(f/25)/Math.log(20000/25)*(w-2*pad),h-3*dpr);});
    }
  }
  function updateVisualizer(){
    if(visualFrame)cancelAnimationFrame(visualFrame);visualFrame=0;
    const now=performance.now(),dt=Math.max(.008,Math.min(.1,(now-visualLast)/1000||.016));visualLast=now;
    const audio=$('trackAudio'),playing=!audio.paused&&!audio.ended&&!document.hidden;
    const live=playing&&!!analyser&&audioContext?.state==='running';
    if(live)analyser.getFloatFrequencyData(frequencyData);
    for(const id of ['radioWave','sidebarWave'])drawRadio($(id),live,dt);
    const status=$('radioVisualStatus'),label=live?'LIVE SPECTRUM':playing?'CONNECTING':'STANDBY';
    if(status&&status.textContent!==label)status.textContent=label;
    if(playing)visualFrame=requestAnimationFrame(updateVisualizer);
  }
  function activateVisualizer(){
    const audio=$('trackAudio'),Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx){updateVisualizer();return;}
    try{
      if(!audioContext){
        audioContext=new Ctx();analyser=audioContext.createAnalyser();
        analyser.fftSize=4096;analyser.smoothingTimeConstant=.66;analyser.minDecibels=-100;analyser.maxDecibels=-20;
        frequencyData=new Float32Array(analyser.frequencyBinCount);
        mediaSource=audioContext.createMediaElementSource(audio);
        mediaSource.connect(audioContext.destination);mediaSource.connect(analyser);
        audioContext.addEventListener('statechange',updateVisualizer);
      }
      if(audioContext.state!=='running'&&audioContext.state!=='closed')audioContext.resume().then(updateVisualizer).catch(updateVisualizer);
    }catch(err){console.warn('Radio visualizer:',err?.message||err);}
    updateVisualizer();
  }
  $('radioSpectrumMode')?.addEventListener('click',()=>{
    spectrumMode=spectrumMode===10?32:10;
    $('radioSpectrumMode').textContent=spectrumMode+' BAND';$('radioSpectrumMode').setAttribute('aria-pressed',String(spectrumMode===32));updateVisualizer();
  });
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
    $('displayMusic').textContent=currentTrack?.title||playlist[0]?.title||profile.music||'—';
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
  function initPlayer(){const a=$('trackAudio');for(const event of ['play','pause','timeupdate','durationchange','loadedmetadata'])a.addEventListener(event,syncPlayer);for(const event of ['play','playing','pause','ended','emptied','error'])a.addEventListener(event,updateVisualizer);a.addEventListener('ended',()=>{syncPlayer();moveTrack(1);});a.addEventListener('error',()=>{syncPlayer();toast('Этот аудиофайл не удалось загрузить');});$('playerToggle').addEventListener('click',()=>playTrack(currentTrack));$('playerPrev').addEventListener('click',()=>moveTrack(-1));$('playerNext').addEventListener('click',()=>moveTrack(1));$('playerSeek').addEventListener('input',()=>{if(Number.isFinite(a.duration))a.currentTime=Number($('playerSeek').value)*a.duration/1000;});}
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
      if(telegramData?.connected){$('musicHint').textContent='✦ Последняя библиотека · повторяем синхронизацию';return;}
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
      if(standalone||music)window.scrollTo(0,0);requestAnimationFrame(updateVisualizer);
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
    window.addEventListener('hashchange',updateVisualizer);
    $('trackAudio').addEventListener('playing',activateVisualizer);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('trackAudio').paused)activateVisualizer();else updateVisualizer();});window.addEventListener('resize',updateVisualizer);
  }
  async function init(){initPlayer();initMusicTab();renderProfile();$('year').textContent=new Date().getFullYear();
    document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
    renderAvatar().catch(console.error);await loadTelegram();setInterval(loadTelegram,180000);
  }
  init();
})();
