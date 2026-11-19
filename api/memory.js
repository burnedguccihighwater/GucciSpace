import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {credentials,telegram} from '../lib/telegram.js';
const SITE='https://gucci-space.vercel.app';
const recent=new Map();
export function verifyLogin(auth,token,now=Date.now()){
 if(!auth||typeof auth!=='object'||Array.isArray(auth))return null;
 const allowed=['id','first_name','last_name','username','photo_url','auth_date','hash'];
 if(Object.keys(auth).some(k=>!allowed.includes(k)))return null;
 const {hash,...fields}=auth;
 if(typeof hash!=='string'||!/^[a-f0-9]{64}$/i.test(hash)||!Object.values(fields).every(v=>typeof v==='string'||typeof v==='number'))return null;
 const id=Number(fields.id),date=Number(fields.auth_date);
 if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(date)||date*1000>now+30000||now-date*1000>600000)return null;
 const check=Object.keys(fields).sort().map(k=>k+'='+fields[k]).join('\n');
 const digest=createHmac('sha256',createHash('sha256').update(token).digest()).update(check).digest();
 if(!timingSafeEqual(digest,Buffer.from(hash,'hex')))return null;
 return {id,first_name:String(fields.first_name||'').slice(0,120),last_name:String(fields.last_name||'').slice(0,120),username:/^[a-zA-Z0-9_]{1,32}$/.test(fields.username||'')?fields.username:null};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const c=credentials();if(!c)return res.status(503).json({error:'unavailable'});
 if(req.method==='GET'){
  try{const bot=await telegram(c,'getMe',{});return res.status(200).json({bot:bot.username})}catch{return res.status(503).json({error:'unavailable'})}
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).end()}
 if(req.headers.origin!==SITE||!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(403).json({error:'forbidden'});
 let body=req.body;try{if(typeof body==='string')body=JSON.parse(body)}catch{return res.status(400).json({error:'invalid'})}
 const sender=verifyLogin(body?.auth,c.token);if(!sender)return res.status(401).json({error:'login_required'});
 const message=typeof body?.message==='string'?body.message.trim():'';
 if(!message||message.length>1000)return res.status(400).json({error:'invalid_message'});
 const now=Date.now();for(const [k,t] of recent)if(now-t>600000)recent.delete(k);
 if(recent.has(sender.id))return res.status(429).json({error:'rate_limit'});
 recent.set(sender.id,now);
 try{
  const name=[sender.first_name,sender.last_name].filter(Boolean).join(' ');
  await telegram(c,'sendMessage',{chat_id:c.user_id,text:'♡ Leave a Memory · Gucci Space\n\nОт: '+name+(sender.username?' (@'+sender.username+')':'')+'\nTelegram ID: '+sender.id+'\n\n'+message,link_preview_options:{is_disabled:true}});
  return res.status(200).json({sent:true});
 }catch{recent.delete(sender.id);return res.status(503).json({error:'delivery_failed'})}
}
