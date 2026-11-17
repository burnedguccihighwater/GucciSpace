import {credentials,telegram,profilePhoto,cache,fail} from '../lib/telegram.js';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return fail(res,405);}
 const c=credentials();if(!c)return fail(res);
 try{
 const id=await profilePhoto(c);if(!id)return fail(res,404);
 const f=await telegram(c,'getFile',{file_id:id});
 if(!f.file_path||!/^photos\/[A-Za-z0-9_.-]+$/.test(f.file_path)||f.file_size>4000000)return fail(res,404);
 const r=await fetch('https://api.telegram.org/file/bot'+c.token+'/'+f.file_path,{signal:AbortSignal.timeout(7500),redirect:'error'});
 if(!r.ok||Number(r.headers.get('content-length'))>4000000)return fail(res);
 const b=Buffer.from(await r.arrayBuffer());if(b.length>4000000||b.length<3||b[0]!==255||b[1]!==216||b[2]!==255)return fail(res);
 cache(res);res.setHeader('Content-Type','image/jpeg');res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(b);
 }catch(_){return fail(res);}
}
