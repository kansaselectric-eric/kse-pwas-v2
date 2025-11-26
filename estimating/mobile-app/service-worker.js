/* eslint-env serviceworker */
/* KSE Estimating PWA - Workbox SW */
try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
} catch (err) {
  console.warn('Workbox failed to load', err);
}
if (self.workbox) {
  const { routing, strategies, recipes, precaching } = self.workbox;
  precaching.precacheAndRoute([
    { url: './', revision: null },
    { url: './index.html', revision: null },
    { url: './app.js', revision: null },
    { url: './manifest.json', revision: null }
  ]);
  routing.registerRoute(
    ({ request }) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style',
    new strategies.StaleWhileRevalidate({ cacheName: 'kse-est-core' })
  );
  routing.registerRoute(
    ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/'),
    new strategies.NetworkFirst({ cacheName: 'kse-est-pages', networkTimeoutSeconds: 3 })
  );
  recipes.offlineFallback({ pageFallback: './index.html' });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'estimating-sync') {
    event.waitUntil(syncQueuedEntries_());
  }
});

async function syncQueuedEntries_() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('kse-estimating', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entriesQueue')) {
          db.createObjectStore('entriesQueue', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction('entriesQueue', 'readonly');
      const req = tx.objectStore('entriesQueue').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    for (const item of all) {
      if (item.nextAttempt && Date.now() < item.nextAttempt) continue;
      try {
        await fetch('https://script.google.com/macros/s/YOUR_ESTIMATING_APPS_SCRIPT_URL/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('entriesQueue', 'readwrite');
          tx.objectStore('entriesQueue').delete(item.id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        const attempts = (item.attempts || 0) + 1;
        const nextAttempt = Date.now() + Math.min(60 * 60 * 1000, 2000 * Math.pow(2, attempts));
        await new Promise((resolve, reject) => {
          const tx = db.transaction('entriesQueue', 'readwrite');
          tx.objectStore('entriesQueue').put({ ...item, attempts, nextAttempt });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
  } catch (err) {
    console.error('Estimating SW sync failed', err);
  }
}




