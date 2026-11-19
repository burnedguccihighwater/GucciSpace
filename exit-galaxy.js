const scene=document.getElementById('exitGalaxy');
const $=id=>document.getElementById(id);
let state='asleep',timers=[];
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const later=(fn,ms)=>{const id=setTimeout(fn,reduce.matches?Math.min(ms,100):ms);timers.push(id)};
function setState(next){state=next;scene.dataset.state=next;
 for(const [id,show] of [['exitPocket',next==='ready'],['exitPack',next==='pack'||next==='open'],['exitCig',next==='open'],['exitLighter',next==='held'],['exitHeld',next==='held'||next==='lighting'||next==='smoking']])$(id).hidden=!show;
}
function enter(){timers.forEach(clearTimeout);timers=[];scene.classList.remove('eyes-open','lit','tap-hint');setState('asleep');
 later(()=>{scene.classList.add('eyes-open');setState('waking');later(()=>setState('ready'),1450)},500);}
function exit(){timers.forEach(clearTimeout);timers=[];scene.classList.remove('eyes-open','lit','tap-hint');setState('asleep');}
$('exitPocket').addEventListener('click',()=>{if(state==='ready')setState('pack')});
$('exitPack').addEventListener('click',()=>{if(state!=='pack')return;setState('open');later(()=>{if(state==='open'){scene.classList.add('tap-hint');if(navigator.vibrate&&!reduce.matches)navigator.vibrate(35)}},1000)});
$('exitCig').addEventListener('click',()=>{if(state!=='open')return;scene.classList.remove('tap-hint');setState('held')});
$('exitLighter').addEventListener('click',()=>{if(state!=='held')return;setState('lighting');later(()=>scene.classList.add('lit'),180);later(()=>setState('smoking'),1250)});
let visible=false;
function route(){const active=location.hash==='#exit-galaxy';if(active===visible)return;visible=active;if(active)enter();else exit()}
window.addEventListener('hashchange',route);route();
