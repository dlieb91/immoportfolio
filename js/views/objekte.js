/* Objektliste: Kachel- und Tabellenansicht, Suche, Filter, Sortierung. */

import { el, leeren, eur, num, toast, modal } from '../util.js';
import {
  state, aendern, neuesObjekt, einheitenVon,
  GRUNDERWERBSTEUER, flaecheVon, verkehrswert, hauptbild,
} from '../store.js';
import { bildURL } from '../storage.js';
import { parseZahl } from '../felder.js';
import { objektKennzahlen, steuerModus, cashflowAktuell } from '../kennzahlen.js';

export const OBJEKTTYPEN = [
  { wert: 'ETW', text: 'Eigentumswohnung' },
  { wert: 'MFH', text: 'Mehrfamilienhaus' },
  { wert: 'EFH', text: 'Ein-/Zweifamilienhaus' },
  { wert: 'Gewerbe', text: 'Gewerbeobjekt' },
  { wert: 'Grundstueck', text: 'Grundstück' },
];

export const typText = (t) => OBJEKTTYPEN.find((o) => o.wert === t)?.text || t || '–';

/** Stift für die Aktionsspalte der Tabellenansicht. */
const STIFT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" '
  + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

const SORTIERUNG = [
  { wert: 'bezeichnung', text: 'Bezeichnung' },
  { wert: 'kaufdatum', text: 'Kaufdatum' },
  { wert: 'kaufpreis', text: 'Kaufpreis' },
  { wert: 'flaeche', text: 'Fläche' },
  { wert: 'ort', text: 'Ort' },
];

let ansichtsModus = localStorage.getItem('immo-objekte-ansicht') || 'kacheln';
let suche = '';
let typFilter = '';
let sortierung = 'bezeichnung';
let absteigend = false;

export const objekte = {
  render(container) {
    const inner = el('div.view-inner');
    container.append(inner);
    zeichnen(inner);
  },
};

function gefiltert() {
  const q = suche.trim().toLowerCase();
  let liste = state.daten.objekte.filter((o) => {
    if (typFilter && o.typ !== typFilter) return false;
    if (!q) return true;
    return [o.bezeichnung, o.strasse, o.ort, o.plz, (o.tags || []).join(' '), o.notizen]
      .some((f) => String(f || '').toLowerCase().includes(q));
  });

  liste = [...liste].sort((a, b) => {
    let x, y;
    switch (sortierung) {
      case 'kaufpreis': x = a.kaufpreis || 0; y = b.kaufpreis || 0; break;
      case 'flaeche': x = flaecheVon(a); y = flaecheVon(b); break;
      case 'kaufdatum': x = a.kaufdatum || ''; y = b.kaufdatum || ''; break;
      case 'ort': x = (a.ort || '').toLowerCase(); y = (b.ort || '').toLowerCase(); break;
      default: x = (a.bezeichnung || '').toLowerCase(); y = (b.bezeichnung || '').toLowerCase();
    }
    const r = x < y ? -1 : x > y ? 1 : 0;
    return absteigend ? -r : r;
  });
  return liste;
}

function zeichnen(inner) {
  leeren(inner);
  const alle = state.daten.objekte;

  if (!alle.length) {
    inner.append(el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '🏢' }),
        el('h3', { text: 'Noch keine Immobilie erfasst' }),
        el('p', { text: 'Lege dein erstes Objekt an – Adresse, Kaufpreis und Kaufnebenkosten. Alles Weitere kannst du jederzeit ergänzen.' }),
        el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => anlegen(inner) }, ['Erstes Objekt anlegen']),
      ]),
    ]));
    return;
  }

  const liste = gefiltert();
  inner.append(werkzeugleiste(inner, liste.length, alle.length));

  if (!liste.length) {
    inner.append(el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '🔍' }),
        el('h3', { text: 'Kein Objekt gefunden' }),
        el('p', { text: 'Für Suche und Filter gibt es keine Treffer.' }),
        el('button.btn', { type: 'button', onclick: () => { suche = ''; typFilter = ''; zeichnen(inner); } }, ['Filter zurücksetzen']),
      ]),
    ]));
    return;
  }

  inner.append(ansichtsModus === 'kacheln' ? kachelAnsicht(liste) : tabellenAnsicht(liste));
  inner.append(summenLeiste(liste));
}

