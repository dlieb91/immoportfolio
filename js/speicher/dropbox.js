/* Ablage „Dropbox" – lokal zuerst, Dropbox als Ziel.

   Die App schreibt immer in den Geraetespeicher, auch wenn Netz da ist.
   Der Abgleich laeuft daneben. Nur so funktioniert Offline-Betrieb ohne
   zweiten Codepfad: Was offline geschrieben wurde, liegt am selben Ort wie
   alles andere und geht beim naechsten Abgleich mit.

   Der Abgleich der portfolio.json steht und faellt mit zwei Zahlen:

     meta.stand   zaehlt in der Datei mit jeder Aenderung hoch (store.js)
     rev          Dropbox' eigene Kennung des Dateistands

   Gemerkt wird, welches Paar beim letzten erfolgreichen Abgleich galt.
   Daraus folgt eindeutig, wer sich seitdem geruehrt hat – ohne Uhren zu
   vergleichen, die auf zwei Geraeten ohnehin auseinanderlaufen.

   Widersprechen sich beide Seiten, wird **nicht** zusammengefuehrt. Einen
   JSON-Baum zweier Geraete automatisch zu verschmelzen waere geraten, nicht
   gerechnet; bei Steuerdaten ist das die falsche Art von Bequemlichkeit.
   Stattdessen entscheidet der Nutzer, und die unterlegene Fassung bleibt
   als Sicherung erhalten. */

import { kvGet, kvSet, kvDel } from '../db.js';
import { dateiablage } from './dateiablage.js';
import * as api from './dropboxApi.js';
import { datumISO } from '../util.js';

const PRAEFIX = 'dropbox/';
const ablage = dateiablage(PRAEFIX);
const DATEI = 'portfolio.json';

export const kennung = 'dropbox';
export const name = 'Dropbox';

export function verfuegbar() {
  return typeof indexedDB !== 'undefined' && typeof fetch === 'function';
}

/* ---------- Auswahl und Rechte ---------- */

export async function waehlen() {
  return { kennung };
}

export async function rechtePruefen() {
  return api.angemeldet();
}

export async function uebernehmen() {
  return (await api.kontoName()) || 'Dropbox';
}

export async function merken(_ziel, anzeigeName) {
  await kvSet('dropboxAktiv', true);
  if (anzeigeName) await kvSet('dropboxName', anzeigeName);
}

export async function gemerkt() {
  if (!(await kvGet('dropboxAktiv'))) return null;
  if (!(await api.angemeldet())) return null;
  return { ziel: { kennung }, name: (await kvGet('dropboxName')) || 'Dropbox' };
}

export async function vergessen() {
  await kvDel('dropboxAktiv');
  await kvDel('dropboxName');
}

/** Trennt die Verbindung und raeumt den Zwischenspeicher. */
export async function abmeldenUndLeeren() {
  await ablage.leeren();
  await api.abmelden();
  await vergessen();
  await kvDel('dropboxRev');
  await kvDel('dropboxStand');
}

/* ---------- Rueckwand: immer der lokale Zwischenspeicher ---------- */

export const lesen = (pfad) => ablage.lesen(pfad);
export const schreiben = (pfad, inhalt) => ablage.schreiben(pfad, inhalt);
export const loeschen = (pfad) => ablage.loeschen(pfad);
export const auflisten = (ordnerPfad) => ablage.auflisten(ordnerPfad);

/* ---------- Abgleich ---------- */

const merker = {
  rev: () => kvGet('dropboxRev'),
  stand: () => kvGet('dropboxStand'),
  setzen: async (rev, stand) => { await kvSet('dropboxRev', rev); await kvSet('dropboxStand', stand); },
};

const standVon = async () => {
  const blob = await ablage.lesen(DATEI);
  if (!blob) return null;
  try { return JSON.parse(await blob.text()); } catch { return null; }
};

/** Zusammenfassung einer Fassung, damit der Konfliktdialog etwas zu zeigen hat. */
function steckbrief(daten) {
  return {
    stand: daten?.meta?.stand ?? 0,
    geaendertAm: daten?.meta?.geaendertAm || null,
    geraet: daten?.meta?.geraet || null,
    objekte: daten?.objekte?.length ?? 0,
    buchungen: (daten?.buchungen?.length ?? 0) + (daten?.fahrten?.length ?? 0),
  };
}

