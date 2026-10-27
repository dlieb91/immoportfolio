/* Mietverträge: Gesamtübersicht über alle Objekte, Filter, Warnhinweise. */

import { el, leeren, eur, num, datum, heuteISO, toast, modal } from '../util.js';
import {
  state, aendern, neuerMietvertrag, einheitenVon, einheitMit, einheitName,
  objektVonEinheit, vertragStatus, vertragsEnde, aktuelleKondition,
  naechsteAnpassung, mieteVon, einheitSicherstellen,
} from '../store.js';
import { parseZahl } from '../felder.js';

export const STATUS_TEXT = { aktiv: 'aktiv', zukuenftig: 'künftig', beendet: 'beendet' };
export const STATUS_KLASSE = { aktiv: 'gruen', zukuenftig: 'blau', beendet: 'grau' };

/** Tage bis zum Vertragsende, null wenn unbefristet. */
export function tageBisEnde(mv, stichtag = heuteISO()) {
  const ende = vertragsEnde(mv);
  if (!ende) return null;
  return Math.round((new Date(ende) - new Date(stichtag)) / 86400000);
}

/** Hinweise, die in Listen als Warnung erscheinen. */
export function warnungen(mv, stichtag = heuteISO()) {
  const raus = [];
  const status = vertragStatus(mv, stichtag);
  const tage = tageBisEnde(mv, stichtag);
  if (status === 'aktiv' && tage != null && tage <= 180) {
    raus.push({ art: 'warn', text: tage < 0 ? 'Ende überschritten' : `Endet in ${tage} Tagen` });
  }
  if (status === 'aktiv' && !aktuelleKondition(mv, stichtag)?.kaltmiete) {
    raus.push({ art: 'warn', text: 'Keine Kaltmiete hinterlegt' });
  }
  const naechste = naechsteAnpassung(mv, stichtag);
  if (status === 'aktiv' && naechste) {
    const tageBis = Math.round((new Date(naechste.gueltigAb) - new Date(stichtag)) / 86400000);
    if (tageBis <= 90) raus.push({ art: 'info', text: `Mietanpassung am ${datum(naechste.gueltigAb)}` });
  }
  return raus;
}

let filter = 'aktiv';
let suche = '';

export const mietvertraege = {
  render(container) {
    const inner = el('div.view-inner');
    container.append(inner);
    zeichnen(inner);
  },
};

function zeichnen(inner) {
  leeren(inner);
  const d = state.daten;

  if (!d.objekte.length) {
    inner.append(el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '📄' }),
        el('h3', { text: 'Zuerst ein Objekt anlegen' }),
        el('p', { text: 'Mietverträge werden immer einer Immobilie bzw. einer ihrer Einheiten zugeordnet.' }),
        el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
      ]),
    ]));
    return;
  }

  if (!d.mietvertraege.length) {
    inner.append(el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '📄' }),
        el('h3', { text: 'Noch kein Mietvertrag erfasst' }),
        el('p', { text: 'Erfasse Mieter, Laufzeit und Miete. Mietanpassungen und Staffeln trägst du als weitere Zeilen mit Gültigkeitsdatum ein.' }),
        el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => anlegen(null, () => zeichnen(inner)) }, ['Ersten Mietvertrag anlegen']),
      ]),
    ]));
    return;
  }

  const heute = heuteISO();
  const q = suche.trim().toLowerCase();
  const liste = d.mietvertraege
    .filter((mv) => filter === 'alle' || vertragStatus(mv, heute) === filter)
    .filter((mv) => {
      if (!q) return true;
      const e = einheitMit(mv.einheitId);
      const o = objektVonEinheit(mv.einheitId);
      return [mv.mieter, einheitName(e), o?.bezeichnung, o?.ort, mv.notizen]
        .some((f) => String(f || '').toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const oa = objektVonEinheit(a.einheitId)?.bezeichnung || '';
      const ob = objektVonEinheit(b.einheitId)?.bezeichnung || '';
      return oa.localeCompare(ob) || String(a.beginn).localeCompare(String(b.beginn));
    });

  inner.append(werkzeugleiste(inner, liste.length, d.mietvertraege.length));
  inner.append(leerstandsHinweis(heute));

  if (!liste.length) {
    inner.append(el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '🔍' }),
        el('h3', { text: 'Keine Treffer' }),
        el('p', { text: 'Für Filter und Suche gibt es keine Verträge.' }),
      ]),
    ]));
    return;
  }

  inner.append(tabelle(liste, heute));
  inner.append(summen(liste, heute));
}

