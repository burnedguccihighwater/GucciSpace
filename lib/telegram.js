import {createHash} from 'node:crypto';
export function credentials() {
  const token=process.env.TELEGRAM_BOT_TOKEN?.trim();
  const raw=process.env.TELEGRAM_USER_ID?.trim();
  if(!/^\d{5,16}:[A-Za-z0-9_-]{20,}$/.test(token||'') || !/^\d{1,16}$/.test(raw||'')){console.warn('Telegram sync configuration invalid', {tokenPresent:!!token,userIdPresent:!!raw});return null;}
  const user_id=Number(raw); if(!Number.isSafeInteger(user_id)||user_id<=0)return null;
  return {token,user_id};
}
export async function telegram(c,method,params) {
  let r;try{r=await fetch('https://api.telegram.org/bot'+c.token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(7500)});}catch(e){console.warn('Telegram sync connection failure',method,e?.name==='TimeoutError'?'timeout':'network');throw new Error('Telegram request failed');}
  if(!r.ok){console.warn('Telegram sync HTTP failure',method,r.status);throw new Error('Telegram request failed');}
  const j=await r.json();if(!j.ok){console.warn('Telegram sync API failure',method,Number(j.error_code)||0);throw new Error('Telegram request failed');}return j.result;
}
export async function profilePhoto(c){
 const result=await telegram(c,'getUserProfilePhotos',{user_id:c.user_id,limit:1});
 const p=(result.photos?.[0]||[]).filter(x=>x.file_id && (!x.file_size || x.file_size<4000000));
 return p.at(-1)?.file_id||null;
}
export function cache(res){res.setHeader('Cache-Control','public, s-maxage=90, stale-while-revalidate=30');}
export function fail(res,code=503){res.setHeader('Cache-Control','no-store');return res.status(code).json({connected:false,tracks:[],avatar:null});}

export const AUDIO_MAX=20*1024*1024;
export function trackKey(a){return createHash('sha256').update(String(a.file_unique_id||a.file_id||'')).digest('hex').slice(0,32);}
export function canPlay(a){return !!a.file_id && (!a.file_size||a.file_size<=AUDIO_MAX);}
let last=null,pending=null;
export async function profileAudios(c){
 const k=c.user_id;
 if(last?.k===k && Date.now()<last.until)return last.value;
 if(pending?.k===k)return pending.promise;
 const promise=(async()=>{
  const value=[],seen=new Set();let offset=0;
  while(true){
   const v=await telegram(c,'getUserProfileAudios',{user_id:k,offset,limit:100});
   if(!Array.isArray(v.audios))throw Error('Invalid profile audios');
   for(const a of v.audios){const id=trackKey(a);if(!seen.has(id)){seen.add(id);value.push(a);}}
   offset+=v.audios.length;
   if(!v.audios.length||offset>=v.total_count||(!Number.isFinite(v.total_count)&&v.audios.length<100))break;
   if(offset>10000)throw Error('Profile audio pagination limit');
  }
  last={k,value,until:Date.now()+45000};return value;
 })().finally(()=>{if(pending?.promise===promise)pending=null;});
 pending={k,promise}; return promise;
}
