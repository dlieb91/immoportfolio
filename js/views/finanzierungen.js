/* Finanzierungen: Übersicht aller Darlehen, Zinsbindungs-Ablaufkalender. */

import { el, leeren, eur, num, datum, heuteISO, datumPlus, toast, modal } from '../util.js';
import {
  state, aendern, objekt as objektMit, neueFinanzierung, verkehrswert, darlehenPlan,
} from '../store.js';
import {
  darlehenKennzahlen, ersatzGuthabenZu, ersatzEingezahltBis,
} from '../finanzmathematik.js';
import { parseZahl } from '../felder.js';

export const DARLEHENSARTEN = [
  { wert: 'annuitaet', text: 'Annuitätendarlehen' },
  // Tilgungsfreie Anlaufzeit gibt es über das Feld Tilgungsstart bei jeder Art.
  { wert: 'kfw', text: 'KfW-Darlehen' },
  { wert: 'endfaellig', text: 'Endfälliges Darlehen' },
];

export const artText = (a) => DARLEHENSARTEN.find((x) => x.wert === a)?.text || a || '–';

/** Kennzahlen eines Darlehens – auf Basis des zwischengespeicherten Plans. */
export function finanzierungKennzahlen(fin, stichtag = heuteISO()) {
  return darlehenKennzahlen(fin, stichtag, darlehenPlan(fin));
}

export const finanzierungen = {
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
        el('div.empty-icon', { text: '🏦' }),
        el('h3', { text: 'Zuerst ein Objekt anlegen' }),
        el('p', { text: 'Jedes Darlehen gehört zu einer Immobilie.' }),
        el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
      ]),
    ]));
    return;
  }

  if (!d.finanzierungen.length) {
    inner.append(el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '🏦' }),
        el('h3', { text: 'Noch kein Darlehen erfasst' }),
        el('p', { text: 'Erfasse Darlehensbetrag, Sollzins, anfängliche Tilgung und Zinsbindung – der Tilgungsplan wird daraus monatsgenau berechnet.' }),
        el('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => anlegen(null, () => zeichnen(inner)) }, ['Erstes Darlehen anlegen']),
      ]),
    ]));
    return;
  }

  const heute = heuteISO();
  const zeilen = d.finanzierungen.map((fin) => ({ fin, k: finanzierungKennzahlen(fin, heute) }));
  zeilen.sort((a, b) => {
    const oa = objektMit(a.fin.objektId)?.bezeichnung || '';
    const ob = objektMit(b.fin.objektId)?.bezeichnung || '';
    return oa.localeCompare(ob) || (a.fin.bank || '').localeCompare(b.fin.bank || '');
  });

  inner.append(el('div.toolbar', {}, [
    el('span.faint', { text: `${zeilen.length} Darlehen`, style: 'font-size:12.5px' }),
    el('span', { style: 'flex:1' }),
    el('button.btn.btn-primary', { type: 'button', onclick: () => anlegen(null, () => zeichnen(inner)) }, ['+ Darlehen']),
  ]));

  inner.append(tabelle(zeilen));
  inner.append(summen(zeilen));
  inner.append(zinsbindungKalender(zeilen, heute));
}