function werkzeugleiste(inner, treffer, gesamt) {
  const sucheInput = el('input', {
    type: 'search', value: suche, placeholder: 'Suchen …',
    style: 'width:210px',
    oninput: (e) => { suche = e.target.value; neuZeichnenErhaltend(inner, e.target); },
  });

  const typSelect = el('select', {
    style: 'width:auto',
    onchange: (e) => { typFilter = e.target.value; zeichnen(inner); },
  }, [
    el('option', { value: '', selected: !typFilter }, ['Alle Typen']),
    ...OBJEKTTYPEN.map((t) => el('option', { value: t.wert, selected: typFilter === t.wert }, [t.text])),
  ]);

  const sortSelect = el('select', {
    style: 'width:auto',
    onchange: (e) => { sortierung = e.target.value; zeichnen(inner); },
  }, SORTIERUNG.map((s) => el('option', { value: s.wert, selected: sortierung === s.wert }, [s.text])));

  const richtung = el('button.btn.btn-sm', {
    type: 'button', title: absteigend ? 'Absteigend' : 'Aufsteigend',
    onclick: () => { absteigend = !absteigend; zeichnen(inner); },
  }, [absteigend ? '↓' : '↑']);

  const umschalter = el('div.seg', {}, [
    el('button' + (ansichtsModus === 'kacheln' ? '.aktiv' : ''), {
      type: 'button', title: 'Kacheln',
      onclick: () => { ansichtsModus = 'kacheln'; localStorage.setItem('immo-objekte-ansicht', 'kacheln'); zeichnen(inner); },
      html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    }),
    el('button' + (ansichtsModus === 'tabelle' ? '.aktiv' : ''), {
      type: 'button', title: 'Tabelle',
      onclick: () => { ansichtsModus = 'tabelle'; localStorage.setItem('immo-objekte-ansicht', 'tabelle'); zeichnen(inner); },
      html: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    }),
  ]);

  return el('div.toolbar', {}, [
    sucheInput,
    typSelect,
    el('span.faint', { text: 'Sortieren:', style: 'font-size:12.5px' }),
    sortSelect,
    richtung,
    el('span', { style: 'flex:1' }),
    el('span.faint', { text: treffer === gesamt ? `${gesamt} Objekte` : `${treffer} von ${gesamt}`, style: 'font-size:12.5px' }),
    umschalter,
    el('button.btn.btn-primary', { type: 'button', onclick: () => anlegen(inner) }, ['+ Objekt']),
  ]);
}

/** Neu zeichnen, ohne den Fokus im Suchfeld zu verlieren. */
function neuZeichnenErhaltend(inner, feld) {
  const pos = feld.selectionStart;
  zeichnen(inner);
  const neu = inner.querySelector('input[type="search"]');
  if (neu) { neu.focus(); neu.setSelectionRange(pos, pos); }
}

/* ---------- Kacheln ---------- */

function kachelAnsicht(liste) {
  return el('div.obj-grid', {}, liste.map(kachel));
}

