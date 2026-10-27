/* Winziger IndexedDB-Speicher mit zwei Faechern.

   kv       Kleinkram, der die Sitzung ueberdauern soll – der Ordner-Handle
            des Portfolios, die zuletzt gewaehlte Ablage.
   dateien  Vollstaendige Dateiablage fuer Geraete ohne Ordnerzugriff
            (iPad). Schluessel ist der relative Pfad, also genau das, was
            auch im Ordner stuende: portfolio.json, bilder/thumbs/x.jpg …
*/

const DB_NAME = 'immo-portfolio';
const KV = 'kv';
const DATEIEN = 'dateien';
const VERSION = 2;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    /* Laeuft bei Erstanlage und bei jeder Versionserhoehung. Beide Faecher
       einzeln pruefen – wer von Version 1 kommt, hat kv bereits. */
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV);
      if (!req.result.objectStoreNames.contains(DATEIEN)) req.result.createObjectStore(DATEIEN);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ---------- kv ---------- */

export const kvGet = (key) => tx(KV, 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => tx(KV, 'readwrite', (s) => s.put(value, key));
export const kvDel = (key) => tx(KV, 'readwrite', (s) => s.delete(key));

/* ---------- dateien ---------- */

/** Liefert { inhalt: Blob, geaendert: number } oder undefined. */
export const dateiGet = (pfad) => tx(DATEIEN, 'readonly', (s) => s.get(pfad));

export const dateiSet = (pfad, inhalt) =>
  tx(DATEIEN, 'readwrite', (s) => s.put({ inhalt, geaendert: Date.now() }, pfad));

export const dateiDel = (pfad) => tx(DATEIEN, 'readwrite', (s) => s.delete(pfad));

/** Alle Pfade unter einem Praefix, mit Groesse und Aenderungszeit. */
export async function dateiListe(praefix = '') {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(DATEIEN, 'readonly');
    const liste = [];
    const req = t.objectStore(DATEIEN).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(liste); return; }
      if (String(cur.key).startsWith(praefix)) {
        liste.push({
          pfad: cur.key,
          groesse: cur.value?.inhalt?.size ?? 0,
          geaendert: cur.value?.geaendert ?? 0,
        });
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
    t.onabort = () => reject(t.error);
  });
}

/** Alles loeschen – fuer „Portfolio von diesem Geraet entfernen". */
export const dateienLeeren = () => tx(DATEIEN, 'readwrite', (s) => s.clear());
