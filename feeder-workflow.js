/* Permanent event history + monthly work queue. Snapshot table remains compatible with old apps. */
'use strict';
const FW={events:[],month:'',date:'',property:'All',scope:'all',view:'remaining',pool:null,loading:false,busy:false,loaded:false};
function fwDay(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date))}
FW.month=fwDay().slice(0,7);FW.date=fwDay();
function fwEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fwFmt(v){return v?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Never recorded'}
function fwInventory(){return FC_FEEDERS.flatMap(([property,pool,pool_name,n])=>Array.from({length:n},(_,i)=>({feeder_key:`${property}|${pool}|${String.fromCharCode(65+i)}`,property,pool,pool_name,letter:String.fromCharCode(65+i),feeder_id:`${pool}-${String.fromCharCode(65+i)}`})))}
function fwEffective(events){const cancelled=new Set(events.filter(e=>e.action==='correction').map(e=>e.payload?.correction_of).filter(Boolean));return events.filter(e=>e.action!=='cleaned'||!cancelled.has(e.id))}
function fwProjection(key){
 const all=FW.events.filter(e=>e.feeder_key===key),events=fwEffective(all).sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at)||new Date(a.recorded_at)-new Date(b.recorded_at));
 const cleans=events.filter(e=>e.action==='cleaned'),last=cleans.at(-1),monthCleans=cleans.filter(e=>fwDay(e.occurred_at).slice(0,7)===FW.month);
 const starts=events.filter(e=>e.action==='feed_down'),start=starts.at(-1),cancel=events.filter(e=>e.action==='correction'&&e.payload?.cancel_feed_down).at(-1);
 const feeding=!!start&&(!last||new Date(start.occurred_at)>new Date(last.occurred_at))&&(!cancel||new Date(start.occurred_at)>new Date(cancel.occurred_at));
 const levels=events.filter(e=>e.action==='level'&&start&&new Date(e.occurred_at)>=new Date(start.occurred_at));
 return {last,cleans,monthCleans,start,feeding,level:levels.at(-1)?.payload?.level||start?.payload?.level||'100%',levelAt:levels.at(-1)?.occurred_at||start?.occurred_at,note:events.filter(e=>e.action==='note').at(-1),events:all};
}
function fwTech(){return localStorage.getItem('fieldlive.pcl.tech')||document.getElementById('tech').value.trim()||''}
function fwSetTech(){const v=prompt('Working technician',fwTech());if(v===null||!v.trim())return;localStorage.setItem('fieldlive.pcl.tech',v.trim());document.getElementById('tech').value=v.trim();fwRender()}
function fwStatus(text,error=false){const el=document.getElementById('fwRefresh');el.textContent=text;el.classList.toggle('fw-error',error)}
async function fcLoad(){return fwLoad()}
async function fcRefreshShared(){return fwLoad()}
function fcFeederViewVisible(){return !document.getElementById('view-feeders').classList.contains('hidden')}
function fcRender(){fwRender()}
async function fwLoad(){
 if(FW.loading)return;if(!FW.manualMonth)FW.month=fwDay().slice(0,7);FW.loading=true;fwStatus('Refreshing shared activity…');
 try{let rows=[],offset=0;while(true){const r=await fetch(`${PCL_SB_URL}/rest/v1/feeder_activity?select=*&order=occurred_at.asc,id.asc&limit=1000&offset=${offset}`,{headers:pclHeaders(),cache:'no-store'});if(!r.ok)throw Error(await r.text());const page=await r.json();rows.push(...page);if(page.length<1000)break;offset+=page.length}
 FW.events=rows;FW.loaded=true;fwRender();fwStatus('Shared data refreshed '+new Date().toLocaleTimeString());
 }catch(e){console.error(e);fwStatus('Refresh failed — '+(FW.loaded?'showing previously loaded records.':'records unavailable. Do not infer cleaning status.')+' Tap Refresh to retry.',true)}finally{FW.loading=false}
}
function fwMatches(x){return(FW.property==='All'||x.property===FW.property)&&(FW.scope!=='pool'||!FW.pool||(x.property===FW.pool.property&&x.pool_name===FW.pool.name))}
function fwActionText(e){const p=e.payload||{};return({feed_down:'Feed-down started',level:'Level checked: '+(p.level||'—'),cleaned:'Cleaning completed',note:'Note: '+(p.note||''),correction:'Correction: '+(p.reason||'')})[e.action]||e.action}
function fwLogRows(events){return events.map(e=>`<article class="fw-event"><div><strong>${fwEsc(e.pool_id+'-'+e.feeder_letter)}</strong> · ${fwEsc(e.property)} · ${fwEsc(e.pool_name)}</div><b>${fwEsc(fwActionText(e))}</b><small>${fwFmt(e.occurred_at)} · ${fwEsc(e.technician)}${e.source==='imported snapshot'?' · Imported saved snapshot':''}</small>${e.recorded_at&&fwDay(e.recorded_at)!==fwDay(e.occurred_at)?`<small>Recorded ${fwFmt(e.recorded_at)}</small>`:''}</article>`).join('')||'<p class="muted">No activity for this selection.</p>'}
function fwRender(){
 if(!document.getElementById('fwBoard'))return;
 document.getElementById('fwTechName').textContent=fwTech()||'Choose technician';
 document.getElementById('fwMonth').value=FW.month;document.getElementById('fwDay').value=FW.date;
 document.querySelectorAll('[data-fwview]').forEach(b=>{b.classList.toggle('active',b.dataset.fwview===FW.view);b.setAttribute('aria-pressed',b.dataset.fwview===FW.view?'true':'false')});
 const inv=fwInventory(),scoped=inv.filter(fwMatches),items=scoped.map(x=>({x,s:fwProjection(x.feeder_key)})),done=items.filter(({s})=>s.monthCleans.length).length;
 document.getElementById('fwProgress').textContent=FW.loaded?`${done} of ${items.length} cleaned · ${items.length-done} remaining · ${FW.month}`:'Loading monthly completion…';
 document.getElementById('fwMeter').value=done;document.getElementById('fwMeter').max=Math.max(1,items.length);
 const historical=FW.month!==fwDay().slice(0,7);
 document.getElementById('fwMonthHelp').textContent=historical?'Completion uses the selected month. Feed-down and ready status show current operations.':'One cleaning per calendar month. Feed-down carries across month boundaries.';
 const daily=FW.view==='daily',history=FW.view==='history';document.getElementById('fwDailyControls').hidden=!daily;
 if(!FW.loaded){document.getElementById('fwBoard').innerHTML='<p>Load shared records before viewing completion or recording work.</p>';return}
 if(daily||history){const keys=new Set(scoped.map(x=>x.feeder_key));let rows=FW.events.filter(e=>keys.has(e.feeder_key));if(daily)rows=rows.filter(e=>fwDay(e.occurred_at)===FW.date||e.action==='correction'&&fwDay(e.recorded_at)===FW.date);else rows=fwEffective(rows).filter(e=>e.action==='cleaned');rows.sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at));document.getElementById('fwBoard').innerHTML=fwLogRows(rows);return}
 const filtered=items.filter(({s})=>FW.view==='remaining'?!s.monthCleans.length:FW.view==='feeding'?s.feeding:FW.view==='ready'?s.feeding&&s.level==='Empty':FW.view==='completed'?s.monthCleans.length:true);
 document.getElementById('fwBoard').innerHTML=filtered.map(({x,s})=>`<article class="fw-feeder"><div class="fw-feeder-title"><strong>${fwEsc(x.feeder_id)}</strong><span class="fw-badge ${s.monthCleans.length?'done':''}">${s.monthCleans.length?'✓ Cleaned this month':'Remaining this month'}</span></div><div class="fw-pool">${fwEsc(x.property)} · ${fwEsc(x.pool_name)}</div><div class="fw-last">Last cleaned: <b>${s.last?fwFmt(s.last.occurred_at):'Never recorded'}</b>${s.last?' · '+fwEsc(s.last.technician):''}</div><div class="fw-state">${s.feeding?(s.level==='Empty'?'Ready to clean':'Feeding down')+' · '+fwEsc(s.level)+'<small>Started '+fwFmt(s.start.occurred_at)+' · '+fwEsc(s.start.technician)+'<br>Latest level '+fwFmt(s.levelAt)+'</small>':'No active feed-down'}</div>${s.note?`<div class="fw-note">Latest note: ${fwEsc(s.note.payload.note)}</div>`:''}<div class="fw-actions">${s.feeding?`<button data-fwa="level" data-key="${fwEsc(x.feeder_key)}">Update Level</button>`:`<button data-fwa="feed_down" data-key="${fwEsc(x.feeder_key)}">${s.last?'Start Another Feed-down':'Start Feed-down'}</button>`}<button class="fw-primary" data-fwa="cleaned" data-key="${fwEsc(x.feeder_key)}">${s.feeding?'Mark Cleaned':'Record Cleaning'}</button><button data-fwa="note" data-key="${fwEsc(x.feeder_key)}">Add Note</button><button data-fwa="detail" data-key="${fwEsc(x.feeder_key)}">Activity${s.last?' & Corrections':''}</button></div></article>`).join('')||'<p class="fw-empty">No feeders in this view. Choose another queue or filter.</p>';
}
function fwShowDetail(key){const x=fwInventory().find(x=>x.feeder_key===key),s=fwProjection(key);document.getElementById('fwDetailTitle').textContent=x.feeder_id+' · Activity';document.getElementById('fwDetailBody').innerHTML=fwLogRows([...s.events].sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at)))+(s.last?`<button class="fw-correct" data-fwa="correction" data-key="${fwEsc(key)}" data-event="${s.last.id}">Correct / void last cleaning</button>`:'');document.getElementById('fwDetail').showModal()}
function fwOpen(action,key,eventId){
 if(action==='detail')return fwShowDetail(key);
 if(!FW.loaded){toast('Load shared records first.');return}if(!fwTech()){fwSetTech();if(!fwTech())return}
 const x=fwInventory().find(x=>x.feeder_key===key),s=fwProjection(key);if(!x)return;
 const d=document.getElementById('fwAction');d.dataset.key=key;d.dataset.action=action;d.dataset.event=eventId||'';
 document.getElementById('fwActionTitle').textContent=x.feeder_id+' · '+({feed_down:'Start feed-down',level:'Update level',cleaned:'Record cleaning',note:'Add note',correction:'Correct cleaning record'})[action];
 document.getElementById('fwActionHelp').textContent=action==='correction'?'This will void the selected cleaning with a recorded reason. The original remains in Activity. Record a replacement cleaning afterward if needed.':action==='cleaned'?'Records actual cleaning time. Previous cleanings remain in history. No feed-down time is invented.':'Saved as a new activity entry with your name and time.';
 document.getElementById('fwLevelWrap').hidden=action!=='level';document.getElementById('fwTextWrap').hidden=!['note','correction'].includes(action);document.getElementById('fwDateWrap').hidden=action!=='cleaned';
 document.getElementById('fwTextLabel').textContent=action==='correction'?'Correction reason':'New note';document.getElementById('fwText').value='';document.getElementById('fwLevel').value=s.level;
 const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());document.getElementById('fwWhen').value=now.toISOString().slice(0,16);document.getElementById('fwSaveError').textContent='';document.getElementById('fwSave').disabled=false;
 d.showModal();
}
async function fwSubmit(){
 if(FW.busy)return;const d=document.getElementById('fwAction'),action=d.dataset.action,x=fwInventory().find(x=>x.feeder_key===d.dataset.key),tech=fwTech();let payload={},at=new Date().toISOString();const error=document.getElementById('fwSaveError');error.textContent='';
 if(!navigator.onLine){error.textContent='Offline — connect before saving a feeder update.';return}
 if(action==='level')payload.level=document.getElementById('fwLevel').value;
 if(action==='note'||action==='correction'){const text=document.getElementById('fwText').value.trim();if(!text){error.textContent='Enter '+(action==='note'?'a note.':'a correction reason.');return}payload[action==='note'?'note':'reason']=text;if(action==='correction')payload.correction_of=d.dataset.event}
 if(action==='cleaned'){const v=document.getElementById('fwWhen').value;if(!v||!Number.isFinite(new Date(v).getTime())){error.textContent='Enter the cleaning date and time.';return}at=new Date(v).toISOString();if(new Date(at)>new Date()){error.textContent='Cleaning time cannot be in the future.';return}}
 FW.busy=true;document.getElementById('fwSave').disabled=true;
 const signature=JSON.stringify({action,key:x.feeder_key,tech,payload,at:action==='cleaned'?at:''});let pending;try{pending=JSON.parse(localStorage.getItem('feeder.pendingRequest')||'null')}catch{}
 const request=pending?.signature===signature?pending:{signature,id:crypto.randomUUID(),at};localStorage.setItem('feeder.pendingRequest',JSON.stringify(request));
 try{const r=await fetch(`${PCL_SB_URL}/rest/v1/rpc/record_feeder_activity`,{method:'POST',headers:pclHeaders(),body:JSON.stringify({p_request_id:request.id,p_feeder_key:x.feeder_key,p_property:x.property,p_pool_id:x.pool,p_pool_name:x.pool_name,p_letter:x.letter,p_action:action,p_technician:tech,p_payload:payload,p_occurred_at:request.at})});if(!r.ok)throw Error(await r.text());localStorage.removeItem('feeder.pendingRequest');d.close();if(document.getElementById('fwDetail').open)document.getElementById('fwDetail').close();toast('Saved to shared activity log.');await fwLoad();
 }catch(e){console.error(e);error.textContent='Save not confirmed. Retry uses the same request to prevent duplicate entries.'}finally{FW.busy=false;document.getElementById('fwSave').disabled=false}
}
async function fwShare(){
 if(!FW.loaded){toast('Refresh shared records before sharing.');return}
 const scoped=fwInventory().filter(fwMatches),keys=new Set(scoped.map(x=>x.feeder_key));let lines;
 if(FW.view==='daily'){const rows=FW.events.filter(e=>keys.has(e.feeder_key)&&(fwDay(e.occurred_at)===FW.date||e.action==='correction'&&fwDay(e.recorded_at)===FW.date)).sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at));lines=['FEEDER DAILY ACTIVITY — '+FW.date,...rows.map(e=>`${fwFmt(e.occurred_at)} | ${e.property} | ${e.pool_id}-${e.feeder_letter} | ${fwActionText(e)} | ${e.technician}`)];}
 else{lines=['FEEDER STATUS — '+FW.month,new Date().toLocaleString(),...scoped.map(x=>{const s=fwProjection(x.feeder_key);return `${x.property} | ${x.feeder_id} | ${s.monthCleans.length?'Completed':'Remaining'} | ${s.feeding?'Feeding down '+s.level:'No active feed-down'} | Last cleaned: ${s.last?fwFmt(s.last.occurred_at):'Never recorded'}`})]}
 const text=lines.join('\n');try{if(navigator.share)await navigator.share({title:lines[0],text});else{await navigator.clipboard.writeText(text);toast('Report copied.')}}catch(e){if(e.name!=='AbortError')toast('Could not share report.')}
}
window.setFeederPool=(property,name)=>{FW.pool={property,name};fwRender()};
document.getElementById('fwTech').onclick=fwSetTech;document.getElementById('fwRefreshBtn').onclick=fwLoad;document.getElementById('fwShare').onclick=fwShare;document.getElementById('fwSave').onclick=fwSubmit;
for(const [id,key]of [['fwMonth','month'],['fwDay','date'],['fwProperty','property'],['fwScope','scope']])document.getElementById(id).addEventListener('change',e=>{if(e.target.value){if(key==='month')FW.manualMonth=true;FW[key]=e.target.value;fwRender()}});
document.getElementById('view-feeders').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.fwview){FW.view=b.dataset.fwview;fwRender()}if(b.dataset.fwa)fwOpen(b.dataset.fwa,b.dataset.key,b.dataset.event)});
for(const id of ['fwAction','fwDetail'])document.getElementById(id).addEventListener('click',e=>{const b=e.target.closest('[data-fwclose]');if(b)document.getElementById(id).close();const a=e.target.closest('[data-fwa]');if(a)fwOpen(a.dataset.fwa,a.dataset.key,a.dataset.event)});
document.querySelector('nav button[data-view="feeders"]').addEventListener('click',fwLoad);
new MutationObserver(()=>document.body.classList.toggle('feeder-view',fcFeederViewVisible())).observe(document.getElementById('view-feeders'),{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&fcFeederViewVisible())fwLoad()});window.addEventListener('online',()=>{if(fcFeederViewVisible())fwLoad()});window.addEventListener('pageshow',()=>{if(fcFeederViewVisible())fwLoad()});
fwRender();fwLoad();