function kachel(o) {
  const z = objektKennzahlen(o);
  const cf = cashflowAktuell(z) / 12;
  const bild = hauptbild(o);

  const thumb = el('div.obj-thumb', {}, [el('span.obj-thumb-leer', { text: '🏠' })]);
  if (bild) {
    bildURL(bild.datei, true).then((url) => {
      if (url) { leeren(thumb); thumb.append(el('img', { src: url, alt: o.bezeichnung || '' })); }
    });
  }

  const anzEinheiten = o.mehrereEinheiten ? einheitenVon(o.id).length : 0;

  return el('a.obj-card', { href: '#/objekt?id=' + o.id }, [
    thumb,
    el('div.obj-body', {}, [
      el('div.obj-titel', { text: o.bezeichnung || 'Ohne Bezeichnung' }),
      el('div.obj-adresse', { text: [o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Keine Adresse' }),
      el('div.obj-badges', {}, [
        el('span.badge', { text: typText(o.typ) }),
        anzEinheiten ? el('span.badge', { text: anzEinheiten + ' Einheiten' }) : null,
        o.baujahr ? el('span.badge', { text: 'Bj. ' + o.baujahr }) : null,
      ]),
      el('div.obj-zahlen', {}, [
        wertPaar('Verkehrswert', z.verkehrswert ? eur(z.verkehrswert, 0) : '–'),
        wertPaar('Rendite', z.bruttorendite ? num(z.bruttorendite, 2) + ' %' : '–'),
        wertPaar('Kaltmiete / Mon.', z.kaltmieteMonat ? eur(z.kaltmieteMonat, 0) : '–'),
        wertPaar('Cashflow / Mon.', eur(cf, 0), cf >= 0 ? 'pos' : 'neg'),
      ]),
      /* Die ganze Kachel ist der Link ins Objekt; das hier macht sichtbar,
         wohin sie führt. Deshalb ein span und kein verschachtelter Link. */
      el('div.obj-aktion', {}, [el('span.btn.btn-sm', { text: 'Objekt bearbeiten' })]),
    ]),
  ]);
}

function wertPaar(label, wert, klasse) {
  return el('div', {}, [
    el('div.obj-zahl-label', { text: label }),
    el('div.obj-zahl-wert' + (klasse ? '.' + klasse : ''), { text: wert }),
  ]);
}

/* ---------- Tabelle ---------- */

function tabellenAnsicht(liste) {
  const nach = steuerModus() === 'nach';
  const zeilen = liste.map((o) => {
    const z = objektKennzahlen(o);
    const cf = cashflowAktuell(z) / 12;
    return el('tr', {
      style: 'cursor:pointer',
      onclick: () => { location.hash = '#/objekt?id=' + o.id; },
    }, [
      el('td', {}, [
        el('div', { text: o.bezeichnung || 'Ohne Bezeichnung', style: 'font-weight:500' }),
        el('div.faint', { text: [o.strasse, o.ort].filter(Boolean).join(', ') || '–', style: 'font-size:12px' }),
      ]),
      el('td', {}, [el('span.badge', { text: typText(o.typ) })]),
      el('td.num', { text: o.kaufpreis ? eur(o.kaufpreis, 0) : '–' }),
      el('td.num', { text: eur(z.investition, 0) }),
      el('td.num', { text: eur(z.verkehrswert, 0) }),
      el('td.num', { text: z.flaeche ? num(z.flaeche, 0) : '–' }),
      el('td.num', { text: z.kaltmieteMonat ? eur(z.kaltmieteMonat, 0) : '–' }),
      el('td.num', { text: z.bruttorendite ? num(z.bruttorendite, 2) + ' %' : '–' }),
      el('td.num', { text: z.restschuld ? eur(z.restschuld, 0) : '–' }),
      el('td.num' + (cf >= 0 ? '.pos' : '.neg'), { text: eur(cf, 0) }),
      el('td.aktion', {}, [
        el('a.btn.btn-sm.btn-icon', {
          href: '#/objekt?id=' + o.id,
          title: 'Objekt bearbeiten',
          'aria-label': 'Objekt bearbeiten',
          // Die Zeile navigiert ohnehin dorthin – ein zweiter Lauf wäre unnötig
          onclick: (ev) => ev.stopPropagation(),
          html: STIFT,
        }),
      ]),
    ]);
  });

  return el('div.card', { style: 'overflow-x:auto' }, [
    el('table.data.liste', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Objekt' }),
          el('th', { text: 'Typ' }),
          el('th', { style: 'text-align:right', text: 'Kaufpreis' }),
          el('th', { style: 'text-align:right', text: 'Investition' }),
          el('th', { style: 'text-align:right', text: 'Verkehrswert' }),
          el('th', { style: 'text-align:right', text: 'm²' }),
          el('th', { style: 'text-align:right', text: 'Kaltmiete' }),
          el('th', { style: 'text-align:right', text: 'Rendite' }),
          el('th', { style: 'text-align:right', text: 'Restschuld' }),
          el('th', { style: 'text-align:right', text: `Cashflow ${nach ? 'n. St.' : 'v. St.'}` }),
          el('th.aktion'),
        ]),
      ]),
      el('tbody', {}, zeilen),
    ]),
  ]);
}

/* ---------- Summen ---------- */

