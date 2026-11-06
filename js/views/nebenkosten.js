/* Nebenkosten: Monat für Monat, was anfällt – umlagefähig, nicht umlagefähig
   und Erhaltungsrücklage getrennt, dazu die Vorauszahlungen der Mieter.

   Die Rechnung steckt in nebenkostenplan.js, die Positionen werden am Objekt
   in der Karte „Laufende Kosten“ gepflegt. Diese Ansicht liest nur.
*/

import { el, leeren, eur, istHandy, druckKnopf } from '../util.js';
import { state, objekt as objektMit } from '../store.js';
import { hinweis } from '../felder.js';
import { kostenplan, doppelteErfassung } from '../nebenkostenplan.js';
import { laufenderMonat } from '../zahlungen.js';

const MONAT_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONAT_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const GRUPPEN = [
  { key: 'umlage', text: 'Umlagefähig', unter: 'zahlen die Mieter über die Vorauszahlung' },
  { key: 'nichtUmlage', text: 'Nicht umlagefähig', unter: 'trägt der Vermieter · Werbungskosten' },
  { key: 'ruecklage', text: 'Erhaltungsrücklage', unter: 'steuerlich erst bei Verausgabung' },
];

/* Sicht gehört in den localStorage: Objekt, Jahr und Handy-Monat */
const SICHT_KEY = 'immo-nebenkosten-sicht';
function sichtLesen() {
  try { return JSON.parse(localStorage.getItem(SICHT_KEY) || '{}'); } catch { return {}; }
}
function sichtSchreiben(s) { localStorage.setItem(SICHT_KEY, JSON.stringify(s)); }

export const nebenkosten = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    if (!state.daten.objekte.length) {
      inner.append(el('div.card', {}, [el('div.empty', {}, [
        el('div.empty-icon', { text: '🧾' }),
        el('h3', { text: 'Noch kein Objekt' }),
        el('p', { text: 'Die Nebenkosten werden je Objekt erfasst.' }),
        el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
      ])]));
      return;
    }

    const sicht = sichtLesen();
    // Aufruf aus der Objektkarte: ?objekt=…
    const ausLink = new URLSearchParams(location.hash.split('?')[1] || '').get('objekt');
    if (ausLink && objektMit(ausLink)) { sicht.objekt = ausLink; sichtSchreiben(sicht); }
    if (sicht.objekt && !objektMit(sicht.objekt)) sicht.objekt = '';
    const jetzt = new Date().getFullYear();
    const jahr = sicht.jahr || jetzt;
    const neu = (aenderung) => { sichtSchreiben({ ...sicht, ...aenderung }); leeren(container); this.render(container); };

    const ids = sicht.objekt ? [sicht.objekt] : null;
    const plan = kostenplan(ids, jahr, !sicht.objekt);
    const doppelt = doppelteErfassung(ids, jahr);

    inner.append(kopf(sicht, jahr, jetzt, neu, plan));

    if (!plan.positionenAnzahl) {
      inner.append(el('div.card', {}, [el('div.empty', {}, [
        el('div.empty-icon', { text: '🧾' }),
        el('h3', { text: 'Noch keine Kosten erfasst' }),
        el('p', { text: 'Die Positionen legst du am Objekt in der Karte „Laufende Kosten“ an.' }),
        sicht.objekt ? el('a.btn.btn-primary', { href: '#/objekt?id=' + sicht.objekt }, ['Zum Objekt']) : null,
      ])]));
      return;
    }

    inner.append(kacheln(plan));
    if (plan.sammelposten) {
      inner.append(hinweis(`<strong>${plan.sammelposten} Sammelposten</strong> aus der früheren Erfassung – sie fassen mehrere `
        + 'Kostenarten zusammen. Teile sie am Objekt anhand des Wirtschaftsplans auf, dann stehen die Kostenarten hier einzeln.'));
    }
    if (doppelt.length) {
      inner.append(hinweis('<strong>Möglicherweise doppelt erfasst:</strong> '
        + doppelt.map((d) => `${d.text} bei „${d.objekt}“ als Position und als ${d.anzahl} Buchung${d.anzahl > 1 ? 'en' : ''}`).join('; ')
        + `. Beides zählt in Cashflow und Steuer ${jahr}. Lösche entweder die Buchungen oder die Position.`, 'warn'));
    }
    inner.append(istHandy() ? monatsKarte(plan, sicht, neu) : tabellenKarte(plan, sicht));
    inner.append(el('div.hint', { html:
      'Die Übersicht zeigt den <strong>Plan</strong> aus den Positionen, jede im Monat ihrer Fälligkeit und nur, solange das '
      + 'Objekt im Bestand ist. Korrigierst du einen Monat in der Buchhaltung, ändert das die Buchhaltung, nicht diese Übersicht. '
      + 'Die Vorauszahlungen kommen aus den Mietverträgen, mit Leerstand und Korrekturen. '
      + '<strong>Steuer:</strong> Umlagefähige und nicht umlagefähige Kosten sind Werbungskosten im Jahr der Zahlung, '
      + 'die Vorauszahlungen Einnahmen. Die Erhaltungsrücklage wird erst abziehbar, wenn die Gemeinschaft das Geld ausgibt (BFH IX R 19/24).' }));
  },
};

