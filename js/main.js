/* Einstieg: Startbildschirm, Ordnerverbindung, Navigation, Router. */

import { $, el, leeren, toast, abfragen, modal } from './util.js';
import {
  istUnterstuetzt, verfuegbareAblagen, ablageWaehlen, rechtePruefen, ablageMerken,
  gemerkteAblage, ablageUebernehmen, portfolioLesen, sofortSpeichern, datenquelle, speicher,
  erstbezug,
} from './storage.js';
import { aufApple, speicherWarnung } from './speicher/lokal.js';
import * as dbx from './speicher/dropboxApi.js';
import { anbinden as abgleichAnbinden, anzeigeAnmelden } from './abgleich.js';
import { hinweis, kartenListe } from './felder.js';
import { state, laden, neuesPortfolio, abonnieren, objekt as objektMit } from './store.js';
import { steuerModus, setSteuerModus } from './kennzahlen.js';
import { dashboard } from './views/dashboard.js';
import { einstellungen } from './views/einstellungen.js';
import { objekte } from './views/objekte.js';
import { objektDetail } from './views/objektDetail.js';
import { mietvertraege } from './views/mietvertraege.js';
import { mietvertragDetail } from './views/mietvertragDetail.js';
import { finanzierungen } from './views/finanzierungen.js';
import { finanzierungDetail } from './views/finanzierungDetail.js';
import { forecast } from './views/forecast.js';
import { objektForecast } from './views/objektForecast.js';
import { buchhaltung } from './views/buchhaltungView.js';
import { steuerjahr } from './views/steuerjahr.js';

/* ---------- Ansichten ---------- */

const ICONS = {
  dashboard: '<path d="M3 12l9-8 9 8M5 10v10h14V10"/>',
  objekte: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/>',
  mietvertraege: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  finanzierungen: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  forecast: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  einzelobjekt: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M8.5 12.5l2-2 1.5 1.5 2.5-3"/>',
  buchhaltung: '<path d="M5 3h14a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2-3-2V4a1 1 0 0 1 1-1z"/><path d="M8 8h8M8 12h5"/>',
  steuerjahr: '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M15 2v5h5"/><path d="M9 15l2 2 4-4"/>',
  einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

const ANSICHTEN = {
  dashboard: { titel: 'Dashboard', view: dashboard },
  objekte: {
    titel: 'Objekte',
    zaehler: (d) => d.objekte.length,
    view: objekte,
  },
  objekt: {
    titel: () => {
      const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
      return objektMit(id)?.bezeichnung || 'Objekt';
    },
    navKey: 'objekte',
    versteckt: true,
    view: objektDetail,
  },
  mietvertraege: {
    titel: 'Mietverträge',
    zaehler: (d) => d.mietvertraege.length,
    view: mietvertraege,
  },
  mietvertrag: {
    titel: 'Mietvertrag',
    navKey: 'mietvertraege',
    versteckt: true,
    view: mietvertragDetail,
  },
  finanzierungen: {
    titel: 'Finanzierungen',
    zaehler: (d) => d.finanzierungen.length,
    view: finanzierungen,
  },
  finanzierung: {
    titel: 'Darlehen',
    navKey: 'finanzierungen',
    versteckt: true,
    view: finanzierungDetail,
  },
  forecast: { titel: 'Forecast', view: forecast },
  einzelobjekt: { titel: 'Einzelobjektbetrachtung', navTitel: 'Einzelobjekt', view: objektForecast },
  buchhaltung: {
    titel: 'Buchhaltung', view: buchhaltung,
    zaehler: (d) => d.zahlungen.length + d.buchungen.length + d.fahrten.length,
  },
  steuerjahr: { titel: 'Steuerjahr', view: steuerjahr },
  einstellungen: { titel: 'Einstellungen', view: einstellungen },
};

const REIHENFOLGE = ['dashboard', 'objekte', 'mietvertraege', 'finanzierungen', 'buchhaltung', 'steuerjahr', 'forecast', 'einzelobjekt', 'einstellungen'];

/* ---------- Design ---------- */

function themaSetzen(thema) {
  document.documentElement.dataset.theme = thema;
  localStorage.setItem('immo-theme', thema);
}

function themaInitialisieren() {
  const gespeichert = localStorage.getItem('immo-theme');
  themaSetzen(gespeichert || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
}

/* ---------- Touch ---------- */

/**
 * Setzt `body.touch`, wenn mit dem Finger bedient wird. Entscheidend ist
 * das Eingabegeraet, nicht die Bildschirmbreite: Ein schmales Fenster am
 * Rechner braucht keine fingergrossen Schaltflaechen, ein iPad im
 * Querformat sehr wohl. Die Kartendarstellung der Listen haengt dagegen an
 * der Breite – siehe CSS.
 */
function touchErkennen() {
  const grob = matchMedia('(pointer: coarse)');
  const setzen = () => document.body.classList.toggle('touch', grob.matches);
  setzen();
  grob.addEventListener('change', setzen);
}

/**
 * Haelt die Spaltenbeschriftung der Listentabellen aktuell.
 *
 * Ein Aufruf in routen() genuegt nicht: Viele Karten zeichnen sich selbst
 * neu – ein Filterwechsel in den Mietvertraegen etwa baut die Tabelle
 * aus, ohne dass der Router davon erfaehrt. Die Beobachtung faengt jeden
 * dieser Wege ab.
 *
 * Nur childList, nicht attributes: kartenListe() setzt selbst Attribute
 * und wuerde sich sonst endlos wieder aufrufen.
 */
function listenBeobachten() {
  const ziel = $('#view');
  if (!ziel || typeof MutationObserver !== 'function') return;
  let geplant = false;
  new MutationObserver(() => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => { geplant = false; kartenListe(ziel); });
  }).observe(ziel, { childList: true, subtree: true });
}

