/* Steuerjahr: Einnahmen und Werbungskosten in der Gliederung der Anlage V –
   je Objekt und fürs Portfolio, als Zuarbeit fürs Finanzamt oder den
   Steuerberater. Keine Steuerberatung: Grenzfälle wie die 15-%-Grenze oder
   § 82b EStDV bleiben dessen Sache.
*/

import { el, leeren, eur, num, toast, csvZeile, datum, druckKnopf } from '../util.js';
import { state } from '../store.js';
import {
  anlageVPortfolio, anlageVAufstellung, verteilungenOffen, werbungskostenHerleitung,
} from '../buchhaltung.js';
import { hinweis } from '../felder.js';

let jahr = new Date().getFullYear();

export const steuerjahr = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    if (!state.daten.objekte.length) {
      inner.append(el('div.card', {}, [
        el('div.empty', {}, [
          el('div.empty-icon', { text: '📋' }),
          el('h3', { text: 'Noch kein Objekt' }),
          el('p', { text: 'Die Anlage-V-Aufstellung braucht mindestens ein Objekt.' }),
          el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
        ]),
      ]));
      return;
    }

    const neu = () => { leeren(container); this.render(container); };
    const portfolio = anlageVPortfolio(jahr);

    inner.append(kopf(neu, portfolio));
    inner.append(hinweis(
      'Zuarbeit fürs Finanzamt oder den Steuerberater, <strong>keine Steuerberatung</strong>. '
      + 'Die Zuordnung zur Anlage V ist vereinfacht; Grenzfälle wie die 15-%-Grenze anschaffungsnaher '
      + 'Herstellungskosten oder die Verteilung nach § 82b EStDV gehören in fachkundige Hände.'
    ));
    inner.append(aufstellungKarte('Portfolio gesamt', portfolio));
    for (const o of state.daten.objekte) {
      /* Jedes Objekt beginnt auf einer neuen Seite – beim Finanzamt wird
         je Objekt eine eigene Anlage V abgegeben. */
      const karte = aufstellungKarte(o.bezeichnung || 'Ohne Bezeichnung', anlageVAufstellung(o, jahr));
      karte.classList.add('druck-neue-seite');
      inner.append(karte);
    }
    const verteilung = verteilungsKarte(jahr);
    if (verteilung) inner.append(verteilung);

    /* Der Anhang schließt die Aufstellung ab: Er zeigt, woraus jede
       Werbungskostenposition entstanden ist. Auf Papier beginnt er auf
       einer neuen Seite. */
    for (const o of state.daten.objekte) {
      const anhang = herleitungsKarte(o, jahr);
      if (anhang) inner.append(anhang);
    }
  },
};

/**
 * Erhaltungsaufwand, der nach § 82b EStDV noch auf kuenftige Jahre verteilt
 * ist. Reine Planungsauskunft: Die Jahresanteile setzt die App selbst an,
 * vergessen kann man sie nicht – aber man will wissen, was noch kommt.
 */
function verteilungsKarte(jahr) {
  const zeilen = [];
  for (const o of state.daten.objekte) {
    for (const v of verteilungenOffen(o.id, jahr)) {
      zeilen.push({ objekt: o.bezeichnung || 'Ohne Bezeichnung', ...v });
    }
  }
  if (!zeilen.length) return null;

  const summe = zeilen.reduce((s, v) => s + v.restbetrag, 0);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Noch zu verteilen' }),
        el('div.sub', { text: `Erhaltungsaufwand nach § 82b EStDV · ${eur(summe, 0)} ab ${jahr}` }),
      ]),
    ]),
    el('div.plan-scroll', {}, [
      el('table.data.kompakt.liste', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Objekt' }),
          el('th', { text: 'Maßnahme' }),
          el('th', { style: 'text-align:right', text: 'Gesamt' }),
          el('th', { style: 'text-align:right', text: 'je Jahr' }),
          el('th', { style: 'text-align:right', text: 'Restbetrag' }),
          el('th', { style: 'text-align:right', text: 'letztes Jahr' }),
        ])]),
        el('tbody', {}, zeilen.map((v) => el('tr', {}, [
          el('td', { text: v.objekt }),
          el('td', {}, [
            el('div', { text: v.bezeichnung }),
            el('div.faint', { text: datum(v.datum), style: 'font-size:12px' }),
          ]),
          el('td.num', { text: eur(v.gesamt, 0) }),
          el('td.num', { text: eur(v.proJahr, 0) }),
          el('td.num', { text: eur(v.restbetrag, 0) }),
          el('td.num', { text: `${v.letztesJahr} (${v.restJahre} J.)` }),
        ]))),
      ]),
    ]),
    el('div', { style: 'padding:12px 18px;border-top:1px solid var(--border)' }, [
      el('div.hint', { text: 'Diese Beträge sind in den Aufstellungen oben bereits mit ihrem '
        + 'Jahresanteil enthalten. Wird ein Objekt vor Ablauf der Verteilung verkauft, ist der '
        + 'Restbetrag im Jahr des Verkaufs in einer Summe abzusetzen – das rechnet die App nicht.' }),
    ]),
  ]);
}

