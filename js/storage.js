/* Speicherschicht: Autosave, Backups, Bilder, Dokumente.

   Diese Datei entscheidet *wann* und *was* geschrieben wird, nicht *wohin*.
   Das Wohin liefert eine austauschbare Rueckwand aus js/speicher/:

     ordner.js   File System Access API – Chrome/Edge, sichtbarer Ordner
     lokal.js    IndexedDB – ueberall, auch auf dem iPad

   Jede Rueckwand kann dasselbe: lesen, schreiben, loeschen, auflisten.
   Alles darueber – Sicherungen, Bildverkleinerung, die Autosave-Taktung –
   steht hier und gilt fuer jede Ablage gleichermassen.

   Ablage im Portfolio (Ordner oder Geraetespeicher, gleicher Aufbau):
     portfolio.json          alle Daten
     bilder/                 Objektfotos (max. 1600 px)
     bilder/thumbs/          Vorschaubilder (max. 480 px)
     dokumente/              PDFs & Co.
     backups/                taegliche Sicherung, letzte 20
*/

import * as ordner from './speicher/ordner.js';
import * as lokal from './speicher/lokal.js';
import * as dropbox from './speicher/dropbox.js';
import { kvGet, kvSet, kvDel } from './db.js';
import { heuteISO, datumISO } from './util.js';

export const DATEI = 'portfolio.json';
const MAX_BACKUPS = 20;
const BILD_KANTE = 1600;
const THUMB_KANTE = 480;
const JPEG_QUALITAET = 0.85;
const AUTOSAVE_MS = 1500;

/** Alle Ablagen in der Reihenfolge, in der sie angeboten werden. */
export const ABLAGEN = [ordner, dropbox, lokal];

const ablageMit = (kennung) => ABLAGEN.find((a) => a.kennung === kennung) || null;

export const speicher = {
  aktiv: null,         // die gewaehlte Rueckwand
  kennung: '',         // 'ordner' | 'lokal'
  ordnerName: '',      // Anzeigename der Ablage
  status: 'idle',      // idle | dirty | saving | error
  onStatus: null,      // Callback fuer die Statusanzeige
};

/** Gibt es ueberhaupt eine nutzbare Ablage? IndexedDB hat jeder Browser. */
export function istUnterstuetzt() {
  return ABLAGEN.some((a) => a.verfuegbar());
}

export const verfuegbareAblagen = () =>
  ABLAGEN.filter((a) => a.verfuegbar()).map((a) => ({ kennung: a.kennung, name: a.name }));

function setStatus(s, detail) {
  speicher.status = s;
  if (speicher.onStatus) speicher.onStatus(s, detail);
}

/* ---------- Ablage waehlen, pruefen, uebernehmen ---------- */

/** Oeffnet die Auswahl der Ablage. Liefert null, wenn abgebrochen wurde. */
export async function ablageWaehlen(kennung) {
  const a = ablageMit(kennung);
  if (!a) throw new Error('Unbekannte Ablage: ' + kennung);
  return { kennung, ziel: await a.waehlen() };
}

export async function rechtePruefen(auswahl, opts) {
  const a = ablageMit(auswahl.kennung);
  return a.rechtePruefen(auswahl.ziel, opts);
}

/** Macht die Ablage scharf – ab hier schreibt die App dorthin. */
export async function ablageUebernehmen(auswahl) {
  const a = ablageMit(auswahl.kennung);
  speicher.aktiv = a;
  speicher.kennung = a.kennung;
  speicher.ordnerName = await a.uebernehmen(auswahl.ziel);
}

export async function ablageMerken(auswahl, anzeigeName) {
  const a = ablageMit(auswahl.kennung);
  await a.merken(auswahl.ziel, anzeigeName);
  await kvSet('ablage', auswahl.kennung);
}

/** Zuletzt benutzte Ablage, oder null. */
export async function gemerkteAblage() {
  const kennung = await kvGet('ablage');
  /* Ohne Eintrag kann es noch eine Fassung von frueher sein, die nur den
     Ordner kannte – deshalb zusaetzlich dort nachsehen. */
  for (const a of kennung ? [ablageMit(kennung)] : ABLAGEN) {
    if (!a || !a.verfuegbar()) continue;
    const g = await a.gemerkt();
    if (g) return { kennung: a.kennung, ziel: g.ziel, name: g.name };
  }
  return null;
}

