// Cache propre à /test-v03/ ; ne touche jamais à l'application V0.2 racine.
const CACHE='chaudiere-hornu-v03-etape1-test-v4';
const PREFIX='chaudiere-hornu-v03-etape1-test-';
const ASSETS=['./','./index.html','./core.js','./app.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.includes('/test-v03/'))return;
  // Ressources téléchargées dans CE cache uniquement (pas celui de la V0.2).
  e.respondWith(caches.open(CACHE).then(async cache=>{
    try {const r=await fetch(e.request);if(r.ok)cache.put(e.request,r.clone());return r}
    catch(err){return (await cache.match(e.request))||Response.error()}
  }));
});