function kopf(neu, portfolio) {
  const jahre = [];
  const jetzt = new Date().getFullYear();
  for (let j = jetzt; j >= jetzt - 9; j--) jahre.push(j);

  const jahrSel = el('select', {
    style: 'width:auto',
    onchange: (e) => { jahr = Number(e.target.value); neu(); },
  }, jahre.map((j) => el('option', { value: String(j), selected: jahr === j }, [String(j)])));

  return el('div.card', {}, [
    el('div.card-body', { style: 'display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap' }, [
      el('div', { style: 'display:flex;flex-direction:column;gap:5px' }, [
        el('label.faint', { text: 'Jahr', style: 'font-size:12px' }), jahrSel,
      ]),
      el('span', { style: 'flex:1' }),
      el('div', {}, [
        el('div.faint', { text: 'Einkünfte aus Vermietung (Portfolio)', style: 'font-size:12.5px' }),
        el('div.num' + (portfolio.einkuenfte >= 0 ? '.pos' : '.neg'), { text: eur(portfolio.einkuenfte, 0), style: 'font-weight:600;font-size:18px' }),
      ]),
      druckKnopf(() => `Anlage V ${jahr}`, () => state.daten.meta.name),
      el('button.btn.btn-sm', { type: 'button', onclick: () => exportieren(portfolio) }, ['CSV']),
    ]),
  ]);
}

function aufstellungKarte(titel, a) {
  const zeile = (label, betrag, hervor) => el('tr', {}, [
    el('td', { text: label }),
    el('td.num', { text: (betrag < 0 ? '− ' : '') + eur(Math.abs(betrag), 0), style: hervor ? 'font-weight:600' : '' }),
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [el('h2', { text: titel }), el('div.sub', { text: `Anlage V · ${a.jahr}` })]),
      el('span.badge.' + (a.einkuenfte >= 0 ? 'gruen' : 'rot'), { text: eur(a.einkuenfte, 0) }),
    ]),
    el('div.card-body', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Einnahmen' }), el('th', { style: 'text-align:right', text: 'Betrag' }),
        ])]),
        el('tbody', {}, a.einnahmen.length
          ? [...a.einnahmen.map((x) => zeile(x.label, x.betrag)), zeile('Summe Einnahmen', a.summeEinnahmen, true)]
          : [el('tr', {}, [el('td.faint', { text: 'Keine Einnahmen erfasst', colspan: 2 })])]),
      ]),
      el('table.data.kompakt', { style: 'margin-top:14px' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Werbungskosten' }), el('th', { style: 'text-align:right', text: 'Betrag' }),
        ])]),
        el('tbody', {}, [
          ...a.werbungskosten.map((x) => zeile(x.label, x.betrag)),
          zeile('Summe Werbungskosten', a.summeWerbungskosten, true),
        ]),
      ]),
      el('div', { style: 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:600' }, [
        el('span', { text: 'Einkünfte aus Vermietung und Verpachtung' }),
        el('span.num' + (a.einkuenfte >= 0 ? '.pos' : '.neg'), { text: eur(a.einkuenfte, 0) }),
      ]),
    ]),
  ]);
}

