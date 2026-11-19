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
   const card=document.createElement('div');card.className='diary-post';
   const link=document.createElement('a');link.className='diary-post-link';link.href='https://t.me/guccihighlights/'+p.id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Бухта Кэндл · #'+p.id+' ↗';
   const frame=document.createElement('iframe');frame.src=link.href+'?embed=1&dark=1';frame.loading='lazy';frame.title='Пост Бухта Кэндл №'+p.id;frame.referrerPolicy='no-referrer';frame.setAttribute('scrolling','yes');card.append(link,frame);$('diaryPosts').append(card);
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
