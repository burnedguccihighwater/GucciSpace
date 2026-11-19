const $=id=>document.getElementById(id);
let before=null,loading=false;const seen=new Set();
async function diary(){
 if(loading)return;loading=true;$('diaryMore').disabled=true;
 try{
  const r=await fetch('/api/diary'+(before?'?before='+before:'')),d=await r.json();
  if(!r.ok||!Array.isArray(d.posts))throw Error();
  let count=0;
  for(const p of d.posts){
   if(!Number.isSafeInteger(p.id)||seen.has(p.id))continue;
   seen.add(p.id);count++;
   const card=document.createElement('article');card.className='diary-post';
   const url='https://t.me/guccihighlights/'+p.id;
   const head=document.createElement('div');head.className='diary-post-head';
   const channel=document.createElement('span');channel.textContent='Бухта Кэндл';
   const link=document.createElement('a');link.className='diary-post-link';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='#'+p.id+' ↗';
   head.append(channel,link);card.append(head);
   const urls=(Array.isArray(p.photos)?p.photos:[]).filter(u=>typeof u==='string'&&/^https:\/\/(?:[a-z0-9-]+\.)*(?:telesco\.pe|telegram-cdn\.org|telegram\.org|t\.me)\//i.test(u)).slice(0,3);
   if(urls.length){
    const media=document.createElement('a');media.className='diary-media';media.href=url;media.target='_blank';media.rel='noopener noreferrer';media.dataset.count=String(urls.length);
    for(const src of urls){const img=document.createElement('img');img.src=src;img.alt='Фото из публикации';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>{img.remove();if(!media.querySelector('img'))media.remove();});media.append(img);}
    if(p.video){const play=document.createElement('span');play.className='diary-video-label';play.textContent='▶';media.append(play);}
    card.append(media);
   }
   if(typeof p.text==='string'&&p.text.trim()){const body=document.createElement('p');body.className='diary-post-text';body.textContent=p.text;card.append(body);}
   const foot=document.createElement('div');foot.className='diary-post-foot';
   const date=new Date(p.date||'');const time=document.createElement('time');if(!Number.isNaN(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});}
   const open=document.createElement('a');open.href=url;open.target='_blank';open.rel='noopener noreferrer';open.textContent=p.video?'Смотреть ↗':'Открыть пост ↗';foot.append(time,open);card.append(foot);
   $('diaryPosts').append(card);
  }
  $('diaryStatus').textContent=count?'':'Больше публикаций не найдено.';
  const next=Number(d.before);$('diaryMore').hidden=!count||!next||next===before;before=next;
 }catch{$('diaryStatus').textContent='Не удалось получить публичные посты. Открой канал по ссылке.';$('diaryMore').textContent='Повторить';}
 finally{loading=false;$('diaryMore').disabled=false;}
}
$('diaryMore').addEventListener('click',diary);
diary();
let auth=null;
window.onGucciMemoryAuth=function(user){
 if(!user?.hash)return;auth=user;
 $('memoryIdentity').textContent='♡ '+[user.first_name,user.last_name].filter(Boolean).join(' ')+(user.username?' · @'+user.username:'');
 $('memorySend').disabled=false;$('memoryStatus').textContent='Ты вошёл через Telegram. Послание и твой профиль будут видны только Gucci.';
};
async function login(){
 try{
  const r=await fetch('/api/memory'),d=await r.json();
  if(!r.ok||!/^[-_a-zA-Z0-9]{5,32}$/.test(d.bot||''))throw Error();
  const script=document.createElement('script');script.async=true;script.src='https://telegram.org/js/telegram-widget.js?22';script.setAttribute('data-telegram-login',d.bot);script.setAttribute('data-size','medium');script.setAttribute('data-radius','3');script.setAttribute('data-onauth','onGucciMemoryAuth(user)');script.setAttribute('data-userpic','false');
  script.onerror=()=>{$('memoryStatus').textContent='Не удалось загрузить вход Telegram.';};
  $('memoryLogin').append(script);
 }catch{$('memoryStatus').textContent='Вход через Telegram временно недоступен.';}
}
$('memoryForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!auth)return;
 const msg=$('memoryText').value.trim();if(!msg)return;$('memorySend').disabled=true;
 try{
  const r=await fetch('/api/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auth,message:msg})});
  const d=await r.json();
  if(!r.ok||!d.sent){if(r.status===401){auth=null;$('memoryIdentity').textContent='';throw Error('Войди через Telegram ещё раз.')}throw Error(r.status===429?'Подожди немного перед новым посланием.':'Не удалось доставить послание. Попробуй позже.');}
  $('memoryText').value='';$('memoryStatus').textContent='Твоё послание доставлено ♡';
 }catch(err){$('memoryStatus').textContent=err.message||'Не удалось отправить.';}
 finally{$('memorySend').disabled=!auth;}
});
login();
