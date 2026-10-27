/* Ablage „Ordner auf diesem Rechner" – File System Access API.

   Braucht Chrome oder Edge; Safari und Firefox kennen showDirectoryPicker
   nicht. Die Dateien liegen sichtbar im gewaehlten Ordner, lassen sich also
   auch ausserhalb der App ansehen und sichern.

   Der Ordner-Handle ueberlebt den Neustart in IndexedDB; das Recht zum
   Schreiben muss der Browser danach einmal pro Sitzung neu bestaetigen. */

import { kvGet, kvSet, kvDel } from '../db.js';

const UNTERORDNER = ['bilder', 'bilder/thumbs', 'dokumente', 'backups'];

let wurzel = null;

export const kennung = 'ordner';
export const name = 'Ordner auf diesem Rechner';

export function verfuegbar() {
  return typeof window.showDirectoryPicker === 'function';
}

/* ---------- Auswahl und Rechte ---------- */

export async function waehlen() {
  return window.showDirectoryPicker({ id: 'immo-portfolio', mode: 'readwrite', startIn: 'documents' });
}

export async function rechtePruefen(handle, { anfragen = true } = {}) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!anfragen) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function uebernehmen(handle) {
  wurzel = handle;
  for (const pfad of UNTERORDNER) {
    let dir = wurzel;
    for (const teil of pfad.split('/')) dir = await dir.getDirectoryHandle(teil, { create: true });
  }
  return handle.name;
}

export async function merken(handle) {
  await kvSet('rootHandle', handle);
  await kvSet('rootName', handle.name);
}

export async function gemerkt() {
  const handle = await kvGet('rootHandle');
  return handle ? { ziel: handle, name: handle.name } : null;
}

export async function vergessen() {
  await kvDel('rootHandle');
  await kvDel('rootName');
  wurzel = null;
}

/* ---------- Pfad-Helfer ---------- */

async function verzeichnis(pfad, create = false) {
  let dir = wurzel;
  for (const teil of pfad.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(teil, { create });
  }
  return dir;
}

async function dateiHandle(relPfad, create = false) {
  const teile = relPfad.split('/');
  const dateiname = teile.pop();
  const dir = teile.length ? await verzeichnis(teile.join('/'), create) : wurzel;
  return dir.getFileHandle(dateiname, { create });
}

/* ---------- Rueckwand ---------- */

export async function lesen(pfad) {
  try {
    const fh = await dateiHandle(pfad);
    return await fh.getFile();
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    throw e;
  }
}

export async function schreiben(pfad, inhalt) {
  const fh = await dateiHandle(pfad, true);
  const w = await fh.createWritable();
  await w.write(inhalt);
  await w.close();
}

export async function loeschen(pfad) {
  const teile = pfad.split('/');
  const dateiname = teile.pop();
  try {
    const dir = teile.length ? await verzeichnis(teile.join('/')) : wurzel;
    await dir.removeEntry(dateiname);
  } catch { /* war schon weg */ }
}

export async function auflisten(ordnerPfad) {
  const liste = [];
  try {
    const dir = await verzeichnis(ordnerPfad);
    for await (const [eintrag, h] of dir.entries()) {
      if (h.kind !== 'file') continue;
      const f = await h.getFile();
      liste.push({ name: eintrag, groesse: f.size, geaendert: f.lastModified });
    }
  } catch { /* Ordner gibt es noch nicht */ }
  return liste;
}
