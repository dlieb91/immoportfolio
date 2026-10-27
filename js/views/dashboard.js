/* Dashboard: Portfolio auf einen Blick – Vermögen, Cashflow, Rendite, Warnungen. */

import { el, eur, num, datum, heuteISO, datumPlus } from '../util.js';
import { state, vertragStatus, einheitenVon, einheitName } from '../store.js';
import {
  portfolioKennzahlen, steuerModus, cashflowAktuell, kapitalbindungPortfolio,
} from '../kennzahlen.js';
import { prognose, basisParameter } from '../forecast.js';
import { erhaltungsAmpel } from '../buchhaltung.js';
import { speicher } from '../storage.js';

export const dashboard = {
  render(container) {
    const d = state.daten;
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    if (!d.objekte.length) {
      inner.append(willkommen());
      return;
    }

    const p = portfolioKennzahlen();
    const nach = steuerModus() === 'nach';
    const folge = portfolioKennzahlen(`${p.jahr + 1}-06-30`);

    const kb = kapitalbindungPortfolio();
    inner.append(kennzahlen(p, folge, nach, kb));
    inner.append(cashflowJahre(p, folge, nach));
    inner.append(el('div.grid.grid-2', {}, [vermoegen(p), cashflowKarte(p, nach)]));
    inner.append(objektTabelle(p, nach));
    const w = warnungen();
    if (w) inner.append(w);
  },
};

/* ---------- Kennzahlen ---------- */

function kachel(label, wert, sub, klasse) {
  return el('div.kpi' + (klasse ? '.' + klasse : ''), {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
  ]);
}

/** „2026-09" → „09/2026" */
const monatKurz = (p) => (p ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : '–');

function kennzahlen(p, folge, nach, kb) {
  const cfFolge = nach ? folge.cashflowNachSteuer : folge.cashflowVorSteuer;
  const kumuliert = nach ? kb.kumuliertNachSteuer : kb.kumuliertVorSteuer;
  const ekRendite = nach ? p.ekRenditeCashflow : p.ekRenditeVorSteuer;
  const ekRenditeGesamt = nach ? p.ekRenditeGesamt : p.ekRenditeGesamtVorSteuer;

  return el('div.grid.grid-kpi', {}, [
    kachel('Verkehrswert', eur(p.verkehrswert, 0),
      `${p.anzahl} Objekte · ${num(p.flaeche, 0)} m²`),
    kachel('Restschuld', eur(p.restschuld, 0),
      p.verkehrswert ? `Beleihungsauslauf ${num(p.ltv, 1)} %` : null),
    kachel('Eingesetztes Eigenkapital', eur(p.eigenkapitalEingesetzt, 0),
      p.darlehenssumme ? `${eur(p.darlehenssumme, 0)} fremdfinanziert` : 'ohne Darlehen'),
    kachel('Summe der Tilgungen', eur(p.getilgt, 0),
      p.darlehenssumme ? `${num(p.getilgt / p.darlehenssumme * 100, 1)} % der Darlehen` : 'kein Darlehen'),
    (() => {
      const n = (state.daten.buchungen?.length || 0) + (state.daten.fahrten?.length || 0);
      return kachel('Buchungen erfasst', num(n, 0),
        n ? 'frei erfasste Buchungen und Fahrten' : 'noch keine frei erfasst · siehe Buchhaltung');
    })(),
    kb.monate
      ? kachel('Geflossener Cashflow', eur(kumuliert, 0),
          `${monatKurz(kb.abMonat)} – ${monatKurz(kb.bis)} · ${kb.monate} ${kb.monate === 1 ? 'Monat' : 'Monate'} · ${nach ? 'nach' : 'vor'} Steuern`,
          kumuliert >= 0 ? 'pos' : 'neg')
      : kachel('Geflossener Cashflow', eur(0, 0),
          kb.abMonat ? `noch nichts geflossen · Kauf ab ${monatKurz(kb.abMonat)}` : 'noch nichts geflossen'),
    kachel(`Cashflow ${folge.jahr} / Monat`, eur(cfFolge / 12, 0),
      `${eur(cfFolge, 0)} im Jahr ${folge.jahr}`, cfFolge >= 0 ? 'pos' : 'neg'),
    kachel('Kaltmiete / Monat', eur(p.kaltmieteMonat, 0),
      `${eur(p.kaltmieteRunrate, 0)} auf zwölf Monate`),
    kachel('Bruttomietrendite', num(p.bruttorendite, 2) + ' %',
      `Faktor ${num(p.kaufpreisfaktor, 1)} · netto ${num(p.nettorendite, 2)} %`),
    kachel('Eigenkapitalrendite',
      ekRendite != null ? num(ekRendite, 2) + ' %' : '–',
      ekRenditeGesamt != null
        ? `${num(ekRenditeGesamt, 2)} % inkl. Vermögensaufbau · ${nach ? 'nach' : 'vor'} Steuern`
        : 'kein Eigenkapital eingesetzt',
      ekRendite != null && ekRendite >= 0 ? 'pos' : ekRendite != null ? 'neg' : ''),
    ...(p.mitErsatz ? [
      kachel('Tilgungsersatz eingezahlt', eur(p.ersatzEingezahlt, 0), 'ohne Verzinsung'),
      kachel('Tilgungsersatz-Guthaben', eur(p.ersatzGuthaben, 0),
        `inkl. ${eur(p.ersatzErtrag, 0)} Zinsertrag`, 'pos'),
    ] : []),
  ]);
}

