/* Tesseract field pilot: photos stay on device; only approved readings enter the form. */
(function(root){
'use strict';
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
function parse(text,kind,pools=[]){
 const lines=text.split(/\n/).map(s=>s.trim()).filter(Boolean), values={};
 const patterns={ph:/\bp\s*h\b/i,fc:/free\s*chlorine|\bf\s*cl(?:₂|2)?\b/i,orp:/\borp\b/i};
 for(const [metric,pattern] of Object.entries(patterns)){
  if(kind==='test'&&metric==='orp')continue;
  const candidates=[];
  lines.forEach((line,i)=>{
   if(!pattern.test(line)||/set\s*point|target|total\s*chlorine/i.test(line))return;
   let tail=line.slice(line.search(pattern)).replace(pattern,'').replace(/\([^)]*\)/g,'').replace(/level/ig,'');
   let match=tail.match(/(?:^|[^\d])([0-9]{1,4}(?:[.,][0-9]{1,2})?)\s*(?:ppm|mg\/l|mv)?\s*$/i);
   if(!match){const next=lines[i+1]||'';match=next.match(/^([0-9]{1,4}(?:[.,][0-9]{1,2})?)\s*(?:ppm|mg\/l|mv)?$/i);}
   if(match){const n=Number(match[1].replace(',','.'));if(n>=0&&n<=({ph:14,fc:60,orp:1200}[metric])&&(metric!=='orp'||Number.isInteger(n)))candidates.push(n);}
  });
  const unique=[...new Set(candidates)];if(unique.length===1)values[metric]=unique[0];
 }
 const normalized=normalize(text), matches=pools.filter(p=>[p.id,p.name].some(s=>{const n=normalize(s);return n.length>=3&&normalized.includes(n)}));
 return {values,poolKey:matches.length===1?matches[0].key:'',paused:/\bpause(?:d)?\b/i.test(text)};
}
root.FieldOCR={parse};
if(typeof module!=='undefined')module.exports={parse};
if(typeof document==='undefined')return;
const el=id=>document.getElementById(id), panel=el('ocrPanel');if(!panel)return;
let image=null,rotation=0,crop=null,start=null,busy=false,worker=null,kind='controller',timer=null;
const canvas=el('ocrCanvas'),ctx=canvas.getContext('2d');
const status=s=>el('ocrStatus').textContent=s;
function render(){
 if(!image)return;const scale=Math.min(1,1600/Math.max(image.width,image.height)),w=Math.round(image.width*scale),h=Math.round(image.height*scale);
 canvas.width=rotation%180?h:w;canvas.height=rotation%180?w:h;
 ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();
 if(crop){ctx.strokeStyle='#ffb300';ctx.lineWidth=4;ctx.strokeRect(crop.x,crop.y,crop.w,crop.h);}
}
function point(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};}
canvas.addEventListener('pointerdown',e=>{if(busy||!image)return;start=point(e);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!start)return;const p=point(e);crop={x:Math.min(p.x,start.x),y:Math.min(p.y,start.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};render();});
canvas.addEventListener('pointerup',()=>{start=null;if(crop&&(crop.w<20||crop.h<20))crop=null;render();});
canvas.addEventListener('pointercancel',()=>{start=null;crop=null;render();});
function controls(){panel.querySelectorAll('button,input[type=file]').forEach(b=>b.disabled=busy);el('ocrScan').disabled=busy||!image;el('ocrCancel').disabled=!busy;}
function invalidate(){el('ocrReview').hidden=true;}
panel.querySelectorAll('[data-ocr-photo]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.ocrPhoto;el('ocrFile').value='';el('ocrFile').click();}));
el('ocrFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;invalidate();status('Opening photo…');
 try{const url=URL.createObjectURL(file),img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});}finally{URL.revokeObjectURL(url);}image=img;rotation=0;crop=null;el('ocrEditor').hidden=false;render();status(`${kind==='controller'?'Controller':'Field test'} photo. Drag over the display to crop, then scan.`);}catch{status('Cannot open this photo. Try a JPEG or enter readings manually.');}controls();
});
el('ocrRotate').onclick=()=>{rotation=(rotation+90)%360;crop=null;invalidate();render();};
el('ocrFull').onclick=()=>{crop=null;invalidate();render();};
async function stop(message){root.FieldOCR.active=null;clearTimeout(timer);if(worker){await worker.terminate().catch(()=>{});worker=null;}busy=false;controls();status(message);}
el('ocrCancel').onclick=()=>stop('Scan cancelled. Manual entry is available.');
function loadEngine(){if(root.Tesseract)return Promise.resolve();return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});}
el('ocrScan').onclick=async()=>{
 if(busy||!image)return;invalidate();busy=true;controls();status('Loading scanner. First scan needs an internet connection…');
 const scanToken={};root.FieldOCR.active=scanToken;
 timer=setTimeout(()=>{root.FieldOCR.active=null;stop('Scan timed out. Try a tighter crop or enter readings manually.');},120000);
 try{
  await loadEngine();if(root.FieldOCR.active!==scanToken||!busy)return;
  const createdWorker=await root.Tesseract.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',logger:m=>{if(busy&&root.FieldOCR.active===scanToken)status(`${m.status} ${Math.round((m.progress||0)*100)}%`);}});
  if(root.FieldOCR.active!==scanToken||!busy){await createdWorker.terminate();return;}worker=createdWorker;await worker.setParameters({tessedit_pageseg_mode:'11'});
  const region=crop||{x:0,y:0,w:canvas.width,h:canvas.height},input=document.createElement('canvas');input.width=Math.round(region.w);input.height=Math.round(region.h);
  crop=null;render();input.getContext('2d').drawImage(canvas,region.x,region.y,region.w,region.h,0,0,input.width,input.height);crop=region;render();
  const ic=input.getContext('2d'),pixels=ic.getImageData(0,0,input.width,input.height),hist=new Uint32Array(256);
  for(let i=0;i<pixels.data.length;i+=4){const gray=Math.round(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2]);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;hist[gray]++;}
  const total=input.width*input.height;let sum=0,lo=0,hi=255;for(let i=0;i<256;i++){sum+=hist[i];if(sum<total*.01)lo=i;if(sum<total*.99)hi=i;}
  if(hi>lo)for(let i=0;i<pixels.data.length;i+=4){const v=Math.max(0,Math.min(255,(pixels.data[i]-lo)*255/(hi-lo)));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}ic.putImageData(pixels,0,0);
  const {data}=await worker.recognize(input);if(!busy||root.FieldOCR.active!==scanToken)return;
  const result=parse(data.text,kind,POOLS);el('ocrRaw').textContent=data.text||'No text detected.';
  el('ocrReviewTitle').textContent=`Review ${kind==='controller'?'controller':'field test'} readings`;
  ['ph','fc','orp'].forEach(metric=>{el('ocr'+metric).value=result.values[metric]??'';el('ocr'+metric+'Row').hidden=kind==='test'&&metric==='orp';});
  el('ocrPool').replaceChildren(new Option('Keep current pool — '+(selectedPool()?.name||'select a pool'),''),...POOLS.map(p=>new Option(p.property+' • '+p.id,p.key)));el('ocrPool').value=kind==='controller'?result.poolKey:'';
  el('ocrWarning').textContent=(result.paused?'Controller shows PAUSE. Confirm the readings represent this visit. ':'')+'Check every value against the photo. Blank or ambiguous readings need manual entry. Confirm the pool; test photos use the selected pool.';
  el('ocrReview').hidden=false;await stop('Scan complete. Review and approve below; form has not changed.');
 }catch{if(busy&&root.FieldOCR.active===scanToken)await stop('Scan failed. Check your connection, try a tighter crop, or enter readings manually.');}
};
el('ocrApprove').onclick=()=>{
 const mapping=kind==='controller'?{ph:'controllerPh',fc:'controllerFc',orp:'orpMv'}:{ph:'testPh',fc:'testFc'},updates=[];
 for(const [metric,id] of Object.entries(mapping)){const input=el('ocr'+metric);if(input.value==='')continue;if(!input.checkValidity()){status('Correct the highlighted reading before approval.');input.reportValidity();return;}updates.push([id,input.value]);}
 if(!updates.length){status('No readings to apply. Enter a reading or use manual entry.');return;}
 const key=el('ocrPool').value,p=POOLS.find(p=>p.key===key);if(p){el('property').value=p.property;fillPools();el('pool').value=p.key;el('pool').dispatchEvent(new Event('change'));}
 updates.forEach(([id,value])=>{el(id).value=value;el(id).dispatchEvent(new Event('input',{bubbles:true}));});
 invalidate();status(`Approved ${updates.length} reading${updates.length===1?'':'s'} for ${selectedPool()?.name||'current pool'}. Review the form, then save the spot check.`);
};
el('ocrDiscard').onclick=()=>{invalidate();status('Suggestions discarded. Form unchanged.');};
document.addEventListener('spot-check-saved',()=>{invalidate();image=null;crop=null;el('ocrEditor').hidden=true;status('Ready for the next photo. Manual entry is always available.');});
controls();
})(typeof window!=='undefined'?window:globalThis);