function tabelle(zeilen) {
  const tr = zeilen.map(({ fin, k }) => {
    const o = objektMit(fin.objektId);
    const fortschritt = fin.betrag ? k.getilgt / fin.betrag * 100 : 0;
    return el('tr', {
      style: 'cursor:pointer',
      onclick: () => { location.hash = '#/finanzierung?id=' + fin.id; },
    }, [
      el('td', {}, [
        el('div', { text: fin.bank || 'Ohne Bank', style: 'font-weight:500' }),
        el('div.faint', { text: o?.bezeichnung || 'kein Objekt', style: 'font-size:12px' }),
      ]),
      el('td', {}, [
        el('span.badge', { text: artText(fin.art) }),
        fin.mitTilgungsersatz ? el('span.badge.blau', { text: 'Ersatz', style: 'margin-left:4px' }) : null,
        !fin.mitTilgungsersatz && fin.art !== 'endfaellig' && fin.tilgungStart
          ? el('span.badge.blau', { text: 'tilgungsfrei', style: 'margin-left:4px', title: 'Tilgung beginnt erst am ' + datum(fin.tilgungStart) })
          : null,
      ]),
      el('td.num', { text: fin.betrag ? eur(fin.betrag, 0) : '–' }),
      el('td.num', { text: fin.sollzins != null ? num(fin.sollzins, 2) + ' %' : '–' }),
      el('td.num', {
        text: fin.mitTilgungsersatz
          ? (fin.tilgungsersatzProzent != null ? num(fin.tilgungsersatzProzent, 2) + ' %*' : '–')
          : (fin.tilgungAnfang != null ? num(fin.tilgungAnfang, 2) + ' %' : '–'),
        title: fin.mitTilgungsersatz ? 'Tilgungsersatz statt Tilgung' : '',
      }),
      el('td.num', { text: k.rateAktuell ? eur(k.rateAktuell) : '–' }),
      el('td', { style: 'min-width:150px' }, [
        el('div.num', { text: eur(k.restschuld, 0), style: 'text-align:right' }),
        balken(fortschritt),
      ]),
      el('td.num', { text: fin.zinsbindungBis ? datum(fin.zinsbindungBis) : 'keine' }),
    ]);
  });

  return el('div.card', { style: 'overflow-x:auto' }, [
    el('table.data.liste', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Bank / Objekt' }),
        el('th', { text: 'Art' }),
        el('th', { style: 'text-align:right', text: 'Betrag' }),
        el('th', { style: 'text-align:right', text: 'Zins' }),
        el('th', { style: 'text-align:right', text: 'Tilgung' }),
        el('th', { style: 'text-align:right', text: 'Rate / Monat' }),
        el('th', { style: 'text-align:right', text: 'Restschuld' }),
        el('th', { style: 'text-align:right', text: 'Zinsbindung bis' }),
      ])]),
      el('tbody', {}, tr),
    ]),
  ]);
}

export function balken(prozent) {
  const p = Math.max(0, Math.min(100, prozent || 0));
  return el('div.balken', { title: num(p, 1) + ' % getilgt' }, [
    el('div.balken-fuell', { style: `width:${p}%` }),
  ]);
}

function summen(zeilen) {
  const betrag = zeilen.reduce((s, z) => s + (z.fin.betrag || 0), 0);
  const rest = zeilen.reduce((s, z) => s + z.k.restschuld, 0);
  const rate = zeilen.reduce((s, z) => s + z.k.rateAktuell, 0);
  const zinsGewichtet = rest
    ? zeilen.reduce((s, z) => s + z.k.restschuld * (z.fin.sollzins || 0), 0) / rest
    : 0;

  // LTV nur über Objekte, die tatsächlich finanziert sind
  const objektIds = new Set(zeilen.map((z) => z.fin.objektId));
  const werte = [...objektIds].map((id) => objektMit(id)).filter(Boolean)
    .reduce((s, o) => s + verkehrswert(o), 0);

  const kachel = (label, wert, sub) => el('div.summe', {}, [
    el('div.summe-label', { text: label }),
    el('div.summe-wert', { text: wert }),
    sub ? el('div.summe-sub', { text: sub }) : null,
  ]);

  return el('div.summen', {}, [
    kachel('Darlehenssumme', eur(betrag, 0), `${zeilen.length} Darlehen`),
    kachel('Restschuld heute', eur(rest, 0), betrag ? num((betrag - rest) / betrag * 100, 1) + ' % getilgt' : null),
    kachel('Rate / Monat', eur(rate, 0), eur(rate * 12, 0) + ' pro Jahr'),
    kachel('Ø Sollzins', num(zinsGewichtet, 2) + ' %', 'nach Restschuld gewichtet'),
    kachel('Beleihungsauslauf', werte ? num(rest / werte * 100, 1) + ' %' : '–', werte ? 'Restschuld / Verkehrswert' : 'kein Verkehrswert'),
    ...(zeilen.some((z) => z.k.plan.mitErsatz) ? [(() => {
      const heute = heuteISO();
      const mitErsatz = zeilen.filter((z) => z.k.plan.mitErsatz);
      const eingezahlt = mitErsatz.reduce((s2, z) => s2 + ersatzEingezahltBis(z.k.plan, heute), 0);
      const guthaben = mitErsatz.reduce((s2, z) => s2 + ersatzGuthabenZu(z.k.plan, heute), 0);
      return kachel('Tilgungsersatz-Guthaben', eur(guthaben, 0),
        `${eur(eingezahlt, 0)} eingezahlt · ${eur(guthaben - eingezahlt, 0)} Zinsertrag`);
    })()] : []),
  ]);
}

/* ---------- Zinsbindungs-Ablaufkalender ---------- */