/* ---------- Seitenleiste als Schublade ---------- */

function schubladeUmschalten(auf) {
  const offen = auf ?? !document.body.classList.contains('nav-offen');
  document.body.classList.toggle('nav-offen', offen);
  $('#btnNav')?.setAttribute('aria-expanded', String(offen));
}

function schubladeSchliessen() {
  schubladeUmschalten(false);
}

/* ---------- Startbildschirm ---------- */

function startBereich() { return $('#startupBody'); }

function startFehler(titel, html) {
  const body = leeren(startBereich());
  body.append(el('div.startup-err', {}, [el('strong', { text: titel }), el('div', { html, style: 'margin-top:6px' })]));
}

/**
 * Service Worker anmelden – nur im sicheren Kontext, den der Browser dafuer
 * verlangt. Scheitert das, laeuft die App einfach ohne Offline-Faehigkeit
 * weiter; ein Grund zum Abbrechen ist es nicht.
 */
function offlineVorbereiten() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('sw.js').catch((e) => {
    console.warn('Offline-Betrieb nicht verfügbar:', e.message);
  });
}

async function starten() {
  themaInitialisieren();
  offlineVorbereiten();

  if (location.protocol === 'file:') {
    startFehler('Bitte über Start.bat öffnen',
      'Die App wurde direkt als Datei geöffnet. In diesem Modus erlaubt der Browser keinen Zugriff auf deinen Portfolio-Ordner.<br><br>'
      + 'Schließe dieses Fenster und starte stattdessen <strong>Start.bat</strong> im selben Ordner.');
    return;
  }

  if (!istUnterstuetzt()) {
    startFehler('Browser zu alt',
      'Die App braucht IndexedDB, um Daten zu speichern. Das kann jeder aktuelle Browser – '
      + 'bitte aktualisiere deinen Browser und öffne die App erneut.');
    return;
  }

  datenquelle(() => state.daten);

  /* Kommen wir gerade von der Dropbox-Anmeldung zurueck? Dann zuerst den
     Code einloesen – sonst stuende die App vor einer Ablage, bei der sie
     sich noch nicht ausweisen kann. */
  if (dbx.rueckkehrErkannt()) {
    const body = leeren(startBereich());
    body.append(el('div.spinner'));
    try {
      if (await dbx.anmeldungAbschliessen()) {
        await verbinden({ kennung: 'dropbox', ziel: { kennung: 'dropbox' }, name: 'Dropbox' }, false);
        return;
      }
    } catch (e) {
      startFehler('Dropbox-Anmeldung fehlgeschlagen', e.message);
      startBereich().append(el('button.btn', {
        type: 'button', style: 'margin-top:12px', onclick: () => startAuswahlZeigen(null),
      }, ['Zurück']));
      return;
    }
  }

  let gemerkt = null;
  try { gemerkt = await gemerkteAblage(); } catch { /* ignorieren */ }
  startAuswahlZeigen(gemerkt);
}