function kopf(sicht, jahr, jetzt, neu, plan) {
  const objekte = [{ wert: '', text: 'Alle Objekte' },
    ...state.daten.objekte.map((o) => ({ wert: o.id, text: o.bezeichnung || 'Ohne Bezeichnung' }))];
  const objSel = el('select', { style: 'width:auto;max-width:100%', onchange: (e) => neu({ objekt: e.target.value }) },
    objekte.map((o) => el('option', { value: o.wert, selected: (sicht.objekt || '') === o.wert }, [o.text])));
  const jahre = [];
  for (let j = jetzt + 1; j >= jetzt - 5; j--) jahre.push(j);
  const jahrSel = el('select', { style: 'width:auto', onchange: (e) => neu({ jahr: Number(e.target.value) }) },
    jahre.map((j) => el('option', { value: String(j), selected: jahr === j }, [String(j)])));
  const feld = (label, eingabe) => el('div', { style: 'display:flex;flex-direction:column;gap:5px;min-width:0' }, [
    el('label.faint', { text: label, style: 'font-size:12px' }), eingabe,
  ]);
  const name = sicht.objekt ? (objektMit(sicht.objekt)?.bezeichnung || 'Objekt') : 'Alle Objekte';
  return el('div.card', {}, [
    el('div.card-body', { style: 'display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap' }, [
      feld('Objekt', objSel), feld('Jahr', jahrSel),
      el('span', { style: 'flex:1' }),
      sicht.objekt ? el('a.btn.btn-sm', { href: '#/objekt?id=' + sicht.objekt }, ['Positionen bearbeiten']) : null,
      plan.positionenAnzahl ? druckKnopf(`Nebenkosten ${jahr}`, () => `${state.daten.meta.name} · ${name}`, { quer: true }) : null,
    ]),
  ]);
}

