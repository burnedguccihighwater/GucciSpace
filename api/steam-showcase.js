const profiles=['https://steamcommunity.com/id/bleed4gucci/?l=english','https://steamcommunity.com/profiles/76561198855975484/?l=english'];
const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'");
function attrs(tag){const a={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))a[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return a}
function blocks(html,cls){
 const result=[];const stack=[];
 for(const m of html.matchAll(/<(\/?)(div|a|section)\b[^>]*>/gi)){
 const tag=m[2].toLowerCase();
 if(!m[1]){const a=attrs(m[0]);stack.push({tag,start:m.index,inner:m.index+m[0].length,match:(a.class||'').split(/\s+/).includes(cls)});}
 else {let i=stack.length-1;while(i>=0&&stack[i].tag!==tag)i--;if(i<0)continue;const it=stack[i];stack.length=i;if(it.match)result.push({start:it.start,inner:html.slice(it.inner,m.index)});}
 }return result.sort((a,b)=>a.start-b.start);
}
function imageURL(raw){const m=String(raw||'').match(/^(?:https:)?\/\/(images\.steamusercontent\.com|steamuserimages-a\.akamaihd\.net|[a-z0-9-]+\.steamusercontent\.com)(\/ugc\/[^\s?#"'<>]+)(?:[?#].*)?$/i);return m?'https://'+m[1]+m[2]:null}
function items(html){
 const result=[];let anchor={};
 for(const m of html.matchAll(/<\/?a\b[^>]*>|<img\b[^>]*>/gi)){
 if(/^<\/a/i.test(m[0])){anchor={};continue}
 if(/^<a\b/i.test(m[0])){anchor=attrs(m[0]);continue}
 const a=attrs(m[0]);const url=[a['data-src'],a['data-original'],a.src].filter(Boolean).map(imageURL).find(Boolean);
 if(!url||result.some(x=>x.url===url))continue;
 const id=(anchor.href||anchor['data-modal-content-url']||'').match(/[?&]id=(\d+)/)?.[1]||null;
 result.push({url,id,title:(anchor.title||a.title||a.alt||'').slice(0,200)});
 }return result;
}
export function parseProfile(html){
 const sections=blocks(html,'profile_customization');
 const candidates=(sections.length?sections.map(x=>x.inner):[html]).map(content=>{
 const main=(blocks(content,'screenshot_showcase_primary')[0]||blocks(content,'artwork_showcase_primary')[0]);
 const side=(blocks(content,'screenshot_showcase_rightcol')[0]||blocks(content,'artwork_showcase_rightcol')[0]);
 if(!main||!side)return null;
 const primary=items(main.inner)[0],thumbs=items(side.inner).filter(x=>x.url!==primary?.url).slice(0,3);
 if(!primary||!thumbs.length)return null;
 return {artwork:/Artwork Showcase|Illustration Showcase|Featured Artwork/i.test(content),primary,thumbs};
 }).filter(Boolean);
 return candidates.find(x=>x.artwork)||null;
}
async function fetchHTML(url){const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html','Accept-Language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('steam_unavailable');return r.text()}
async function original(item){
 if(!item.id)return item;
 try{
 const page=await fetchHTML('https://steamcommunity.com/sharedfiles/filedetails/?id='+item.id+'&l=english');
 const art=blocks(page,'actualmedia')[0];
 const a=[...page.matchAll(/<(?:img|a)\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>/(?:^|\s)actualmedia(?:img)?(?:\s|$)/i.test(a.class||'')||a.id==='actualmedia');
 const url=a.map(a=>imageURL(a.src||a.href||'')).find(Boolean)||(art?items(art.inner)[0]?.url:null);if(url)item.url=url;
 const title=blocks(page,'workshopItemTitle')[0]?.inner.replace(/<[^>]+>/g,'').trim();if(title)item.title=decode(title).slice(0,200);
 }catch{}return item;
}
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({connected:false})}
 try{
 const results=await Promise.allSettled(profiles.map(async url=>parseProfile(await fetchHTML(url))));
 const data=results.find(r=>r.status==='fulfilled'&&r.value)?.value;if(!data)throw Error('showcase_not_found');
 const all=await Promise.all([data.primary,...data.thumbs].map(original));
 res.setHeader('Cache-Control','public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
 return res.status(200).json({connected:true,primary:all[0],thumbs:all.slice(1)});
 }catch(error){res.setHeader('Cache-Control','no-store');return res.status(503).json({connected:false,reason:String(error.message||'steam_unavailable')})}
}