/**
 * Erster Griff nach dem Verbinden: Liegt drueben schon ein Portfolio, wird
 * es in den Zwischenspeicher geholt. Muss vor dem regulaeren Abgleich
 * laufen, denn der setzt eine lokale Fassung voraus.
 *
 * Liefert true, wenn etwas geholt wurde.
 */
export async function erstbezug() {
  if (await ablage.lesen(DATEI)) return false;       // schon etwas da
  const fern = await api.datenLaden('/' + DATEI);
  if (!fern) return false;
  const text = await fern.blob.text();
  await ablage.schreiben(DATEI, text);
  let stand = 0;
  try { stand = JSON.parse(text)?.meta?.stand ?? 0; } catch { /* egal */ }
  await merker.setzen(fern.rev, stand);
  await dateienAbgleichen();
  return true;
}

let laeuft = null;

/**
 * Gleicht ab. Liefert:
 *   { art: 'nichts' | 'hochgeladen' | 'geholt' | 'erstanlage', ... }
 *   { art: 'konflikt', hier, dort, fremdRev }   – der Aufrufer muss fragen
 *
 * Mehrfachaufrufe teilen sich denselben Lauf; parallele Abgleiche waeren
 * ein sicherer Weg, genau den Konflikt zu erzeugen, den sie verhindern sollen.
 */
export function abgleichen() {
  if (laeuft) return laeuft;
  laeuft = abgleichLauf().finally(() => { laeuft = null; });
  return laeuft;
}

async function abgleichLauf() {
  const hier = await standVon();
  if (!hier) throw new Error('Lokal ist noch kein Portfolio vorhanden.');

  const fern = await api.datenLaden('/' + DATEI);
  const gemerkteRev = await merker.rev();
  const gemerkterStand = await merker.stand();

  /* Erstanlage: drueben liegt noch nichts. */
  if (!fern) {
    const rev = await api.datenSchreiben('/' + DATEI, JSON.stringify(hier, null, 2), null);
    await merker.setzen(rev, hier.meta.stand);
    await dateienHochladen();
    return { art: 'erstanlage' };
  }

  const fremdText = await fern.blob.text();
  const fremd = JSON.parse(fremdText);
  const hierGeaendert = hier.meta.stand !== gemerkterStand;
  const dortGeaendert = fern.rev !== gemerkteRev;

  if (!hierGeaendert && !dortGeaendert) {
    await dateienAbgleichen();
    return { art: 'nichts' };
  }

  if (hierGeaendert && !dortGeaendert) {
    const rev = await hochladen(hier, fern.rev);
    await dateienAbgleichen();
    return { art: 'hochgeladen', stand: hier.meta.stand };
  }

  if (!hierGeaendert && dortGeaendert) {
    await uebernehmenVonFern(fremd, fern.rev);
    await dateienAbgleichen();
    return { art: 'geholt', daten: fremd, stand: fremd.meta?.stand };
  }

  /* Beide Seiten haben sich bewegt – hier endet das, was die App allein
     entscheiden darf. Die fremde Fassung wird als Sicherung abgelegt,
     damit sie in keinem Fall verloren geht. */
  await ablage.schreiben(`backups/konflikt-${stempel()}.json`, fremdText);
  return {
    art: 'konflikt',
    hier: steckbrief(hier),
    dort: steckbrief(fremd),
    fremdRev: fern.rev,
    fremdDaten: fremd,
  };
}

function stempel() {
  const n = new Date();
  return `${datumISO(n)}-${String(n.getHours()).padStart(2, '0')}-${String(n.getMinutes()).padStart(2, '0')}`;
}

async function hochladen(daten, rev) {
  const neu = await api.datenSchreiben('/' + DATEI, JSON.stringify(daten, null, 2), rev);
  await merker.setzen(neu, daten.meta.stand);
  return neu;
}

async function uebernehmenVonFern(fremd, rev) {
  /* Den eigenen Stand vorher sichern – er wird gleich ersetzt. */
  const alt = await ablage.lesen(DATEI);
  if (alt) await ablage.schreiben(`backups/vor-abgleich-${stempel()}.json`, await alt.text());
  await ablage.schreiben(DATEI, JSON.stringify(fremd, null, 2));
  await merker.setzen(rev, fremd.meta?.stand ?? 0);
}

