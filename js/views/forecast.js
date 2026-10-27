/* Forecast: Entwicklung des Portfolios über die Jahre, mit Szenarien. */

import { el, leeren, eur, num, toast, csvZeile } from '../util.js';
import { state } from '../store.js';
import { steuerModus } from '../kennzahlen.js';
import { prognose, basisParameter, szenarioParameter, SZENARIEN } from '../forecast.js';
import { flaechenDiagramm, linienDiagramm, balkenDiagramm, farbe } from '../diagramm.js';
import { hinweis } from '../felder.js';
import { annahmenKarte } from './annahmen.js';

const SZENARIO_FARBE = {
  pessimistisch: '--serie-pess',
  basis: '--serie-basis',
  optimistisch: '--serie-opti',
};

let szenario = localStorage.getItem('immo-szenario') || 'basis';
let vergleich = localStorage.getItem('immo-szenario-vergleich') === '1';

export const forecast = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    if (!state.daten.objekte.length) {
      inner.append(el('div.card', {}, [
        el('div.empty', {}, [
          el('div.empty-icon', { text: '📈' }),
          el('h3', { text: 'Noch nichts zu prognostizieren' }),
          el('p', { text: 'Lege zuerst ein Objekt an. Sobald Miete und Finanzierung erfasst sind, entsteht hier die Entwicklung über die Jahre.' }),
          el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
        ]),
      ]));
      return;
    }

    const neu = () => { leeren(container); this.render(container); };

    const basis = basisParameter();
    const p = prognose(szenarioParameter(basis, szenario));
    /* Die beiden anderen Szenarien nur rechnen, wenn der Vergleich sie auch
       zeigt – sonst kostet jeder Seitenaufbau vier vollstaendige Prognosen
       statt einer. */
    const alle = vergleich
      ? Object.fromEntries(SZENARIEN.map((sz) => [sz.id, sz.id === szenario ? p : prognose(szenarioParameter(basis, sz.id))]))
      : null;

    inner.append(parameterKarte(basis, neu));
    if (p.jahre.some((j) => j.rumpfjahr)) {
      inner.append(hinweis(
        '<strong>Rumpfjahr im Betrachtungszeitraum.</strong> In einem Anschaffungsjahr zählen Miete, '
        + 'Kosten und Abschreibung nur ab dem Kaufmonat, die Darlehensraten erst ab dem Monat nach der '
        + 'Auszahlung. Solche Jahre sind in der Tabelle gekennzeichnet und lassen sich nicht direkt mit '
        + 'einem vollen Jahr vergleichen.'
      ));
    }
    inner.append(kennzahlen(p));
    inner.append(vermoegenKarte(p));
    inner.append(cashflowKarte(p));
    if (vergleich) inner.append(vergleichKarte(alle));
    if (p.verkauf) inner.append(verkaufKarte(p));
    inner.append(tabelle(p));
  },
};

/* ---------- Parameter ---------- */

function parameterKarte(basis, neu) {
  const vergleichSchalter = el('button.btn.btn-sm' + (vergleich ? '.btn-primary' : ''), {
    type: 'button',
    onclick: () => {
      vergleich = !vergleich;
      localStorage.setItem('immo-szenario-vergleich', vergleich ? '1' : '0');
      neu();
    },
  }, [vergleich ? '✓ Vergleich' : 'Szenarien vergleichen']);

  return annahmenKarte({
    einstellungen: state.daten.einstellungen,
    basis, szenario,
    setSzenario: (id) => { szenario = id; localStorage.setItem('immo-szenario', id); neu(); },
    neu,
    extra: vergleichSchalter,
    sub: 'Änderungen wirken sofort und werden im Portfolio gespeichert',
  });
}

/* ---------- Kennzahlen am Ende des Zeitraums ---------- */

