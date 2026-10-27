/* Einzelobjektbetrachtung: ein Objekt über die Jahre, mit denselben
   Annahmen wie der Portfolio-Forecast. */

import { el, leeren, eur, num, datum, toast } from '../util.js';
import { state, objekt as objektMit, flaecheVon } from '../store.js';
import { objektKennzahlen, steuerModus } from '../kennzahlen.js';
import { prognose, basisParameter, szenarioParameter, SZENARIEN } from '../forecast.js';
import { flaechenDiagramm, linienDiagramm, balkenDiagramm, farbe } from '../diagramm.js';
import { annahmenKarte } from './annahmen.js';
import { hinweis } from '../felder.js';
import { typText } from './objekte.js';

let szenario = localStorage.getItem('immo-szenario') || 'basis';

function gewaehltesObjekt() {
  const ausHash = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  const gemerkt = localStorage.getItem('immo-einzelobjekt');
  const kandidaten = [ausHash, gemerkt].filter(Boolean);
  for (const id of kandidaten) {
    const o = objektMit(id);
    if (o) return o;
  }
  return state.daten.objekte[0] || null;
}

export const objektForecast = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    if (!state.daten.objekte.length) {
      inner.append(el('div.card', {}, [
        el('div.empty', {}, [
          el('div.empty-icon', { text: '🔎' }),
          el('h3', { text: 'Noch kein Objekt vorhanden' }),
          el('p', { text: 'Die Einzelbetrachtung zeigt ein Objekt Jahr für Jahr. Lege zuerst eine Immobilie an.' }),
          el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
        ]),
      ]));
      return;
    }

    const o = gewaehltesObjekt();
    const neu = () => { leeren(container); this.render(container); };

    const basis = basisParameter();
    const p = prognose(szenarioParameter(basis, szenario), undefined, [o.id]);
    const z = objektKennzahlen(o);

    inner.append(objektWahl(o, neu));
    inner.append(annahmenKarte({
      einstellungen: state.daten.einstellungen,
      basis, szenario,
      setSzenario: (id) => { szenario = id; localStorage.setItem('immo-szenario', id); neu(); },
      neu,
      sub: 'dieselben Annahmen wie im Portfolio-Forecast',
    }));

    if (p.jahre.some((j) => j.rumpfjahr)) {
      inner.append(hinweis(
        '<strong>Rumpfjahr im Betrachtungszeitraum.</strong> Im Anschaffungsjahr zählen Miete, Kosten und '
        + 'Abschreibung erst ab dem Kaufmonat, die Darlehensraten ab dem Monat nach der Auszahlung. '
        + 'Solche Jahre sind in der Tabelle gekennzeichnet.'
      ));
    }

    inner.append(kennzahlen(o, z, p));
    inner.append(vermoegenKarte(p));
    inner.append(cashflowKarte(p));
    if (p.verkauf) inner.append(verkaufKarte(p, o));
    inner.append(tabelle(p, o));
  },
};

/* ---------- Objektauswahl ---------- */

function objektWahl(o, neu) {
  const sel = el('select', {
    style: 'max-width:420px',
    // Der Hash-Wechsel löst das Neuzeichnen über den Router aus
    onchange: (ev) => {
      localStorage.setItem('immo-einzelobjekt', ev.target.value);
      location.hash = '#/einzelobjekt?id=' + ev.target.value;
    },
  }, state.daten.objekte.map((x) => el('option', {
    value: x.id, selected: x.id === o.id,
  }, [x.bezeichnung || 'Ohne Bezeichnung'])));

  const liste = state.daten.objekte;
  const pos = liste.findIndex((x) => x.id === o.id);
  const wechseln = (richtung) => {
    const ziel = liste[(pos + richtung + liste.length) % liste.length];
    localStorage.setItem('immo-einzelobjekt', ziel.id);
    location.hash = '#/einzelobjekt?id=' + ziel.id;
  };

  return el('div.card', {}, [
    el('div.card-body', { style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' }, [
      el('div', { style: 'flex:1;min-width:240px' }, [
        el('div.faint', { text: 'Objekt', style: 'font-size:12.5px;margin-bottom:5px' }),
        sel,
      ]),
      liste.length > 1
        ? el('div', { style: 'display:flex;gap:6px' }, [
            el('button.btn.btn-sm', { type: 'button', title: 'Vorheriges Objekt', onclick: () => wechseln(-1) }, ['←']),
            el('span.faint', { text: `${pos + 1} / ${liste.length}`, style: 'font-size:12.5px;align-self:center;padding:0 4px' }),
            el('button.btn.btn-sm', { type: 'button', title: 'Nächstes Objekt', onclick: () => wechseln(1) }, ['→']),
          ])
        : null,
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, [
        el('span.badge', { text: typText(o.typ) }),
        o.ort ? el('span.badge', { text: o.ort }) : null,
        flaecheVon(o) ? el('span.badge', { text: num(flaecheVon(o), 0) + ' m²' }) : null,
        o.kaufdatum ? el('span.badge', { text: 'Kauf ' + datum(o.kaufdatum) }) : null,
      ]),
    ]),
  ]);
}