/* ---------- Konflikt aufloesen ---------- */

/** „Mein Stand gewinnt" – ueberschreibt die fremde Fassung. */
export async function konfliktHierBehalten(fremdRev) {
  const hier = await standVon();
  await hochladen(hier, fremdRev);
  await dateienAbgleichen();
  return { art: 'hochgeladen', stand: hier.meta.stand };
}

/** „Dropbox gewinnt" – holt die fremde Fassung, sichert die eigene. */
export async function konfliktDortBehalten(fremdDaten, fremdRev) {
  await uebernehmenVonFern(fremdDaten, fremdRev);
  await dateienAbgleichen();
  return { art: 'geholt', daten: fremdDaten, stand: fremdDaten.meta?.stand };
}

/* ---------- Bilder und Dokumente ---------- */

/*  Diese Dateien tragen eindeutige Namen aus uid() und werden praktisch nur
    angelegt und geloescht, nie geaendert. Ein Abgleich der Namenslisten
    genuegt also – ohne Konfliktbehandlung.

    Bewusste Grenze: Es wird nur ergaenzt, nie geloescht. Ob eine Datei hier
    fehlt, weil sie geloescht wurde, oder weil dieses Geraet sie noch nie
    geholt hat, laesst sich ohne Grabsteine nicht unterscheiden – und ein
    falsch geratenes Loeschen waere der teurere Fehler. Verwaiste Dateien
    bleiben darum liegen; sie kosten Platz, aber keine Daten. */

const ORDNER = ['bilder', 'bilder/thumbs', 'dokumente'];

async function dateienHochladen() {
  for (const ordner of ORDNER) {
    for (const e of await ablage.auflisten(ordner)) {
      const blob = await ablage.lesen(`${ordner}/${e.name}`);
      if (blob) await api.datenSchreiben(`/${ordner}/${e.name}`, blob, null).catch(() => {});
    }
  }
}

/**
 * Bilder und Dokumente abgleichen.
 *
 * Schlaegt das fehl, ist das aergerlich, aber kein Grund, den ganzen
 * Abgleich zu verwerfen – die Zahlen stehen in der portfolio.json und sind
 * an dieser Stelle laengst uebertragen. Der Fehler landet in der Konsole,
 * der naechste Lauf versucht es erneut.
 */
async function dateienAbgleichen() {
  try {
    await dateienAbgleichenRoh();
  } catch (e) {
    console.warn('Bilder und Dokumente konnten nicht abgeglichen werden:', e);
  }
}

async function dateienAbgleichenRoh() {
  const fern = new Map();
  for (const ordner of ORDNER) {
    for (const e of await api.auflisten('/' + ordner)) fern.set(e.pfad.toLowerCase(), e);
  }

  for (const ordner of ORDNER) {
    const hier = new Set((await ablage.auflisten(ordner)).map((e) => e.name));

    /* Was hier liegt und drueben fehlt: hinschicken. */
    for (const name of hier) {
      if (fern.has(`/${ordner}/${name}`.toLowerCase())) continue;
      const blob = await ablage.lesen(`${ordner}/${name}`);
      if (blob) await api.datenSchreiben(`/${ordner}/${name}`, blob, null).catch(() => {});
    }

    /* Was drueben liegt und hier fehlt: holen. */
    for (const [pfad] of fern) {
      if (!pfad.startsWith(`/${ordner}/`)) continue;
      const name = pfad.slice(ordner.length + 2);
      if (!name || name.includes('/') || hier.has(name)) continue;
      const geholt = await api.datenLaden(pfad).catch(() => null);
      if (geholt) await ablage.schreiben(`${ordner}/${name}`, geholt.blob);
    }
  }
}

/* ---------- Status fuer die Oberflaeche ---------- */

export async function abgleichStatus() {
  const daten = await standVon();
  return {
    angemeldet: await api.angemeldet(),
    konto: await api.kontoName(),
    offeneAenderungen: daten ? daten.meta?.stand !== (await merker.stand()) : false,
    online: navigator.onLine,
  };
}