function exportieren(portfolio) {
  const kopf = ['Position', 'Betrag'];
  const zeilen = [
    ...portfolio.einnahmen.map((x) => csvZeile([x.label, x.betrag.toFixed(2).replace('.', ',')])),
    csvZeile(['Summe Einnahmen', portfolio.summeEinnahmen.toFixed(2).replace('.', ',')]),
    ...portfolio.werbungskosten.map((x) => csvZeile([x.label, x.betrag.toFixed(2).replace('.', ',')])),
    csvZeile(['Summe Werbungskosten', portfolio.summeWerbungskosten.toFixed(2).replace('.', ',')]),
    csvZeile(['Einkünfte aus Vermietung und Verpachtung', portfolio.einkuenfte.toFixed(2).replace('.', ',')]),
  ];
  const csv = '﻿' + [csvZeile(kopf), ...zeilen].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `anlage-v-${jahr}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('CSV exportiert', 'ok');
}


/* ---------- Anhang: Herleitung der Werbungskosten ---------- */

/**
 * Zeigt je Position, woraus sie entstanden ist.
 *
 * Die Aufstellung oben nennt nur Summen; wer sie prüfen soll, braucht den
 * Weg dahin. Die Beträge stammen aus werbungskostenHerleitung() und decken
 * sich auf den Cent mit der Aufstellung – das ist der ganze Zweck.
 */
function herleitungsKarte(o, jahr) {
  const positionen = werbungskostenHerleitung(o, jahr);
  if (!positionen.length) return null;

  const summe = positionen.reduce((s, x) => s + x.betrag, 0);

  const zeile = (text, zusatz, betrag, stark) => el('tr', {}, [
    el('td', {}, [
      el('span', { text, style: stark ? 'font-weight:600' : '' }),
      zusatz ? el('div.faint', { text: zusatz, style: 'font-size:11.5px;margin-top:1px' }) : null,
    ]),
    el('td.num', { text: betrag == null ? '' : eur(betrag), style: stark ? 'font-weight:600' : '' }),
  ]);

  const block = (pos) => {
    const zeilen = [];

    if (pos.art === 'afa') {
      const r = pos.rechnung;
      zeilen.push(zeile('Anschaffungskosten inkl. Nebenkosten', null, r.anschaffung));
      zeilen.push(zeile('abzüglich Grundstücksanteil', null, -r.grundstueck));
      if (r.modernisierung) zeilen.push(zeile('zuzüglich aktivierte Modernisierung', null, r.modernisierung));
      zeilen.push(zeile('AfA-Bemessungsgrundlage', null, r.gebaeude, true));
      zeilen.push(zeile(`Abschreibung ${num(r.satz, 3)} % pro Jahr`,
        r.dauer ? `über ${num(r.dauer, 1)} Jahre` : null, r.afaVoll));
      if (r.monate < 12) {
        zeilen.push(zeile(`zeitanteilig ${r.monate} von 12 Monaten`,
          'im Anschaffungsjahr ab dem Kaufmonat (§ 7 Abs. 1 S. 4 EStG)', null));
      }
    } else {
      for (const x of pos.posten) {
        zeilen.push(zeile(x.text, x.zusatz || x.hinweis || x.datum || null, -(x.betrag || 0)));
      }
    }

    return el('div', { style: 'margin-bottom:14px' }, [
      el('div', {
        style: 'display:flex;justify-content:space-between;align-items:baseline;gap:12px;'
          + 'padding:6px 0;border-bottom:1px solid var(--border)',
      }, [
        el('span', { text: pos.label, style: 'font-weight:600' }),
        pos.art === 'hinweis'
          ? el('span.badge', { text: 'nicht abziehbar' })
          : el('span.num', { text: eur(pos.betrag), style: 'font-weight:600' }),
      ]),
      pos.text ? el('div.hint', { text: pos.text, style: 'margin:6px 0' }) : null,
      el('table.data.kompakt', {}, [el('tbody', {}, zeilen)]),
    ].filter(Boolean));
  };

  const karte = el('div.card.druck-neue-seite', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Anhang: Herleitung der Werbungskosten' }),
        el('div.sub', { text: `${o.bezeichnung || 'Ohne Bezeichnung'} · ${jahr}` }),
      ]),
      el('span.num', { text: eur(summe), style: 'font-weight:600' }),
    ]),
    el('div.card-body', {}, [
      ...positionen.map(block),
      el('div', {
        style: 'display:flex;justify-content:space-between;gap:12px;padding-top:10px;'
          + 'border-top:2px solid var(--border-strong);font-weight:600',
      }, [
        el('span', { text: 'Summe Werbungskosten' }),
        el('span.num', { text: eur(summe) }),
      ]),
      hinweis('Die Summe stimmt mit der Aufstellung oben überein. Beträge ohne Vorzeichen in '
        + 'der Herleitung sind Rechengrößen, keine Zahlungen.'),
    ]),
  ]);
  return karte;
}