/* Auf dem Startbildschirm lohnt die Warnung nur dort, wo sie wirklich
   draengt – auf iPhone und iPad. Den allgemeinen Hinweis bekommt man in den
   Einstellungen, sobald der Geraetespeicher tatsaechlich in Benutzung ist. */
function homeBildschirmHinweis() {
  const text = aufApple() ? speicherWarnung() : null;
  return text ? el('div.startup-hint', { html: text }) : null;
}

function startAuswahlZeigen(gemerkt) {
  const body = leeren(startBereich());
  const ablagen = verfuegbareAblagen();
  const mitOrdner = ablagen.some((a) => a.kennung === 'ordner');

  if (gemerkt) {
    body.append(el('div.startup-recent', {}, [
      el('div', { style: 'font-size:19px' }, [gemerkt.kennung === 'ordner' ? '📁' : '📱']),
      el('div', { style: 'min-width:0' }, [
        el('div.rec-name', { text: gemerkt.name }),
        el('div.rec-path', { text: 'zuletzt verwendetes Portfolio' }),
      ]),
    ]));
    body.append(el('button.btn.btn-primary.btn-lg', {
      type: 'button', onclick: () => verbinden(gemerkt, false),
    }, ['Portfolio öffnen']));
    body.append(el('button.btn.btn-ghost', {
      type: 'button', onclick: () => startAuswahlZeigen(null),
    }, ['Anderes Portfolio']));
    return;
  }

  if (mitOrdner) {
    body.append(el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => ordnerDialog(true) }, ['Neues Portfolio anlegen']));
    body.append(el('button.btn', { type: 'button', onclick: () => ordnerDialog(false) }, ['Vorhandenes Portfolio öffnen']));
    body.append(el('button.btn', { type: 'button', onclick: () => dropboxStarten() }, ['Mit Dropbox verbinden']));
    body.append(el('button.btn.btn-ghost', { type: 'button', onclick: () => lokalStarten() }, ['Nur auf diesem Gerät']));
    body.append(el('div.startup-hint', {
      text: 'Beim Anlegen wählst du einen Ordner auf deinem Rechner. Dort speichert die App portfolio.json, '
        + 'deine Bilder, Dokumente und automatische Sicherungen.',
    }));
  } else {
    /* Safari und damit jeder Browser auf dem iPad: kein Ordnerzugriff. */
    body.append(el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => dropboxStarten() }, ['Mit Dropbox verbinden']));
    body.append(el('button.btn', { type: 'button', onclick: () => lokalStarten() }, ['Nur auf diesem Gerät']));
    body.append(el('div.startup-hint', {
      text: 'Dieser Browser kann nicht auf einen Ordner zugreifen. Über Dropbox siehst du auf allen '
        + 'Geräten denselben Stand; „Nur auf diesem Gerät" speichert ohne Abgleich im Browser.',
    }));
  }

  const hinweis = homeBildschirmHinweis();
  if (hinweis) body.append(hinweis);
}

async function ordnerDialog(neuAnlegen) {
  let auswahl;
  try {
    auswahl = await ablageWaehlen('ordner');
  } catch (e) {
    if (e.name !== 'AbortError') toast('Ordner konnte nicht geöffnet werden: ' + e.message, 'err');
    return;
  }
  await verbinden({ ...auswahl, name: auswahl.ziel.name }, neuAnlegen);
}

async function lokalStarten() {
  const auswahl = await ablageWaehlen('lokal');
  await verbinden({ ...auswahl, name: 'Dieses Gerät' }, true);
}

/**
 * Fragt den App Key ab und erklaert, wo er herkommt. Der Key ist bei PKCE
 * ausdruecklich oeffentlich – er identifiziert die App, er berechtigt zu
 * nichts. Die Redirect-URI wird angezeigt, weil sie bei Dropbox auf das
 * Zeichen genau eingetragen sein muss.
 */
