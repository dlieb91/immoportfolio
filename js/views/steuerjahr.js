/* Steuerjahr: Einnahmen und Werbungskosten in der Gliederung der Anlage V –
   je Objekt und fürs Portfolio, als Zuarbeit fürs Finanzamt oder den
   Steuerberater. Keine Steuerberatung: Die 15-%-Grenze anschaffungsnaher
   Herstellungskosten und die Verteilung nach § 82b EStDV rechnet die App
   mit, die Beurteilung des Einzelfalls bleibt Sache des Steuerberaters.
*/

import { el, leeren, eur, num, toast, csvZeile, datum, druckKnopf } from '../util.js';
import { state } from '../store.js';
import {
  anlageVPortfolio, anlageVAufstellung, verteilungenOffen, werbungskostenHerleitung,
} from '../buchhaltung.js';
import { hinweis } from '../felder.js';
import { kostenplan } from '../nebenkostenplan.js';

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
      + 'Die Zuordnung zur Anlage V ist vereinfacht. Die <strong>15-%-Grenze</strong> anschaffungsnaher '
      + 'Herstellungskosten (§ 6 Abs. 1 Nr. 1a EStG) rechnet die App mit: Bleiben die Maßnahmen der ersten '
      + 'drei Jahre darunter, sind sie hier sofort abgezogen; darüber wandern sie in die AfA. Die App rechnet '
      + 'dabei mit Bruttobeträgen, das Gesetz mit Nettobeträgen – knapp unter der Grenze lohnt der Blick des '
      + 'Steuerberaters. '
      + '<strong>Die Erhaltungsrücklage ist nicht enthalten</strong> – Einzahlungen sind erst abziehbar, '
      + 'wenn die Gemeinschaft das Geld verausgabt (BFH IX R 19/24). Erfasse den Betrag dann als '
      + 'Buchung der Kategorie „Erhaltungsaufwand“.'
    ));
    inner.append(aufstellungKarte('Portfolio gesamt', portfolio));
    const nk = nebenkostenKarte(jahr);
    if (nk) inner.append(nk);
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

/**
 * Die laufenden Kosten aus den Positionen am Objekt, je Kostenart: was davon
 * im Jahr abziehbar ist. Sie stecken in der Aufstellung oben bereits unter
 * Betriebs- und Verwaltungskosten – hier sieht man, woraus diese bestehen.
 */
function nebenkostenKarte(jahr) {
  const plan = kostenplan(null, jahr, true);
  if (!plan.positionenAnzahl || !plan.summen.gesamt) return null;
  const gruppeText = { umlage: 'umlagefähig', nichtUmlage: 'nicht umlagefähig', ruecklage: 'Rücklage' };
  return el('div.card', {}, [
    el('div.card-head', {}, [el('div', {}, [
      el('h2', { text: 'Nebenkosten laut Positionen' }),
      el('div.sub', { text: `${jahr} · in der Aufstellung oben enthalten · ${eur(plan.summen.abziehbar, 0)} abziehbar` }),
    ])]),
    el('div.tabelle-scroll', {}, [el('table.data.kompakt.liste', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Kostenart' }), el('th', { text: 'Umlage' }),
        el('th', { style: 'text-align:right', text: 'Jahr' }),
        el('th', { style: 'text-align:right', text: 'abziehbar' }),
      ])]),
      el('tbody', {}, plan.zeilen.filter((z) => z.jahr).map((z) => el('tr', {}, [
        el('td', { text: z.text }),
        el('td', { text: gruppeText[z.gruppe] }),
        el('td.num', { text: eur(z.jahr, 0) }),
        el('td.num', {}, [z.abziehbar ? eur(z.jahr, 0) : el('span.badge', { text: 'nicht abziehbar' })]),
      ]))),
      el('tfoot', {}, [el('tr', {}, [
        el('td', { text: 'Summe', style: 'font-weight:600' }), el('td', {}),
        el('td.num', { text: eur(plan.summen.gesamt, 0), style: 'font-weight:600' }),
        el('td.num', { text: eur(plan.summen.abziehbar, 0), style: 'font-weight:600' }),
      ])]),
    ])]),
    el('div', { style: 'padding:12px 18px;border-top:1px solid var(--border)' }, [
      el('div.hint', { text: 'Umlagefähige und nicht umlagefähige Kosten sind Werbungskosten im Jahr der Zahlung; '
        + 'die Vorauszahlungen der Mieter stehen dafür bei den Einnahmen. Die Erhaltungsrücklage ist erst abziehbar, '
        + 'wenn die Gemeinschaft das Geld ausgibt (BFH IX R 19/24). Korrekturen einzelner Monate in der Buchhaltung '
        + 'sind in der Aufstellung berücksichtigt, in dieser Aufschlüsselung nicht.' }),
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
 * Der kleine Verweis auf die 15-%-Grenze, der unter jedem Erhaltungsblock
 * steht – auch wenn die Grenze weit entfernt ist. Wer die Herleitung liest,
 * soll wissen, dass es sie gibt und wo man gerade steht.
 */
function grenzVerweis(g) {
  const basis = `15-%-Grenze § 6 Abs. 1 Nr. 1a EStG: ${eur(g.betrag, 0)}`;
  if (!g.aktiv) return `${basis} · Dreijahresfrist seit ${datum(g.bis)} abgelaufen`;
  return `${basis} · ${eur(g.verbraucht, 0)} verbraucht, noch ${eur(g.offen, 0)} `
    + `bis zum ${datum(g.bis)} – darüber gelten alle Maßnahmen des Zeitraums als Herstellungskosten`;
}

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
        /* Datum, Verteilung und Herkunft koennen gleichzeitig vorliegen –
           vorher gewann davon nur die erste Angabe. */
        const unter = [x.datum ? datum(x.datum) : null, x.hinweis, x.zusatz]
          .filter(Boolean).join(' · ');
        zeilen.push(zeile(x.text, unter || null, -(x.betrag || 0)));
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
      pos.grenze ? el('div.faint', {
        style: 'font-size:11.5px;margin-top:4px',
        text: grenzVerweis(pos.grenze),
      }) : null,
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
