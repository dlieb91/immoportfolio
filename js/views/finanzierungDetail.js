/* Darlehen im Detail: Konditionen, Sondertilgungen, vollständiger Tilgungsplan. */

import { el, leeren, eur, num, datum, uid, heuteISO, toast, bestaetigen } from '../util.js';
import { state, aendern, objekt as objektMit, verkehrswert } from '../store.js';
import {
  sondertilgungPruefen, MINDEST_TILGUNG, ersatzGuthabenZu, ersatzEingezahltBis,
} from '../finanzmathematik.js';
import {
  textFeld, zahlFeld, datumFeld, auswahlFeld, schalterFeld, textBereich,
  anzeigeFeld, felderGitter, abschnitt, hinweis, parseZahl,
  tabellenDatum, tabellenZahl, tabellenText,
} from '../felder.js';
import { DARLEHENSARTEN, finanzierungKennzahlen, balken } from './finanzierungen.js';
import { dokumenteKarte, protokollKarte, dokumenteEntfernenFuer } from './dokumente.js';

let planAnsicht = 'jahre';   // jahre | monate

export const finanzierungDetail = {
  render(container) {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
    const fin = id ? state.daten.finanzierungen.find((f) => f.id === id) : null;

    if (!fin) {
      container.append(el('div.view-inner', {}, [
        el('div.card', {}, [
          el('div.empty', {}, [
            el('div.empty-icon', { text: '🤷' }),
            el('h3', { text: 'Darlehen nicht gefunden' }),
            el('a.btn.btn-primary', { href: '#/finanzierungen' }, ['Zur Übersicht']),
          ]),
        ]),
      ]));
      return;
    }

    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const kopfBox = el('div', {}, [kopf(fin)]);
    const kpiBox = el('div', {}, [kennzahlen(fin)]);
    const planBox = el('div');

    const planNeu = () => { leeren(planBox).append(tilgungsplanKarte(fin, planNeu)); };
    const obenNeu = () => {
      leeren(kopfBox).append(kopf(fin));
      leeren(kpiBox).append(kennzahlen(fin));
      planNeu();
    };
    planNeu();

    inner.append(kopfBox, kpiBox);
    // Zwei Rückmeldungen: reine Werte ziehen nur Kopf, Kennzahlen und Plan
    // nach, während Darlehensart und Tilgungsersatz-Schalter die Karte
    // umbauen – sonst verlöre man beim Tippen den Fokus.
    inner.append(neuZeichnend((z) => konditionen(fin, obenNeu, () => { z(); obenNeu(); })));
    inner.append(neuZeichnend((z) => sondertilgungen(fin, () => { z(); obenNeu(); })));
    inner.append(planBox);
    inner.append(neuZeichnend((z) => dokumenteKarte('finanzierung', fin.id, z)));
    inner.append(abschnitt('Notizen', null, textBereich(null, fin, 'notizen', {
      zeilen: 4, platzhalter: 'Vereinbarungen, Ansprechpartner, Bereitstellungszinsen …',
      protokollLabel: 'Notizen', bezug: fin.id,
    })));
    inner.append(protokollKarte(fin.id));
  },
};

function neuZeichnend(bauen) {
  const wrap = el('div');
  const zeichne = () => { leeren(wrap); wrap.append(bauen(zeichne)); };
  zeichne();
  return wrap;
}

/* ---------- Kopf & Kennzahlen ---------- */

function kopf(fin) {
  const o = objektMit(fin.objektId);
  const art = DARLEHENSARTEN.find((a) => a.wert === fin.art)?.text || fin.art;

  return el('div.detail-kopf', {}, [
    el('div', { style: 'min-width:0;flex:1' }, [
      el('a.zurueck', { href: '#/finanzierungen' }, ['← Finanzierungen']),
      el('h2', { text: fin.bank || 'Ohne Bank', style: 'font-size:20px;margin-top:4px' }),
      o
        ? el('a.faint', { href: '#/objekt?id=' + o.id, style: 'display:inline-block;margin-top:3px;text-decoration:none', text: o.bezeichnung })
        : el('div.faint', { text: 'Keinem Objekt zugeordnet' }),
      el('div.obj-badges', { style: 'margin-top:9px' }, [
        el('span.badge', { text: art }),
        fin.mitTilgungsersatz ? el('span.badge.blau', { text: 'Tilgungsersatz' }) : null,
        fin.darlehensnummer ? el('span.badge', { text: 'Nr. ' + fin.darlehensnummer }) : null,
        el('span.badge', { text: 'ausgezahlt ' + datum(fin.auszahlung) }),
        fin.zinsbindungBis
          ? el('span.badge' + (fin.zinsbindungBis < heuteISO() ? '.gelb' : ''), { text: 'Bindung bis ' + datum(fin.zinsbindungBis) })
          : el('span.badge', { text: 'ohne Zinsbindung' }),
      ]),
    ]),
    el('button.btn.btn-danger.btn-sm', { type: 'button', onclick: () => loeschen(fin) }, ['Darlehen löschen']),
  ]);
}