/** Verbindung loesen – die Daten selbst bleiben, wo sie sind. */
export async function ordnerVergessen() {
  for (const a of ABLAGEN) {
    try { await a.vergessen(); } catch { /* egal */ }
  }
  await kvDel('ablage');
  speicher.aktiv = null;
  speicher.kennung = '';
  speicher.ordnerName = '';
}

/* ---------- Abgleich (nur die Dropbox-Ablage kann das) ---------- */

export const abgleichMoeglich = () => speicher.kennung === 'dropbox';

/**
 * Stoesst einen Abgleich an. Vorher wird alles Offene geschrieben – sonst
 * ginge die letzte Aenderung nicht mit und der naechste Lauf meldete
 * grundlos einen Konflikt.
 */
export async function abgleichen() {
  if (!abgleichMoeglich()) return { art: 'nichts' };
  if (speicher.status === 'dirty') await sofortSpeichern();
  return dropbox.abgleichen();
}

/** Holt beim ersten Verbinden ein bereits vorhandenes Portfolio herunter. */
export async function erstbezug() {
  if (speicher.kennung !== 'dropbox') return false;
  return dropbox.erstbezug();
}

export const konfliktHierBehalten = (rev) => dropbox.konfliktHierBehalten(rev);
export const konfliktDortBehalten = (daten, rev) => dropbox.konfliktDortBehalten(daten, rev);
export const abgleichStatus = () => dropbox.abgleichStatus();

/** Loescht den Geraetespeicher samt Daten – nur ueber den ausdruecklichen
    Weg in den Einstellungen, nie als Nebenwirkung. */
export async function geraetedatenLoeschen() {
  await lokal.alleDatenLoeschen();
  await kvDel('ablage');
  speicher.aktiv = null;
  speicher.kennung = '';
  speicher.ordnerName = '';
}

/* ---------- Rohzugriff ueber die aktive Ablage ---------- */

function rueckwand() {
  if (!speicher.aktiv) throw new Error('Keine Ablage verbunden');
  return speicher.aktiv;
}

const schreiben = (pfad, inhalt) => rueckwand().schreiben(pfad, inhalt);

/** Roher Dateiinhalt als Text, null wenn es die Datei nicht gibt. */
async function rohLesen(pfad = DATEI) {
  const blob = await rueckwand().lesen(pfad);
  return blob == null ? null : blob.text();
}

/* ---------- Portfolio lesen / schreiben ---------- */

export async function portfolioLesen() {
  const text = await rohLesen();
  return text == null ? null : JSON.parse(text);
}

let timer = null;
let laufend = null;
let erneut = false;
let holeDaten = null;

/** Registriert die Funktion, die den aktuellen Portfolio-Stand liefert. */
export function datenquelle(fn) {
  holeDaten = fn;
}

export function planeSpeichern() {
  if (!speicher.aktiv || !holeDaten) return;
  setStatus('dirty');
  clearTimeout(timer);
  timer = setTimeout(() => { sofortSpeichern().catch(() => { /* Status zeigt den Fehler */ }); }, AUTOSAVE_MS);
}

export async function sofortSpeichern() {
  if (!speicher.aktiv || !holeDaten) return;
  clearTimeout(timer);

  /* Laeuft bereits ein Schreibvorgang, wird nach dessen Ende noch einmal
     geschrieben. Ohne das ginge jede Aenderung verloren, die waehrend des
     Schreibens entsteht – auf OneDrive oder Dropbox dauert ein Schreibvorgang
     leicht laenger als das Autosave-Intervall. */
  if (laufend) {
    erneut = true;
    return laufend;
  }

  laufend = (async () => {
    setStatus('saving');
    try {
      do {
        erneut = false;
        const daten = holeDaten();
        // Erst sichern, dann ueberschreiben – siehe backupWennFaellig.
        await backupWennFaellig(daten);
        await schreiben(DATEI, JSON.stringify(daten, null, 2));
      } while (erneut);
      setStatus('idle', new Date());
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e);
      setStatus('error', e);
      throw e;
    } finally {
      laufend = null;
      erneut = false;
    }
  })();
  return laufend;
}

/**
 * Taegliche Sicherung – gesichert wird der Stand, der **vor** dieser
 * Aenderung in der Datei stand.
 *
 * Muss deshalb vor dem Ueberschreiben laufen: Wuerde stattdessen der neue
 * Stand gesichert, enthielte die erste Sicherung des Tages die Aenderung
 * bereits. Genau die erste Aenderung des Tages – etwa ein geloeschtes
 * Objekt – waere dann nicht wiederherstellbar, obwohl die Loeschdialoge das
 * zusagen.
 */
