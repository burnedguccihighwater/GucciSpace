import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {credentials,telegram,profileAudios,trackKey,canPlay,AUDIO_MAX} from '../lib/telegram.js';
const coverMax=1024*1024;
function error(res,status){res.setHeader('Cache-Control','no-store');return res.status(status).end();}
const audioTypes={mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',wav:'audio/wav',flac:'audio/flac',opus:'audio/ogg'};
function parseRange(value,size){
 if(!value)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!m||(!m[1]&&!m[2])||!size)return false;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 let end=m[1]&&m[2]?Math.min(size-1,Number(m[2])):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
 return {start,end};
}
export default async function handler(req,res){
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return error(res,405);}
 const id=req.query?.id,kind=req.query?.kind;
 if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id)||!['audio','cover'].includes(kind))return error(res,400);
 const c=credentials();if(!c)return error(res,503);
 try{
 const tracks=await profileAudios(c);
 const a=tracks.find(t=>trackKey(t)===id);
 if(!a)return error(res,404);
 const cover=kind==='cover', max=cover?coverMax:AUDIO_MAX;
 if(!cover&&!canPlay(a))return error(res,413);
 const fileId=cover?a.thumbnail?.file_id:a.file_id;
 if(!fileId)return error(res,404);
 const f=await telegram(c,'getFile',{file_id:fileId});
 const path=f.file_path;
 if(typeof path!=='string'||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(path)||path.split('/').some(p=>p==='..'||p==='.'))return error(res,404);
 let size=Number(f.file_size||(cover?a.thumbnail?.file_size:a.file_size))||0;
 if(size>max)return error(res,413);
 const ext=path.split('.').at(-1).toLowerCase();
 let type=cover?({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[ext]:audioTypes[ext];
 if(!type&&!cover&&Object.values(audioTypes).includes(a.mime_type))type=a.mime_type;
 if(!type)return error(res,415);
 const rawRange=!cover&&typeof req.headers.range==='string'?req.headers.range:null;
 let range=rawRange&&size?parseRange(rawRange,size):null;
 if(range===false){res.setHeader('Content-Range','bytes */'+size);return error(res,416);}
 const upstream=await fetch('https://api.telegram.org/file/bot'+c.token+'/'+path,{headers:range?{Range:'bytes='+range.start+'-'+range.end}:{},signal:AbortSignal.timeout(45000),redirect:'error'});
 if(!upstream.ok||!upstream.body)return error(res,502);
 const len=Number(upstream.headers.get('content-length'))||0;
 if(len>max){await upstream.body.cancel();return error(res,413);}
 if(!size&&upstream.status===200)size=len;
 if(!cover&&rawRange&&!range){range=parseRange(rawRange,size);if(range===false){await upstream.body.cancel();if(size)res.setHeader('Content-Range','bytes */'+size);return error(res,416);}}
 res.setHeader('Cache-Control',cover?'public, s-maxage=180, max-age=60':'private, max-age=60');
 res.setHeader('Content-Type',type);res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Disposition','inline');
 if(!cover)res.setHeader('Accept-Ranges','bytes');
 let skip=0,remaining=max;
 if(range){
  const expected=range.end-range.start+1;
  if(upstream.status===206){
   const cr=upstream.headers.get('content-range');
   if(cr!=='bytes '+range.start+'-'+range.end+'/'+size){await upstream.body.cancel();return error(res,502);}
  }else{skip=range.start;}
  res.statusCode=206;res.setHeader('Content-Range','bytes '+range.start+'-'+range.end+'/'+size);res.setHeader('Content-Length',expected);remaining=expected;
 }else{res.statusCode=200;if(len)res.setHeader('Content-Length',len);remaining=len||max;}
 if(req.method==='HEAD'){await upstream.body.cancel();return res.end();}
 const stream=Readable.fromWeb(upstream.body);
 const limiter=new Transform({transform(chunk,_,cb){
  if(skip){const n=Math.min(skip,chunk.length);skip-=n;chunk=chunk.subarray(n);}
  if(remaining>0&&chunk.length){const b=chunk.subarray(0,remaining);remaining-=b.length;this.push(b);}
  cb();
 }});
 await pipeline(stream,limiter,res);
 }catch(e){console.warn('Telegram media request failed',kind,e?.name==='TimeoutError'?'timeout':'media');if(!res.headersSent)return error(res,502);res.destroy();}
}