function kennzahlen(fin) {
  const k = finanzierungKennzahlen(fin);
  const o = objektMit(fin.objektId);
  const wert = o ? verkehrswert(o) : 0;
  const fortschritt = fin.betrag ? k.getilgt / fin.betrag * 100 : 0;

  const kachel = (label, wert2, sub, extra) => el('div.kpi', {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert2 }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
    extra || null,
  ]);

  return el('div.grid.grid-kpi', {}, [
    kachel('Rate / Monat', k.rateAktuell ? eur(k.rateAktuell) : '–', eur(k.rateAktuell * 12, 0) + ' pro Jahr'),
    kachel('Restschuld heute', eur(k.restschuld, 0), `${num(fortschritt, 1)} % getilgt`, balken(fortschritt)),
    kachel('Restschuld bei Bindungsende',
      k.restschuldZinsbindung != null ? eur(k.restschuldZinsbindung, 0) : '–',
      fin.zinsbindungBis ? datum(fin.zinsbindungBis) : 'keine Zinsbindung'),
    kachel('Volltilgung', k.volltilgung ? datum(k.volltilgung) : 'nicht erreicht',
      k.volltilgung ? `Laufzeit ${num(k.laufzeitJahre, 1)} Jahre` : 'innerhalb von 60 Jahren'),
    kachel('Zinsen gesamt', eur(k.zinsenGesamt, 0), `davon ${eur(k.zinsenGezahlt, 0)} bereits gezahlt`),
    kachel('Beleihungsauslauf', wert ? num(k.restschuld / wert * 100, 1) + ' %' : '–',
      wert ? 'Restschuld / Verkehrswert' : 'kein Verkehrswert erfasst'),
    ...(k.plan.mitErsatz ? [
      kachel('Ansparguthaben heute', eur(ersatzGuthabenZu(k.plan, heuteISO()), 0),
        `${eur(ersatzEingezahltBis(k.plan, heuteISO()), 0)} eingezahlt`),
      kachel('Guthaben bei Ablauf', eur(k.plan.ersatzGuthabenEnde, 0),
        `${eur(k.plan.ersatzEingezahltGesamt, 0)} eingezahlt · `
        + `${eur(k.plan.ersatzGuthabenEnde - k.plan.ersatzEingezahltGesamt, 0)} Zinsertrag`),
      kachel('Deckung der Restschuld',
        fin.betrag ? num(k.plan.ersatzGuthabenEnde / fin.betrag * 100, 1) + ' %' : '–',
        k.plan.ersatzGuthabenEnde >= fin.betrag
          ? 'Guthaben deckt die Restschuld'
          : `es fehlen ${eur(fin.betrag - k.plan.ersatzGuthabenEnde, 0)}`),
    ] : []),
  ]);
}

/* ---------- Konditionen ---------- */