async function backupWennFaellig(daten) {
  const heute = heuteISO();
  if (daten.meta?.letztesBackup === heute) return;

  const vorher = await rohLesen();
  if (vorher != null) {
    const n = new Date();
    const stempel = `${datumISO(n)}-${String(n.getHours()).padStart(2, '0')}-${String(n.getMinutes()).padStart(2, '0')}`;
    await schreiben(`backups/portfolio-${stempel}.json`, vorher);
    await backupsAufraeumen();
  }
  // Vor dem Serialisieren vermerken, damit der Stempel mitgespeichert wird.
  if (daten.meta) daten.meta.letztesBackup = heute;
}

async function backupsAufraeumen() {
  try {
    const namen = (await rueckwand().auflisten('backups'))
      .map((e) => e.name)
      .filter((n) => n.endsWith('.json'))
      .sort();
    for (const name of namen.slice(0, Math.max(0, namen.length - MAX_BACKUPS))) {
      await rueckwand().loeschen(`backups/${name}`);
    }
  } catch (e) {
    console.warn('Backups aufraeumen fehlgeschlagen:', e);
  }
}

/** Inhalt einer Sicherung lesen – für die Wiederherstellung. */
export async function backupLesen(name) {
  return JSON.parse(await rohLesen(`backups/${name}`));
}

export async function backupsAuflisten() {
  const liste = (await rueckwand().auflisten('backups')).filter((e) => e.name.endsWith('.json'));
  return liste.sort((a, b) => b.name.localeCompare(a.name));
}

/* ---------- Sichern und Zurueckholen als Datei ---------- */

/** Laedt die portfolio.json als Download herunter. */
export async function alsDateiSichern(daten, dateiname) {
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Liest eine zuvor gesicherte Datei ein. Wirft bei ungueltigem JSON. */
export async function ausDateiLesen(file) {
  return JSON.parse(await file.text());
}

/* ---------- Bilder ---------- */

async function skalieren(file, maxKante) {
  const bitmap = await createImageBitmap(file);
  const faktor = Math.min(1, maxKante / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * faktor);
  const h = Math.round(bitmap.height * faktor);

  /* OffscreenCanvas gibt es erst ab Safari 16.4. Faellt es aus, tut es ein
     gewoehnliches Canvas genauso – nur ohne eigenen Thread. */
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITAET });
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITAET));
}

/** Speichert ein Bild verkleinert plus Vorschau. Liefert den Dateinamen. */
export async function bildSpeichern(file, basisName) {
  const name = `${basisName}.jpg`;
  await schreiben(`bilder/${name}`, await skalieren(file, BILD_KANTE));
  await schreiben(`bilder/thumbs/${name}`, await skalieren(file, THUMB_KANTE));
  return name;
}

const urlCache = new Map();

/** Object-URL fuer ein gespeichertes Bild (thumb = Vorschau). */
export async function bildURL(name, thumb = false) {
  if (!name) return null;
  const key = (thumb ? 't:' : 'b:') + name;
  if (urlCache.has(key)) return urlCache.get(key);
  try {
    const blob = await rueckwand().lesen(thumb ? `bilder/thumbs/${name}` : `bilder/${name}`);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

export async function bildLoeschen(name) {
  // Object-URLs halten die Datei im Speicher, bis sie freigegeben werden.
  for (const key of ['b:' + name, 't:' + name]) {
    const url = urlCache.get(key);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(key);
  }
  for (const pfad of ['bilder', 'bilder/thumbs']) {
    await rueckwand().loeschen(`${pfad}/${name}`);
  }
}

/* ---------- Dokumente ---------- */

export async function dokumentSpeichern(file, zielName) {
  await schreiben(`dokumente/${zielName}`, file);
  return zielName;
}

/** Dateiname ohne Sonderzeichen, damit er auf jedem Dateisystem funktioniert. */
export function dateinameSaeubern(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(-80);
}

export async function dokumentOeffnen(name) {
  const blob = await rueckwand().lesen(`dokumente/${name}`);
  if (!blob) throw new Error('Dokument nicht gefunden: ' + name);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function dokumentLoeschen(name) {
  await rueckwand().loeschen(`dokumente/${name}`);
}
