/* Service Worker: haelt die Programmdateien vor, damit die App ohne Netz
   startet. **Nur Programmdateien** – die Daten liegen in IndexedDB und
   gehoeren hier nicht hinein.

   Strategie: beim Abruf zuerst das Netz, bei Erfolg die Antwort in den
   Zwischenspeicher legen, bei Fehlschlag von dort bedienen. So laeuft man
   nie einer alten Fassung hinterher, solange Netz da ist, und hat trotzdem
   immer eine vollstaendige Huelle.

   Aufrufe an Dropbox gehen diesen Weg ausdruecklich nicht – sie werden
   durchgereicht, damit ein fehlgeschlagener Abgleich als Fehler ankommt
   und nicht als veraltete Antwort aus dem Zwischenspeicher. */

const CACHE = 'immo-huelle-v1';

const HUELLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './bilder/icon-180.png',
  './bilder/icon-192.png',
  './bilder/icon-512.png',
];

self.addEventListener('install', (e) => {
  /* Fehlt eine Datei, soll nicht die ganze Installation scheitern –
     der Rest wird beim ersten Abruf nachgelegt. */
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(HUELLE.map((p) => c.add(p))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Fremde Server – Dropbox allen voran – bleiben unberuehrt.
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(async () => {
        const treffer = await caches.match(e.request);
        if (treffer) return treffer;
        /* Ein Seitenaufruf ohne Treffer bekommt die Startseite – sonst
           stuende bei einem tiefen Link offline nur ein Browserfehler. */
        if (e.request.mode === 'navigate') {
          const start = await caches.match('./index.html');
          if (start) return start;
        }
        throw new Error('offline und nicht im Zwischenspeicher');
      })
  );
});