/* ---------- Cashflow: laufendes Jahr, Folgejahr, Zehnjahresschnitt ---------- */

function cashflowJahre(p, folge, nach) {
  const zehn = prognose({ ...basisParameter(), jahre: 10 });
  // Schnitt über die zehn vollen Folgejahre, ohne das laufende (ggf. angeschnittene)
  const volle = zehn.jahre.slice(1);
  const mittel = (feld) => volle.reduce((s, j) => s + j[feld], 0) / (volle.length || 1);
  const schnittVor = mittel('cashflowVorSteuer');
  const schnittNach = mittel('cashflowNachSteuer');

  const spalte = (titel, unter, vor, nachSt, hervor) => el('div.cf-spalte' + (hervor ? '.hervor' : ''), {}, [
    el('div.cf-spalte-titel', { text: titel }),
    el('div.cf-spalte-unter', { text: unter }),
    el('div.cf-paar', {}, [
      el('div', {}, [
        el('div.faint', { text: 'vor Steuern', style: 'font-size:11.5px' }),
        el('div.num' + (vor >= 0 ? '.pos' : '.neg'), { text: eur(vor / 12, 0) + ' / Mon.', style: 'font-weight:600;font-size:16px' }),
        el('div.faint', { text: eur(vor, 0) + ' / Jahr', style: 'font-size:11.5px' }),
      ]),
      el('div', {}, [
        el('div.faint', { text: 'nach Steuern', style: 'font-size:11.5px' }),
        el('div.num' + (nachSt >= 0 ? '.pos' : '.neg'), { text: eur(nachSt / 12, 0) + ' / Mon.', style: 'font-weight:600;font-size:16px' }),
        el('div.faint', { text: eur(nachSt, 0) + ' / Jahr', style: 'font-size:11.5px' }),
      ]),
    ]),
  ]);

  const hinweisText = p.angeschnitten
    ? `${p.jahr} ist ein angeschnittenes Jahr: Miete und Kapitaldienst laufen nicht über alle zwölf Monate. `
      + `Für die laufende Belastung ist ${folge.jahr} die aussagekräftige Zahl.`
    : null;

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Cashflow' }),
        el('div.sub', { text: 'laufendes Jahr, Folgejahr und Durchschnitt der nächsten zehn Jahre' }),
      ]),
      nach ? el('span.badge.blau', { text: 'Anzeige: nach Steuern' }) : null,
    ]),
    el('div.card-body', {}, [
      el('div.cf-jahre', {}, [
        spalte(String(p.jahr), 'laufendes Jahr', p.cashflowVorSteuer, p.cashflowNachSteuer, !p.angeschnitten),
        spalte(String(folge.jahr), 'Folgejahr, volle zwölf Monate', folge.cashflowVorSteuer, folge.cashflowNachSteuer, p.angeschnitten),
        spalte('Ø 10 Jahre', `${zehn.startJahr + 1}–${zehn.startJahr + 10}, mit Annahmen aus dem Forecast`, schnittVor, schnittNach),
      ]),
      hinweisText ? el('div.hint', { style: 'margin-top:14px', text: hinweisText }) : null,
      el('div.hint', { style: 'margin-top:6px', text:
        'Die Spalten oben sind Kalenderjahre und enthalten auch die Monate, die im laufenden Jahr noch '
        + 'kommen. Die Kachel „Geflossener Cashflow" zählt dagegen nur bis zum laufenden Monat. Mieten und '
        + 'Zinsen stammen aus den erfassten Konditionen und dem Tilgungsplan; für laufende Kosten und '
        + 'Steuersatz werden die heutigen Werte auch auf die Vorjahre angewendet, die Steuer wird '
        + 'zeitanteilig angesetzt.' }),
    ]),
  ]);
}

