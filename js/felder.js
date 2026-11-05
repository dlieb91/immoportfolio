/* Wiederverwendbare Formularfelder.

   Alle Felder schreiben direkt in das uebergebene Objekt und stossen
   ueber aendern() das Autosave an. Gespeichert wird beim Verlassen des
   Feldes (change), damit die Eingabe nicht unterbrochen wird.
*/

import { el, num, istHandy } from './util.js';
import { aendern, protokollieren } from './store.js';

/**
 * Liest eine Zahl aus einer Eingabe – deutsch geschrieben, aber nachsichtig.
 *
 * Der Punkt ist zweideutig: „1.000" meint tausend, „1.5" meint eineinhalb.
 * Entschieden wird nach der Schreibweise, nicht nach Vermutung:
 *   - Steht ein Komma da, ist es das Dezimalzeichen und jeder Punkt trennt
 *     Tausender („1.234,50").
 *   - Sonst sind Punkte nur dann Tausendertrenner, wenn sie es formal auch
 *     sind: auf jeden folgen genau drei Ziffern („1.000", „1.234.567").
 *   - Alles andere gilt als Dezimalpunkt („1.5", „0.75") – so tippt, wer
 *     eine englische Tastatur gewohnt ist.
 */
export function parseZahl(text) {
  if (text == null) return null;
  const s = String(text).trim().replace(/\s|€|%|m²/g, '');
  if (!s) return null;
  let normalisiert;
  if (s.includes(',')) normalisiert = s.replace(/\./g, '').replace(',', '.');
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(s)) normalisiert = s.replace(/\./g, '');
  else normalisiert = s;
  const v = Number(normalisiert);
  return Number.isFinite(v) ? v : null;
}

function huelle(label, control, hint) {
  return el('div.field', {}, [
    label ? el('label', { text: label }) : null,
    control,
    hint ? el('div.hint', { text: hint }) : null,
  ]);
}

function melden(opts) {
  if (typeof opts.nach === 'function') opts.nach();
}

/**
 * Schreibt eine Änderung ins Protokoll. Muss innerhalb von aendern()
 * laufen, damit sie mitgespeichert wird.
 *
 * opts.bezug   ID, unter der der Eintrag erscheinen soll (bei
 *              Unterobjekten wie o.kosten notwendig)
 * opts.stumm   true = nicht protokollieren
 */
function merken(opts, obj, label, alt, neu) {
  if (opts.stumm || !label) return;
  const a = alt ?? null;
  const n = neu ?? null;
  if (a === n) return;
  protokollieren(opts.bezug ?? obj.id ?? null, label, a, n);
}

/** Setzt einen Wert, protokolliert ihn und stößt Speichern plus Rückmeldung an. */
function setzen(opts, obj, key, label, wert) {
  const alt = obj[key];
  if (alt === wert) return;
  aendern(() => {
    obj[key] = wert;
    merken(opts, obj, label, alt, wert);
  });
  melden(opts);
}

export function textFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'text', value: obj[key] ?? '', placeholder: opts.platzhalter || '',
    onchange: (e) => setzen(opts, obj, key, label, e.target.value),
  });
  return huelle(label, input, opts.hint);
}

/**
 * Nacktes Zahlenfeld ohne Beschriftung und Hülle – für Ansichten, die
 * ihre eigene Umgebung bauen, etwa mit selbst nachgezogenen Hinweisen.
 * Die Beschriftung fürs Protokoll kommt über opts.label.
 */
export function zahlEingabe(obj, key, opts = {}) {
  const nk = opts.nachkomma ?? 2;
  /* Eine Jahreszahl ist keine Menge: „1.945" liest sich als Betrag und nicht
     als Baujahr. Mit opts.jahr bleibt die Gruppierung weg. */
  const zeigen = (v) => (opts.jahr ? String(Math.round(v)) : num(v, nk));
  return el('input', {
    type: 'text', inputmode: 'decimal', placeholder: opts.platzhalter || '',
    value: obj[key] == null ? '' : zeigen(obj[key]),
    onchange: (e) => {
      const v = parseZahl(e.target.value);
      setzen(opts, obj, key, opts.label, v);
      e.target.value = v == null ? '' : zeigen(v);
    },
  });
}

