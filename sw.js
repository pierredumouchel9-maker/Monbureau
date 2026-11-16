/* Service worker : met l'application en cache pour qu'elle fonctionne sans connexion.
   Ne contient jamais de données personnelles (elles sont dans IndexedDB, chiffrées). */
const CACHE = 'mon-bureau-v0.8.7';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'lib/pdf-lib.min.js', 'lib/pdfjs/pdf.min.mjs', 'lib/pdfjs/pdf.worker.min.mjs', 'js/core.js', 'js/files.js', 'js/pdf.js',
  'js/skills/accueil.js', 'js/skills/annuaire.js', 'js/skills/modeles.js', 'js/skills/coffre.js',
  'js/skills/sauvegarde.js', 'js/skills/parametres.js', 'js/skills/gestion-skills.js', 'js/skills/circonscription.js', 'js/skills/a-venir.js'
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // Réseau d'abord (pour recevoir les mises à jour), cache si hors ligne.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true})));
});
