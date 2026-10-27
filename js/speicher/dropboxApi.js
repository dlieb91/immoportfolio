/* Dropbox-Zugang: Anmeldung per PKCE und die vier gebrauchten Aufrufe.

   Ohne Fremdbibliothek und ohne App-Geheimnis. PKCE ist genau fuer solche
   Faelle gedacht: Eine App, die im Browser laeuft, kann kein Geheimnis
   verwahren – also weist sie sich stattdessen mit einem selbst erzeugten
   Einmalwert aus, dessen Pruefsumme sie vorab hinterlegt.

   Der App Key ist deshalb oeffentlich und darf in den Einstellungen stehen.
   Der Refresh-Token ist es nicht: Er liegt in IndexedDB und verlaesst das
   Geraet nie. Der kurzlebige Access-Token steht nur im Arbeitsspeicher.

   Erfordert einen sicheren Kontext (HTTPS oder localhost) – ohne den gibt
   es kein crypto.subtle und damit kein PKCE. */

import { kvGet, kvSet, kvDel } from '../db.js';

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const RPC = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

/** Wohin Dropbox nach der Anmeldung zurueckspringt – ohne Hash und Query. */
export function redirectUri() {
  return location.origin + location.pathname;
}

export const appKeyLesen = () => kvGet('dropboxAppKey');
export const appKeySetzen = (key) => kvSet('dropboxAppKey', String(key || '').trim());

export async function angemeldet() {
  return Boolean(await kvGet('dropboxRefresh'));
}

export async function abmelden() {
  await kvDel('dropboxRefresh');
  await kvDel('dropboxKonto');
  zugriff = null;
  zugriffBis = 0;
}

export const kontoName = () => kvGet('dropboxKonto');

/* ---------- PKCE ---------- */

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function verifierErzeugen() {
  /* Dropbox verlangt 43–128 Zeichen aus [0-9a-zA-Z-._~]. 64 zufaellige
     Bytes als base64url ergeben 86 Zeichen – passt. */
  return base64url(crypto.getRandomValues(new Uint8Array(64)));
}

async function challengeFuer(verifier) {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

/**
 * Schickt den Browser zur Dropbox-Anmeldung. Kommt nicht zurueck –
 * die Seite wird verlassen und spaeter ueber anmeldungAbschliessen()
 * wieder aufgenommen.
 */
export async function anmeldungStarten() {
  const appKey = await appKeyLesen();
  if (!appKey) throw new Error('Es ist noch kein Dropbox-App-Key hinterlegt.');
  if (!window.isSecureContext) {
    throw new Error('Die Anmeldung braucht HTTPS. Über http:// erlaubt der Browser die nötige Verschlüsselung nicht.');
  }

  const verifier = verifierErzeugen();
  sessionStorage.setItem('dropboxVerifier', verifier);

  const p = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: await challengeFuer(verifier),
    code_challenge_method: 'S256',
    /* Ohne „offline" gibt es keinen Refresh-Token, und die Anmeldung
       waere nach wenigen Stunden wieder faellig. */
    token_access_type: 'offline',
    redirect_uri: redirectUri(),
  });
  location.href = `${AUTH_URL}?${p}`;
}

/** Steht in der Adresse ein Dropbox-Code? Dann sind wir gerade zurueckgesprungen. */
export function rueckkehrErkannt() {
  const p = new URLSearchParams(location.search);
  return p.has('code') || p.has('error');
}

/**
 * Loest den Code gegen die Token ein. Liefert true bei Erfolg.
 * Raeumt die Adresszeile in jedem Fall auf, damit ein Neuladen nicht
 * denselben – dann verbrauchten – Code noch einmal einloest.
 */
export async function anmeldungAbschliessen() {
  const p = new URLSearchParams(location.search);
  const code = p.get('code');
  const fehler = p.get('error_description') || p.get('error');
  const verifier = sessionStorage.getItem('dropboxVerifier');
  sessionStorage.removeItem('dropboxVerifier');
  history.replaceState(null, '', redirectUri() + location.hash);

  if (fehler) throw new Error('Dropbox hat die Anmeldung abgelehnt: ' + fehler);
  if (!code) return false;
  if (!verifier) throw new Error('Die Anmeldung konnte nicht zugeordnet werden. Bitte noch einmal versuchen.');

  const appKey = await appKeyLesen();
  const antwort = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, grant_type: 'authorization_code',
      client_id: appKey, code_verifier: verifier, redirect_uri: redirectUri(),
    }),
  });
  if (!antwort.ok) throw new Error('Token konnte nicht geholt werden: ' + (await antwort.text()).slice(0, 200));

  const t = await antwort.json();
  if (!t.refresh_token) throw new Error('Dropbox hat keinen dauerhaften Zugang geliefert.');
  await kvSet('dropboxRefresh', t.refresh_token);
  zugriffSetzen(t.access_token, t.expires_in);
  await kontoMerken();
  return true;
}

/* ---------- Access-Token ---------- */

let zugriff = null;
let zugriffBis = 0;

function zugriffSetzen(token, sekunden) {
  zugriff = token;
  /* Eine Minute Sicherheitsabstand, damit ein Aufruf nicht genau in dem
     Moment losgeht, in dem der Token ablaeuft. */
  zugriffBis = Date.now() + Math.max(0, (sekunden || 14400) - 60) * 1000;
}

