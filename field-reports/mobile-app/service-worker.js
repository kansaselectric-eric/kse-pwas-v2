/* Kansas Electric Field Reports - Service Worker with Workbox */

try {
  importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');
} catch (e) {
  // fallback to no-op
}

if (self.workbox) {
  const { routing, strategies, recipes, precaching } = self.workbox;

  precaching.precacheAndRoute([
    { url: './', revision: null },
    { url: './index.html', revision: null },
    { url: './app.js', revision: null },
    { url: './styles.css', revision: null },
    { url: './manifest.json', revision: null }
  ]);

  routing.registerRoute(
    ({ request }) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style',
    new strategies.StaleWhileRevalidate({ cacheName: 'kse-fw-core' })
  );

  routing.registerRoute(
    ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/'),
    new strategies.NetworkFirst({ cacheName: 'kse-fw-pages', networkTimeoutSeconds: 3 })
  );

  recipes.offlineFallback({
    pageFallback: './index.html'
  });
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'field-reports-sync') {
    event.waitUntil(syncQueuedReports_());
  }
});

async function syncQueuedReports_() {
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('kse-field-reports', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('reportsQueue')) {
          db.createObjectStore('reportsQueue', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction('reportsQueue', 'readonly');
      const req = tx.objectStore('reportsQueue').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    // Load ID token from localStorage via clients API (best-effort)
    let idToken = null;
    try {
      const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      // try to message a client for token; fallback to reading indexedDB/localStorage is restricted here
      // In practice, we rely on the client attaching token on interactive submits.
    } catch (e) {
      // ignore
    }

    for (const item of items) {
      try {
        const res = await fetch('https://script.google.com/macros/s/YOUR_APPS_SCRIPT_WEB_APP_URL/exec', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
          },
          body: JSON.stringify(item.payload)
        });
        if (res.ok) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('reportsQueue', 'readwrite');
            tx.objectStore('reportsQueue').delete(item.id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
      } catch (e) {
        // ignore, will retry next sync
      }
    }
  } catch (e) {
    // swallow
  }
}