function kennzahlen(p) {
  const erst = p.jahre[0];
  const letzt = p.jahre.at(-1);
  const nach = steuerModus() === 'nach';
  const cfFeld = nach ? 'cashflowNachSteuer' : 'cashflowVorSteuer';
  const kumFeld = nach ? 'kumuliertNachSteuer' : 'kumuliertVorSteuer';

  const kachel = (label, wert, sub, klasse) => el('div.kpi' + (klasse ? '.' + klasse : ''), {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
  ]);

  const ekWachstum = erst.eigenkapital ? (letzt.eigenkapital / erst.eigenkapital - 1) * 100 : 0;

  return el('div.grid.grid-kpi', {}, [
    kachel(`Verkehrswert ${letzt.jahr}`, eur(letzt.verkehrswert, 0),
      `heute ${eur(erst.verkehrswert, 0)}`),
    kachel(`Restschuld ${letzt.jahr}`, eur(letzt.restschuld, 0),
      letzt.verkehrswert ? `LTV ${num(letzt.ltv, 1)} %` : null),
    kachel(`Eigenkapital ${letzt.jahr}`, eur(letzt.eigenkapital, 0),
      `${ekWachstum >= 0 ? '+' : ''}${num(ekWachstum, 0)} % gegenüber heute`, 'pos'),
    kachel(`Cashflow ${letzt.jahr}`, eur(letzt[cfFeld] / 12, 0) + ' / Monat',
      `heute ${eur(erst[cfFeld] / 12, 0)} / Monat`, letzt[cfFeld] >= 0 ? 'pos' : 'neg'),
    kachel('Kumulierter Cashflow', eur(letzt[kumFeld], 0),
      `über ${p.jahre.length - 1} Jahre, ${nach ? 'nach' : 'vor'} Steuern`,
      letzt[kumFeld] >= 0 ? 'pos' : 'neg'),
    kachel('Getilgt', eur(erst.restschuld - letzt.restschuld, 0),
      erst.restschuld ? `${num((erst.restschuld - letzt.restschuld) / erst.restschuld * 100, 0)} % der heutigen Restschuld` : 'unfinanziert'),
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
        el('div.sub', { text: 'Verkehrswert aufgeteilt in Eigenkapital und Restschuld' }),
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

function vergleichKarte(alle) {
  const xWerte = alle.basis.jahre.map((j) => j.jahr);
  const nach = steuerModus() === 'nach';
  const kumFeld = nach ? 'kumuliertNachSteuer' : 'kumuliertVorSteuer';

  const serien = (feld) => SZENARIEN.map((sz) => ({
    name: sz.name,
    farbe: farbe(SZENARIO_FARBE[sz.id]),
    werte: alle[sz.id].jahre.map((j) => j[feld]),
  }));

  const ek = linienDiagramm({
    xWerte, serien: serien('eigenkapital'),
    format: (v) => eur(v, 0).replace(/\s?€/, ''), tooltipFormat: (v) => eur(v, 0),
  });
  const kum = linienDiagramm({
    xWerte, serien: serien(kumFeld),
    format: (v) => eur(v, 0).replace(/\s?€/, ''), tooltipFormat: (v) => eur(v, 0),
  });

  const letzte = SZENARIEN.map((sz) => ({ sz, j: alle[sz.id].jahre.at(-1) }));

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Szenarien im Vergleich' }),
        el('div.sub', { text: 'dieselben Objekte unter drei Annahmesätzen' }),
      ]),
    ]),
    el('div.card-body', {}, [
      el('div', { text: 'Eigenkapital', style: 'font-size:12.5px;color:var(--text-dim);font-weight:500;margin-bottom:6px' }),
      ek,
      el('div', { text: 'Kumulierter Cashflow', style: 'font-size:12.5px;color:var(--text-dim);font-weight:500;margin:20px 0 6px' }),
      kum,
      el('table.data.kompakt', { style: 'margin-top:18px' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Szenario' }),
          el('th', { style: 'text-align:right', text: 'Verkehrswert' }),
          el('th', { style: 'text-align:right', text: 'Restschuld' }),
          el('th', { style: 'text-align:right', text: 'Eigenkapital' }),
          el('th', { style: 'text-align:right', text: 'Cashflow / Monat' }),
          el('th', { style: 'text-align:right', text: 'kumuliert' }),
        ])]),
        el('tbody', {}, letzte.map(({ sz, j }) => el('tr' + (sz.id === szenario ? '.zeile-aktiv' : ''), {}, [
          el('td', {}, [
            el('span.legende-punkt', { style: `background:${farbe(SZENARIO_FARBE[sz.id])};display:inline-block;margin-right:7px` }),
            sz.name,
          ]),
          el('td.num', { text: eur(j.verkehrswert, 0) }),
          el('td.num', { text: eur(j.restschuld, 0) }),
          el('td.num', { text: eur(j.eigenkapital, 0) }),
          el('td.num', { text: eur((nach ? j.cashflowNachSteuer : j.cashflowVorSteuer) / 12, 0) }),
          el('td.num', { text: eur(j[kumFeld], 0) }),
        ]))),
      ]),
    ]),
  ]);
}

/* ---------- Verkauf ---------- */

