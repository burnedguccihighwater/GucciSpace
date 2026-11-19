const channel='guccihighlights';
const decode=s=>String(s||'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(m,k)=>{const chars={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};if(k[0]!=='#')return chars[k.toLowerCase()]||m;try{return String.fromCodePoint(k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):Number(k.slice(1)))}catch{return m}});
function tagAttrs(tag){const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return out;}
function messageText(block){
 const start=/<div\b[^>]*class=["'][^"']*\btgme_widget_message_text\b[^"']*["'][^>]*>/i.exec(block);
 if(!start)return '';
 const rest=block.slice(start.index+start[0].length);let depth=1,end=rest.length;
 for(const m of rest.matchAll(/<\/?div\b[^>]*>/gi)){depth+=m[0][1]==='/'?-1:1;if(!depth){end=m.index;break;}}
 return decode(rest.slice(0,end).replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|blockquote|div)>/gi,'\n').replace(/<[^>]*>/g,'')).trim().slice(0,12000);
}
function mediaURL(value){
 const s=String(value||'');const match=s.match(/^https:\/\/([^/?#]+)(\/[^\s"'<>]*)$/i);
 if(!match)return null;const host=match[1].toLowerCase();
 if(!(/^(?:[a-z0-9-]+\.)*(?:telesco\.pe|telegram-cdn\.org|telegram\.org|t\.me)$/.test(host)))return null;
 return s;
}
export function parsePosts(html){
 const matches=[...html.matchAll(/data-post=["']guccihighlights\/(\d+)["']/gi)];
 const posts=new Map();
 for(let i=0;i<matches.length;i++){
  const id=Number(matches[i][1]);if(!Number.isSafeInteger(id))continue;
  const block=html.slice(matches[i].index,matches[i+1]?.index??html.length);
  const photos=[];
  for(const m of block.matchAll(/<(?:a|div|i|img|video)\b[^>]*>/gi)){
   const a=tagAttrs(m[0]),cls=a.class||'';
   if(!/tgme_widget_message_(?:photo|video_thumb|video|animation|sticker)/.test(cls))continue;
   const bg=(a.style||'').match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
   const url=mediaURL(bg||a.poster||a.src);
   if(url&&!photos.includes(url)&&photos.length<6)photos.push(url);
  }
  const date=block.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]||null;
  const text=messageText(block);
  const video= /tgme_widget_message_(?:video|roundvideo|animation)/.test(block);
  const p={id,url:'https://t.me/'+channel+'/'+id,text,photos,date,video};
  const prev=posts.get(id);if(!prev||text||photos.length)posts.set(id,p);
 }
 return [...posts.values()].sort((a,b)=>b.id-a.id);
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end()}
 try{
  const before=typeof req.query?.before==='string'&&/^\d{1,15}$/.test(req.query.before)?req.query.before:null;
  const response=await fetch('https://t.me/s/'+channel+(before?'?before='+before:''),{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('unavailable');
  const posts=parsePosts(await response.text());if(!posts.length)throw Error('no_public_posts');
  res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=120');
  return res.status(200).json({posts,before:posts.at(-1).id});
 }catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({posts:[],error:'channel_preview_unavailable'})}
}
