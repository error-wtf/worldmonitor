// Full native dashboard; companion data never hides or resizes its panels.
// Theme follows the app default (worldmonitor.app template) - no forced override.

// --- EXIT News als echter Tab in der Dashboard-Tab-Leiste ---
function exitNewsTab(){
 if(document.getElementById('exit-news-tab'))return;
 const list=document.querySelector('.dashboard-tablist');
 if(!list)return;
 const tab=document.createElement('button');
 tab.id='exit-news-tab';
 tab.className='dashboard-tab-label';
 tab.type='button';
 tab.textContent='EXIT News';
 tab.title='EXIT News — Nachrichten, Krypto & Rechte';
 tab.addEventListener('click',()=>{
  const btn=document.getElementById('exit-companion-button');
  if(btn)btn.click();
  else if(window.__exitCompanionOpen)window.__exitCompanionOpen();
 });
 list.appendChild(tab);
 // Observer falls die tablist spaeter neu gerendert wird:
 new MutationObserver(()=>{if(!document.getElementById('exit-news-tab')&&list.isConnected){list.appendChild(tab);}}).observe(list,{childList:true});
}

function exitCompanion(){
 if(!document.body)return;
 const lang=(new URLSearchParams(location.search).get('lang')||document.documentElement.lang||'de').slice(0,2);
 const text=(de,it,en)=>({de,it,en}[lang]||de);
 if(document.getElementById('exit-companion-button'))return;
 const button=document.createElement('button');button.id='exit-companion-button';button.textContent=text('EXIT · News, Krypto & Rechte','EXIT · Notizie, cripto e diritti','EXIT · News, crypto & rights');button.setAttribute('aria-haspopup','dialog');
 const dialog=document.createElement('dialog');dialog.id='exit-companion';dialog.setAttribute('aria-label','Welt, Deutschland, Italien, Kryptokurse und Wetter');
 const close=document.createElement('button');close.id='exit-companion-close';close.textContent=text('Schließen ×','Chiudi ×','Close ×');
 const frame=document.createElement('iframe');frame.title='Nachrichten, Kryptokurse und Wetter';
 new MutationObserver(()=>{const l=document.documentElement.lang.slice(0,2);button.textContent=({de:'EXIT · News, Krypto & Rechte',it:'EXIT · Notizie, cripto e diritti',en:'EXIT · News, crypto & rights'}[l]||'EXIT · News');close.textContent=({de:'Schließen ×',it:'Chiudi ×',en:'Close ×'}[l]||'Close ×');if(frame.hasAttribute('src'))frame.src='/worldmapp/news.html?lang='+l;}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 dialog.append(close,frame);document.body.append(button,dialog);
 document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  const liveDialog=document.getElementById('exit-companion');
  if(!(liveDialog instanceof HTMLDialogElement))return;
  if(target?.closest('#exit-companion-close')){liveDialog.close();return;}
  if(!target?.closest('#exit-companion-button'))return;
  const liveFrame=liveDialog.querySelector('iframe');
  if(liveFrame&&!liveFrame.getAttribute('src'))liveFrame.src='/worldmapp/news.html?lang='+(document.documentElement.lang||lang).slice(0,2);
  liveDialog.showModal();
 });
 exitNewsTab();
 // falls die tablist spaeter mountet:
 const tabObs=new MutationObserver(()=>{exitNewsTab();});
 tabObs.observe(document.body,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',exitCompanion,{once:true});else exitCompanion();