function kacheln(plan) {
  const s = plan.summen;
  const monate = Math.max(1, plan.monateImBestand);
  const k = (label, wert, sub, klasse) => el('div.kpi' + (klasse ? '.' + klasse : ''), {}, [
    el('div.kpi-label', { text: label }), el('div.kpi-value', { text: wert }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
  ]);
  return el('div.grid.grid-kpi', {}, [
    k('Ø pro Monat', eur(s.gesamt / monate, 0), `${eur(s.gesamt, 0)} im Jahr · Hausgeld ${eur(s.hausgeld / monate, 0)} / Monat`),
    k('Umlagefähig', eur(s.umlage / monate, 0), `${eur(s.umlage, 0)} im Jahr · zahlen die Mieter`),
    k('Nicht umlagefähig', eur(s.nichtUmlage / monate, 0), `${eur(s.nichtUmlage, 0)} im Jahr · trägt der Vermieter`),
    k('Erhaltungsrücklage', eur(s.ruecklage / monate, 0), `${eur(s.ruecklage, 0)} im Jahr`),
    k('Deckung durch Vorauszahlungen', (s.deckung > 0 ? '+' : '') + eur(s.deckung, 0),
      s.deckung < -0.5 ? 'voraussichtliche Nachzahlung der Mieter'
        : s.deckung > 0.5 ? 'voraussichtliche Erstattung an die Mieter' : 'Vorauszahlungen decken die Kosten',
      s.deckung >= 0 ? 'pos' : 'neg'),
  ]);
}

/* ---------- Tabelle über zwölf Monate (Rechner, iPad) ---------- */

function tabellenKarte(plan, sicht) {
  const laufend = laufenderMonat();
  const istLaufend = (m) => laufend === `${plan.jahr}-${String(m + 1).padStart(2, '0')}`;
  const fest = 'position:sticky;left:0;background:var(--surface);z-index:1;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis;';
  const zelle = (wert, i, stil = '') => el('td.num', {
    text: plan.monateBestand[i] ? (wert ? eur(wert, 0) : '–') : '',
    style: stil + (istLaufend(i) ? 'background:var(--accent-soft);' : ''),
  });
  const zeile = (label, werte, opt = {}) => {
    const jahr = werte.reduce((a, b) => a + b, 0);
    const stil = (opt.fett ? 'font-weight:600;' : '') + (opt.farbe ? '' : '');
    return el('tr', { style: opt.trenner ? 'border-top:2px solid var(--border)' : '' }, [
      el('td', { style: fest + stil + (opt.einzug ? 'padding-left:22px;' : ''), title: opt.titel || label }, [
        label, opt.zusatz ? el('span.faint', { text: ' ' + opt.zusatz, style: 'font-size:11.5px' }) : null,
      ]),
      ...werte.map((w, i) => zelle(w, i, stil + (opt.farbe && w ? (w >= 0 ? 'color:var(--pos);' : 'color:var(--neg);') : ''))),
      el('td.num', { text: eur(jahr, 0), style: 'font-weight:600;' + (opt.farbe ? (jahr >= 0 ? 'color:var(--pos);' : 'color:var(--neg);') : '') }),
      el('td.num', { text: eur(jahr / Math.max(1, plan.monateImBestand), 0), style: 'color:var(--text-dim)' }),
    ]);
  };

  const koerper = [];
  for (const g of GRUPPEN) {
    const zeilen = plan.zeilen.filter((z) => z.gruppe === g.key);
    if (!zeilen.length) continue;
    koerper.push(el('tr', {}, [el('td', {
      colspan: 15, style: fest + 'font-weight:600;padding-top:14px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-faint)',
    }, [g.text, el('span', { text: ' · ' + g.unter, style: 'text-transform:none;letter-spacing:0;font-weight:400' })])]));
    for (const z of zeilen) {
      const zusatz = [
        !sicht.objekt && z.anzahl > 1 ? `${z.anzahl}×` : null,
        z.imHausgeld && sicht.objekt ? 'Hausgeld' : null,
        !z.abziehbar ? 'nicht abziehbar' : null,
      ].filter(Boolean).join(' · ');
      const objekt = sicht.objekt || !z.objektId ? '' : ` (${objektMit(z.objektId)?.bezeichnung || ''})`;
      koerper.push(zeile(z.text + objekt, z.monate, { einzug: true, zusatz }));
    }
    koerper.push(zeile('Summe ' + (g.key === 'ruecklage' ? g.text : g.text.toLowerCase()), plan.gruppen[g.key], { fett: true }));
  }
  koerper.push(zeile('Gesamt', plan.gesamt, { fett: true, trenner: true }));
  if (plan.summen.hausgeld) koerper.push(zeile('davon über das Hausgeld', plan.hausgeld, { einzug: true }));
  koerper.push(zeile('Vorauszahlungen der Mieter', plan.vorauszahlung, { trenner: true }));
  koerper.push(zeile('Deckung umlagefähiger Kosten', plan.deckung, { fett: true, farbe: true, titel: 'Vorauszahlungen minus umlagefähige Kosten' }));

  return el('div.card', {}, [
    el('div.card-head', {}, [el('div', {}, [
      el('h2', { text: `Nebenkosten ${plan.jahr} – Monat für Monat` }),
      el('div.sub', { text: 'jede Position im Monat ihrer Fälligkeit' }),
    ])]),
    // Keine Höhengrenze: Die Tabelle ist die Ansicht, nicht ein Teil davon
    el('div.plan-scroll', { style: 'max-height:none' }, [el('table.data.kompakt', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: '', style: fest + 'z-index:3;' }),
        ...MONAT_KURZ.map((m, i) => el('th', { text: m, style: 'text-align:right' + (istLaufend(i) ? ';color:var(--accent)' : '') })),
        el('th', { text: 'Jahr', style: 'text-align:right' }),
        el('th', { text: 'Ø Monat', style: 'text-align:right' }),
      ])]),
      el('tbody', {}, koerper),
    ])]),
  ]);
}

