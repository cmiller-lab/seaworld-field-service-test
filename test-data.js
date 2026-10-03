/* Local test API. All requests to Supabase are handled here; none reach production. */
(function(){
 const originalFetch=window.fetch.bind(window);
 window.fetch=async function(input,options={}){
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(!url.hostname.endsWith('.supabase.co'))return originalFetch(input,options);
 const table=url.pathname.split('/').pop(),key='field-test-api.'+table;
 let rows=JSON.parse(localStorage.getItem(key)||'[]');
 const method=(options.method||input.method||'GET').toUpperCase();
 if(method==='POST'){
  const incoming=JSON.parse(options.body);for(const row of (Array.isArray(incoming)?incoming:[incoming])){const i=rows.findIndex(x=>table==='feeder_cleanings'?x.month===row.month&&x.feeder_key===row.feeder_key:x.id===row.id);if(i>=0)rows[i]={...rows[i],...row};else rows.push({...row,created_at:new Date().toISOString()})}localStorage.setItem(key,JSON.stringify(rows));return new Response(JSON.stringify(Array.isArray(incoming)?incoming:[incoming]),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(method==='DELETE'){rows=rows.filter(x=>x.id!==url.searchParams.get('id')?.replace('eq.',''));localStorage.setItem(key,JSON.stringify(rows));return new Response(null,{status:204})}
 if(method!=='GET')return new Response('Unsupported test operation',{status:400});
 const month=url.searchParams.get('month');if(month)rows=rows.filter(x=>x.month===month.replace('eq.',''));
 if(url.searchParams.get('cleaned_at'))rows=rows.filter(x=>x.cleaned_at);
 rows.sort((a,b)=>new Date(b.cleaned_at||b.observed_at)-new Date(a.cleaned_at||a.observed_at));
 return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
 };
})();