function zinsbindungKalender(zeilen, heute) {
  const mit = zeilen.filter((z) => z.fin.zinsbindungBis);
  if (!mit.length) return el('div', { hidden: true });

  const grenze = datumPlus({ jahre: 2 });

  const sortiert = [...mit].sort((a, b) => a.fin.zinsbindungBis.localeCompare(b.fin.zinsbindungBis));

  const tr = sortiert.map(({ fin, k }) => {
    const o = objektMit(fin.objektId);
    const abgelaufen = fin.zinsbindungBis < heute;
    const bald = !abgelaufen && fin.zinsbindungBis <= grenze;
    return el('tr', {
      style: 'cursor:pointer',
      onclick: () => { location.hash = '#/finanzierung?id=' + fin.id; },
    }, [
      el('td.num', { text: datum(fin.zinsbindungBis) }),
      el('td', {}, [
        abgelaufen ? el('span.badge.grau', { text: 'abgelaufen' })
          : bald ? el('span.badge.gelb', { text: 'in unter 2 Jahren' })
          : el('span.badge.gruen', { text: 'läuft' }),
      ]),
      el('td', { text: (fin.bank || 'Ohne Bank') + ' · ' + (o?.bezeichnung || '–') }),
      el('td.num', { text: eur(k.restschuldZinsbindung ?? 0, 0) }),
      el('td.num', { text: num(fin.anschlusszins ?? state.daten.einstellungen.anschlusszins, 2) + ' %' }),
    ]);
  });

  const naechste = sortiert.filter((z) => z.fin.zinsbindungBis >= heute && z.fin.zinsbindungBis <= grenze);
  const summeBald = naechste.reduce((s, z) => s + (z.k.restschuldZinsbindung || 0), 0);

  return el('div.card', { style: 'margin-top:16px' }, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Zinsbindungen' }),
        el('div.sub', {
          text: naechste.length
            ? `${naechste.length} Darlehen mit ${eur(summeBald, 0)} Restschuld in den nächsten 2 Jahren`
            : 'keine Anschlussfinanzierung in den nächsten 2 Jahren',
        }),
      ]),
    ]),
    el('div', { style: 'overflow-x:auto' }, [
      el('table.data.liste', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { style: 'text-align:right', text: 'Ablauf' }),
          el('th', { text: 'Status' }),
          el('th', { text: 'Darlehen' }),
          el('th', { style: 'text-align:right', text: 'Restschuld dann' }),
          el('th', { style: 'text-align:right', text: 'Anschlusszins' }),
        ])]),
        el('tbody', {}, tr),
      ]),
    ]),
  ]);
}

/* ---------- Anlegen ---------- */