function verkaufKarte(p) {
  const v = p.verkauf;
  const innerhalbFrist = v.details.filter((d) => d.steuerpflichtig);

  const zeile = (label, wert, art) => el('tr', {}, [
    el('td', { text: label, style: art === 'summe' ? 'font-weight:600' : 'color:var(--text-faint)' }),
    el('td.num' + (art === 'summe' ? (wert >= 0 ? '.pos' : '.neg') : ''), {
      text: (art === 'abzug' && wert > 0 ? '− ' : '') + eur(wert, 0),
      style: art === 'summe' ? 'font-weight:600' : '',
    }),
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: `Verkauf im Jahr ${v.jahr}` }),
        el('div.sub', { text: 'alle Objekte zum prognostizierten Verkehrswert' }),
      ]),
      el('span.badge.' + (v.gesamtergebnis >= 0 ? 'gruen' : 'rot'), { text: eur(v.gesamtergebnis, 0) + ' Gesamtergebnis' }),
    ]),
    el('div.card-body', {}, [
      innerhalbFrist.length
        ? hinweis(`<strong>${innerhalbFrist.length} Objekt${innerhalbFrist.length === 1 ? '' : 'e'} innerhalb der zehnjährigen Spekulationsfrist.</strong> `
          + 'Der Veräußerungsgewinn ist zu versteuern; Bemessungsgrundlage ist der Buchwert nach bereits geltend gemachter Abschreibung.')
        : hinweis('Alle Objekte liegen außerhalb der zehnjährigen Spekulationsfrist – der Veräußerungsgewinn bleibt steuerfrei.'),
      el('table.data.kompakt', {}, [el('tbody', {}, [
        zeile('Verkaufserlös nach Verkaufskosten', v.erloes),
        zeile('Restschuld ablösen', v.restschuld, 'abzug'),
        zeile('Spekulationssteuer', v.steuer, 'abzug'),
        zeile('Netto-Verkaufserlös', v.netto, 'summe'),
        el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
        zeile('Kumulierter Cashflow bis dahin', v.kumulierterCashflow),
        zeile('Gesamtergebnis', v.gesamtergebnis, 'summe'),
      ])]),
      el('div', { style: 'margin-top:18px;overflow-x:auto' }, [
        el('table.data.kompakt', {}, [
          el('thead', {}, [el('tr', {}, [
            el('th', { text: 'Objekt' }),
            el('th', { style: 'text-align:right', text: 'Haltedauer' }),
            el('th', { style: 'text-align:right', text: 'Erlös netto' }),
            el('th', { style: 'text-align:right', text: 'Buchwert' }),
            el('th', { style: 'text-align:right', text: 'Gewinn' }),
            el('th', { style: 'text-align:right', text: 'Steuer' }),
          ])]),
          el('tbody', {}, v.details.map((d) => el('tr', {}, [
            el('td', { text: d.objekt.bezeichnung || 'Ohne Bezeichnung' }),
            el('td.num', {}, [
              String(d.haltedauer) + ' J.',
              d.steuerpflichtig ? el('span.badge.gelb', { text: 'Frist', style: 'margin-left:6px' }) : null,
            ]),
            el('td.num', { text: eur(d.netto, 0) }),
            el('td.num', { text: eur(d.buchwert, 0) }),
            el('td.num' + (d.gewinn >= 0 ? '.pos' : '.neg'), { text: eur(d.gewinn, 0) }),
            el('td.num', { text: d.steuer ? eur(d.steuer, 0) : '–' }),
          ]))),
        ]),
      ]),
    ]),
  ]);
}

/* ---------- Tabelle ---------- */

