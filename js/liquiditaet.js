/* Liquiditätsvorschau – Monat für Monat, was in den nächsten zwölf Monaten
   rein- und rausgeht. Reine Funktionen, keine Oberfläche.

   Der Forecast rechnet in Jahresschritten, die Klemme entsteht aber in einem
   Monat: Wenn die Grundsteuer im Februar fällig ist und die Miete erst im
   März wieder alles ausgleicht, nützt ein gutes Jahresergebnis nichts.

   Quellen sind dieselben wie bei jahresSummen() – nichts wird neu erfunden:
     - monatszahlungen(): Mieten, Vorauszahlungen, Hausgeld, Rate aus dem
       Tilgungsplan, Korrekturen
     - frei erfasste Buchungen, in dem Monat, in dem ihr Datum liegt
     - Fahrten über fahrtBetrag()

   Gerechnet wird **vor Steuern**: Eine Erstattung oder Nachzahlung kommt
   irgendwann im Jahr danach und ist hier nicht vorhergesagt.

   Die Grenze, die der Nutzer kennen muss: Posten, die als Zwölftel erfasst
   sind (`sonstigeJahr`, die Erhaltungsrücklage), erscheinen auch hier als
   Zwölftel, nicht in ihrem Fälligkeitsmonat. Wer die Grundsteuer im Februar
   sehen will, erfasst sie als Buchung mit Datum im Februar – das ist
   dieselbe Logik, nach der die App ohnehin das Zuflussprinzip führt.
*/

import { state } from './store.js';
import { monatszahlungen, wirkung, artInfo, fahrtBetrag } from './zahlungen.js';

/** Addiert Monate auf eine Periode 'YYYY-MM'. */
function periodePlus(periode, n) {
  const [j, m] = periode.split('-').map(Number);
  const z = (j * 12 + (m - 1)) + n;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, '0')}`;
}

/**
 * In welchen der vier Zeilen eine Zahlung landet. Die Einteilung folgt den
 * Gruppen des Katalogs, damit die Vorschau mit der Buchhaltung dieselbe
 * Sprache spricht.
 */
function zeileVon(art) {
  const gruppe = artInfo(art).gruppe;
  if (gruppe === 'Einnahmen') return 'einnahmen';
  if (gruppe === 'Finanzierung') return 'kapitaldienst';
  if (gruppe === 'Neutral') return 'neutral';
  return 'kosten';   // Betriebskosten, Erhaltung, sonstige Werbungskosten
}

/**
 * @param abPeriode   erster Monat der Vorschau, 'YYYY-MM' (der laufende)
 * @param monate      Länge der Vorschau
 * @param objektIds   nur diese Objekte; leer = alle
 *
 * @returns {
 *   monate:   [{ periode, jahr, monat, einnahmen, kosten, kapitaldienst, neutral,
 *                saldo, kumuliert, posten: [{ art, text, betrag }] }],
 *   summe:    { einnahmen, kosten, kapitaldienst, neutral, saldo },
 *   tiefpunkt:{ periode, kumuliert },  // der niedrigste kumulierte Stand
 *   bedarf:   Betrag, den die Objekte im ungünstigsten Moment zuschießen –
 *             0, wenn die Summe nie unter den Ausgangsstand fällt
 * }
 *
 * `kumuliert` beginnt bei null: Wie viel auf dem Konto liegt, weiß die App
 * nicht. Aussagekräftig ist deshalb der **Tiefpunkt** – so viel Reserve
 * braucht man, um die zwölf Monate ohne Zuschuss von außen zu überstehen.
 */
export function liquiditaetsvorschau(abPeriode, monate = 12, objektIds = null) {
  const objekte = (state.daten.objekte || [])
    .filter((o) => !objektIds || !objektIds.length || objektIds.includes(o.id));
  const ids = new Set(objekte.map((o) => o.id));

  const raus = [];
  let kumuliert = 0;
  const summe = { einnahmen: 0, kosten: 0, kapitaldienst: 0, neutral: 0, saldo: 0 };
  let tief = null;

  for (let i = 0; i < monate; i++) {
    const periode = periodePlus(abPeriode, i);
    const jahr = Number(periode.slice(0, 4));
    const monat = Number(periode.slice(5, 7));
    const m = { periode, jahr, monat, einnahmen: 0, kosten: 0, kapitaldienst: 0, neutral: 0 };
    const nachArt = new Map();

    const buchen = (art, betrag) => {
      if (!betrag) return;
      m[zeileVon(art)] += betrag;
      nachArt.set(art, (nachArt.get(art) || 0) + betrag);
    };

    for (const o of objekte) {
      for (const z of monatszahlungen(o, jahr, monat)) buchen(z.art, wirkung(z));
    }

    // Freie Buchungen: im Monat ihres Datums, auch wenn es in der Zukunft liegt.
    for (const b of state.daten.buchungen || []) {
      if (!ids.has(b.objektId) || !b.datum || b.datum.slice(0, 7) !== periode) continue;
      buchen(b.kategorie, (b.betrag || 0) * artInfo(b.kategorie).vorzeichen);
    }
    for (const f of state.daten.fahrten || []) {
      if (!ids.has(f.objektId) || !f.datum || f.datum.slice(0, 7) !== periode) continue;
      buchen('fahrtkosten', -fahrtBetrag(f, state.daten.einstellungen));
    }

    m.saldo = m.einnahmen + m.kosten + m.kapitaldienst + m.neutral;
    kumuliert += m.saldo;
    m.kumuliert = kumuliert;
    m.posten = [...nachArt.entries()]
      .map(([art, betrag]) => ({ art, text: artInfo(art).text, betrag }))
      .sort((a, b) => Math.abs(b.betrag) - Math.abs(a.betrag));

    for (const k of ['einnahmen', 'kosten', 'kapitaldienst', 'neutral', 'saldo']) summe[k] += m[k];
    if (!tief || kumuliert < tief.kumuliert) tief = { periode, kumuliert };
    raus.push(m);
  }

  return {
    monate: raus,
    summe,
    tiefpunkt: tief,
    bedarf: tief && tief.kumuliert < 0 ? -tief.kumuliert : 0,
  };
}
