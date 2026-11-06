/* Nebenkosten-Übersicht: Monat für Monat, was anfällt.

   Die Kosten kommen aus den Positionen (betriebskosten.js), jede im Monat
   ihrer Fälligkeit und nur in Monaten, in denen das Objekt im Bestand ist –
   dieselbe Grenze wie in monatszahlungen(). Das ist der **Plan**: Wer einen
   einzelnen Monat in der Buchhaltung korrigiert, ändert die Buchhaltung,
   nicht diese Übersicht.

   Die Vorauszahlungen der Mieter kommen dagegen aus der Zahlungsebene, mit
   Leerstand und Korrekturen. Deckung = Vorauszahlung − umlagefähige Kosten:
   negativ heißt, der Vermieter streckt vor und fordert mit der Abrechnung nach.

   Reines Rechenmodul ohne DOM.
*/

import { state, objekt as objektMit, besitzMonate } from './store.js';
import { monatszahlungen, KATEGORIEN } from './zahlungen.js';
import {
  positionen, betragImMonat, gruppeVon, kostenart, positionName, zahlungsart, giltImJahr,
} from './betriebskosten.js';

const leer = () => new Array(12).fill(0);
const periode = (jahr, monat) => `${jahr}-${String(monat).padStart(2, '0')}`;

/** Wie in monatszahlungen(): im Bestand ab dem Kaufmonat. */
export function imBestand(o, jahr, monat) {
  return besitzMonate(o, jahr) > 0 && (!o.kaufdatum || periode(jahr, monat) >= o.kaufdatum.slice(0, 7));
}

/** Steuerlich abziehbar im Jahr der Zahlung? Über die Zahlungsart. */
export function abziehbar(pos) {
  const art = zahlungsart(pos);
  return !!KATEGORIEN.find((k) => k.key === art)?.steuerlich;
}

/**
 * @param objektIds  Liste der Objekte, null = alle
 * @param jahr       Kalenderjahr
 * @param zusammenfassen  true: Zeilen je Kostenart über alle Objekte,
 *                         false: eine Zeile je Position
 */
export function kostenplan(objektIds, jahr, zusammenfassen = false) {
  const objekte = (objektIds ? objektIds.map(objektMit) : state.daten.objekte).filter(Boolean);
  const zeilen = new Map();
  const gruppen = { umlage: leer(), nichtUmlage: leer(), ruecklage: leer() };
  const gesamt = leer(), hausgeld = leer(), vorauszahlung = leer();
  let sammelposten = 0, positionenAnzahl = 0;

  for (const o of objekte) {
    for (const pos of positionen(o)) {
      if (!giltImJahr(pos, jahr)) continue;
      positionenAnzahl++;
      if (kostenart(pos.art).sammel && pos.betrag) sammelposten++;
      const gruppe = gruppeVon(pos);
      // Stände derselben Position (kette) bilden eine Zeile
      const key = zusammenfassen ? `${gruppe}|${pos.art}` : (pos.kette || pos.id);
      let z = zeilen.get(key);
      if (!z) {
        z = {
          key, gruppe, art: pos.art,
          text: zusammenfassen ? kostenart(pos.art).text : positionName(pos),
          objektId: zusammenfassen ? null : o.id,
          imHausgeld: !!pos.imHausgeld, abziehbar: abziehbar(pos),
          monate: leer(), jahr: 0, anzahl: 0,
        };
        zeilen.set(key, z);
      }
      z.anzahl++;
      for (let m = 1; m <= 12; m++) {
        if (!imBestand(o, jahr, m)) continue;
        const b = betragImMonat(pos, m, jahr);
        if (!b) continue;
        z.monate[m - 1] += b;
        z.jahr += b;
        gruppen[gruppe][m - 1] += b;
        gesamt[m - 1] += b;
        if (pos.imHausgeld) hausgeld[m - 1] += b;
      }
    }
    for (let m = 1; m <= 12; m++) {
      for (const z of monatszahlungen(o, jahr, m)) {
        if (z.art === 'nebenkosten') vorauszahlung[m - 1] += z.betrag || 0;
      }
    }
  }

  const reihenfolge = { umlage: 0, nichtUmlage: 1, ruecklage: 2 };
  const liste = [...zeilen.values()].sort((a, b) => reihenfolge[a.gruppe] - reihenfolge[b.gruppe]
    || b.jahr - a.jahr || a.text.localeCompare(b.text));
  const summe = (a) => a.reduce((s, x) => s + x, 0);
  const deckung = vorauszahlung.map((v, i) => v - gruppen.umlage[i]);
  const monateBestand = objekte.length
    ? Array.from({ length: 12 }, (_, i) => objekte.some((o) => imBestand(o, jahr, i + 1)))
    : new Array(12).fill(false);

  return {
    jahr, zeilen: liste,
    gruppen, gesamt, hausgeld, vorauszahlung, deckung, monateBestand,
    summen: {
      umlage: summe(gruppen.umlage), nichtUmlage: summe(gruppen.nichtUmlage),
      ruecklage: summe(gruppen.ruecklage), gesamt: summe(gesamt), hausgeld: summe(hausgeld),
      vorauszahlung: summe(vorauszahlung), deckung: summe(deckung),
      abziehbar: liste.filter((z) => z.abziehbar).reduce((s, z) => s + z.jahr, 0),
    },
    monateImBestand: monateBestand.filter(Boolean).length,
    sammelposten, positionenAnzahl,
  };
}

/**
 * Kostenarten, die als Position **und** als freie Buchung im selben Jahr
 * erfasst sind – dann zählen sie doppelt in Cashflow und Steuer.
 */
const BUCHUNG_ZU_ART = { grundsteuer: 'grundsteuer', versicherung: 'versicherung' };

export function doppelteErfassung(objektIds, jahr) {
  const objekte = (objektIds ? objektIds.map(objektMit) : state.daten.objekte).filter(Boolean);
  const raus = [];
  for (const o of objekte) {
    for (const [kategorie, art] of Object.entries(BUCHUNG_ZU_ART)) {
      if (!positionen(o).some((p) => p.art === art && p.betrag && giltImJahr(p, jahr))) continue;
      const anzahl = (state.daten.buchungen || []).filter((b) => b.objektId === o.id
        && b.kategorie === kategorie && (b.datum || '').startsWith(String(jahr))).length;
      if (anzahl) raus.push({ objektId: o.id, objekt: o.bezeichnung || 'Ohne Bezeichnung', art, text: kostenart(art).text, anzahl });
    }
  }
  return raus;
}
