import {credentials,telegram,profilePhoto,cache,fail} from '../lib/telegram.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(res,405);}
 const c=credentials();if(!c)return fail(res);
 const bioEnabled=process.env.TELEGRAM_SYNC_BIO==='1';
 const [audios,photo,bio]=await Promise.allSettled([
 telegram(c,'getUserProfileAudios',{user_id:c.user_id,offset:0,limit:10}),
 profilePhoto(c),
 bioEnabled?telegram(c,'getChat',{chat_id:c.user_id}):Promise.resolve(null)
 ]);
 if(audios.status!=='fulfilled')return fail(res);
 const tracks=(audios.value.audios||[]).slice(0,10).map(a=>({
 title:String(a.title||a.file_name||'Unknown track').slice(0,120),
 artist:String(a.performer||'Unknown artist').slice(0,120),
 duration:Number.isFinite(a.duration)?Math.max(0,Math.floor(a.duration)):0
 }));
 cache(res);
 return res.status(200).json({connected:true,synced_at:new Date().toISOString(),avatar:photo.status==='fulfilled'&&photo.value?'/api/telegram-avatar':null,bio:bioEnabled&&bio.status==='fulfilled'?String(bio.value?.bio||'').slice(0,1800):null,tracks});
}