function konditionen(fin, neuRechnen, neuAufbauen) {
  const objekte = state.daten.objekte.map((o) => ({ wert: o.id, text: o.bezeichnung || 'Ohne Bezeichnung' }));
  const e = state.daten.einstellungen;
  const ohneTilgung = fin.mitTilgungsersatz || fin.art === 'endfaellig';

  /* Was der Tilgungsstart konkret bedeutet – wird nachgezogen statt neu
     aufgebaut, sonst verschwände das Datumsfeld beim Tippen unter dem Cursor. */
  const tilgungHinweis = el('div');
  const tilgungHinweisNeu = () => {
    leeren(tilgungHinweis);
    if (!fin.tilgungStart || ohneTilgung) return;
    const plan = finanzierungKennzahlen(fin).plan;
    if (!plan.monate.length) return;

    const abMonat = String(fin.tilgungStart).slice(0, 7);
    const frei = plan.monate.filter((m) => m.datum.slice(0, 7) < abMonat);
    const erste = plan.monate.find((m) => m.datum.slice(0, 7) >= abMonat);

    if (!frei.length) {
      tilgungHinweis.append(hinweis(
        'Der Tilgungsstart liegt nicht nach der ersten Rate – es wird von Anfang an getilgt.'
      ));
      return;
    }
    if (!erste) {
      tilgungHinweis.append(hinweis(
        '<strong>Der Tilgungsstart liegt hinter dem Ende der Laufzeit.</strong> Das Darlehen wird '
        + 'in diesem Plan nie getilgt – bitte das Datum prüfen.'
      ));
      return;
    }

    const jahre = frei.length / 12;
    tilgungHinweis.append(hinweis(
      `<strong>${frei.length} tilgungsfreie Raten</strong> (${num(jahre, jahre % 1 ? 1 : 0)} Jahre), `
      + `von ${datum(frei[0].datum)} bis ${datum(frei.at(-1).datum)}. `
      + `In dieser Zeit werden nur Zinsen gezahlt: <strong>${eur(frei[0].rate)}</strong> statt `
      + `${eur(erste.rate)} pro Monat – das entlastet den Cashflow um ${eur(erste.rate - frei[0].rate)} monatlich. `
      + `Die Restschuld bleibt bis dahin bei ${eur(erste.restschuldAnfang, 0)}, die Laufzeit verlängert sich entsprechend.`
    ));
  };

  // Abgeleitete Anzeige, die sich ohne Neuaufbau der Karte aktualisiert
  const einzahlungWert = el('div.readonly');
  const einzahlungNeu = () => {
    einzahlungWert.textContent = eur((fin.betrag || 0) * (fin.tilgungsersatzProzent || 0) / 100 / 12);
  };
  einzahlungNeu();
  const wertGeaendert = () => { einzahlungNeu(); neuRechnen(); };

  const felder = [
    auswahlFeld('Objekt', fin, 'objektId', objekte, { nach: neuRechnen }),
    textFeld('Bank', fin, 'bank', { nach: neuRechnen }),
    textFeld('Darlehensnummer', fin, 'darlehensnummer', { nach: neuRechnen }),
    auswahlFeld('Darlehensart', fin, 'art', DARLEHENSARTEN, { nach: neuAufbauen }),
    zahlFeld('Darlehensbetrag', fin, 'betrag', { suffix: '€', nach: wertGeaendert }),
    datumFeld('Auszahlung', fin, 'auszahlung', { hint: 'erste Rate im Folgemonat', nach: neuRechnen }),
    zahlFeld('Sollzins p. a.', fin, 'sollzins', { suffix: '%', nach: neuRechnen }),
    zahlFeld('Anfängliche Tilgung', fin, 'tilgungAnfang', {
      suffix: '%', nach: neuRechnen,
      hint: fin.mitTilgungsersatz ? 'bei Tilgungsersatz ohne Wirkung'
        : fin.art === 'endfaellig' ? 'bei endfälligen Darlehen ohne Wirkung'
        : fin.tilgungStart ? 'greift ab dem Tilgungsstart' : '',
    }),
    datumFeld('Tilgungsstart', fin, 'tilgungStart', {
      nach: () => { tilgungHinweisNeu(); neuRechnen(); },
      hint: ohneTilgung ? 'ohne Wirkung, dieses Darlehen tilgt nicht' : 'leer = Tilgung ab der ersten Rate',
    }),
    datumFeld('Zinsbindung bis', fin, 'zinsbindungBis', { nach: () => { hinweisNeu(); neuRechnen(); } }),
    zahlFeld('Anschlusszins', fin, 'anschlusszins', {
      suffix: '%', nach: neuRechnen,
      hint: `leer = Portfolio-Vorgabe (${num(e.anschlusszins, 2)} %)`,
    }),
  ];

  felder.push(zahlFeld('Sondertilgungsrecht', fin, 'sondertilgungMaxProzent', {
    suffix: '%', nachkomma: 1, hint: 'pro Jahr, vom Darlehensbetrag', nach: neuRechnen,
  }));

  /* Tilgungsersatz als Option zum bestehenden Darlehen */
  const ersatzSchalter = schalterFeld('Tilgungsersatz statt Tilgung', fin, 'mitTilgungsersatz', {
    nach: neuAufbauen,
    hint: 'Das Darlehen wird nicht getilgt; stattdessen wird auf ein verzinstes Konto gespart.',
  });

  const ersatzFelder = fin.mitTilgungsersatz
    ? felderGitter([
        zahlFeld('Tilgungsersatz p. a.', fin, 'tilgungsersatzProzent', {
          suffix: '%', nachkomma: 2, nach: wertGeaendert,
          hint: 'vom Darlehensbetrag, monatlich aufs Ansparkonto',
        }),
        zahlFeld('Verzinsung des Guthabens', fin, 'tilgungsersatzZins', {
          suffix: '%', nachkomma: 2, nach: neuRechnen, hint: 'p. a., monatlich verzinst',
        }),
        el('div.field', {}, [
          el('label', { text: 'Einzahlung pro Monat' }),
          einzahlungWert,
          el('div.hint', { text: 'zusätzlich zur Zinsrate' }),
        ]),
      ])
    : null;

  const ersatzHinweis = fin.mitTilgungsersatz
    ? hinweis('Das Darlehen wird <strong>nicht getilgt</strong> – die Restschuld und damit die Zinslast '
      + 'bleiben über die gesamte Laufzeit konstant. Stattdessen fließt der Tilgungsersatz monatlich auf ein '
      + 'verzinstes Konto. Die Einzahlungen mindern den Cashflow wie eine Tilgung, sind aber ebenso wenig '
      + 'steuerlich abzugsfähig. Das Guthaben wird getrennt ausgewiesen, es fließt nicht in die Restschuld ein.')
    : null;

  /* Der Hinweis hängt am Datum, wird aber nachgezogen statt neu aufgebaut –
     sonst verschwände das Datumsfeld beim Tippen unter dem Cursor. */
  const anschlussHinweis = el('div');
  const hinweisNeu = () => {
    leeren(anschlussHinweis);
    if (!fin.zinsbindungBis || fin.mitTilgungsersatz) return;
    anschlussHinweis.append(hinweis(
      'Nach Ablauf der Zinsbindung rechnet die App mit dem Anschlusszins weiter und behält '
      + '<strong>die bisherige Monatsrate bei</strong> – der Tilgungsanteil verändert sich entsprechend. '
      + `Sinkt die Tilgung dadurch unter <strong>${num(MINDEST_TILGUNG, 0)} % der Restschuld</strong>, `
      + 'wird die Rate auf Zins + Mindesttilgung angehoben; ohne das käme die Tilgung bei einem '
      + 'kräftigen Zinssprung fast zum Erliegen.'));
  };
  hinweisNeu();
  tilgungHinweisNeu();

  return abschnitt('Konditionen', 'Grundlage der Tilgungsrechnung', [
    anschlussHinweis,
    felderGitter(felder),
    tilgungHinweis,
    el('div', { style: 'margin-top:6px;padding-top:14px;border-top:1px solid var(--border)' }, [
      ersatzSchalter,
    ]),
    ersatzHinweis,
    ersatzFelder,
  ]);
}

