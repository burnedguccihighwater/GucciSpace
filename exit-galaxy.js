const scene=document.getElementById('exitGalaxy');
const $=id=>document.getElementById(id);
let state='asleep',timers=[],visible=false,ctx=null,master=null,night=null,musicSource=null,filter=null,pan=null,wet=null,raf=0,radioWasPlaying=false;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const music=$('exitMusic'),radio=$('trackAudio');
const later=(fn,ms)=>{const id=setTimeout(fn,reduce.matches?Math.min(ms,100):ms);timers.push(id)};
function setState(next){
 state=next;scene.dataset.state=next;
 for(const [id,show] of [['exitPocket',next==='ready'],['exitPack',next==='pack'||next==='open'],['exitCig',next==='open'],['exitLighter',next==='held'||next==='lighting'],['exitHeld',['held','lighting','smoking','inhaling','exhaling'].includes(next)]])$(id).hidden=!show;
 $('exitLighter').disabled=next==='lighting';$('exitHeld').disabled=next!=='smoking';$('exitHeld').setAttribute('aria-label','Сделать затяжку');
}
function noiseBuffer(seconds,impulse=false){
 const n=Math.floor(ctx.sampleRate*seconds),b=ctx.createBuffer(2,n,ctx.sampleRate);
 for(let c=0;c<2;c++){const d=b.getChannelData(c);let smooth=0;for(let i=0;i<n;i++){const v=Math.random()*2-1;smooth=.98*smooth+.02*v;d[i]=impulse?v*Math.pow(1-i/n,3.2)*.30:smooth;}}
 return b;
}
function buildAudio(){
 if(ctx)return;
 const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
 ctx=new C();master=ctx.createGain();master.gain.value=.8;master.connect(ctx.destination);
 night=ctx.createBufferSource();night.buffer=noiseBuffer(7);night.loop=true;const air=ctx.createBiquadFilter();air.type='lowpass';air.frequency.value=750;const gain=ctx.createGain();gain.gain.value=.14;night.connect(air).connect(gain).connect(master);night.start();
 musicSource=ctx.createMediaElementSource(music);filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1750;filter.Q.value=.45;const distance=ctx.createGain();distance.gain.value=.27;pan=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();if(pan.pan)pan.pan.value=-.18;
 musicSource.connect(filter).connect(distance).connect(pan).connect(master);
 const verb=ctx.createConvolver();verb.buffer=noiseBuffer(1.7,true);wet=ctx.createGain();wet.gain.value=.16;filter.connect(verb).connect(wet).connect(master);
}
function drift(){
 if(!visible||!ctx)return;const t=ctx.currentTime;filter.frequency.setTargetAtTime(1700+220*Math.sin(t*.23),t,.45);if(pan.pan)pan.pan.setTargetAtTime(-.18+.055*Math.sin(t*.29),t,.45);raf=requestAnimationFrame(drift);
}
async function chooseTrack(){
 if(music.getAttribute('src'))return true;
 try{const head=await fetch('/assets/exit-galaxy-track.mp3',{method:'HEAD'});if(head.ok&&/audio\//i.test(head.headers.get('content-type')||'')){music.src='/assets/exit-galaxy-track.mp3';return true;}}catch{}
 try{const r=await fetch('/api/telegram');const d=await r.json();const t=(d.tracks||[]).find(x=>/розовое\s+вино|rozovoe\s+vino/i.test(x.title||'')&&/feduk|федук|eldzhay|элджей/i.test(x.artist||''));if(t?.src&&/^\/api\/telegram-media\?kind=audio&id=[a-f0-9]{32}$/.test(t.src)){music.src=t.src;return true;}}catch{}
 return false;
}
let trackReady=chooseTrack();
const original=new Image();original.onload=()=>scene.querySelector('.exit-world').classList.add('has-original');original.src='assets/exit-galaxy-bg.webp';
async function startSound(){
 try{buildAudio();if(ctx?.state==='suspended')await ctx.resume();if(!visible)return;if(ctx&&!raf)drift();if(await trackReady&&visible&&music.paused)await music.play();}catch{}
}
function enter(){if(!music.getAttribute('src'))trackReady=chooseTrack();timers.forEach(clearTimeout);timers=[];scene.classList.remove('eyes-open','lit','tap-hint');setState('asleep');radioWasPlaying=!radio.paused;if(radioWasPlaying)radio.pause();
 later(()=>{scene.classList.add('eyes-open');setState('waking');later(()=>{setState('ready');startSound()},1450)},500);}
function exit(){timers.forEach(clearTimeout);timers=[];scene.classList.remove('eyes-open','lit','tap-hint');setState('asleep');music.pause();try{music.currentTime=0}catch{};if(ctx?.state==='running')ctx.suspend().catch(()=>{});cancelAnimationFrame(raf);raf=0;if(radioWasPlaying)radio.play().catch(()=>{});radioWasPlaying=false;}
$('exitPocket').addEventListener('click',()=>{if(state==='ready'){startSound();setState('pack')}});
$('exitPack').addEventListener('click',()=>{if(state!=='pack')return;setState('open');later(()=>{if(state==='open'){scene.classList.add('tap-hint');if(navigator.vibrate&&!reduce.matches)navigator.vibrate(35)}},1000)});
$('exitCig').addEventListener('click',()=>{if(state!=='open')return;scene.classList.remove('tap-hint');setState('held')});
$('exitLighter').addEventListener('click',()=>{if(state!=='held')return;setState('lighting');later(()=>scene.classList.add('lit'),180);later(()=>setState('smoking'),1250)});
$('exitHeld').addEventListener('click',()=>{if(state!=='smoking')return;setState('inhaling');later(()=>{setState('exhaling');later(()=>setState('smoking'),2100)},1100)});
document.querySelector('a[href="#exit-galaxy"]')?.addEventListener('click',()=>{if(!visible){try{buildAudio();ctx?.resume().catch(()=>{})}catch{}}});
scene.addEventListener('pointerdown',()=>{if(visible)startSound()},{passive:true});
function route(){const active=location.hash==='#exit-galaxy';if(active===visible)return;visible=active;if(active)enter();else exit()}
window.addEventListener('hashchange',route);route();
