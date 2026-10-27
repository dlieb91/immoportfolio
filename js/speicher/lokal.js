/* Ablage „Auf diesem Geraet" – IndexedDB.

   Fuer Geraete ohne Ordnerzugriff, allen voran das iPad: Safari kennt die
   File System Access API nicht, und auf iPadOS benutzen alle Browser
   WebKit – Chrome fuers iPad hilft also nicht.

   ACHTUNG, Sieben-Tage-Regel: Safari loescht auf iOS und iPadOS saemtlichen
   schreibbaren Speicher, wenn eine Seite sieben Tage nicht besucht wurde.
   Davon ausgenommen sind nur Web-Apps, die auf dem Home-Bildschirm liegen –
   die haben eigenen, von Safari getrennten Speicher. Siehe speicherWarnung(). */

import { kvGet, kvSet, kvDel, dateiListe, dateiGet, dateiSet, dateiDel } from '../db.js';
import { dateiablage } from './dateiablage.js';

const PRAEFIX = 'geraet/';
const ablage = dateiablage(PRAEFIX);

export const kennung = 'lokal';
export const name = 'Auf diesem Gerät';

export function verfuegbar() {
  return typeof indexedDB !== 'undefined';
}

/** Laeuft die App als Web-App vom Home-Bildschirm statt im Safari-Reiter? */
export function imHomeBildschirm() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

/** iPhone oder iPad? Neuere iPads melden sich als „MacIntel" mit Touch. */
export function aufApple() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Warnung zum Geraetespeicher, oder null wenn keine noetig ist.
 *
 * Auf iOS und iPadOS loescht Safari schreibbaren Speicher nach sieben Tagen
 * ohne Besuch – das ist die harte Variante und betrifft nur den Browser-
 * Reiter, nicht die Web-App auf dem Home-Bildschirm. Ueberall sonst kann der
 * Browser den Speicher bei Platzmangel raeumen; das ist seltener, aber ein
 * Grund, ab und zu zu exportieren.
 */
export function speicherWarnung() {
  if (imHomeBildschirm()) return null;
  if (aufApple()) {
    return '<strong>Lege die App auf den Home-Bildschirm.</strong> Safari löscht auf iPhone und iPad '
      + 'gespeicherte Daten nach sieben Tagen ohne Besuch. Als Web-App über <em>Teilen → Zum '
      + 'Home-Bildschirm</em> hat die App ihren eigenen Speicher und ist davon ausgenommen. '
      + 'Sichere bis dahin regelmäßig über „Als Datei exportieren".';
  }
  return '<strong>Die Daten liegen nur in diesem Browser.</strong> Wird der Browserspeicher geleert, '
    + 'sind sie weg – ein anderes Profil oder ein privates Fenster sieht sie ohnehin nicht. '
    + 'Sichere regelmäßig über „Als Datei exportieren", oder wähle einen Ordner auf dem Rechner.';
}

/* ---------- Auswahl und Rechte ---------- */

/* Es gibt nichts auszuwaehlen – der Speicher gehoert zur Adresse der App.
   Der Name dient nur der Anzeige und kommt vom Portfolionamen. */
export async function waehlen() {
  return { kennung };
}

export async function rechtePruefen() {
  return true;
}

export async function uebernehmen() {
  await altbestandUmziehen();
  return (await kvGet('lokalName')) || 'Dieses Gerät';
}

/**
 * Die erste Fassung des Geraetespeichers legte ohne Praefix ab. Seit
 * Dropbox als zweite IndexedDB-Ablage dazugekommen ist, braucht jede ihr
 * eigenes Fach – sonst saehe die eine die Dateien der anderen. Diese
 * Umstellung laeuft einmal und ist danach wirkungslos.
 */
async function altbestandUmziehen() {
  if (await kvGet('lokalUmgezogen')) return;
  const bekannt = /^(portfolio\.json|bilder\/|dokumente\/|backups\/)/;
  for (const e of await dateiListe('')) {
    if (!bekannt.test(e.pfad)) continue;
    const alt = await dateiGet(e.pfad);
    if (alt) await dateiSet(PRAEFIX + e.pfad, alt.inhalt);
    await dateiDel(e.pfad);
  }
  await kvSet('lokalUmgezogen', true);
}

export async function merken(_ziel, anzeigeName) {
  await kvSet('lokalAktiv', true);
  if (anzeigeName) await kvSet('lokalName', anzeigeName);
}

export async function gemerkt() {
  if (!(await kvGet('lokalAktiv'))) return null;
  return { ziel: { kennung }, name: (await kvGet('lokalName')) || 'Dieses Gerät' };
}

export async function vergessen() {
  await kvDel('lokalAktiv');
  await kvDel('lokalName');
}

/** Entfernt auch die Daten – nur ueber den ausdruecklichen Weg in den Einstellungen. */
export async function alleDatenLoeschen() {
  await ablage.leeren();
  await vergessen();
}

/* ---------- Rueckwand ---------- */

export const lesen = (pfad) => ablage.lesen(pfad);
export const schreiben = (pfad, inhalt) => ablage.schreiben(pfad, inhalt);
export const loeschen = (pfad) => ablage.loeschen(pfad);
export const auflisten = (ordnerPfad) => ablage.auflisten(ordnerPfad);