/* ---------- Vermögensstruktur ---------- */

function vermoegen(p) {
  const gesamt = p.verkehrswert || 1;
  const ekAnteil = Math.max(0, p.eigenkapital) / gesamt * 100;
  const fkAnteil = Math.min(100, p.restschuld / gesamt * 100);

  const balken = el('div.stapel', {}, [
    ekAnteil > 0 ? el('div.stapel-teil.serie-ek', { style: `width:${ekAnteil}%`, title: 'Eigenkapital ' + eur(p.eigenkapital, 0) }) : null,
    fkAnteil > 0 ? el('div.stapel-teil.serie-fk', { style: `width:${fkAnteil}%`, title: 'Restschuld ' + eur(p.restschuld, 0) }) : null,
  ]);

  const legende = el('div.legende', {}, [
    legendeEintrag('serie-ek', 'Eigenkapital', eur(p.eigenkapital, 0), num(ekAnteil, 1) + ' %'),
    legendeEintrag('serie-fk', 'Restschuld', eur(p.restschuld, 0), num(fkAnteil, 1) + ' %'),
  ]);

  const zeile = (label, wert, betont) => el('tr', {}, [
    el('td', { text: label, style: 'color:var(--text-faint)' }),
    el('td.num', { text: wert, style: betont ? 'font-weight:600' : '' }),
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Vermögensstruktur' }),
        el('div.sub', { text: 'Verkehrswert aufgeteilt in Eigen- und Fremdkapital' }),
      ]),
    ]),
    el('div.card-body', {}, [
      balken, legende,
      el('table.data.kompakt', { style: 'margin-top:16px' }, [
        el('tbody', {}, [
          zeile('Kaufpreise', eur(p.kaufpreis, 0)),
          zeile('Gesamtinvestition inkl. Nebenkosten', eur(p.investition, 0)),
          zeile('Verkehrswert heute', eur(p.verkehrswert, 0)),
          zeile('Eingesetztes Eigenkapital', eur(p.eigenkapitalEingesetzt, 0)),
          zeile('Netto-Vermögen', eur(p.eigenkapital, 0), true),
        ]),
      ]),
    ]),
  ]);
}

function legendeEintrag(klasse, label, wert, anteil) {
  return el('div.legende-eintrag', {}, [
    el('span.legende-punkt.' + klasse),
    el('span', { text: label }),
    el('span.num.legende-wert', { text: wert }),
    el('span.faint', { text: anteil, style: 'font-size:11.5px' }),
  ]);
}

/* ---------- Cashflow ---------- */

function cashflowKarte(p, nach) {
  const zeile = (label, wert, art) => el('tr', {}, [
    el('td', { text: label, style: art === 'summe' ? 'font-weight:600' : 'color:var(--text-faint)' }),
    el('td.num' + (art === 'summe' ? (wert >= 0 ? '.pos' : '.neg') : ''), {
      text: (art === 'abzug' && wert > 0 ? '− ' : '') + eur(wert, 0),
      style: art === 'summe' ? 'font-weight:600' : '',
    }),
  ]);

  const zeilen = [
    zeile('Kaltmiete', p.kaltmieteJahr),
    zeile('Bewirtschaftungskosten', p.bewirtschaftung, 'abzug'),
  ];
  if (p.werbungskostenFrei) zeilen.push(zeile('Erhaltung, Fahrten, Sonstiges', p.werbungskostenFrei, 'abzug'));
  zeilen.push(
    zeile('Zinsen', p.zins, 'abzug'),
    zeile('Tilgung', p.tilgung, 'abzug'),
  );
  if (p.sondertilgung) zeilen.push(zeile('Sondertilgung', p.sondertilgung, 'abzug'));
  zeilen.push(zeile('Cashflow vor Steuern', p.cashflowVorSteuer, 'summe'));

  if (nach) {
    zeilen.push(
      el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
      zeile('Einkünfte aus Vermietung', p.einkuenfte),
      zeile('davon Abschreibung', p.afaJahr, 'abzug'),
      zeile(p.steuer >= 0 ? 'Steuer' : 'Steuererstattung', Math.abs(p.steuer), p.steuer >= 0 ? 'abzug' : null),
      zeile('Cashflow nach Steuern', p.cashflowNachSteuer, 'summe'),
    );
  }

  const cf = nach ? p.cashflowNachSteuer : p.cashflowVorSteuer;

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: `Cashflow ${p.jahr} im Detail` }),
        el('div.sub', { text: nach ? 'nach Steuern · Abschreibung mindert die Steuer, nicht den Cashflow' : 'vor Steuern · umlagefähige Kosten bleiben außen vor' }),
      ]),
      el('span.badge.' + (cf >= 0 ? 'gruen' : 'rot'), { text: eur(cf / 12, 0) + ' / Monat' }),
    ]),
    el('div.card-body', {}, [
      el('table.data.kompakt', {}, [el('tbody', {}, zeilen)]),
    ]),
  ]);
}

