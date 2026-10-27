/* Steuerjahr: Einnahmen und Werbungskosten in der Gliederung der Anlage V –
   je Objekt und fürs Portfolio, als Zuarbeit fürs Finanzamt oder den
   Steuerberater. Keine Steuerberatung: Grenzfälle wie die 15-%-Grenze oder
   § 82b EStDV bleiben dessen Sache.
*/

import { el, leeren, eur, num, toast, csvZeile } from '../util.js';
import { state } from '../store.js';
import { anlageVPortfolio, anlageVAufstellung } from '../buchhaltung.js';
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
      inner.append(aufstellungKarte(o.bezeichnung || 'Ohne Bezeichnung', anlageVAufstellung(o, jahr)));
    }
  },
};

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