/* ---------- Handy: ein Monat als Liste ---------- */

function monatsKarte(plan, sicht, neu) {
  const laufend = laufenderMonat();
  let monat = sicht.monat;
  if (!monat) monat = laufend.startsWith(String(plan.jahr)) ? Number(laufend.slice(5, 7)) : 1;
  const i = monat - 1;
  const wechsel = (d) => neu({ monat: ((monat - 1 + d + 12) % 12) + 1 });

  const posten = (text, wert, opt = {}) => el('div', {
    style: 'display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);'
      + (opt.fett ? 'font-weight:600;' : '') + (opt.einzug ? 'padding-left:10px;' : ''),
  }, [
    el('span', { style: 'min-width:0' }, [text, opt.zusatz ? el('div.faint', { text: opt.zusatz, style: 'font-size:12px;font-weight:400' }) : null]),
    el('span.num', { text: eur(wert, 0), style: opt.farbe ? (wert >= 0 ? 'color:var(--pos)' : 'color:var(--neg)') : '' }),
  ]);

  const inhalt = [];
  if (!plan.monateBestand[i]) {
    inhalt.push(el('div.faint', { text: 'In diesem Monat war kein Objekt im Bestand.', style: 'padding:12px 0' }));
  } else {
    for (const g of GRUPPEN) {
      const zeilen = plan.zeilen.filter((z) => z.gruppe === g.key && z.monate[i]);
      if (!zeilen.length) continue;
      inhalt.push(el('div', { text: g.text, style: 'margin-top:14px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-faint);font-weight:600' }));
      for (const z of zeilen) {
        const objekt = sicht.objekt || !z.objektId ? '' : objektMit(z.objektId)?.bezeichnung;
        inhalt.push(posten(z.text, z.monate[i], { einzug: true, zusatz: [objekt, z.imHausgeld && sicht.objekt ? 'im Hausgeld' : null].filter(Boolean).join(' · ') }));
      }
      inhalt.push(posten('Summe', plan.gruppen[g.key][i], { fett: true }));
    }
    inhalt.push(el('div', { style: 'height:10px' }));
    inhalt.push(posten('Gesamt', plan.gesamt[i], { fett: true }));
    inhalt.push(posten('Vorauszahlungen der Mieter', plan.vorauszahlung[i]));
    inhalt.push(posten('Deckung umlagefähiger Kosten', plan.deckung[i], { fett: true, farbe: true }));
  }

  const knopf = (text, d, titel) => el('button.btn.btn-sm', { type: 'button', title: titel, style: 'min-width:44px', onclick: () => wechsel(d) }, [text]);
  return el('div.card', {}, [
    el('div.card-head', {}, [
      knopf('‹', -1, 'Vormonat'),
      // Kein h2: Die Monatskarte soll am Handy nicht einklappbar sein (kartenKlappen)
      el('div.monat-titel', { text: `${MONAT_LANG[i]} ${plan.jahr}`, style: 'flex:1;text-align:center;font-weight:600;font-size:16px' }),
      knopf('›', 1, 'Folgemonat'),
    ]),
    el('div.card-body', {}, inhalt),
  ]);
}