/* ---------- Kennzahlen ---------- */

function kennzahlen(o, z, p) {
  const erst = p.jahre[0];
  const letzt = p.jahre.at(-1);
  const nach = steuerModus() === 'nach';
  const cfFeld = nach ? 'cashflowNachSteuer' : 'cashflowVorSteuer';
  const kumFeld = nach ? 'kumuliertNachSteuer' : 'kumuliertVorSteuer';
  const volle = p.jahre.slice(1);
  const schnitt = volle.length ? volle.reduce((s, j) => s + j[cfFeld], 0) / volle.length : erst[cfFeld];

  const kachel = (label, wert, sub, klasse) => el('div.kpi' + (klasse ? '.' + klasse : ''), {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
  ]);

  return el('div.grid.grid-kpi', {}, [
    kachel('Eingesetztes Eigenkapital', eur(z.eigenkapitalEingesetzt, 0),
      z.darlehenssumme ? `${eur(z.darlehenssumme, 0)} fremdfinanziert` : 'ohne Darlehen'),
    kachel(`Ø Cashflow / Monat`, eur(schnitt / 12, 0),
      `${volle.length} volle Jahre, ${nach ? 'nach' : 'vor'} Steuern`, schnitt >= 0 ? 'pos' : 'neg'),
    kachel('Kumulierter Cashflow', eur(letzt[kumFeld], 0),
      `bis ${letzt.jahr}`, letzt[kumFeld] >= 0 ? 'pos' : 'neg'),
    kachel(`Verkehrswert ${letzt.jahr}`, eur(letzt.verkehrswert, 0), `heute ${eur(erst.verkehrswert, 0)}`),
    kachel(`Restschuld ${letzt.jahr}`, eur(letzt.restschuld, 0),
      letzt.verkehrswert ? `LTV ${num(letzt.ltv, 1)} %` : null),
    kachel(`Eigenkapital ${letzt.jahr}`, eur(letzt.eigenkapital, 0),
      'Verkehrswert abzüglich Restschuld', 'pos'),
  ]);
}

/* ---------- Diagramme ---------- */

function vermoegenKarte(p) {
  const xWerte = p.jahre.map((j) => j.jahr);
  const diagramm = flaechenDiagramm({
    xWerte,
    serien: [
      { name: 'Eigenkapital', farbe: farbe('--serie-ek'), werte: p.jahre.map((j) => Math.max(0, j.eigenkapital)) },
      { name: 'Restschuld', farbe: farbe('--serie-fk'), werte: p.jahre.map((j) => j.restschuld) },
    ],
    format: (v) => eur(v, 0).replace(/\s?€/, ''),
    tooltipFormat: (v) => eur(v, 0),
  });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Vermögensentwicklung' }),
        el('div.sub', { text: 'Verkehrswert dieses Objekts, aufgeteilt in Eigenkapital und Restschuld' }),
      ]),
    ]),
    el('div.card-body', {}, [diagramm]),
  ]);
}

function cashflowKarte(p) {
  const nach = steuerModus() === 'nach';
  const feld = nach ? 'cashflowNachSteuer' : 'cashflowVorSteuer';
  const kumFeld = nach ? 'kumuliertNachSteuer' : 'kumuliertVorSteuer';
  const xWerte = p.jahre.map((j) => j.jahr);

  const balken = balkenDiagramm({
    xWerte,
    werte: p.jahre.map((j) => j[feld]),
    name: `Cashflow ${nach ? 'nach' : 'vor'} Steuern`,
    format: (v) => eur(v, 0).replace(/\s?€/, ''),
    tooltipFormat: (v) => eur(v, 0),
  });

  const kumuliert = linienDiagramm({
    xWerte,
    serien: [{ name: 'kumuliert', farbe: farbe('--accent'), werte: p.jahre.map((j) => j[kumFeld]) }],
    format: (v) => eur(v, 0).replace(/\s?€/, ''),
    tooltipFormat: (v) => eur(v, 0),
  });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: `Cashflow ${nach ? 'nach' : 'vor'} Steuern` }),
        el('div.sub', { text: 'oben je Jahr, unten aufsummiert – umschaltbar über den Schalter in der Kopfzeile' }),
      ]),
    ]),
    el('div.card-body', {}, [balken, el('div', { style: 'margin-top:18px' }, [kumuliert])]),
  ]);
}