export function zahlFeld(label, obj, key, opts = {}) {
  const input = zahlEingabe(obj, key, { ...opts, label });
  const control = opts.suffix
    ? el('div.input-suffix', {}, [input, el('span', { text: opts.suffix })])
    : input;
  return huelle(label, control, opts.hint);
}

/**
 * Datumsfeld. Beim Tippen meldet der Browser jede Zwischenstufe der
 * Jahreszahl als Änderung – aus „2026" werden nacheinander die Jahre
 * 0002, 0020, 0202 und 2026. Solche Zwischenstände werden verworfen,
 * sonst würde jede Ziffer eine Neuberechnung auslösen.
 */
export function datumFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'date', value: obj[key] || '',
    onchange: (e) => {
      const wert = e.target.value || null;
      if (wert && !plausiblesDatum(wert)) return;
      setzen(opts, obj, key, label, wert);
    },
  });
  return huelle(label, input, opts.hint);
}

/** Jahreszahl im sinnvollen Bereich – filtert Tippzwischenstände heraus. */
export function plausiblesDatum(wert) {
  const jahr = Number(String(wert).slice(0, 4));
  return Number.isFinite(jahr) && jahr >= 1900 && jahr <= 2200;
}

/* ---------- Eingaben in Tabellenzeilen ----------
   Der Wert wird sofort übernommen, der Neuaufbau der Tabelle (Sortierung,
   abgeleitete Spalten) erst beim Verlassen des Feldes. Sonst verschwände
   die Zeile unter dem Cursor. */

function tabellenEingabe(attr, lesen, schreiben, { nach, umbauen }) {
  let veraendert = false;
  const input = el('input', {
    ...attr,
    onchange: (e) => {
      if (!schreiben(e)) return;
      veraendert = true;
      if (nach) nach();
    },
    onblur: () => {
      if (!veraendert) return;
      veraendert = false;
      if (umbauen) umbauen();
    },
  });
  input.value = lesen();
  return input;
}

export function tabellenDatum(obj, key, opts = {}) {
  return tabellenEingabe(
    { type: 'date', style: opts.style },
    () => obj[key] || '',
    (e) => {
      const wert = e.target.value || null;
      if (wert && !plausiblesDatum(wert)) return false;
      if (obj[key] === wert) return false;
      aendern(() => { obj[key] = wert; });
      return true;
    },
    opts,
  );
}

export function tabellenZahl(obj, key, opts = {}) {
  const nk = opts.nachkomma ?? 2;
  return tabellenEingabe(
    { type: 'text', inputmode: 'decimal', style: opts.style || 'text-align:right' },
    () => (obj[key] == null ? '' : num(obj[key], nk)),
    (e) => {
      const v = parseZahl(e.target.value);
      e.target.value = v == null ? '' : num(v, nk);
      if (obj[key] === v) return false;
      aendern(() => { obj[key] = v; });
      return true;
    },
    opts,
  );
}

export function tabellenText(obj, key, opts = {}) {
  return tabellenEingabe(
    { type: 'text', placeholder: opts.platzhalter || '', style: opts.style },
    () => obj[key] || '',
    (e) => {
      if (obj[key] === e.target.value) return false;
      aendern(() => { obj[key] = e.target.value; });
      return true;
    },
    opts,
  );
}

/**
 * Auswahlliste in einer Tabellenzeile. Anders als bei Text-/Zahlenfeldern
 * gibt es hier kein Zwischenstadium beim Tippen – die Änderung übernimmt
 * sofort, `opts.umbauen` wird direkt danach aufgerufen statt erst bei
 * `blur`.
 */