/* ---------- Objekte ---------- */

function objektTabelle(p, nach) {
  const maximum = Math.max(...p.objekte.map((k) => Math.abs(cashflowAktuell(k) / 12)), 1);

  const zeilen = [...p.objekte]
    .sort((a, b) => cashflowAktuell(b) - cashflowAktuell(a))
    .map((k) => {
      const cf = cashflowAktuell(k) / 12;
      return el('tr', {
        style: 'cursor:pointer',
        onclick: () => { location.hash = '#/objekt?id=' + k.objekt.id; },
      }, [
        el('td', {}, [
          el('div', { text: k.objekt.bezeichnung || 'Ohne Bezeichnung', style: 'font-weight:500' }),
          el('div.faint', { text: k.objekt.ort || '–', style: 'font-size:12px' }),
        ]),
        el('td.num', { text: eur(k.verkehrswert, 0) }),
        el('td.num', { text: k.restschuld ? eur(k.restschuld, 0) : '–' }),
        el('td.num', { text: eur(k.kaltmieteMonat, 0) }),
        el('td.num', { text: num(k.bruttorendite, 2) + ' %' }),
        el('td.num', { text: k.ltv ? num(k.ltv, 0) + ' %' : '–' }),
        el('td', { style: 'min-width:190px' }, [
          el('div.num' + (cf >= 0 ? '.pos' : '.neg'), { text: eur(cf, 0), style: 'text-align:right' }),
          cashflowBalken(cf, maximum),
        ]),
      ]);
    });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Objekte im Vergleich' }),
        el('div.sub', { text: `Cashflow ${nach ? 'nach' : 'vor'} Steuern pro Monat, absteigend sortiert` }),
      ]),
      el('a.btn.btn-sm', { href: '#/objekte' }, ['Alle Objekte']),
    ]),
    el('div', { style: 'overflow-x:auto' }, [
      el('table.data', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Objekt' }),
          el('th', { style: 'text-align:right', text: 'Verkehrswert' }),
          el('th', { style: 'text-align:right', text: 'Restschuld' }),
          el('th', { style: 'text-align:right', text: 'Kaltmiete' }),
          el('th', { style: 'text-align:right', text: 'Rendite' }),
          el('th', { style: 'text-align:right', text: 'LTV' }),
          el('th', { style: 'text-align:right', text: 'Cashflow / Monat' }),
        ])]),
        el('tbody', {}, zeilen),
      ]),
    ]),
  ]);
}

/** Balken mit Nulllinie in der Mitte – links negativ, rechts positiv. */
export function cashflowBalken(wert, maximum) {
  const anteil = Math.min(50, Math.abs(wert) / maximum * 50);
  const fuell = el('div.cf-fuell' + (wert >= 0 ? '.pos' : '.neg'), {
    style: wert >= 0
      ? `left:50%;width:${anteil}%;border-radius:0 3px 3px 0`
      : `right:50%;width:${anteil}%;border-radius:3px 0 0 3px`,
  });
  return el('div.cf-balken', {}, [el('div.cf-mitte'), fuell]);
}

/* ---------- Warnungen ---------- */