async function token() {
  if (zugriff && Date.now() < zugriffBis) return zugriff;
  const refresh = await kvGet('dropboxRefresh');
  if (!refresh) throw new Error('Nicht bei Dropbox angemeldet.');
  const appKey = await appKeyLesen();

  const antwort = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: appKey }),
  });
  if (!antwort.ok) {
    /* Der Refresh-Token wurde zurueckgezogen – etwa weil die App in den
       Dropbox-Einstellungen getrennt wurde. Dann hilft nur neu anmelden. */
    if (antwort.status === 400 || antwort.status === 401) await abmelden();
    throw new Error('Die Dropbox-Anmeldung ist abgelaufen. Bitte neu anmelden.');
  }
  const t = await antwort.json();
  zugriffSetzen(t.access_token, t.expires_in);
  return zugriff;
}

async function kontoMerken() {
  try {
    const k = await rpc('users/get_current_account', null);
    await kvSet('dropboxKonto', k?.email || k?.name?.display_name || 'Dropbox');
  } catch { /* nur Anzeige, nicht kriegsentscheidend */ }
}

/* ---------- Aufrufe ---------- */

/** Fehler, der eine Dropbox-Antwort mitfuehrt – der Abgleich wertet sie aus. */
export class DropboxFehler extends Error {
  constructor(text, status, daten) {
    super(text);
    this.status = status;
    this.daten = daten;
  }
}

async function rpc(pfad, argument) {
  const antwort = await fetch(`${RPC}/${pfad}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(argument === null ? {} : { 'Content-Type': 'application/json' }),
    },
    body: argument === null ? null : JSON.stringify(argument),
  });
  const text = await antwort.text();
  const daten = text ? JSON.parse(text) : null;
  if (!antwort.ok) throw new DropboxFehler(kurz(daten) || antwort.statusText, antwort.status, daten);
  return daten;
}

function kurz(daten) {
  const t = daten?.error?.['.tag'];
  return t ? `Dropbox: ${t}` : daten?.error_summary || null;
}

/**
 * Laedt eine Datei. Liefert { blob, rev } oder null, wenn es sie nicht gibt.
 * Eine fehlende Datei ist beim ersten Abgleich der Normalfall, kein Fehler.
 */
export async function datenLaden(pfad) {
  const antwort = await fetch(`${CONTENT}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Dropbox-API-Arg': JSON.stringify({ path: pfad }),
    },
  });
  if (antwort.status === 409) return null;            // path/not_found
  if (!antwort.ok) throw new DropboxFehler('Laden fehlgeschlagen', antwort.status, await antwort.text());
  const kopf = antwort.headers.get('Dropbox-API-Result');
  return { blob: await antwort.blob(), rev: kopf ? JSON.parse(kopf).rev : null };
}

/**
 * Schreibt eine Datei und liefert die neue rev.
 *
 * Mit `rev` wird im Modus „update" geschrieben: Dropbox nimmt die Datei nur
 * an, wenn sie unveraendert ist. Hat inzwischen ein anderes Geraet
 * gespeichert, kommt ein Konflikt zurueck statt eines stillen
 * Ueberschreibens – das ist der Kern des ganzen Abgleichs.
 *
 * Ohne `rev` wird im Modus „add" geschrieben; mit autorename:false meldet
 * Dropbox ebenfalls einen Konflikt, wenn die Datei schon existiert.
 */
export async function datenSchreiben(pfad, inhalt, rev = null) {
  const modus = rev ? { '.tag': 'update', update: rev } : 'add';
  const antwort = await fetch(`${CONTENT}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: pfad, mode: modus, autorename: false, mute: true, strict_conflict: true,
      }),
    },
    body: inhalt instanceof Blob ? inhalt : new Blob([inhalt]),
  });
  const text = await antwort.text();
  const daten = text ? JSON.parse(text) : null;
  if (!antwort.ok) throw new DropboxFehler(kurz(daten) || 'Schreiben fehlgeschlagen', antwort.status, daten);
  return daten.rev;
}

/** Ist dieser Fehler ein Schreibkonflikt? */
export function istKonflikt(e) {
  const reason = e?.daten?.error?.reason?.['.tag'];
  return e instanceof DropboxFehler && (reason === 'conflict' || reason === 'conflict_file');
}

export async function loeschen(pfad) {
  try {
    await rpc('files/delete_v2', { path: pfad });
  } catch (e) {
    /* Schon weg ist auch recht. */
    if (!String(e.message).includes('path_lookup') && !String(e.message).includes('not_found')) throw e;
  }
}

/** Alle Dateien unter einem Ordner, rekursiv. Leerer Ordner ist kein Fehler. */
export async function auflisten(ordner) {
  const treffer = [];
  let antwort;
  try {
    antwort = await rpc('files/list_folder', { path: ordner, recursive: true });
  } catch (e) {
    if (String(e.message).includes('not_found')) return treffer;
    throw e;
  }
  for (;;) {
    for (const e of antwort.entries) {
      if (e['.tag'] === 'file') treffer.push({ pfad: e.path_lower, rev: e.rev, groesse: e.size });
    }
    if (!antwort.has_more) break;
    antwort = await rpc('files/list_folder/continue', { cursor: antwort.cursor });
  }
  return treffer;
}