function tabelle(p) {
  const nach = steuerModus() === 'nach';
  const ersatz = p.jahre.some((j) => j.tilgungsersatz > 0);
  const mitEk = (p.jahre[0]?.eigenkapitalEingesetzt || 0) > 0;
  const zeilen = p.jahre.map((j) => el('tr' + (j.t === 0 ? '.zeile-aktiv' : ''), {}, [
    el('td', {}, [
      String(j.jahr),
      j.rumpfjahr ? el('span.badge.gelb', { text: 'Rumpfjahr', style: 'margin-left:6px' }) : null,
    ]),
    el('td.num', { text: eur(j.miete, 0) }),
    el('td.num', { text: eur(j.bewirtschaftung + j.instandhaltung, 0) }),
    el('td.num', { text: eur(j.zins, 0) }),
    el('td.num', { text: eur(j.tilgung + j.sondertilgung, 0) }),
    ersatz ? el('td.num', { text: eur(j.tilgungsersatz, 0) }) : null,
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

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Jahr für Jahr' }),
        el('div.sub', {
          text: 'Cashflow = Miete − Kosten − Zinsen − Tilgung'
            + (ersatz ? ' − Tilgungsersatz' : '') + (nach ? ' − Steuer' : ''),
        }),
      ]),
      el('button.btn.btn-sm', { type: 'button', onclick: () => exportieren(p) }, ['Als CSV exportieren']),
    ]),
    el('div.plan-scroll', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Jahr' }),
          el('th', { style: 'text-align:right', text: 'Miete' }),
          el('th', { style: 'text-align:right', text: 'Kosten' }),
          el('th', { style: 'text-align:right', text: 'Zinsen' }),
          el('th', { style: 'text-align:right', text: 'Tilgung' }),
          ersatz ? el('th', { style: 'text-align:right', text: 'Tilgungsersatz' }) : null,
          nach ? el('th', { style: 'text-align:right', text: 'Steuer' }) : null,
          el('th', { style: 'text-align:right', text: 'Cashflow' }),
          el('th', { style: 'text-align:right', text: 'kumuliert' }),
          mitEk ? el('th', { style: 'text-align:right', text: 'EK-Rendite' }) : null,
          mitEk ? el('th', { style: 'text-align:right', text: 'inkl. Aufbau' }) : null,
          el('th', { style: 'text-align:right', text: 'Verkehrswert' }),
          el('th', { style: 'text-align:right', text: 'Restschuld' }),
          el('th', { style: 'text-align:right', text: 'Eigenkapital' }),
          ersatz ? el('th', { style: 'text-align:right', text: 'Ansparguthaben' }) : null,
          ersatz ? el('th', { style: 'text-align:right', text: 'Vermögen' }) : null,
          el('th', { style: 'text-align:right', text: 'LTV' }),
        ].filter(Boolean))]),
        el('tbody', {}, zeilen),
      ]),
    ]),
    (ersatz || mitEk)
      ? el('div', { style: 'padding:12px 18px;border-top:1px solid var(--border);display:grid;gap:6px' }, [
          mitEk ? el('div.hint', { html:
            `<strong>EK-Rendite</strong> = Cashflow des Jahres ÷ eingesetztes Eigenkapital `
            + `(${eur(p.jahre[0].eigenkapitalEingesetzt, 0)}, also Gesamtinvestition abzüglich Darlehen). `
            + '<strong>inkl. Aufbau</strong> zählt Tilgung und Tilgungsersatz mit, die als Vermögen erhalten bleiben. '
            + 'Wertsteigerung steckt in beiden nicht.' }) : null,
          ersatz ? el('div.hint', { html:
            '<strong>Eigenkapital</strong> = Verkehrswert − Restschuld, also nur der Anteil, der in der Immobilie steckt. '
            + 'Das <strong>Ansparguthaben</strong> aus den Tilgungsersatzleistungen liegt daneben auf dem Konto, '
            + '<strong>Vermögen</strong> ist die Summe aus beidem.' }) : null,
        ])
      : null,
  ]);
}

function exportieren(p) {
  const kopf = ['Jahr', 'Miete', 'Bewirtschaftung', 'Instandhaltung', 'Zinsen', 'Tilgung', 'Sondertilgung',
    'Tilgungsersatz', 'AfA', 'Einkuenfte', 'Steuer', 'CashflowVorSteuer', 'CashflowNachSteuer',
    'KumuliertVorSteuer', 'KumuliertNachSteuer', 'Verkehrswert', 'Restschuld', 'Eigenkapital',
    'Ansparguthaben', 'Vermoegen', 'LTV'];
  // Die Jahreszahl bleibt ganzzahlig, alle Betraege bekommen zwei Nachkommastellen
  const betrag = (v) => (v || 0).toFixed(2).replace('.', ',');
  const zeilen = p.jahre.map((j) => csvZeile([
    j.jahr,
    ...[j.miete, j.bewirtschaftung, j.instandhaltung, j.zins, j.tilgung, j.sondertilgung,
      j.tilgungsersatz, j.afa, j.einkuenfte, j.steuer, j.cashflowVorSteuer, j.cashflowNachSteuer,
      j.kumuliertVorSteuer, j.kumuliertNachSteuer, j.verkehrswert, j.restschuld, j.eigenkapital,
      j.ersatzGuthaben, j.vermoegen, j.ltv].map(betrag),
  ]));

  const csv = '﻿' + [csvZeile(kopf), ...zeilen].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `forecast-${szenario}-${p.startJahr}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('CSV exportiert', 'ok');
}
