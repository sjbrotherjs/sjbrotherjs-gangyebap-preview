importScripts('offline-list.js');
const prefix='gangyebap:'+self.registration.scope+':';
const cacheName=prefix+release;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(cacheName);
    for(let i=0;i<offlineFiles.length;i+=12)await cache.addAll(offlineFiles.slice(i,i+12).map(p=>new Request(p,{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==cacheName)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    const key=event.request.mode==='navigate'?new URL('index.html',self.registration.scope):event.request;
    return await cache.match(key)||fetch(event.request);
  })());
});
