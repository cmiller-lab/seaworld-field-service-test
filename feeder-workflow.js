/* Permanent event history + monthly work queue. Snapshot table remains compatible with old apps. */
'use strict';
const FW={events:[],month:'',date:'',property:'All',pins:new Set(),panels:{},drafts:{},feedback:{},pending:{},undo:{},view:'remaining',pool:null,loading:false,busy:false,loaded:false};
function fwDay(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date))}
FW.month=fwDay().slice(0,7);FW.date=fwDay();
function fwEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fwFmt(v){return v?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Never recorded'}
function fwInventory(){return FC_FEEDERS.flatMap(([property,pool,pool_name,n])=>Array.from({length:n},(_,i)=>({feeder_key:`${property}|${pool}|${String.fromCharCode(65+i)}`,property,pool,pool_name,letter:String.fromCharCode(65+i),feeder_id:`${pool}-${String.fromCharCode(65+i)}`})))}
function fwEffective(events){const cancelled=new Set(events.filter(e=>e.action==='correction').map(e=>e.payload?.correction_of).filter(Boolean));return events.filter(e=>!['cleaned','feed_down'].includes(e.action)||!cancelled.has(e.id))}
function fwProjection(key){
 const all=FW.events.filter(e=>e.feeder_key===key),events=fwEffective(all).sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at)||new Date(a.recorded_at)-new Date(b.recorded_at));
 const cleans=events.filter(e=>e.action==='cleaned'),last=cleans.at(-1),monthCleans=cleans.filter(e=>fwDay(e.occurred_at).slice(0,7)===FW.month);
 const reset=all.filter(e=>e.payload?.status_reset).sort((a,b)=>new Date(a.recorded_at)-new Date(b.recorded_at)).at(-1),working=events.filter(e=>!reset||new Date(e.recorded_at)>new Date(reset.recorded_at));
 const starts=working.filter(e=>e.action==='feed_down'),start=starts.at(-1),cancel=working.filter(e=>e.action==='correction'&&e.payload?.cancel_feed_down).at(-1);
 const feeding=!!start&&(!last||new Date(start.occurred_at)>new Date(last.occurred_at))&&(!cancel||new Date(start.occurred_at)>new Date(cancel.occurred_at));
 const levels=working.filter(e=>e.action==='level'&&start&&new Date(e.occurred_at)>=new Date(start.occurred_at));
 return {reset,currentClean:working.filter(e=>e.action==='cleaned').at(-1),last,cleans,monthCleans,start,feeding,level:levels.at(-1)?.payload?.level||start?.payload?.level||'100%',levelAt:levels.at(-1)?.occurred_at||start?.occurred_at,note:working.filter(e=>e.action==='note').at(-1),events:all};
}
function fwTech(){return document.getElementById('fwTechnician').value.trim()}
function fwNeedTech(){if(fwTech())return true;const el=document.getElementById('fwTechnician');el.focus();el.setCustomValidity('Enter your technician name once before recording work.');el.reportValidity();return false}
function fwStatus(text,error=false){const el=document.getElementById('fwRefresh');el.textContent=text;el.classList.toggle('fw-error',error)}
async function fcLoad(){return fwLoad()}
async function fcRefreshShared(){return fwLoad()}
function fcFeederViewVisible(){return !document.getElementById('view-feeders').classList.contains('hidden')}
function fcRender(){fwRender()}
async function fwLoad(){
 if(FW.loading)return;if(!FW.manualMonth)FW.month=fwDay().slice(0,7);FW.loading=true;fwStatus('Refreshing shared activity…');
 try{let rows=[],offset=0;while(true){const r=await fetch(`${PCL_SB_URL}/rest/v1/feeder_activity?select=*&order=occurred_at.asc,id.asc&limit=1000&offset=${offset}`,{headers:pclHeaders(),cache:'no-store'});if(!r.ok)throw Error(await r.text());const page=await r.json();rows.push(...page);if(page.length<1000)break;offset+=page.length}
 FW.events=rows;FW.loaded=true;fwRender();fwStatus('Shared data refreshed '+new Date().toLocaleTimeString());return true;
 }catch(e){console.error(e);fwStatus('Refresh failed — '+(FW.loaded?'showing previously loaded records.':'records unavailable. Do not infer cleaning status.')+' Tap Refresh to retry.',true);return false}finally{FW.loading=false}
}
function fwMatches(x){return FW.property==='All'||x.property===FW.property}
function fwActionText(e){const p=e.payload||{};return({feed_down:'Feed-down started',level:'Level checked: '+(p.level||'—'),cleaned:'Cleaning completed',note:'Note: '+(p.note||''),correction:'Correction: '+(p.reason||'')})[e.action]||e.action}
function fwLogRows(events){return events.map(e=>`<article class="fw-event"><div><strong>${fwEsc(e.pool_id+'-'+e.feeder_letter)}</strong> · ${fwEsc(e.property)} · ${fwEsc(e.pool_name)}</div><b>${fwEsc(fwActionText(e))}</b><small>${fwFmt(e.occurred_at)} · ${fwEsc(e.technician)}${e.source==='imported snapshot'?' · Imported saved snapshot':''}</small>${e.recorded_at&&fwDay(e.recorded_at)!==fwDay(e.occurred_at)?`<small>Recorded ${fwFmt(e.recorded_at)}</small>`:''}</article>`).join('')||'<p class="muted">No activity for this selection.</p>'}
function fwCardId(key){return 'feeder-'+encodeURIComponent(key)}
function fwCapture(){document.querySelectorAll('[data-fwdraft]').forEach(el=>{FW.drafts[el.dataset.fwdraft]=el.value})}
function fwCounts(items){return {remaining:items.filter(i=>!i.s.monthCleans.length).length,feeding:items.filter(i=>i.s.feeding).length,ready:items.filter(i=>i.s.feeding&&i.s.level==='Empty').length}}
function fwInline(x,s){const key=x.feeder_key,p=FW.panels[key],draft=FW.drafts[key]||'',attr=`data-key="${fwEsc(key)}"`;if(!p)return '';
 if(p==='detail')return `<div class="fw-inline">${fwLogRows([...s.events].sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at)))}<div class="fw-actions"><button data-fwa="backdate" ${attr}>Record Earlier Cleaning</button>${s.last?`<button data-fwa="correction" ${attr}>Correct Last Cleaning</button>`:''}</div></div>`;
 return `<div class="fw-inline"><label>${p==='note'?'New note':p==='correction'?'Reason for voiding last cleaning':'Actual cleaning time (device time zone)'}${p==='backdate'?`<input type="datetime-local" data-fwdraft="${fwEsc(key)}" value="${fwEsc(draft)}">`:`<textarea rows="2" data-fwdraft="${fwEsc(key)}" placeholder="${p==='note'?'Add service note…':'Explain the correction…'}">${fwEsc(draft)}</textarea>`}</label><div class="fw-actions"><button class="fw-primary" data-fwa="submitInline" ${attr}>${p==='correction'?'Save Correction':p==='note'?'Save Note':'Save Cleaning'}</button><button data-fwa="closeInline" ${attr}>Close</button></div></div>`
}
function fwRender(){
 if(!document.getElementById('fwBoard'))return;fwCapture();
 document.getElementById('fwMonth').value=FW.month;document.getElementById('fwDay').value=FW.date;
 const items=fwInventory().filter(fwMatches).map(x=>({x,s:fwProjection(x.feeder_key)})),done=items.filter(i=>i.s.monthCleans.length).length,counts=fwCounts(items);
 document.querySelectorAll('[data-fwview]').forEach(b=>{const name={remaining:'Remaining',feeding:'Feeding Down',ready:'Ready to Clean'}[b.dataset.fwview];b.textContent=name+' · '+counts[b.dataset.fwview];b.classList.toggle('active',b.dataset.fwview===FW.view);b.setAttribute('aria-pressed',String(b.dataset.fwview===FW.view))});
 document.getElementById('fwOtherView').value=['all','completed','history'].includes(FW.view)?FW.view:'';
 document.getElementById('fwProgress').textContent=FW.loaded?`${counts.feeding} feeding down · ${counts.ready} ready to clean · ${done}/${items.length} cleaned in ${FW.month}`:'Loading shared feeder status…';
 document.getElementById('fwMeter').value=done;document.getElementById('fwMeter').max=Math.max(1,items.length);
 document.getElementById('fwMonthHelp').textContent=FW.month!==fwDay().slice(0,7)?'Completion uses the selected month; levels show current operations.':'Feed-down carries across months. Levels are the latest technician checks.';
 const active=items.filter(i=>i.s.feeding).sort((a,b)=>(parseInt(a.s.level)||0)-(parseInt(b.s.level)||0)||a.x.feeder_id.localeCompare(b.x.feeder_id));
 document.getElementById('fwGlance').innerHTML=FW.loaded?(active.length?'<div class="fw-glance-title">Feeding Down · lowest levels first</div><div class="fw-chips">'+(FW.expandGlance?active:active.slice(0,6)).map(({x,s})=>`<button class="fw-chip ${s.level==='Empty'?'ready':s.level==='25%'?'low':''}" data-fwjump="${fwEsc(x.feeder_key)}" title="${fwEsc(x.property+' · '+x.pool_name+' · Checked '+fwFmt(s.levelAt))}"><strong>${fwEsc(x.feeder_id)}</strong> · ${s.level==='Empty'?'Empty · Ready to Clean':fwEsc(s.level)}</button>`).join('')+'</div>'+(active.length>6?`<button class="fw-glance-toggle" data-fwexpand aria-expanded="${!!FW.expandGlance}">${FW.expandGlance?'Show fewer':`Show all ${active.length} feeding down`}</button>`:''):'<p class="muted">No active feed-downs for this property.</p>'):'<p class="muted">Waiting for shared records.</p>';
 if(!FW.loaded){document.getElementById('fwBoard').innerHTML='<p>Refresh shared records before recording work.</p>';return}
 const keys=new Set(items.map(i=>i.x.feeder_key));document.getElementById('fwDailyBoard').innerHTML=fwLogRows(FW.events.filter(e=>keys.has(e.feeder_key)&&(fwDay(e.occurred_at)===FW.date||e.action==='correction'&&fwDay(e.recorded_at)===FW.date)).sort((a,b)=>new Date(b.recorded_at)-new Date(a.recorded_at)));
 if(FW.view==='history'){document.getElementById('fwBoard').innerHTML=fwLogRows(fwEffective(FW.events.filter(e=>keys.has(e.feeder_key))).filter(e=>e.action==='cleaned').sort((a,b)=>new Date(b.occurred_at)-new Date(a.occurred_at)));return}
 const filtered=items.filter(({x,s})=>FW.pins.has(x.feeder_key)||(FW.view==='remaining'?!s.monthCleans.length:FW.view==='feeding'?s.feeding:FW.view==='ready'?s.feeding&&s.level==='Empty':FW.view==='completed'?s.monthCleans.length:true));
 document.getElementById('fwBoard').innerHTML=filtered.map(({x,s})=>{const k=x.feeder_key,attr=`data-key="${fwEsc(k)}"`,busy=FW.busy?'disabled':'';return `<article class="fw-feeder" id="${fwCardId(k)}" tabindex="-1"><div class="fw-feeder-title"><strong>${fwEsc(x.feeder_id)}</strong><span class="fw-badge ${s.monthCleans.length?'done':''}">${s.monthCleans.length?'✓ Cleaned this month':'Remaining this month'}</span></div><div class="fw-pool">${fwEsc(x.property)} · ${fwEsc(x.pool_name)}</div><div class="fw-last">Last cleaned: <b>${s.last?fwFmt(s.last.occurred_at):'Never recorded'}</b>${s.last?' · '+fwEsc(s.last.technician):''}</div><div class="fw-state">${s.feeding?(s.level==='Empty'?'Ready to clean':'Feeding down')+' · '+fwEsc(s.level)+'<small>Started '+fwFmt(s.start.occurred_at)+' · '+fwEsc(s.start.technician)+'<br>Level checked '+fwFmt(s.levelAt)+'</small>':'No active feed-down'}</div>${s.feeding?`<div class="fw-levels" aria-label="Level for ${fwEsc(x.feeder_id)}">${['100%','75%','50%','25%','Empty'].map(level=>`<button ${busy} data-fwa="level" ${attr} data-level="${level}" aria-pressed="${level===s.level}">${level}</button>`).join('')}</div>`:''}${s.note?`<div class="fw-note">Latest note: ${fwEsc(s.note.payload.note)}</div>`:''}<div class="fw-actions">${!s.feeding?`<button ${busy} data-fwa="feed_down" ${attr}>${s.last?'Start Another Feed-down':'Start Feed-down'}</button>`:''}<button ${busy} class="fw-primary" data-fwa="cleaned" ${attr}>${s.feeding?'Mark Cleaned':'Record Cleaning'}</button><button ${busy} data-fwa="note" ${attr}>Add Note</button><button ${busy} data-fwa="detail" ${attr}>Activity</button></div>${fwInline(x,s)}<div class="fw-feedback ${FW.feedback[k]?.error?'fw-error':''}" role="status">${fwEsc(FW.feedback[k]?.text||'')}${FW.feedback[k]?.error?` <button data-fwa="retry" ${attr}>Retry</button>`:''}${FW.undo[k]?` <button data-fwa="undo" ${attr} ${busy}>Undo ${FW.undo[k].action==='feed_down'?'Feed-down':'Cleaning'}</button>`:''}</div></article>`}).join('')||'<p class="fw-empty">No feeders in this queue.</p>';
}
function fwPanel(action,key){fwCapture();if(FW.panels[key]===action){delete FW.panels[key]}else{FW.panels[key]=action;FW.drafts[key]='';if(action==='backdate'){const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());FW.drafts[key]=now.toISOString().slice(0,16)}}fwRender()}
async function fwSaveAction(action,key,payload={},at=null,retry=null){
 if(FW.busy||!FW.loaded)return;if(localStorage.getItem('feeder.pendingReset')){toast('Retry the unconfirmed status reset first.');return}if(!fwNeedTech())return;fwCapture();const x=fwInventory().find(x=>x.feeder_key===key);if(!x)return;
 if(!navigator.onLine){FW.feedback[key]={text:'Offline — connect before saving.',error:true};FW.pending[key]={action,key,payload,at};fwRender();return}
 const tech=fwTech(),signature=JSON.stringify({action,key,tech,payload,at});let saved;try{saved=JSON.parse(localStorage.getItem('feeder.pendingRequest')||'null')}catch{}
 // A failed request must be resolved before another operation replaces its retry identity.
 if(saved&&saved.signature!==signature){FW.feedback[key]={text:'Resolve the unconfirmed save first. Refresh, then retry that action.',error:false};fwRender();return}
 const request=saved?.signature===signature?saved:{signature,id:crypto.randomUUID(),at:at||new Date().toISOString()};
 localStorage.setItem('feeder.pendingRequest',JSON.stringify(request));FW.pending[key]={action,key,payload,at};FW.pins.add(key);FW.busy=true;FW.feedback[key]={text:'Saving…'};fwRender();
 try{const r=await fetch(`${PCL_SB_URL}/rest/v1/rpc/record_feeder_activity`,{method:'POST',headers:pclHeaders(),body:JSON.stringify({p_request_id:request.id,p_feeder_key:key,p_property:x.property,p_pool_id:x.pool,p_pool_name:x.pool_name,p_letter:x.letter,p_action:action,p_technician:tech,p_payload:payload,p_occurred_at:request.at})});if(!r.ok){const message=await r.text();if(r.status>=400&&r.status<500){localStorage.removeItem('feeder.pendingRequest');let detail;try{detail=JSON.parse(message).message}catch{};throw Error(detail||'Update rejected. Refresh and check feeder status.')}throw Error(message)}const id=await r.json();localStorage.removeItem('feeder.pendingRequest');delete FW.pending[key];delete FW.panels[key];delete FW.drafts[key];delete FW.undo[key];
 const event={id,feeder_key:key,property:x.property,pool_id:x.pool,pool_name:x.pool_name,feeder_letter:x.letter,action,technician:tech,payload,occurred_at:request.at,recorded_at:new Date().toISOString(),source:'live',request_id:request.id};if(!FW.events.some(e=>e.id===id))FW.events.push(event);
 if(['feed_down','cleaned'].includes(action))FW.undo[key]={id,action};FW.feedback[key]={text:'Saved · '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})};fwRender();await fwLoad();
 }catch(e){console.error(e);FW.feedback[key]={text:localStorage.getItem('feeder.pendingRequest')?'Save not confirmed — retry this action to avoid duplicates.':e.message,error:true}}
 finally{FW.busy=false;fwRender()}
}
async function fwClick(action,key,button){
 if(FW.busy)return;
 if(['note','detail','correction','backdate'].includes(action))return fwPanel(action,key);
 if(action==='closeInline'){delete FW.panels[key];fwRender();return}
 if(action==='retry'){const p=FW.pending[key];if(p)return fwSaveAction(p.action,key,p.payload,p.at,true);return}
 if(action==='undo'){const u=FW.undo[key];if(u)return fwSaveAction('correction',key,{correction_of:u.id,reason:'Technician used Undo for an accidental '+(u.action==='feed_down'?'feed-down start':'cleaning')});return}
 if(action==='submitInline'){fwCapture();const panel=FW.panels[key],text=(FW.drafts[key]||'').trim();if(!text){FW.feedback[key]={text:'Enter '+(panel==='backdate'?'the actual time.':'a note or correction reason.')};fwRender();return}
 if(panel==='backdate'){const date=new Date(text);if(!Number.isFinite(date.getTime())||date>new Date()){FW.feedback[key]={text:'Enter a valid past cleaning time.'};fwRender();return}return fwSaveAction('cleaned',key,{},date.toISOString())}
 return fwSaveAction(panel==='note'?'note':'correction',key,panel==='note'?{note:text}:{correction_of:fwProjection(key).last?.id,reason:text})}
 return fwSaveAction(action,key,action==='level'?{level:button.dataset.level}:{});
}
function fwStatusReport(scoped=fwInventory().filter(fwMatches)){
 const lines=['FEEDER STATUS',new Date().toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),''];
 for(const property of [...new Set(scoped.map(x=>x.property))]){
  const rows=scoped.filter(x=>x.property===property).map(x=>({x,s:fwProjection(x.feeder_key)})).filter(({s})=>s.feeding||s.currentClean);
  if(!rows.length)continue;lines.push(property.toUpperCase());
  for(const heading of ['READY TO CLEAN','FEEDING DOWN','CLEANED']){
   const group=rows.filter(({s})=>heading==='READY TO CLEAN'?s.feeding&&s.level==='Empty':heading==='FEEDING DOWN'?s.feeding&&s.level!=='Empty':!s.feeding&&s.currentClean).sort((a,b)=>(parseInt(a.s.level)||0)-(parseInt(b.s.level)||0)||a.x.feeder_id.localeCompare(b.x.feeder_id));
   if(!group.length)continue;lines.push(heading);for(const {x,s}of group)lines.push('• '+x.feeder_id+(heading==='FEEDING DOWN'?' — '+s.level:''));
  }lines.push('');
 }
 if(lines.length===3)lines.push('No current feeder statuses.');return lines.join('\n').trim();
}
async function fwResetAll(){
 if(FW.busy||!FW.loaded||!fwNeedTech())return;if(FW.loading){document.getElementById('fwResetStatus').textContent='Wait for the refresh to finish, then retry.';return}
 if(!navigator.onLine){document.getElementById('fwResetStatus').textContent='Connect before clearing statuses.';return}
 if(localStorage.getItem('feeder.pendingRequest')){document.getElementById('fwResetStatus').textContent='Resolve the unconfirmed feeder save first.';return}
 let request;try{request=JSON.parse(localStorage.getItem('feeder.pendingReset')||'null')}catch{}
 if(!request){request={id:crypto.randomUUID(),technician:fwTech()};localStorage.setItem('feeder.pendingReset',JSON.stringify(request))}
 FW.busy=true;fwRender();document.getElementById('fwResetConfirm').disabled=true;document.getElementById('fwResetStatus').textContent='Clearing all current statuses…';
 try{const r=await fetch(`${PCL_SB_URL}/rest/v1/rpc/reset_feeder_statuses`,{method:'POST',headers:pclHeaders(),body:JSON.stringify({p_request_id:request.id,p_technician:request.technician,p_feeders:fwInventory()})});if(!r.ok)throw Error(await r.text());await r.json();FW.undo={};FW.feedback={};FW.pins.clear();FW.view='all';FW.property='All';document.getElementById('fwProperty').value='All';if(!await fwLoad())throw Error('Reset saved but refresh failed');localStorage.removeItem('feeder.pendingReset');document.getElementById('fwResetStatus').textContent='All current statuses cleared. Activity logs and monthly cleaning totals retained.';
 }catch(e){console.error(e);document.getElementById('fwResetStatus').textContent='Reset or refresh not confirmed. Retry uses the same request; logs are preserved.'}
 finally{FW.busy=false;document.getElementById('fwResetConfirm').disabled=false;fwRender()}
}
async function fwShare(daily=false){
 if(!FW.loaded){toast('Refresh shared records before sharing.');return}
 const scoped=fwInventory().filter(fwMatches),keys=new Set(scoped.map(x=>x.feeder_key));let lines;
 if(daily){const rows=FW.events.filter(e=>keys.has(e.feeder_key)&&(fwDay(e.occurred_at)===FW.date||e.action==='correction'&&fwDay(e.recorded_at)===FW.date)).sort((a,b)=>new Date(a.occurred_at)-new Date(b.occurred_at));lines=['FEEDER DAILY ACTIVITY — '+FW.date,...rows.map(e=>`${fwFmt(e.occurred_at)} | ${e.property} | ${e.pool_id}-${e.feeder_letter} | ${fwActionText(e)} | ${e.technician}`)];}
 else{lines=fwStatusReport(scoped).split('\n')}
 const text=lines.join('\n');try{if(navigator.share)await navigator.share({title:lines[0],text});else{await navigator.clipboard.writeText(text);toast('Report copied.')}}catch(e){if(e.name!=='AbortError')toast('Could not share report.')}
}
window.setFeederPool=()=>{};
document.getElementById('fwTechnician').value=localStorage.getItem('fieldlive.pcl.tech')||document.getElementById('tech').value||'';
document.getElementById('fwTechnician').addEventListener('input',e=>{e.target.setCustomValidity('');localStorage.setItem('fieldlive.pcl.tech',e.target.value.trim());document.getElementById('tech').value=e.target.value.trim()});
document.getElementById('fwResetConfirm').onclick=fwResetAll;
if(localStorage.getItem('feeder.pendingReset'))document.getElementById('fwResetStatus').textContent='Previous reset unconfirmed. Open Clear Current Statuses and retry.';
document.getElementById('fwRefreshBtn').onclick=()=>{FW.pins.clear();fwLoad()};document.getElementById('fwShare').onclick=()=>fwShare();document.getElementById('fwShareDaily').onclick=()=>fwShare(true);
for(const [id,key]of [['fwMonth','month'],['fwDay','date'],['fwProperty','property']])document.getElementById(id).addEventListener('change',e=>{if(e.target.value){if(key==='month')FW.manualMonth=true;FW[key]=e.target.value;FW.pins.clear();fwRender()}});
document.getElementById('fwOtherView').addEventListener('change',e=>{if(e.target.value){FW.view=e.target.value;FW.pins.clear();fwRender()}});
document.getElementById('view-feeders').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-fwexpand')){FW.expandGlance=!FW.expandGlance;fwRender()}if(b.dataset.fwview){FW.view=b.dataset.fwview;FW.pins.clear();fwRender()}if(b.dataset.fwa)fwClick(b.dataset.fwa,b.dataset.key,b);if(b.dataset.fwjump){const key=b.dataset.fwjump;FW.pins.add(key);if(FW.view==='history')FW.view='feeding';fwRender();const card=document.getElementById(fwCardId(key));card?.scrollIntoView({behavior:'smooth',block:'start'});card?.focus({preventScroll:true})}});
document.querySelector('nav button[data-view="feeders"]').addEventListener('click',fwLoad);
new MutationObserver(()=>document.body.classList.toggle('feeder-view',fcFeederViewVisible())).observe(document.getElementById('view-feeders'),{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&fcFeederViewVisible())fwLoad()});window.addEventListener('online',()=>{if(fcFeederViewVisible())fwLoad()});window.addEventListener('pageshow',()=>{if(fcFeederViewVisible())fwLoad()});
try{const pending=JSON.parse(localStorage.getItem('feeder.pendingRequest')||'null');if(pending){const op=JSON.parse(pending.signature);FW.pending[op.key]={action:op.action,key:op.key,payload:op.payload,at:op.at||null};FW.pins.add(op.key);FW.feedback[op.key]={text:'Previous save unconfirmed — retry to check it.',error:true}}}catch{}
fwRender();fwLoad();