export async function anlegen(objektIdVorgabe, danach) {
  const d = state.daten;

  let auswahl = null;
  if (!objektIdVorgabe) {
    auswahl = el('select', {}, d.objekte.map((o) => el('option', { value: o.id }, [o.bezeichnung || 'Ohne Bezeichnung'])));
  }
  const bank = el('input', { type: 'text', placeholder: 'z. B. Sparkasse' });
  const art = el('select', {}, DARLEHENSARTEN.map((a) => el('option', { value: a.wert }, [a.text])));
  const betrag = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });
  const zins = el('input', { type: 'text', inputmode: 'decimal', placeholder: '3,50' });
  const tilgung = el('input', { type: 'text', inputmode: 'decimal', value: '2,00' });
  const auszahlung = el('input', { type: 'date', value: heuteISO() });
  const bindung = el('input', { type: 'date' });
  const tilgungStart = el('input', { type: 'date' });

  /* Tilgungsersatz: Schalter blendet die beiden Sätze ein */
  const ersatzHaken = el('input', { type: 'checkbox', style: 'width:auto;margin-right:9px' });
  const ersatzProzent = el('input', { type: 'text', inputmode: 'decimal', placeholder: '2,00' });
  const ersatzZins = el('input', { type: 'text', inputmode: 'decimal', placeholder: '3,00' });
  const ersatzVorschau = el('div.readonly', { text: '–' });

  const ersatzBlock = el('div', { hidden: true, style: 'margin-top:4px' }, [
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 14px' }, [
      el('div.field', {}, [
        el('label', { text: 'Tilgungsersatz p. a.' }),
        el('div.input-suffix', {}, [ersatzProzent, el('span', { text: '%' })]),
        el('div.hint', { text: 'vom Darlehensbetrag' }),
      ]),
      el('div.field', {}, [
        el('label', { text: 'Verzinsung' }),
        el('div.input-suffix', {}, [ersatzZins, el('span', { text: '%' })]),
        el('div.hint', { text: 'des Guthabens, p. a.' }),
      ]),
      el('div.field', {}, [
        el('label', { text: 'Einzahlung / Monat' }),
        ersatzVorschau,
        el('div.hint', { text: 'zusätzlich zur Zinsrate' }),
      ]),
    ]),
  ]);

  const vorschauAktualisieren = () => {
    const b = parseZahl(betrag.value) || 0;
    const pz = parseZahl(ersatzProzent.value) || 0;
    ersatzVorschau.textContent = b && pz ? eur(b * pz / 100 / 12) : '–';
  };
  ersatzHaken.addEventListener('change', () => {
    ersatzBlock.hidden = !ersatzHaken.checked;
    if (ersatzHaken.checked) { tilgung.value = '0,00'; ersatzProzent.focus(); }
    vorschauAktualisieren();
  });
  ersatzProzent.addEventListener('input', vorschauAktualisieren);
  betrag.addEventListener('input', vorschauAktualisieren);

  const inhalt = el('div', {}, [
    auswahl ? el('div.field', {}, [el('label', { text: 'Objekt' }), auswahl]) : null,
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 14px' }, [
      el('div.field', {}, [el('label', { text: 'Bank' }), bank]),
      el('div.field', {}, [el('label', { text: 'Darlehensart' }), art]),
      el('div.field', {}, [
        el('label', { text: 'Darlehensbetrag' }),
        el('div.input-suffix', {}, [betrag, el('span', { text: '€' })]),
      ]),
      el('div.field', {}, [el('label', { text: 'Auszahlung' }), auszahlung]),
      el('div.field', {}, [
        el('label', { text: 'Sollzins p. a.' }),
        el('div.input-suffix', {}, [zins, el('span', { text: '%' })]),
      ]),
      el('div.field', {}, [
        el('label', { text: 'Anfängliche Tilgung' }),
        el('div.input-suffix', {}, [tilgung, el('span', { text: '%' })]),
      ]),
    ]),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:0 14px' }, [
      el('div.field', {}, [
        el('label', { text: 'Zinsbindung bis' }), bindung,
        el('div.hint', { text: 'leer lassen, wenn keine Bindung vereinbart ist' }),
      ]),
      el('div.field', {}, [
        el('label', { text: 'Tilgungsstart' }), tilgungStart,
        el('div.hint', { text: 'leer = Tilgung ab der ersten Rate; davor nur Zinsen' }),
      ]),
    ]),
    el('div', { style: 'margin-top:6px;padding-top:12px;border-top:1px solid var(--border)' }, [
      el('label', { style: 'display:flex;align-items:center;cursor:pointer;font-size:13px' },
        [ersatzHaken, 'Tilgungsersatz statt Tilgung']),
      el('div.hint', { style: 'margin-left:24px', text: 'Das Darlehen wird nicht getilgt; stattdessen wird auf ein verzinstes Konto gespart.' }),
    ]),
    ersatzBlock,
  ]);

  const ok = await modal({
    titel: 'Neues Darlehen', beschreibung: 'Aus diesen Angaben entsteht der vollständige Tilgungsplan.',
    inhalt, breite: 620,
    buttons: [
      { text: 'Abbrechen', wert: false },
      { text: 'Anlegen', klasse: 'btn-primary', wert: true },
    ],
  });
  if (!ok) return null;

  const fin = neueFinanzierung(objektIdVorgabe || auswahl?.value);
  fin.bank = bank.value.trim();
  fin.art = art.value;
  fin.betrag = parseZahl(betrag.value);
  fin.sollzins = parseZahl(zins.value);
  fin.tilgungAnfang = parseZahl(tilgung.value) ?? 0;
  fin.auszahlung = auszahlung.value || heuteISO();
  fin.zinsbindungBis = bindung.value || null;
  fin.tilgungStart = tilgungStart.value || null;
  fin.mitTilgungsersatz = ersatzHaken.checked;
  if (ersatzHaken.checked) {
    fin.tilgungsersatzProzent = parseZahl(ersatzProzent.value);
    fin.tilgungsersatzZins = parseZahl(ersatzZins.value);
  }

  aendern((dd) => { dd.finanzierungen.push(fin); });
  toast('Darlehen angelegt', 'ok');
  if (danach) danach();
  return fin;
}
