const root=document.getElementById('lifeArtwork');
const status=document.getElementById('lifeArtworkStatus');
function addImage(item,slot) {
  if(!item||typeof item.url!=='string'||!/^https:\/\/(?:images\.steamusercontent\.com|steamuserimages-a\.akamaihd\.net|[a-z0-9-]+\.steamusercontent\.com)\/ugc\//i.test(item.url))return;
  const a=document.createElement('a');a.href=item.id&&/^\d+$/.test(item.id)?'https://steamcommunity.com/sharedfiles/filedetails/?id='+item.id:item.url;a.target='_blank';a.rel='noopener noreferrer';
  const img=document.createElement('img');img.alt=item.title||'Steam artwork';img.src=item.url;img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{a.classList.add('artwork-missing');img.alt='Изображение Steam недоступно';});a.append(img);slot.append(a);
}
async function load(){
  try{
    const r=await fetch('/api/steam-showcase');const data=await r.json();
    if(!r.ok||!data.connected||!data.primary)throw Error('unavailable');
    addImage(data.primary,root.querySelector('.life-art-main'));
    for(const item of (data.thumbs||[]).slice(0,3))addImage(item,root.querySelector('.life-art-side'));
    if(data.primary.title)document.getElementById('lifeArtworkTitle').textContent=data.primary.title;
    root.hidden=false;status.hidden=true;
  }catch{status.textContent='Иллюстрации Steam временно недоступны.';}
}
load();