/* ---------- Verkauf ---------- */

function verkaufKarte(p, o) {
  const v = p.verkauf;
  const detail = v.details[0];
  if (!detail) return el('div', { hidden: true });

  const zeile = (label, wert, art, unter) => el('tr', {}, [
    el('td', {}, [
      el('span', { text: label, style: art === 'summe' ? 'font-weight:600' : 'color:var(--text-faint)' }),
      unter ? el('div.faint', { text: unter, style: 'font-size:11.5px' }) : null,
    ]),
    el('td.num' + (art === 'summe' ? (wert >= 0 ? '.pos' : '.neg') : ''), {
      text: (art === 'abzug' && wert > 0 ? '− ' : '') + eur(wert, 0),
      style: art === 'summe' ? 'font-weight:600' : '',
    }),
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: `Verkauf im Jahr ${v.jahr}` }),
        el('div.sub', { text: `Haltedauer ${detail.haltedauer} Jahre` }),
      ]),
      el('span.badge.' + (detail.steuerpflichtig ? 'gelb' : 'gruen'), {
        text: detail.steuerpflichtig ? 'innerhalb der Spekulationsfrist' : 'steuerfrei',
      }),
    ]),
    el('div.card-body', {}, [
      el('table.data.kompakt', {}, [el('tbody', {}, [
        zeile('Verkehrswert im Verkaufsjahr', detail.brutto),
        zeile('Verkaufskosten', detail.kosten, 'abzug'),
        zeile('Erlös', detail.netto, 'summe'),
        el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
        zeile('Buchwert', detail.buchwert, null, 'Anschaffungskosten abzüglich geltend gemachter AfA'),
        zeile('Veräußerungsgewinn', detail.gewinn),
        zeile('Spekulationssteuer', detail.steuer, 'abzug'),
        zeile('Restschuld ablösen', detail.restschuld, 'abzug'),
        zeile('Netto-Verkaufserlös', v.netto, 'summe'),
        el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
        zeile('Kumulierter Cashflow bis dahin', v.kumulierterCashflow),
        zeile('Gesamtergebnis', v.gesamtergebnis, 'summe'),
      ])]),
    ]),
  ]);
}

/* ---------- Tabelle ---------- */