export function tabellenAuswahl(obj, key, optionen, opts = {}) {
  const sel = el('select', {
    style: opts.style,
    onchange: (e) => {
      const treffer = optionen.find((o) => String(o.wert) === e.target.value);
      const wert = treffer ? treffer.wert : e.target.value;
      if (obj[key] === wert) return;
      aendern(() => { obj[key] = wert; });
      if (opts.nach) opts.nach();
      if (opts.umbauen) opts.umbauen();
    },
  }, optionen.map((o) => el('option', { value: String(o.wert), selected: obj[key] === o.wert }, [o.text])));
  return sel;
}

export function auswahlFeld(label, obj, key, optionen, opts = {}) {
  const sel = el('select', {
    onchange: (e) => {
      const treffer = optionen.find((o) => String(o.wert) === e.target.value);
      setzen(opts, obj, key, label, treffer ? treffer.wert : e.target.value);
    },
  }, optionen.map((o) => el('option', { value: String(o.wert), selected: obj[key] === o.wert }, [o.text])));
  return huelle(label, sel, opts.hint);
}

export function schalterFeld(label, obj, key, opts = {}) {
  const input = el('input', {
    type: 'checkbox', checked: !!obj[key], style: 'width:auto;margin-right:9px',
    onchange: (e) => setzen(opts, obj, key, label, e.target.checked),
  });
  return el('div.field', {}, [
    el('label', { style: 'display:flex;align-items:center;cursor:pointer;color:var(--text)' }, [input, label]),
    opts.hint ? el('div.hint', { text: opts.hint, style: 'margin-left:24px' }) : null,
  ]);
}

export function textBereich(label, obj, key, opts = {}) {
  const ta = el('textarea', {
    rows: opts.zeilen || 4, placeholder: opts.platzhalter || '',
    onchange: (e) => setzen(opts, obj, key, label || opts.protokollLabel, e.target.value),
  });
  ta.value = obj[key] ?? '';
  return huelle(label, ta, opts.hint);
}

/**
 * Zahl für ein Eingabefeld, deutsch geschrieben. Auf die gewünschten
 * Nachkommastellen gerundet – es sei denn, das veränderte den Wert: Wer
 * 4,625 eingibt, soll nicht 4,63 sehen und trotzdem mit 4,625 rechnen.
 */
function zahlAnzeige(wert, nachkomma) {
  if (wert == null) return '';
  const gerundet = num(wert, nachkomma);
  const zurueck = Number(gerundet.replace(/\./g, '').replace(',', '.'));
  return Math.abs(zurueck - wert) < 1e-9 ? gerundet : String(wert).replace('.', ',');
}

/**
 * Eingabefeld, das **nur in der Ansicht lebt**.
 *
 * Alle anderen Felder hier schreiben über setzen() ins Portfolio – und damit
 * in die Datei und ins Änderungsprotokoll. Für Was-wäre-wenn-Werte (die
 * Annahmen einer Anschlussrechnung) und für die Angaben zu einem Brief ist das
 * falsch: Niemand will sie speichern, und sie gehörten nicht ins Protokoll.
 * Der Aufrufer hält den Wert selbst und bekommt ihn über `nach` zurück.
 *
 * typ: 'zahl' (deutsch geschrieben, parseZahl) | 'text' | 'datum'
 */
export function ansichtsFeld({ label, typ = 'zahl', wert, nachkomma = 2, suffix, hint, platzhalter, nach }) {
  const anzeige = typ === 'zahl' ? zahlAnzeige(wert, nachkomma) : (wert ?? '');
  const input = el('input', {
    type: typ === 'datum' ? 'date' : 'text',
    inputmode: typ === 'zahl' ? 'decimal' : null,
    placeholder: platzhalter || '',
    value: anzeige,
    onchange: (e) => {
      if (typ === 'zahl') return nach(parseZahl(e.target.value));
      const v = e.target.value || null;
      // Beim Tippen meldet der Browser jede Zwischenstufe der Jahreszahl, siehe datumFeld().
      if (typ === 'datum' && v && !plausiblesDatum(v)) return;
      nach(v);
    },
  });
  const control = suffix ? el('div.input-suffix', {}, [input, el('span', { text: suffix })]) : input;
  return huelle(label, control, hint);
}

