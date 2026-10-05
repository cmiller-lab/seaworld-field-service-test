/* Shared weekly chemical inventory. Historical counts are append-only in Supabase. */
(function(){
'use strict';
const SB_URL='https://eseqjmcsdwqyohmoabnq.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZXFqbWNzZHdxeW9obW9hYm5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MjUxMTIsImV4cCI6MjEwNDIwMTExMn0.PIqeyV12we4gCuyFXYwcN9-tCgc-rIhYud2DuUhxqlQ';
const PALLET_BUCKETS=24;
const BUCKET_LB=50;
const PALLET_LB=PALLET_BUCKETS*BUCKET_LB;
const PROPERTIES=[
  {name:'Aquatica',items:['Briquettes']},
  {name:'SeaWorld',items:['Briquettes','Stabilizer']},
  {name:'Discovery Cove',items:['Briquettes']}
];
const state={rows:[],drafts:{},dirty:new Set(),saving:new Set(),loaded:false};
const $=id=>document.getElementById(id);
const key=(property,item)=>property+'|'+item;
const headers=()=>({apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json'});
const dayKey=(value=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const fmtDate=(value,short=false)=>new Date(value).toLocaleDateString('en-US',{timeZone:'America/New_York',month:short?'short':'numeric',day:'numeric',year:short?'numeric':'2-digit'});
const fmtDateTime=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
const plural=(n,word)=>n+' '+word+(n===1?'':'s');
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3200)}
function latestRows(property,item){return state.rows.filter(r=>r.property===property&&r.item===item).sort((a,b)=>new Date(b.counted_at)-new Date(a.counted_at)||new Date(b.recorded_at)-new Date(a.recorded_at))}
function latest(property,item){return latestRows(property,item)[0]}
function isComplete(property){return PROPERTIES.find(p=>p.name===property).items.every(item=>{const row=latest(property,item);return row&&row.source!=='baseline'&&dayKey(row.counted_at)===dayKey()&&!state.dirty.has(key(property,item))})}
function seedDrafts(){for(const p of PROPERTIES)for(const item of p.items){const k=key(p.name,item);if(state.drafts[k]===undefined)state.drafts[k]=latest(p.name,item)?.pallets??0}}
function usage(property){
 const rows=latestRows(property,'Briquettes').slice().reverse();
 if(rows.length<2)return null;
 const current=rows.at(-1),previous=rows.at(-2),used=Math.max(0,previous.pallets-current.pallets);
 const intervalDays=Math.max(.25,(new Date(current.counted_at)-new Date(previous.counted_at))/86400000);
 let trendUsed=0,trendDays=0;
 for(let i=1;i<rows.length;i++){const drop=rows[i-1].pallets-rows[i].pallets;if(drop>0){trendUsed+=drop;trendDays+=Math.max(.25,(new Date(rows[i].counted_at)-new Date(rows[i-1].counted_at))/86400000)}}
 const palletsPerDay=trendDays?trendUsed/trendDays:0;
 const depletion=palletsPerDay>0?new Date(new Date(current.counted_at).getTime()+(current.pallets/palletsPerDay)*86400000):null;
 return {current,previous,used,intervalDays,palletsPerDay,depletion};
}
function render(){
 seedDrafts();
 const complete=PROPERTIES.filter(p=>isComplete(p.name)).length;
 const briquettes=PROPERTIES.reduce((sum,p)=>sum+(state.drafts[key(p.name,'Briquettes')]||0),0);
 $('totalPallets').textContent=plural(briquettes,'pallet');
 $('totalWeight').textContent=(briquettes*PALLET_LB).toLocaleString()+' lb total · 24 buckets per pallet';
 $('progressCount').textContent=complete+' / 3';
 $('propertyCards').innerHTML=PROPERTIES.map(p=>{
   const done=isComplete(p.name),saving=state.saving.has(p.name);
   const rows=p.items.map(item=>{const k=key(p.name,item),last=latest(p.name,item),count=state.drafts[k]||0;return `<div class="count-row"><div class="count-label"><strong>${item}</strong><small>Last saved: ${last?plural(last.pallets,'pallet')+' · '+fmtDate(last.counted_at,true):'No count'}</small></div><button class="stepper" data-step="-1" data-key="${k}" aria-label="Decrease ${p.name} ${item}">−</button><div class="count-value">${count}<small>pallet${count===1?'':'s'}</small></div><button class="stepper" data-step="1" data-key="${k}" aria-label="Increase ${p.name} ${item}">+</button></div>`}).join('');
   return `<article class="property-card ${done?'complete':''}"><div class="property-title"><h2>${p.name}</h2><span class="status">${saving?'Saving…':done?'✓ Counted today':state.dirty.size&&p.items.some(item=>state.dirty.has(key(p.name,item)))?'Ready to save':'Needs count'}</span></div>${rows}<button class="save-property ${done?'saved':''}" data-save="${p.name}" ${saving?'disabled':''}>${done?'✓ '+p.name+' Counted':'Mark '+p.name+' Counted'}</button></article>`;
 }).join('');
 $('shareInventory').disabled=complete!==3;
 $('shareHelp').textContent=complete===3?'All properties complete. Share by text message or copy the report.':`Complete ${3-complete} more ${3-complete===1?'property':'properties'} to share today's inventory.`;
 $('statsGrid').innerHTML=PROPERTIES.map(p=>{const u=usage(p.name);if(!u)return `<article class="stat-card"><h3>${p.name}</h3><p class="stat-line"><strong>Trend starts after the next count</strong><span>Current baseline: ${plural(state.drafts[key(p.name,'Briquettes')]||0,'pallet')}</span></p></article>`;const lbs=u.used*PALLET_LB,buckets=u.used*PALLET_BUCKETS,lbDay=u.palletsPerDay*PALLET_LB,bucketDay=u.palletsPerDay*PALLET_BUCKETS;return `<article class="stat-card"><h3>${p.name}</h3><p class="stat-line"><strong>${u.used?plural(u.used,'pallet')+' used':'No decrease'} since ${fmtDate(u.previous.counted_at,true)}</strong><span>${lbs.toLocaleString()} lb · ${plural(buckets,'bucket')}</span></p><p class="stat-line"><strong>${u.palletsPerDay?Math.round(lbDay).toLocaleString()+' lb/day':'Usage rate unavailable'}</strong><span>${u.palletsPerDay?bucketDay.toFixed(1)+' buckets/day':'Count was unchanged or increased'}</span></p><p class="stat-line"><strong>${u.depletion?'Expected empty '+fmtDate(u.depletion,true):'No depletion date yet'}</strong><span>${u.depletion?'At the observed usage rate':'A decreasing count is needed'}</span></p></article>`}).join('');
 renderHistory();
}
function renderHistory(){
 const groups=new Map();
 for(const row of [...state.rows].sort((a,b)=>new Date(b.counted_at)-new Date(a.counted_at)||a.property.localeCompare(b.property))){const groupKey=row.submission_id+'|'+row.property;if(!groups.has(groupKey))groups.set(groupKey,{at:row.counted_at,property:row.property,tech:row.technician,source:row.source,rows:[]});groups.get(groupKey).rows.push(row)}
 $('historyLog').innerHTML=[...groups.values()].slice(0,30).map(g=>`<article class="history-entry"><header><div><h3>${g.property}</h3><small>${g.tech}${g.source==='baseline'?' · Starting baseline':''}</small></div><time>${fmtDateTime(g.at)}</time></header><ul>${g.rows.sort((a,b)=>a.item.localeCompare(b.item)).map(r=>`<li>${r.item}: ${plural(r.pallets,'pallet')}</li>`).join('')}</ul></article>`).join('')||'<p class="help">No inventory history yet.</p>';
}
async function load(){
 $('syncStatus').textContent='Refreshing…';$('syncStatus').classList.remove('error');
 try{const response=await fetch(`${SB_URL}/rest/v1/chemical_inventory_counts?select=*&order=counted_at.desc,recorded_at.desc&limit=500`,{headers:headers(),cache:'no-store'});if(!response.ok)throw Error(await response.text());state.rows=await response.json();state.loaded=true;state.drafts={};state.dirty.clear();$('syncStatus').textContent='Shared history';render()}
 catch(error){console.error(error);$('syncStatus').textContent='Refresh failed';$('syncStatus').classList.add('error');toast('Inventory history could not be loaded.',true)}
}
async function saveProperty(property){
 if(!state.loaded||state.saving.has(property))return;
 const tech=$('inventoryTech').value.trim();if(!tech){$('inventoryTech').focus();toast('Enter the technician name before saving.',true);return}
 const config=PROPERTIES.find(p=>p.name===property),submission=crypto.randomUUID(),at=new Date().toISOString();
 const payload=config.items.map(item=>({submission_id:submission,property,item,pallets:state.drafts[key(property,item)]||0,counted_at:at,technician:tech,source:'live'}));
 state.saving.add(property);render();
 try{const response=await fetch(`${SB_URL}/rest/v1/chemical_inventory_counts`,{method:'POST',headers:{...headers(),Prefer:'return=representation'},body:JSON.stringify(payload)});if(!response.ok)throw Error(await response.text());const saved=await response.json();state.rows.push(...saved);for(const item of config.items)state.dirty.delete(key(property,item));localStorage.setItem('fieldlive.pcl.tech',tech);toast(property+' inventory saved.');render()}
 catch(error){console.error(error);toast(property+' count was not saved. Check the connection and retry.',true)}
 finally{state.saving.delete(property);render()}
}
function shareText(){const lines=[`Inventory ${new Date().toLocaleDateString('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric',year:'2-digit'})}`,''];for(const p of PROPERTIES){lines.push(p.name);for(const item of p.items){const n=state.drafts[key(p.name,item)]||0;lines.push(`${item} - ${plural(n,'pallet')}`)}lines.push('')}return lines.join('\n').trim()}
async function share(){const text=shareText();try{if(navigator.share)await navigator.share({title:'Chemical Inventory',text});else{await navigator.clipboard.writeText(text);toast('Inventory copied. Paste it into the group text.')}}catch(error){if(error.name!=='AbortError')toast('Could not open sharing. Try again.',true)}}
$('propertyCards').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.step){const k=button.dataset.key;state.drafts[k]=Math.max(0,Math.min(200,(state.drafts[k]||0)+Number(button.dataset.step)));state.dirty.add(k);render()}else if(button.dataset.save)saveProperty(button.dataset.save)});
$('inventoryTech').value=localStorage.getItem('fieldlive.pcl.tech')||'';
$('inventoryTech').addEventListener('input',event=>localStorage.setItem('fieldlive.pcl.tech',event.target.value.trim()));
$('shareInventory').addEventListener('click',share);
window.addEventListener('online',load);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
load();
})();