/* ---------- Sondertilgungen ---------- */

function sondertilgungen(fin, neuZeichnen) {
  const liste = [...(fin.sondertilgungen || [])].sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
  const summe = liste.reduce((s, x) => s + (x.betrag || 0), 0);
  const verstoss = sondertilgungPruefen(fin);

  const eingabeOpt = { umbauen: neuZeichnen };
  const zeilen = liste.map((s) => el('tr', {}, [
    el('td', { style: 'width:160px' }, [tabellenDatum(s, 'datum', eingabeOpt)]),
    el('td', { style: 'width:160px' }, [tabellenZahl(s, 'betrag', eingabeOpt)]),
    el('td', {}, [tabellenText(s, 'notiz', { platzhalter: 'Notiz' })]),
    el('td', { style: 'width:40px' }, [el('button.icon-mini', {
      type: 'button', title: 'Entfernen', html: '&times;',
      onclick: () => { aendern(() => { fin.sondertilgungen = fin.sondertilgungen.filter((x) => x !== s); }); neuZeichnen(); },
    })]),
  ]));

  const inhalt = liste.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Datum' }),
          el('th', { style: 'text-align:right', text: 'Betrag (€)' }),
          el('th', { text: 'Notiz' }), el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: 'Summe', style: 'font-weight:600' }),
          el('td.num', { text: eur(summe), style: 'font-weight:600' }),
          el('td', {}), el('td', {}),
        ])]),
      ])
    : el('div.faint', { text: 'Keine Sondertilgungen erfasst.', style: 'font-size:13px' });

  const warnung = verstoss.length
    ? el('div.note', { style: 'margin-top:14px;background:var(--warn-soft);border-color:color-mix(in srgb, var(--warn) 30%, transparent)' }, [
        el('div.note-icon', { style: 'color:var(--warn)', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' }),
        el('div', {
          html: verstoss.map((v) => `<strong>${v.jahr}:</strong> ${eur(v.betrag, 0)} Sondertilgung überschreiten das vereinbarte Recht von ${eur(v.max, 0)} pro Jahr.`).join('<br>'),
        }),
      ])
    : null;

  return abschnitt('Sondertilgungen', 'werden im Tilgungsplan im jeweiligen Monat verrechnet', [
    inhalt,
    warnung,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => {
        aendern(() => {
          fin.sondertilgungen = [...(fin.sondertilgungen || []), { id: uid('st'), datum: heuteISO(), betrag: null, notiz: '' }];
        });
        neuZeichnen();
      },
    }, ['+ Sondertilgung']),
  ]);
}