function tabelle(p, o) {
  const nach = steuerModus() === 'nach';
  const ersatz = p.jahre.some((j) => j.tilgungsersatz > 0);
  const mitEk = (p.jahre[0]?.eigenkapitalEingesetzt || 0) > 0;

  const zeilen = p.jahre.map((j) => el('tr' + (j.t === 0 ? '.zeile-aktiv' : ''), {}, [
    el('td', {}, [
      String(j.jahr),
      j.rumpfjahr ? el('span.badge.gelb', { text: 'Rumpfjahr', style: 'margin-left:6px' }) : null,
    ]),
    el('td.num', { text: eur(j.miete, 0) }),
    el('td.num', { text: eur(j.bewirtschaftung, 0) }),
    el('td.num', { text: eur(j.instandhaltung, 0) }),
    el('td.num', { text: eur(j.zins, 0) }),
    el('td.num', { text: eur(j.tilgung + j.sondertilgung, 0) }),
    ersatz ? el('td.num', { text: eur(j.tilgungsersatz, 0) }) : null,
    nach ? el('td.num', { text: eur(j.afa, 0) }) : null,
    nach ? el('td.num', { text: eur(j.steuer, 0) }) : null,
    el('td.num' + ((nach ? j.cashflowNachSteuer : j.cashflowVorSteuer) >= 0 ? '.pos' : '.neg'), {
      text: eur(nach ? j.cashflowNachSteuer : j.cashflowVorSteuer, 0),
    }),
    el('td.num', { text: eur(nach ? j.kumuliertNachSteuer : j.kumuliertVorSteuer, 0) }),
    mitEk ? el('td.num', { text: num(nach ? j.ekRenditeNachSteuer : j.ekRenditeVorSteuer, 2) + ' %' }) : null,
    mitEk ? el('td.num', { text: num(nach ? j.ekRenditeGesamtNachSteuer : j.ekRenditeGesamtVorSteuer, 2) + ' %' }) : null,
    el('td.num', { text: eur(j.verkehrswert, 0) }),
    el('td.num', { text: eur(j.restschuld, 0) }),
    el('td.num', { text: eur(j.eigenkapital, 0) }),
    ersatz ? el('td.num', { text: eur(j.ersatzGuthaben, 0) }) : null,
    ersatz ? el('td.num', { text: eur(j.vermoegen, 0), style: 'font-weight:600' }) : null,
    el('td.num', { text: j.ltv ? num(j.ltv, 0) + ' %' : '–' }),
  ].filter(Boolean)));

  const kopf = [
    ['Jahr', false], ['Miete', true], ['Bewirtschaftung', true], ['Instandhaltung', true],
    ['Zinsen', true], ['Tilgung', true],
    ...(ersatz ? [['Tilgungsersatz', true]] : []),
    ...(nach ? [['AfA', true], ['Steuer', true]] : []),
    ['Cashflow', true], ['kumuliert', true],
    ...(mitEk ? [['EK-Rendite', true], ['inkl. Aufbau', true]] : []),
    ['Verkehrswert', true],
    ['Restschuld', true],
    ['Eigenkapital', true],
    ...(ersatz ? [['Ansparguthaben', true], ['Vermögen', true]] : []),
    ['LTV', true],
  ];

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Jahr für Jahr' }),
        el('div.sub', { text: `${o.bezeichnung || 'Objekt'} · Szenario ${SZENARIEN.find((s) => s.id === szenario).name}` }),
      ]),
      el('button.btn.btn-sm', { type: 'button', onclick: () => exportieren(p, o) }, ['Als CSV exportieren']),
    ]),
    el('div.plan-scroll', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, kopf.map(([t, rechts]) =>
          el('th', { style: rechts ? 'text-align:right' : '', text: t })))]),
        el('tbody', {}, zeilen),
      ]),
    ]),
    mitEk
      ? el('div', { style: 'padding:12px 18px;border-top:1px solid var(--border)' }, [
          el('div.hint', { html:
            '<strong>EK-Rendite</strong> = Cashflow des Jahres ÷ eingesetztes Eigenkapital '
            + `(${eur(p.jahre[0].eigenkapitalEingesetzt, 0)}). <strong>inkl. Aufbau</strong> zählt Tilgung `
            + 'und Tilgungsersatz mit, die als Vermögen erhalten bleiben. Wertsteigerung steckt in beiden nicht.' }),
        ])
      : null,
  ]);
}

function exportieren(p, o) {
  const kopf = ['Jahr', 'Miete', 'Bewirtschaftung', 'Instandhaltung', 'Zinsen', 'Tilgung', 'Sondertilgung',
    'Tilgungsersatz', 'AfA', 'Einkuenfte', 'Steuer', 'CashflowVorSteuer', 'CashflowNachSteuer',
    'KumuliertVorSteuer', 'KumuliertNachSteuer', 'Verkehrswert', 'Restschuld', 'Eigenkapital',
    'Ansparguthaben', 'Vermoegen', 'LTV'];
  const zeilen = p.jahre.map((j) => [
    j.jahr, j.miete, j.bewirtschaftung, j.instandhaltung, j.zins, j.tilgung, j.sondertilgung,
    j.tilgungsersatz, j.afa, j.einkuenfte, j.steuer, j.cashflowVorSteuer, j.cashflowNachSteuer,
    j.kumuliertVorSteuer, j.kumuliertNachSteuer, j.verkehrswert, j.restschuld, j.eigenkapital,
    j.ersatzGuthaben, j.vermoegen, j.ltv,
  ].map((v) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v)).join(';'));

  const csv = '﻿' + [kopf.join(';'), ...zeilen].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const name = (o.bezeichnung || 'objekt').replace(/[^\wäöüÄÖÜß -]/g, '').trim() || 'objekt';
  const a = el('a', { href: url, download: `${name}-${szenario}-${p.startJahr}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('CSV exportiert', 'ok');
}