export async function appKeyAbfragen() {
  const uri = dbx.redirectUri();
  const input = el('input', {
    type: 'text', value: (await dbx.appKeyLesen()) || '',
    placeholder: 'z. B. a1b2c3d4e5f6g7h',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  const meldung = el('div.hint', { style: 'color:var(--neg)' });
  const inhalt = el('div', { style: 'display:grid;gap:12px' }, [
    hinweis('<strong>Einmalige Einrichtung bei Dropbox.</strong> Lege auf '
      + '<em>dropbox.com/developers/apps</em> eine App an: <em>Scoped access</em>, '
      + '<em>App folder</em>, beliebiger Name. Im Reiter <em>Permissions</em> die Rechte '
      + '<em>files.content.read</em> und <em>files.content.write</em> setzen und speichern.'),
    el('div.field', {}, [
      el('label', { text: 'Redirect-URI – im Reiter „Settings" unter „Redirect URIs" eintragen' }),
      el('div.readonly', { text: uri, style: 'user-select:all;word-break:break-all' }),
    ]),
    el('div.field', {}, [
      el('label', { text: 'App key – Reiter „Settings", Feld „App key"' }),
      input,
      el('div.hint', { text: 'Nicht das darunterstehende „App secret" – das wird hier nicht '
        + 'gebraucht. Der App key ist nicht geheim, er benennt nur die App. Dein Zugang '
        + 'entsteht erst bei der Anmeldung und bleibt auf diesem Gerät.' }),
    ]),
    meldung,
  ]);

  for (;;) {
    const wert = await modal({
      titel: 'Dropbox einrichten', inhalt, breite: 560,
      buttons: [
        { text: 'Abbrechen', wert: null },
        { text: 'Weiter zur Anmeldung', klasse: 'btn-primary', wert: '\0' },
      ],
    });
    if (wert !== '\0') return false;

    const key = input.value.trim();
    /* Dropbox-App-Keys bestehen aus Buchstaben und Ziffern. Ein Leerzeichen
       oder ein mitkopiertes „App key:" faellt hier auf – sonst erst drueben
       mit „invalid client_id", und dann weiss niemand, woran es lag. */
    const fehler = !key ? 'Bitte den App key eintragen.'
      : /\s/.test(key) ? 'Der App key enthält ein Leerzeichen. Bitte nur die Zeichenfolge selbst einfügen.'
      : !/^[A-Za-z0-9]+$/.test(key) ? 'Der App key besteht nur aus Buchstaben und Ziffern – hier stehen andere Zeichen.'
      : null;
    if (fehler) { meldung.textContent = fehler; continue; }

    await dbx.appKeySetzen(key);
    return true;
  }
}

async function dropboxStarten() {
  if (!window.isSecureContext) {
    startFehler('Dropbox braucht HTTPS',
      'Diese Adresse ist nicht verschlüsselt. Der Browser erlaubt die für die Anmeldung nötige '
      + 'Verschlüsselung nur über <strong>https://</strong> oder <strong>localhost</strong>.<br><br>'
      + 'Lege die App auf einen Webspeicher mit HTTPS – siehe LIESMICH.');
    startBereich().append(el('button.btn', {
      type: 'button', style: 'margin-top:12px', onclick: () => startAuswahlZeigen(null),
    }, ['Zurück']));
    return;
  }

  if (await dbx.angemeldet()) {
    await verbinden({ kennung: 'dropbox', ziel: { kennung: 'dropbox' }, name: 'Dropbox' }, false);
    return;
  }
  /* Solange nicht angemeldet ist, wird der App key jedes Mal gezeigt –
     vorausgefuellt und aenderbar. Erschiene er nur beim ersten Mal, saesse
     man mit einem Tippfehler fest: Dropbox lehnt mit „invalid client_id"
     ab, und die App haette keinen Weg, den Wert zu korrigieren. */
  if (!(await appKeyAbfragen())) return;
  try {
    await dbx.anmeldungStarten();      // verlaesst die Seite
  } catch (e) {
    toast(e.message, 'err', 7000);
  }
}

async function verbinden(auswahl, neuAnlegen) {
  const body = leeren(startBereich());
  body.append(el('div.spinner'));

  try {
    if (!(await rechtePruefen(auswahl))) {
      startFehler('Zugriff verweigert', 'Ohne Schreibrecht auf den Ordner kann das Portfolio nicht geladen werden.');
      startBereich().append(el('button.btn', { type: 'button', onclick: () => startAuswahlZeigen(null) }, ['Erneut versuchen']));
      return;
    }

    await ablageUebernehmen(auswahl);
    /* Bei Dropbox zuerst nachsehen, ob drueben schon ein Portfolio liegt –
       sonst legte jedes neue Geraet ein zweites an. */
    if (auswahl.kennung === 'dropbox') await erstbezug();
    let daten = await portfolioLesen();

    if (!daten) {
      const vorschlag = auswahl.kennung === 'ordner' ? auswahl.name : 'Mein Portfolio';
      const wo = auswahl.kennung === 'ordner'
        ? `Im Ordner „${auswahl.name}" wurde noch keine portfolio.json gefunden.`
        : 'Auf diesem Gerät ist noch kein Portfolio gespeichert.';
      const name = await abfragen(
        'Neues Portfolio anlegen',
        `${wo} Es wird ein neues Portfolio angelegt.`,
        { label: 'Name des Portfolios', wert: vorschlag, platzhalter: 'Mein Portfolio' }
      );
      if (name === null) { startAuswahlZeigen(await gemerkteAblage()); return; }
      daten = neuesPortfolio(name || vorschlag);
      laden(daten);
      await sofortSpeichern();
      toast('Portfolio angelegt', 'ok');
    } else {
      laden(daten);
      if (neuAnlegen) toast('Vorhandenes Portfolio geladen', 'info');
    }

    await ablageMerken(auswahl, state.daten.meta.name);
    appStarten();
  } catch (e) {
    console.error(e);
    /* Der Rat muss zur Ursache passen. Frueher stand hier immer „prüfe
       portfolio.json" – bei einem Netz- oder Dropbox-Fehler schickte das
       auf die falsche Fährte. */
    const klar = dbx.fehlerKlartext(e);
    const roh = e.message || String(e);
    const rat = klar.neuAnmelden ? ''
      : /JSON|Unexpected token/i.test(roh)
        ? '<br><br>Die Datei <strong>portfolio.json</strong> ist beschädigt. Unter „backups" liegen die letzten Sicherungen.'
        : /Dropbox|fetch|Failed to|NetworkError/i.test(roh)
          ? '<br><br>Das sieht nach einem Problem mit Dropbox oder der Verbindung aus. Prüfe, ob du online bist.'
          : '<br><br>Versuche es erneut, oder wähle ein anderes Portfolio.';

    startFehler('Portfolio konnte nicht geladen werden', klar.text + rat);
    const box = startBereich();
    if (klar.neuAnmelden) {
      /* Bei einem Zugangsproblem nützt „Neu starten" nichts – es braucht
         eine frische Anmeldung. Also gleich den Knopf dafür. */
      box.append(el('button.btn.btn-primary', {
        type: 'button', style: 'margin-top:12px',
        onclick: async () => { await dbx.abmelden(); dropboxStarten(); },
      }, ['Bei Dropbox neu anmelden']));
    } else {
      box.append(el('button.btn.btn-primary', { type: 'button', style: 'margin-top:12px', onclick: () => location.reload() }, ['Neu starten']));
    }
    box.append(el('button.btn', { type: 'button', style: 'margin-top:8px', onclick: () => startAuswahlZeigen(null) }, ['Anderes Portfolio wählen']));
  }
}

/* ---------- App ---------- */

function appStarten() {
  $('#startup').hidden = true;
  $('#app').hidden = false;

  touchErkennen();
  listenBeobachten();
  $('#btnNav')?.addEventListener('click', () => schubladeUmschalten());
  $('#navSchatten')?.addEventListener('click', () => schubladeSchliessen());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') schubladeSchliessen();
  });

  navAufbauen();
  steuerUmschalterAufbauen();
  chromeAktualisieren();
  abonnieren(chromeAktualisieren);

  speicher.onStatus = statusAnzeigen;
  statusAnzeigen('idle');

  $('#themeToggle').addEventListener('click', () => {
    themaSetzen(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  $('#btnFolder').addEventListener('click', () => {
    const wo = speicher.kennung === 'ordner' ? 'Portfolio-Ordner' : 'Gespeichert auf';
    toast(`${wo}: ${speicher.ordnerName} – siehe Einstellungen`, 'info', 5000);
    location.hash = '#/einstellungen';
  });

  /* Der Abgleich weiss nicht, wie neu gezeichnet wird – hier meldet er es an. */
  anzeigeAnmelden(() => { chromeAktualisieren(); routen(); });
  abgleichAnbinden();

  window.addEventListener('hashchange', routen);
  window.addEventListener('beforeunload', (e) => {
    if (speicher.status === 'dirty' || speicher.status === 'saving') {
      sofortSpeichern();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && speicher.status === 'dirty') sofortSpeichern();
  });

  routen();
}

function navAufbauen() {
  const nav = leeren($('#nav'));
  for (const key of REIHENFOLGE) {
    if (key === 'einstellungen') nav.append(el('div', { style: 'flex:1' }));
    const cfg = ANSICHTEN[key];
    nav.append(el('a.nav-item', { href: '#/' + key, dataset: { key } }, [
      el('span', { html: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[key]}</svg>`, style: 'display:flex' }),
      el('span', { text: cfg.navTitel || cfg.titel }),
      cfg.zaehler ? el('span.nav-badge', { dataset: { badge: key } }) : null,
    ]));
  }
}

/** Umschalter „vor Steuern / nach Steuern“ – wirkt auf alle Ansichten. */
function steuerUmschalterAufbauen() {
  const box = leeren($('#steuerModus'));
  for (const [wert, text, titel] of [
    ['vor', 'vor St.', 'Cashflow vor Steuern'],
    ['nach', 'nach St.', 'Cashflow nach Steuern – mit AfA und persönlichem Steuersatz'],
  ]) {
    box.append(el('button' + (steuerModus() === wert ? '.aktiv' : ''), {
      type: 'button', text, title: titel,
      onclick: () => {
        if (steuerModus() === wert) return;
        setSteuerModus(wert);
        steuerUmschalterAufbauen();
        routen();
      },
    }));
  }
}

function chromeAktualisieren() {
  const d = state.daten;
  $('#portfolioName').textContent = d.meta.name;
  const version = $('#version');
  if (version) version.textContent = `v1.0 · Schema ${d.schemaVersion}`;
  $('#folderName').textContent = speicher.ordnerName || 'Ordner';

  // Titel kann sich mit den Daten aendern (z. B. Objektbezeichnung)
  const key = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  const cfg = ANSICHTEN[key];
  if (cfg) $('#viewTitle').textContent = typeof cfg.titel === 'function' ? cfg.titel() : cfg.titel;

  document.title = d.meta.name + ' – ImmoPortfolio';
  for (const key of REIHENFOLGE) {
    const cfg = ANSICHTEN[key];
    if (!cfg.zaehler) continue;
    const badge = document.querySelector(`[data-badge="${key}"]`);
    if (badge) {
      const n = cfg.zaehler(d);
      badge.textContent = n > 0 ? String(n) : '';
    }
  }
}

function statusAnzeigen(status, detail) {
  const box = $('#saveStatus');
  if (!box) return;
  box.dataset.state = status;
  const label = box.querySelector('.label');
  const texte = {
    idle: detail instanceof Date ? 'Gespeichert ' + detail.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Gespeichert',
    dirty: 'Nicht gespeichert',
    saving: 'Speichert …',
    error: 'Fehler beim Speichern',
  };
  label.textContent = texte[status] || '';
  if (status === 'error') toast('Speichern fehlgeschlagen. Prüfe die Ordnerrechte.', 'err', 7000);
}

function routen() {
  const key = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  if (key === 'zahlungen') {   // alte Route, seit dem Ausbau zur Buchhaltung umbenannt
    location.hash = '#/buchhaltung';
    return;
  }
  const cfg = ANSICHTEN[key] || ANSICHTEN.dashboard;
  const aktiv = cfg.navKey || key;

  for (const a of document.querySelectorAll('.nav-item')) {
    a.classList.toggle('active', a.dataset.key === aktiv);
  }
  $('#viewTitle').textContent = typeof cfg.titel === 'function' ? cfg.titel() : cfg.titel;

  const container = leeren($('#view'));
  container.scrollTop = 0;
  cfg.view.render(container);
  /* Nach jedem Aufbau: Listentabellen beschriften, damit sie auf schmalen
     Geraeten als Karten lesbar sind. Siehe kartenListe() in felder.js. */
  kartenListe(container);
  schubladeSchliessen();
}

starten();