function werkzeugleiste(inner, treffer, gesamt) {
  const stufen = [
    { wert: 'aktiv', text: 'Aktiv' },
    { wert: 'zukuenftig', text: 'Künftig' },
    { wert: 'beendet', text: 'Beendet' },
    { wert: 'alle', text: 'Alle' },
  ];

  const sucheInput = el('input', {
    type: 'search', value: suche, placeholder: 'Mieter, Objekt, Ort …', style: 'width:220px',
    oninput: (e) => {
      const pos = e.target.selectionStart;
      suche = e.target.value;
      zeichnen(inner);
      const neu = inner.querySelector('input[type="search"]');
      if (neu) { neu.focus(); neu.setSelectionRange(pos, pos); }
    },
  });

  return el('div.toolbar', {}, [
    sucheInput,
    el('div.seg.seg-sm', {}, stufen.map((s) => el('button' + (filter === s.wert ? '.aktiv' : ''), {
      type: 'button', text: s.text,
      onclick: () => { filter = s.wert; zeichnen(inner); },
    }))),
    el('span', { style: 'flex:1' }),
    el('span.faint', { text: treffer === gesamt ? `${gesamt} Verträge` : `${treffer} von ${gesamt}`, style: 'font-size:12.5px' }),
    el('button.btn.btn-primary', { type: 'button', onclick: () => anlegen(null, () => zeichnen(inner)) }, ['+ Mietvertrag']),
  ]);
}

/* ---------- Leerstand ---------- */

function leerstandsHinweis(heute) {
  const leer = [];
  for (const o of state.daten.objekte) {
    for (const e of einheitenVon(o.id)) {
      const belegt = state.daten.mietvertraege.some(
        (m) => m.einheitId === e.id && vertragStatus(m, heute) === 'aktiv'
      );
      if (!belegt) leer.push({ o, e });
    }
  }
  if (!leer.length) return el('div', { hidden: true });

  return el('div.note', { style: 'margin-bottom:16px;border-color:color-mix(in srgb, var(--warn) 30%, transparent);background:var(--warn-soft)' }, [
    el('div.note-icon', { style: 'color:var(--warn)', html: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' }),
    el('div', {}, [
      el('strong', { text: leer.length === 1 ? '1 Einheit ohne aktiven Mietvertrag' : `${leer.length} Einheiten ohne aktiven Mietvertrag` }),
      el('div', { style: 'margin-top:4px;font-size:12.5px' },
        leer.slice(0, 6).map(({ o, e }) => el('a.leerstand-link', {
          href: '#/objekt?id=' + o.id,
          text: o.bezeichnung + (einheitenVon(o.id).length > 1 ? ' · ' + einheitName(e) : ''),
        }))),
      leer.length > 6 ? el('div.faint', { text: `… und ${leer.length - 6} weitere`, style: 'font-size:12px;margin-top:3px' }) : null,
    ]),
  ]);
}

/* ---------- Tabelle ---------- */

function tabelle(liste, heute) {
  const zeilen = liste.map((mv) => {
    const e = einheitMit(mv.einheitId);
    const o = objektVonEinheit(mv.einheitId);
    const status = vertragStatus(mv, heute);
    const k = aktuelleKondition(mv, heute) || (mv.konditionen || [])[0];
    const kalt = k?.kaltmiete || 0;
    const nk = k?.nkVorauszahlung || 0;
    const flaeche = e?.flaeche || o?.flaeche || 0;
    const ende = vertragsEnde(mv);
    const warn = warnungen(mv, heute);

    return el('tr', {
      style: 'cursor:pointer',
      onclick: () => { location.hash = '#/mietvertrag?id=' + mv.id; },
    }, [
      el('td', {}, [
        el('div', { text: mv.mieter || 'Ohne Mieter', style: 'font-weight:500' }),
        el('div.faint', { style: 'font-size:12px', text: (o?.bezeichnung || '–') + (einheitenVon(o?.id || '').length > 1 ? ' · ' + einheitName(e) : '') }),
      ]),
      el('td', {}, [
        el('span.badge.' + STATUS_KLASSE[status], { text: STATUS_TEXT[status] }),
        ...warn.map((w) => el('span.badge.' + (w.art === 'warn' ? 'gelb' : 'blau'), { text: w.text, style: 'margin-left:4px' })),
      ]),
      el('td.num', { text: datum(mv.beginn) }),
      el('td.num', { text: ende ? datum(ende) : 'unbefristet' }),
      el('td.num', { text: kalt ? eur(kalt) : '–' }),
      el('td.num', { text: nk ? eur(nk) : '–' }),
      el('td.num', { text: kalt || nk ? eur(kalt + nk) : '–' }),
      el('td.num', { text: flaeche && kalt ? num(kalt / flaeche, 2) : '–' }),
    ]);
  });

  return el('div.card', { style: 'overflow-x:auto' }, [
    el('table.data.liste', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Mieter / Objekt' }),
        el('th', { text: 'Status' }),
        el('th', { style: 'text-align:right', text: 'Beginn' }),
        el('th', { style: 'text-align:right', text: 'Ende' }),
        el('th', { style: 'text-align:right', text: 'Kaltmiete' }),
        el('th', { style: 'text-align:right', text: 'NK' }),
        el('th', { style: 'text-align:right', text: 'Warm' }),
        el('th', { style: 'text-align:right', text: '€/m²' }),
      ])]),
      el('tbody', {}, zeilen),
    ]),
  ]);
}

