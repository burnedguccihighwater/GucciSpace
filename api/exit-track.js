import {list,put} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
const PATH='exit-galaxy/soundtrack.mp3';
const MAX=4100000;
const KEY='25d9efaaacde267e215b152690007c3bcbd8ef65f1f0f17d7d32a550837c302a';
const ORIGIN='https://gucci-space.vercel.app';
export const config={api:{bodyParser:false}};
async function findTrack(){
 const r=await list({prefix:PATH,limit:10});
 return r.blobs.find(b=>b.pathname===PATH&&/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/exit-galaxy\/soundtrack\.mp3$/i.test(b.url));
}
function authorized(req){
 const token=req.headers['x-upload-key'];if(typeof token!=='string'||token.length>100)return false;
 return timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(KEY,'hex'));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method==='POST'){
   if(req.headers.origin!==ORIGIN||!authorized(req))return res.status(403).json({error:'forbidden'});
   if(await findTrack())return res.status(409).json({error:'already_uploaded'});
   if(!String(req.headers['content-type']).startsWith('audio/mpeg'))return res.status(415).json({error:'mp3_required'});
   let body=req.body;
   if(!Buffer.isBuffer(body)){
    const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>MAX)return res.status(413).json({error:'too_large'});chunks.push(chunk);}
    body=Buffer.concat(chunks);
   }
   if(body.length<100||body.length>MAX)return res.status(413).json({error:'size'});
   if(body.subarray(0,3).toString()!=='ID3'&&!(body[0]===255&&(body[1]&224)===224))return res.status(415).json({error:'invalid_mp3'});
   await put(PATH,body,{access:'public',contentType:'audio/mpeg',addRandomSuffix:false,allowOverwrite:false,cacheControlMaxAge:3600});
   return res.status(201).json({ready:true});
  }
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD, POST');return res.status(405).end()}
  const file=await findTrack();
  if(req.query?.status==='1')return res.status(200).json({ready:!!file});
  if(!file)return res.status(404).end();
  const range=typeof req.headers.range==='string'&&/^bytes=\d*-\d*$/.test(req.headers.range)?req.headers.range:null;
  const upstream=await fetch(file.url,{method:req.method,headers:range?{Range:range}:{},signal:AbortSignal.timeout(45000),redirect:'error'});
  if(!upstream.ok&&upstream.status!==416)return res.status(502).end();
  res.statusCode=upstream.status;res.setHeader('Content-Type','audio/mpeg');
  for(const h of ['content-length','content-range','accept-ranges']){const v=upstream.headers.get(h);if(v)res.setHeader(h,v)}
  res.setHeader('Cache-Control','public,max-age=3600');
  if(!upstream.body)return res.end();
  await pipeline(Readable.fromWeb(upstream.body),res);
 }catch{if(!res.headersSent)return res.status(503).json({error:'track_unavailable'});res.destroy();}
}
