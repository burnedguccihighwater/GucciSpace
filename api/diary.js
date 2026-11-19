const channel='guccihighlights';
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end()}
 try{
  const before=typeof req.query?.before==='string'&&/^\d{1,15}$/.test(req.query.before)?req.query.before:null;
  const url='https://t.me/s/'+channel+(before?'?before='+before:'');
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html'},signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw Error('unavailable');
  const html=await response.text();
  const ids=[...new Set([...html.matchAll(/data-post=["']guccihighlights\/(\d+)["']/gi)].map(x=>Number(x[1])))].filter(Number.isSafeInteger).sort((a,b)=>b-a);
  if(!ids.length)throw Error('no_public_posts');
  res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=120');
  return res.status(200).json({posts:ids.map(id=>({id,url:'https://t.me/'+channel+'/'+id})),before:ids.at(-1)});
 }catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({posts:[],error:'channel_preview_unavailable'})}
}