function summenLeiste(liste) {
  const nach = steuerModus() === 'nach';
  const werte = liste.map((o) => objektKennzahlen(o));
  const s = (feld) => werte.reduce((sum, z) => sum + (z[feld] || 0), 0);

  const kaufpreis = s('kaufpreis');
  const investition = s('investition');
  const wert = s('verkehrswert');
  const restschuld = s('restschuld');
  const flaeche = s('flaeche');
  const kaltmiete = s('kaltmieteMonat');
  const cf = werte.reduce((sum, z) => sum + cashflowAktuell(z), 0) / 12;

  return el('div.summen', {}, [
    summe('Objekte', String(liste.length), flaeche ? num(flaeche, 0) + ' m²' : null),
    summe('Gesamtinvestition', eur(investition, 0), kaufpreis ? eur(kaufpreis, 0) + ' Kaufpreise' : null),
    summe('Verkehrswert', eur(wert, 0), kaufpreis ? vorzeichen(wert - kaufpreis) : null),
    summe('Restschuld', eur(restschuld, 0), wert ? 'LTV ' + num(restschuld / wert * 100, 1) + ' %' : null),
    summe('Eigenkapital', eur(wert - restschuld, 0), 'Verkehrswert − Restschuld'),
    summe('Kaltmiete / Monat', eur(kaltmiete, 0), investition ? num(kaltmiete * 12 / investition * 100, 2) + ' % Rendite' : null),
    summe(`Cashflow ${nach ? 'n. St.' : 'v. St.'}`, eur(cf, 0), 'pro Monat'),
  ]);
}

function summe(label, wert, sub) {
  return el('div.summe', {}, [
    el('div.summe-label', { text: label }),
    el('div.summe-wert', { text: wert }),
    sub ? el('div.summe-sub', { text: sub }) : null,
  ]);
}

function vorzeichen(delta) {
  return (delta >= 0 ? '+' : '') + eur(delta, 0) + ' ggü. Kaufpreis';
}

/* ---------- Anlegen ---------- */

async function anlegen(inner) {
  const e = state.daten.einstellungen;
  const bezeichnung = el('input', { type: 'text', placeholder: 'z. B. ETW Musterstraße 12' });
  const typ = el('select', {}, OBJEKTTYPEN.map((t) => el('option', { value: t.wert }, [t.text])));
  const land = el('select', {}, [
    el('option', { value: '' }, ['– Bundesland wählen –']),
    ...Object.keys(GRUNDERWERBSTEUER).map((b) => el('option', { value: b }, [`${b} (${num(GRUNDERWERBSTEUER[b], 1)} %)`])),
  ]);
  const kaufpreis = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });

  const inhalt = el('div', {}, [
    el('div.field', {}, [el('label', { text: 'Bezeichnung' }), bezeichnung]),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 14px' }, [
      el('div.field', {}, [el('label', { text: 'Typ' }), typ]),
      el('div.field', {}, [
        el('label', { text: 'Kaufpreis' }),
        el('div.input-suffix', {}, [kaufpreis, el('span', { text: '€' })]),
      ]),
    ]),
    el('div.field', {}, [
      el('label', { text: 'Bundesland' }), land,
      el('div.hint', { text: 'setzt die Grunderwerbsteuer – im Objekt jederzeit änderbar' }),
    ]),
  ]);

  const ok = await modal({
    titel: 'Neues Objekt', beschreibung: 'Nur die Eckdaten – alles Weitere ergänzt du danach im Objekt.',
    inhalt,
    buttons: [
      { text: 'Abbrechen', wert: false },
      { text: 'Anlegen', klasse: 'btn-primary', wert: true, vorAbschluss: () => {
        if (!bezeichnung.value.trim()) { bezeichnung.focus(); bezeichnung.style.borderColor = 'var(--neg)'; return false; }
        return true;
      } },
    ],
  });
  if (!ok) return;

  const o = neuesObjekt(e);
  o.bezeichnung = bezeichnung.value.trim();
  o.typ = typ.value;
  o.kaufpreis = parseZahl(kaufpreis.value);
  o.mehrereEinheiten = typ.value === 'MFH';
  if (land.value) {
    o.bundesland = land.value;
    o.nebenkosten.grunderwerbsteuer.wert = GRUNDERWERBSTEUER[land.value];
  }

  aendern((d) => { d.objekte.push(o); });
  toast('Objekt angelegt', 'ok');
  location.hash = '#/objekt?id=' + o.id;
}