function summen(liste, heute) {
  const aktive = liste.filter((mv) => vertragStatus(mv, heute) === 'aktiv');
  const kalt = aktive.reduce((s, mv) => s + mieteVon(mv, heute).kalt, 0);
  const nk = aktive.reduce((s, mv) => s + mieteVon(mv, heute).nk, 0);

  const kachel = (label, wert, sub) => el('div.summe', {}, [
    el('div.summe-label', { text: label }),
    el('div.summe-wert', { text: wert }),
    sub ? el('div.summe-sub', { text: sub }) : null,
  ]);

  return el('div.summen', {}, [
    kachel('Aktive Verträge', String(aktive.length), `${liste.length} in der Auswahl`),
    kachel('Kaltmiete / Monat', eur(kalt, 0), 'Ist-Miete heute'),
    kachel('Nebenkosten / Monat', eur(nk, 0), 'Vorauszahlungen'),
    kachel('Warmmiete / Monat', eur(kalt + nk, 0)),
    kachel('Jahreskaltmiete', eur(kalt * 12, 0)),
  ]);
}

/* ---------- Anlegen ---------- */

/**
 * Legt einen Mietvertrag an. Ist eine Einheit vorgegeben, entfaellt die Auswahl.
 * Fuer Einzelobjekte wird die (unsichtbare) Einheit bei Bedarf erzeugt.
 */
export async function anlegen(einheitIdVorgabe, danach, objektIdFilter) {
  const d = state.daten;
  const auswaehlbar = objektIdFilter ? d.objekte.filter((o) => o.id === objektIdFilter) : d.objekte;

  const mieter = el('input', { type: 'text', placeholder: 'Name des Mieters' });
  const beginn = el('input', { type: 'date', value: heuteISO() });
  const kaltmiete = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });
  const nkVoraus = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });

  let auswahl = null;
  if (!einheitIdVorgabe) {
    auswahl = el('select', {}, auswaehlbar.flatMap((o) => {
      const einheiten = einheitenVon(o.id);
      if (o.mehrereEinheiten && einheiten.length) {
        return einheiten.map((e) => el('option', { value: 'e:' + e.id }, [`${o.bezeichnung} · ${einheitName(e)}`]));
      }
      return [el('option', { value: 'o:' + o.id }, [o.bezeichnung || 'Ohne Bezeichnung'])];
    }));
  }

  const inhalt = el('div', {}, [
    auswahl ? el('div.field', {}, [el('label', { text: 'Objekt / Einheit' }), auswahl]) : null,
    el('div.field', {}, [el('label', { text: 'Mieter' }), mieter]),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 14px' }, [
      el('div.field', {}, [el('label', { text: 'Mietbeginn' }), beginn]),
      el('div.field', {}, [
        el('label', { text: 'Kaltmiete' }),
        el('div.input-suffix', {}, [kaltmiete, el('span', { text: '€' })]),
      ]),
    ]),
    el('div.field', {}, [
      el('label', { text: 'Nebenkosten-Vorauszahlung' }),
      el('div.input-suffix', {}, [nkVoraus, el('span', { text: '€' })]),
      el('div.hint', { text: 'monatlich, wird als durchlaufender Posten behandelt' }),
    ]),
  ]);

  const ok = await modal({
    titel: 'Neuer Mietvertrag',
    beschreibung: 'Spätere Mietanpassungen trägst du im Vertrag als weitere Zeile mit Gültigkeitsdatum ein.',
    inhalt,
    buttons: [
      { text: 'Abbrechen', wert: false },
      { text: 'Anlegen', klasse: 'btn-primary', wert: true },
    ],
  });
  if (!ok) return null;

  let einheitId = einheitIdVorgabe;
  if (!einheitId && auswahl) {
    const [art, id] = auswahl.value.split(':');
    einheitId = art === 'e' ? id : einheitSicherstellen(id).id;
  }
  if (!einheitId) { toast('Keine Einheit gewählt', 'err'); return null; }

  const mv = neuerMietvertrag(einheitId, beginn.value || heuteISO());
  mv.mieter = mieter.value.trim();
  mv.konditionen[0].kaltmiete = parseZahl(kaltmiete.value);
  mv.konditionen[0].nkVorauszahlung = parseZahl(nkVoraus.value);

  aendern((dd) => { dd.mietvertraege.push(mv); });
  toast('Mietvertrag angelegt', 'ok');
  if (danach) danach();
  return mv;
}