/* ---------- Tilgungsplan ---------- */

function tilgungsplanKarte(fin, neuZeichnen) {
  const { plan } = finanzierungKennzahlen(fin);

  if (!plan.monate.length) {
    return abschnitt('Tilgungsplan', null, [
      el('div.faint', { text: 'Für den Tilgungsplan werden Darlehensbetrag, Auszahlungsdatum und Sollzins benötigt.', style: 'font-size:13px' }),
    ]);
  }

  const umschalter = el('div.seg.seg-sm', {}, [
    el('button' + (planAnsicht === 'jahre' ? '.aktiv' : ''), {
      type: 'button', text: 'Jahre',
      onclick: () => { planAnsicht = 'jahre'; if (neuZeichnen) neuZeichnen(); },
    }),
    el('button' + (planAnsicht === 'monate' ? '.aktiv' : ''), {
      type: 'button', text: 'Monate',
      onclick: () => { planAnsicht = 'monate'; if (neuZeichnen) neuZeichnen(); },
    }),
  ]);

  const heute = heuteISO();
  const ersatz = plan.mitErsatz;

  /* Monate vor dem Tilgungsstart werden gekennzeichnet – dort steht in der
     Tilgungsspalte eine Null, und das soll erklärt sein statt zu verwundern. */
  const abMonat = (!ersatz && fin.art !== 'endfaellig' && fin.tilgungStart)
    ? String(fin.tilgungStart).slice(0, 7) : null;
  const tilgungsfrei = (m) => abMonat && m.datum.slice(0, 7) < abMonat;
  const freieRaten = abMonat ? plan.monate.filter(tilgungsfrei).length : 0;

  const zeilen = planAnsicht === 'jahre'
    ? plan.jahre.map((j) => el('tr' + (j.jahr === Number(heute.slice(0, 4)) ? '.zeile-aktiv' : ''), {}, [
        el('td', { text: String(j.jahr) }),
        el('td.num', { text: num(j.zinssatz, 2) + ' %' }),
        el('td.num', { text: eur(j.rate, 0) }),
        el('td.num', { text: eur(j.zins, 0) }),
        el('td.num', { text: eur(j.tilgung, 0) }),
        el('td.num', { text: j.sondertilgung ? eur(j.sondertilgung, 0) : '–' }),
        ersatz ? el('td.num', { text: eur(j.tilgungsersatz, 0) }) : null,
        ersatz ? el('td.num', { text: eur(j.ersatzGuthaben, 0) }) : null,
        el('td.num', { text: eur(j.restschuldEnde, 0) }),
      ].filter(Boolean)))
    : plan.monate.map((m) => el('tr' + (m.datum.slice(0, 7) === heute.slice(0, 7) ? '.zeile-aktiv' : ''), {}, [
        el('td', { style: 'white-space:nowrap' }, [
          datum(m.datum).slice(3),
          tilgungsfrei(m) ? el('span.badge.blau', { text: 'tilgungsfrei', style: 'margin-left:6px' }) : null,
        ]),
        el('td.num', { text: num(m.zinssatz, 2) + ' %' }),
        el('td.num', { text: eur(m.rate) }),
        el('td.num', { text: eur(m.zins) }),
        el('td.num', { text: eur(m.tilgung) }),
        el('td.num', { text: m.sondertilgung ? eur(m.sondertilgung, 0) : '–' }),
        ersatz ? el('td.num', { text: eur(m.tilgungsersatz) }) : null,
        ersatz ? el('td.num', { text: eur(m.ersatzGuthaben, 0) }) : null,
        el('td.num', { text: eur(m.restschuldEnde, 0) }),
      ].filter(Boolean)));

  const summeRate = plan.monate.reduce((s, m) => s + m.rate, 0);
  const summeSonder = plan.monate.reduce((s, m) => s + m.sondertilgung, 0);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Tilgungsplan' }),
        el('div.sub', {
          text: `${plan.monate.length} Raten · ${num(plan.laufzeitMonate / 12, 1)} Jahre`
            + (freieRaten ? ` · davon ${freieRaten} tilgungsfrei` : '')
            + (plan.volltilgung ? ` · Volltilgung ${datum(plan.volltilgung)}` : ' · keine Volltilgung im Betrachtungszeitraum'),
        }),
      ]),
      umschalter,
    ]),
    el('div.plan-scroll', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: planAnsicht === 'jahre' ? 'Jahr' : 'Monat' }),
          el('th', { style: 'text-align:right', text: 'Zins %' }),
          el('th', { style: 'text-align:right', text: 'Rate' }),
          el('th', { style: 'text-align:right', text: 'Zinsanteil' }),
          el('th', { style: 'text-align:right', text: 'Tilgung' }),
          el('th', { style: 'text-align:right', text: 'Sondertilgung' }),
          ersatz ? el('th', { style: 'text-align:right', text: 'Tilgungsersatz' }) : null,
          ersatz ? el('th', { style: 'text-align:right', text: 'Guthaben' }) : null,
          el('th', { style: 'text-align:right', text: 'Restschuld' }),
        ].filter(Boolean))]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: 'Summe', style: 'font-weight:600' }),
          el('td', {}),
          el('td.num', { text: eur(summeRate, 0), style: 'font-weight:600' }),
          el('td.num', { text: eur(plan.zinsenGesamt, 0), style: 'font-weight:600' }),
          el('td.num', { text: eur(summeRate - plan.zinsenGesamt - plan.ersatzEingezahltGesamt, 0), style: 'font-weight:600' }),
          el('td.num', { text: summeSonder ? eur(summeSonder, 0) : '–', style: 'font-weight:600' }),
          ersatz ? el('td.num', { text: eur(plan.ersatzEingezahltGesamt, 0), style: 'font-weight:600' }) : null,
          ersatz ? el('td.num', { text: eur(plan.ersatzGuthabenEnde, 0), style: 'font-weight:600' }) : null,
          el('td.num', { text: eur(plan.monate.at(-1).restschuldEnde, 0) }),
        ].filter(Boolean))]),
      ]),
    ]),
  ]);
}

/* ---------- Löschen ---------- */

async function loeschen(fin) {
  const ok = await bestaetigen(
    `Darlehen „${fin.bank || 'ohne Bank'}" löschen?`,
    'Das Darlehen inklusive Sondertilgungen wird entfernt. Im Ordner „backups" liegt der Stand von heute.',
    { okText: 'Endgültig löschen', gefahr: true }
  );
  if (!ok) return;
  const dokIds = new Set(await dokumenteEntfernenFuer('finanzierung', fin.id));
  aendern((d) => {
    d.finanzierungen = d.finanzierungen.filter((x) => x.id !== fin.id);
    d.dokumente = d.dokumente.filter((x) => !dokIds.has(x.id));
    d.protokoll = d.protokoll.filter((p) => p.bezugId !== fin.id);
  });
  toast('Darlehen gelöscht', 'ok');
  location.hash = '#/finanzierungen';
}