function warnungen() {
  const d = state.daten;
  const heute = heuteISO();
  const punkte = [];

  // Leerstand
  const leer = [];
  for (const o of d.objekte) {
    for (const e of einheitenVon(o.id)) {
      const belegt = d.mietvertraege.some((m) => m.einheitId === e.id && vertragStatus(m, heute) === 'aktiv');
      if (!belegt) leer.push({ o, e });
    }
  }
  if (leer.length) {
    punkte.push({
      art: 'warn', ziel: '#/mietvertraege',
      text: `${leer.length} Einheit${leer.length === 1 ? '' : 'en'} ohne aktiven Mietvertrag`,
      detail: leer.slice(0, 3).map(({ o, e }) => o.bezeichnung + (einheitenVon(o.id).length > 1 ? ' · ' + einheitName(e) : '')).join(', '),
    });
  }

  // Auslaufende Zinsbindungen
  const grenze = datumPlus({ jahre: 2 });
  const bindungen = d.finanzierungen.filter((f) => f.zinsbindungBis && f.zinsbindungBis >= heute && f.zinsbindungBis <= grenze);
  if (bindungen.length) {
    punkte.push({
      art: 'warn', ziel: '#/finanzierungen',
      text: `${bindungen.length} Zinsbindung${bindungen.length === 1 ? '' : 'en'} laufen in den nächsten 2 Jahren aus`,
      detail: bindungen.map((f) => `${f.bank || 'Darlehen'} bis ${datum(f.zinsbindungBis)}`).join(', '),
    });
  }

  // Auslaufende Mietverträge
  const grenzeMiete = datumPlus({ tage: 180 });
  const endend = d.mietvertraege.filter((m) => {
    if (vertragStatus(m, heute) !== 'aktiv') return false;
    const ende = m.gekuendigtZum || (m.unbefristet ? null : m.ende);
    return ende && ende <= grenzeMiete;
  });
  if (endend.length) {
    punkte.push({
      art: 'info', ziel: '#/mietvertraege',
      text: `${endend.length} Mietvertrag/-verträge enden innerhalb von 180 Tagen`,
      detail: endend.map((m) => m.mieter || 'ohne Mieter').join(', '),
    });
  }

  // Erhaltungsaufwand nahe oder über der 15-%-Grenze (§ 6 Abs. 1 Nr. 1a EStG)
  for (const o of d.objekte) {
    const ampel = erhaltungsAmpel(o, heute);
    if (!ampel || ampel.stufe === 'gruen') continue;
    punkte.push({
      art: ampel.stufe === 'rot' ? 'warn' : 'info', ziel: `#/objekt?id=${o.id}`,
      text: (ampel.stufe === 'rot' ? 'Über der 15-%-Grenze: ' : 'Nähert sich der 15-%-Grenze: ')
        + (o.bezeichnung || 'Objekt'),
      detail: `Erhaltungsaufwand seit dem Kauf ${eur(ampel.summe, 0)} von ${eur(ampel.grenze, 0)}`,
    });
  }

  // Fehlende Angaben
  const ohneWert = d.objekte.filter((o) => !(o.werte || []).length);
  if (ohneWert.length) {
    punkte.push({
      art: 'info', ziel: '#/objekte',
      text: `${ohneWert.length} Objekt${ohneWert.length === 1 ? '' : 'e'} ohne Verkehrswert – gerechnet wird mit dem Kaufpreis`,
      detail: ohneWert.map((o) => o.bezeichnung).slice(0, 4).join(', '),
    });
  }

  if (!punkte.length) return null;

  return el('div.card', {}, [
    el('div.card-head', {}, [el('h2', { text: 'Hinweise' })]),
    el('div.card-body', { style: 'display:grid;gap:10px' }, punkte.map((p) => el('a.hinweis', { href: p.ziel }, [
      el('span.hinweis-punkt.' + p.art),
      el('span', {}, [
        el('div', { text: p.text }),
        p.detail ? el('div.faint', { text: p.detail, style: 'font-size:12px;margin-top:2px' }) : null,
      ]),
    ]))),
  ]);
}

/* ---------- Leerer Zustand ---------- */

function willkommen() {
  const d = state.daten;
  return el('div', { style: 'display:grid;gap:16px' }, [
    el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '🏠' }),
        el('h3', { text: 'Willkommen in deinem Portfolio' }),
        el('p', {
          text: 'Sobald du dein erstes Objekt angelegt hast, erscheinen hier Vermögen, Cashflow, '
            + 'Renditen und Hinweise zu allem, was Aufmerksamkeit braucht.',
        }),
        el('a.btn.btn-primary.btn-lg', { href: '#/objekte' }, ['Erstes Objekt anlegen']),
      ]),
    ]),
    el('div.card', {}, [
      el('div.card-head', {}, [el('h2', { text: 'Speicherort' })]),
      el('div.card-body', {}, [
        el('table.data.kompakt', {}, [el('tbody', {}, [
          el('tr', {}, [el('td', { text: 'Ordner', style: 'color:var(--text-faint);width:45%' }), el('td', { text: speicher.ordnerName || '–' })]),
          el('tr', {}, [el('td', { text: 'Portfolio', style: 'color:var(--text-faint)' }), el('td', { text: d.meta.name })]),
          el('tr', {}, [el('td', { text: 'Zuletzt geändert', style: 'color:var(--text-faint)' }), el('td', { text: datum(d.meta.geaendertAm) })]),
        ])]),
      ]),
    ]),
  ]);
}
