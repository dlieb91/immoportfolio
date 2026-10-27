/* Gemeinsamer Annahmen-Block für Forecast und Einzelobjektbetrachtung.

   Die Werte liegen in den Portfolio-Einstellungen – eine Änderung hier
   wirkt deshalb in beiden Ansichten und wird mitgespeichert.
*/

import { el, num } from '../util.js';
import { zahlFeld, felderGitter } from '../felder.js';
import { SZENARIEN, SZENARIO_DELTA, szenarioParameter } from '../forecast.js';

export const BEZEICHNUNG = {
  mietsteigerung: 'Mietsteigerung', wertsteigerung: 'Wertsteigerung',
  leerstand: 'Leerstand', anschlusszins: 'Anschlusszins',
  instandhaltungProzent: 'Instandhaltung',
};

/** Die Eingabefelder für alle Prognose-Annahmen. */
export function annahmenFelder(e, neu) {
  return [
    zahlFeld('Zeitraum', e, 'forecastJahre', { suffix: 'J.', nachkomma: 0, nach: neu }),
    zahlFeld('Mietsteigerung p. a.', e, 'mietsteigerung', { suffix: '%', nachkomma: 1, nach: neu }),
    zahlFeld('Wertsteigerung p. a.', e, 'wertsteigerung', { suffix: '%', nachkomma: 1, nach: neu }),
    zahlFeld('Instandhaltung p. a.', e, 'instandhaltungProzent', {
      suffix: '%', nachkomma: 2, nach: neu,
      hint: 'vom Kaufpreis, wenn am Objekt nichts erfasst ist',
    }),
    zahlFeld('Leerstandsquote', e, 'leerstandProzent', { suffix: '%', nachkomma: 1, nach: neu }),
    zahlFeld('Inflation p. a.', e, 'inflation', { suffix: '%', nachkomma: 1, hint: 'steigert die Kosten', nach: neu }),
    zahlFeld('Anschlusszins', e, 'anschlusszins', { suffix: '%', nachkomma: 2, hint: 'nach Ablauf der Zinsbindung', nach: neu }),
    zahlFeld('Steuersatz', e, 'steuersatz', { suffix: '%', nachkomma: 1, nach: neu }),
    zahlFeld('Verkauf nach', e, 'verkaufNachJahren', { suffix: 'J.', nachkomma: 0, hint: 'leer = kein Verkauf', nach: neu }),
    zahlFeld('Verkaufskosten', e, 'verkaufskosten', { suffix: '%', nachkomma: 1, hint: 'Makler, Notar, Vorfälligkeit', nach: neu }),
  ];
}

/** Segmentierter Umschalter zwischen den drei Szenarien. */
export function szenarioUmschalter(aktuell, setzen) {
  return el('div.seg.seg-sm', {}, SZENARIEN.map((sz) => el('button' + (aktuell === sz.id ? '.aktiv' : ''), {
    type: 'button', text: sz.name,
    onclick: () => { if (aktuell !== sz.id) setzen(sz.id); },
  })));
}

/** Zeile, die die Abweichungen des gewählten Szenarios benennt. */
export function szenarioHinweis(basis, szenario) {
  if (szenario === 'basis') return null;
  const aktiv = szenarioParameter(basis, szenario);
  const text = Object.entries(SZENARIO_DELTA[szenario])
    .map(([k, v]) => `${BEZEICHNUNG[k]} ${v > 0 ? '+' : ''}${num(v, 2)} → ${num(aktiv[k], 2)} %`)
    .join(' · ');
  return el('div.hint', { style: 'margin-top:12px' },
    [`Im Szenario „${SZENARIEN.find((s) => s.id === szenario).name}" gerechnet wird mit: ${text}`]);
}

/** Vollständige Annahmen-Karte inklusive Kopfzeile. */
export function annahmenKarte({ einstellungen, basis, szenario, setSzenario, neu, extra, sub }) {
  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Annahmen' }),
        el('div.sub', { text: sub || 'gelten für Forecast und Einzelobjektbetrachtung gleichermaßen' }),
      ]),
      el('div', { style: 'display:flex;gap:9px;align-items:center;flex-wrap:wrap' }, [
        szenarioUmschalter(szenario, setSzenario),
        ...[].concat(extra || []),
      ]),
    ]),
    el('div.card-body', {}, [
      felderGitter(annahmenFelder(einstellungen, neu), 175),
      szenarioHinweis(basis, szenario),
    ]),
  ]);
}
