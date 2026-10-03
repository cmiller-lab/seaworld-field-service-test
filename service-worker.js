const CACHE='seaworld-chemistry-console-field-service-test-v1';
const ASSETS=[
  './',
  './index.html',
  './index.html?version=15.11.2',
  './manifest.webmanifest?v=15.1',
  './icon-192.png',
  './icon-512.png',
  './lab-sheets.html',
  './lab-upload.html',
  './lab-config.js',
  './lab-api.js',
  './field-ui.js',
  './field-ui.css',
  './test-data.js',
  './calibration.html',
  './calibration.html?embedded=1'
];

self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(new URL(event.request.url).origin!==self.location.origin)return;

  const isNavigation=event.request.mode==='navigate';

  if(isNavigation){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          // Only replace the cached console fallback when the request is for
          // the console itself. Lab pages keep their own cached responses.
          const url=new URL(event.request.url);
          const isConsole=url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');
          if(isConsole)caches.open(CACHE).then(cache=>cache.put('./index.html',copy.clone()));
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>{
      const network=fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>cached);
      return cached||network;
    })
  );
});