/** Reines Anzeigefeld fuer berechnete Werte. */
export function anzeigeFeld(label, wert, opts = {}) {
  return el('div.field', {}, [
    el('label', { text: label }),
    el('div.readonly' + (opts.klasse ? '.' + opts.klasse : ''), { text: wert }),
    opts.hint ? el('div.hint', { text: opts.hint }) : null,
  ]);
}

/* ---------- Layout ---------- */

export function felderGitter(felder, minBreite = 210) {
  return el('div', {
    style: `display:grid;grid-template-columns:repeat(auto-fit,minmax(${minBreite}px,1fr));gap:0 18px`,
  }, felder);
}

export function abschnitt(titel, sub, inhalt, hinweisHtml) {
  return el('div.card', {}, [
    titel ? el('div.card-head', {}, [
      el('div', {}, [el('h2', { text: titel }), sub ? el('div.sub', { text: sub }) : null]),
    ]) : null,
    el('div.card-body', {}, [
      hinweisHtml ? hinweis(hinweisHtml) : null,
      ...[].concat(inhalt),
    ]),
  ]);
}

export function hinweis(html, art) {
  // art 'warn': dieselbe Karte in der Warnfarbe, mit Warndreieck statt Infokreis
  const warn = art === 'warn';
  return el('div.note' + (warn ? '.note-warn' : ''), { style: 'margin-bottom:16px' }, [
    el('div.note-icon', { html: warn
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>' }),
    el('div', { html }),
  ]);
}

/* ---------- Touch: Listentabellen als Karten ----------

   Auf schmalen Geraeten wird aus jeder Tabellenzeile eine Karte, in der
   jede Zelle ihre Spaltenueberschrift vor sich her traegt. Statt das in
   fuenf Ansichten einzeln zu bauen, holt sich jede Zelle hier ihre
   Beschriftung aus dem Tabellenkopf – den Rest erledigt das CSS.

   Betroffen sind nur Tabellen mit der Klasse `liste`. Die Jahrestabellen
   in Forecast und Einzelobjekt tragen sie bewusst nicht: Eine
   Jahresreihe *ist* eine Tabelle und bleibt waagerecht scrollbar. */

export function kartenListe(wurzel = document) {
  for (const tabelle of wurzel.querySelectorAll('table.data.liste')) {
    const kopf = [...tabelle.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!kopf.length) continue;
    for (const zeile of tabelle.querySelectorAll('tbody tr')) {
      const zellen = [...zeile.children];
      // Leermeldungen ueber die ganze Breite bleiben, wie sie sind.
      if (zellen.length === 1 && zellen[0].colSpan > 1) continue;
      zellen.forEach((zelle, i) => {
        if (kopf[i]) zelle.dataset.spalte = kopf[i];
      });
    }
  }
}

/* ---------- Einklappbare Karten (Handy) ----------

   Am Handy ist eine Objektansicht sonst zehn Bildschirme lang. Jede Karte mit
   Überschrift lässt sich dort per Tipp auf den Kopf ein- und ausklappen; der
   Zustand wird je Ansicht und Kartentitel im Gerät gemerkt. Am Rechner und
   auf dem iPad wirkt nichts davon – die Klasse `zu` greift nur in der
   Handy-Media-Query von app.css, und der Klick prüft istHandy().

   Was standardmäßig zu ist: Eingabe- und Detailkarten, die man selten
   braucht. Offen bleibt, was man beim Öffnen einer Ansicht sehen will –
   Kennzahlen, Cashflow, Hinweise, Ergebnisse. */

const STANDARD_ZU = [
  /^Annahmen$/, /^Anhang: Herleitung/, /^Änderungsprotokoll/, /^Dokumente$/, /^Bilder$/, /^Notizen$/,
  /^Stammdaten$/, /^Steuerliche Angaben$/, /^Einheiten$/, /^Laufende Kosten$/, /^Modernisierung/,
  /^Buchungen/, /^Nebenkostenabrechnung/, /^Tilgungsplan$/, /^Konditionen$/, /^Sondertilgungen$/,
  /^Jahr für Jahr$/, /^Mietkonditionen/, /^Laufzeit/, /^Zuordnung/, /^Vertragsdaten/,
];
const KLAPP_KEY = 'immo-karten-zu';

function klappZustand() {
  try { return JSON.parse(localStorage.getItem(KLAPP_KEY) || '{}'); } catch { return {}; }
}

export function kartenKlappen(wurzel) {
  if (!wurzel) return;
  const route = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  const gemerkt = klappZustand();
  for (const karte of wurzel.querySelectorAll('.card')) {
    if (karte.dataset.klappbar) continue;
    const kopf = karte.querySelector(':scope > .card-head');
    const h2 = kopf?.querySelector('h2');
    if (!h2) continue;
    const titel = h2.textContent.trim();
    // Jahreszahlen im Titel („Buchungen 2026“) sollen den Zustand nicht jedes Jahr zurücksetzen.
    const schluessel = route + '|' + titel.replace(/\d{4}/g, '#');
    karte.dataset.klappbar = '1';
    karte.classList.toggle('zu', gemerkt[schluessel] ?? STANDARD_ZU.some((re) => re.test(titel)));
    kopf.addEventListener('click', (e) => {
      if (!istHandy()) return;
      // Knöpfe und Felder im Kopf behalten ihre eigene Aufgabe.
      if (e.target.closest('button, a, input, select, textarea, label, .seg')) return;
      const zu = karte.classList.toggle('zu');
      // Eingeklappt hatten Tabellen keine Breite – erst jetzt lässt sich messen.
      if (!zu) { breiteTabellen(karte); langeHinweise(karte); }
      const z = klappZustand();
      z[schluessel] = zu;
      localStorage.setItem(KLAPP_KEY, JSON.stringify(z));
    });
  }
}

/* ---------- Breite Tabellen ----------
   Eine Tabelle, die breiter ist als ihr Platz, bekommt einen eigenen
   Scrollbehälter. Nur diese: Allen anderen nähme ein Behälter die volle
   Breite. Tabellen in .plan-scroll haben ihren schon, Listentabellen werden
   zu Karten. */
export function breiteTabellen(wurzel) {
  if (!wurzel) return;
  for (const t of wurzel.querySelectorAll('table.data:not(.liste)')) {
    if (t.closest('.plan-scroll, .tabelle-scroll')) continue;
    const platz = t.parentElement?.clientWidth || 0;
    if (!platz || t.scrollWidth <= platz + 1) continue;
    const huelle = el('div.tabelle-scroll');
    t.before(huelle);
    huelle.append(t);
  }
}

/* ---------- Lange Hinweise (Handy) ----------
   Am Handy füllte ein Hinweis von zwölf Zeilen den ersten Bildschirm. Er
   wird auf drei Zeilen gekürzt, „mehr“ zeigt den Rest. Der Anfang bleibt
   stehen – dort steht, was niemand übersehen darf („keine Steuerberatung“). */
const HINWEIS_LANG = 240;

export function langeHinweise(wurzel) {
  if (!wurzel || !istHandy()) return;
  for (const note of wurzel.querySelectorAll('.note')) {
    if (note.dataset.gekuerzt) continue;
    const text = note.lastElementChild;
    if (!text || (text.textContent || '').length < HINWEIS_LANG) continue;
    note.dataset.gekuerzt = '1';
    note.classList.add('gekuerzt');
    const knopf = el('button.note-mehr', {
      type: 'button', text: 'mehr',
      onclick: () => {
        const offen = note.classList.toggle('offen');
        knopf.textContent = offen ? 'weniger' : 'mehr';
      },
    });
    note.append(knopf);
  }
}
