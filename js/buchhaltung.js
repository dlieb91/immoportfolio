/* Buchhaltung – reine Rechnung, keine Oberfläche.

   Führt drei Quellen zu einem Hauptbuch zusammen: die aus den Stammdaten
   abgeleiteten Zahlungen (zahlungen.js), frei erfasste Buchungen
   (`state.daten.buchungen`) und Fahrten zum Objekt (`state.daten.fahrten`).
   Ausserdem drei eigenständige Auswertungen, die auf diesem Hauptbuch
   aufbauen:

     Nebenkostenabrechnung   Vorauszahlung je Einheit gegen die anteiligen
                             umlagefähigen Kosten, nach Wohnfläche verteilt.
     Erhaltungsaufwand       Ampel zur 15-%-Grenze (§ 6 Abs. 1 Nr. 1a EStG):
                             Erhaltungsaufwand binnen drei Jahren ab Kauf
                             über 15 % der Gebäude-Anschaffungskosten kippt
                             rückwirkend vollständig in die AfA. Nur ein
                             Hinweis – die App reklassifiziert nichts von
                             selbst.
     Anlage-V-Aufstellung    Einnahmen und Werbungskosten in der Gliederung
                             der Anlage V, als Zuarbeit fürs Finanzamt oder
                             den Steuerberater – keine Steuerberatung.
*/

import { heuteISO, datumPlus } from './util.js';
import {
  state, objekt as objektMit, einheitMit, einheitName, objektVonEinheit,
  flaecheVon, einheitenVon, mieteEinheit, buchungenVon, fahrtenVon,
} from './store.js';
import {
  KATEGORIEN, GRUPPEN, artInfo, zahlungsliste, jahresSummen, fahrtBetrag,
} from './zahlungen.js';
import { afaWerte, afaImJahr } from './kennzahlen.js';

export { KATEGORIEN, GRUPPEN, artInfo, fahrtBetrag };

/* ---------- Hauptbuch ---------- */

/**
 * Abgeleitete Zeilen, freie Buchungen und Fahrten zusammengeführt, neueste
 * zuerst. Dieselbe Filterform wie `zahlungsliste()`, um `herkunft`
 * ('abgeleitet' | 'manuell') erweitert.
 */
export function buchungsliste(filter = {}) {
  const raus = [];

  if (filter.herkunft !== 'manuell') {
    for (const z of zahlungsliste(filter)) {
      raus.push({ ...z, datum: `${z.periode}-01`, herkunft: 'abgeleitet' });
    }
  }

  if (filter.herkunft !== 'abgeleitet') {
    const heute = new Date();
    const bisJahr = filter.bisJahr ?? heute.getFullYear();
    const vonJahr = filter.vonJahr ?? bisJahr;
    const alleJahre = filter.bisJahr === null;

    for (const b of state.daten.buchungen || []) {
      if (filter.objektId && b.objektId !== filter.objektId) continue;
      if (filter.einheitId && b.einheitId !== filter.einheitId) continue;
      if (filter.art && b.kategorie !== filter.art) continue;
      const jahr = Number((b.datum || '').slice(0, 4));
      if (!alleJahre && (jahr < vonJahr || jahr > bisJahr)) continue;
      const o = objektMit(b.objektId);
      const e = b.einheitId ? einheitMit(b.einheitId) : null;
      raus.push({
        id: b.id, datum: b.datum, periode: (b.datum || '').slice(0, 7),
        jahr, monat: Number((b.datum || '').slice(5, 7)), art: b.kategorie, geplant: false,
        objektId: b.objektId, objektName: o?.bezeichnung || 'Ohne Bezeichnung',
        bezugId: b.einheitId || null, bezugText: b.bezeichnung || (e ? einheitName(e) : ''),
        standard: b.betrag || 0, betrag: b.betrag || 0,
        korrigiert: false, entfaellt: false, notiz: b.notiz || '',
        herkunft: 'manuell', quelle: b,
      });
    }

    for (const fa of state.daten.fahrten || []) {
      if (filter.objektId && fa.objektId !== filter.objektId) continue;
      if (filter.art && filter.art !== 'fahrtkosten') continue;
      const jahr = Number((fa.datum || '').slice(0, 4));
      if (!alleJahre && (jahr < vonJahr || jahr > bisJahr)) continue;
      const o = objektMit(fa.objektId);
      const betrag = fahrtBetrag(fa, state.daten.einstellungen);
      raus.push({
        id: fa.id, datum: fa.datum, periode: (fa.datum || '').slice(0, 7),
        jahr, monat: Number((fa.datum || '').slice(5, 7)), art: 'fahrtkosten', geplant: false,
        objektId: fa.objektId, objektName: o?.bezeichnung || 'Ohne Bezeichnung',
        bezugId: null, bezugText: fa.anlass || `${fa.km || 0} km`,
        standard: betrag, betrag,
        korrigiert: false, entfaellt: false, notiz: fa.notiz || '',
        herkunft: 'manuell', quelle: fa,
      });
    }
  }

  if (filter.gruppe) {
    return raus
      .filter((z) => artInfo(z.art).gruppe === filter.gruppe)
      .sort((a, b) => b.datum.localeCompare(a.datum) || a.objektName.localeCompare(b.objektName));
  }
  raus.sort((a, b) => b.datum.localeCompare(a.datum) || a.objektName.localeCompare(b.objektName));
  return raus;
}

/* ---------- Nebenkostenabrechnung ---------- */

/**
 * Vorauszahlung gegen umlagefähige Kosten, je Einheit und Jahr.
 *
 * Die Vorauszahlung kommt monatsweise aus den Mietverträgen dieser Einheit
 * (wie kennzahlen.js:mieteImJahr, nur je Einheit statt je Objekt). Die
 * umlagefähigen Kosten sind am Objekt erfasst, nicht je Einheit – sie werden
 * nach Wohnfläche verteilt, ersatzweise zu gleichen Teilen, wenn keine
 * Fläche hinterlegt ist. Ergebnis positiv heisst Nachzahlung des Mieters,
 * negativ heisst Erstattung durch den Vermieter.
 */
export function nkAbrechnung(einheitId, jahr) {
  const e = einheitMit(einheitId);
  const o = objektVonEinheit(einheitId);
  if (!e || !o) return null;

  let vorauszahlung = 0, monateVermietet = 0;
  for (let m = 1; m <= 12; m++) {
    const stichtag = `${jahr}-${String(m).padStart(2, '0')}-15`;
    const w = mieteEinheit(einheitId, stichtag);
    if (w.nk) vorauszahlung += w.nk;
    if (w.anzahl) monateVermietet++;
  }

  const ist = jahresSummen(o.id, jahr);
  const gesamtFlaeche = flaecheVon(o);
  const anzahlEinheiten = Math.max(1, einheitenVon(o.id).length);
  const flaechenanteil = gesamtFlaeche
    ? (e.flaeche || 0) / gesamtFlaeche
    : 1 / anzahlEinheiten;
  const kosten = ist.betriebskostenUmlagefaehig * flaechenanteil;

  return {
    einheitId, objektId: o.id, jahr,
    vorauszahlung, kosten, ergebnis: kosten - vorauszahlung,
    flaechenanteil, monateVermietet,
  };
}

/** Nebenkostenabrechnung aller Einheiten eines Objekts. */
export function nkAbrechnungObjekt(objektId, jahr) {
  return einheitenVon(objektId)
    .map((e) => nkAbrechnung(e.id, jahr))
    .filter(Boolean);
}

/* ---------- Erhaltungsaufwand: 15-%-Grenze und § 82b EStDV ---------- */

/**
 * Ampel zur 15-%-Grenze anschaffungsnaher Herstellungskosten
 * (§ 6 Abs. 1 Nr. 1a EStG): Erhaltungsaufwand **binnen drei Jahren ab
 * Kauf**, der in Summe 15 % der Gebäude-Anschaffungskosten übersteigt, gilt
 * rückwirkend vollständig als Herstellungskosten – abzuschreiben statt
 * sofort abziehbar. Die Grenze bezieht sich auf die reinen
 * Anschaffungskosten des Gebäudes, ohne spätere aktivierte Modernisierung.
 *
 * `stufe` ist eine Warnung, keine Buchung – die App reklassifiziert nichts
 * von selbst. Ausserhalb des Dreijahresfensters liefert die Funktion null.
 */
export function erhaltungsAmpel(o, stichtag = heuteISO()) {
  if (!o.kaufdatum) return null;
  const [j, m, t] = o.kaufdatum.split('-').map(Number);
  const fensterEnde = datumPlus({ jahre: 3 }, new Date(j, (m || 1) - 1, t || 1));
  if (stichtag < o.kaufdatum || stichtag >= fensterEnde) return null;

  const summe = buchungenVon(o.id)
    .filter((b) => b.kategorie === 'erhaltung' && b.datum >= o.kaufdatum && b.datum < fensterEnde)
    .reduce((s, b) => s + (b.betrag || 0), 0);

  const a = afaWerte(o);
  const basis = Math.max(0, a.gebaeude - a.modernisierung);
  const grenze = basis * 0.15;
  const quote = grenze ? (summe / grenze) * 100 : 0;

  return {
    summe, grenze, basis, quote, fensterEnde,
    stufe: quote >= 100 ? 'rot' : quote >= 80 ? 'gelb' : 'gruen',
  };
}

/**
 * Steuerlich abzugsfähiger Erhaltungsaufwand eines Jahres: aktivierte
 * Buchungen zählen nicht (sie stecken in der AfA, siehe kennzahlen.js:
 * afaWerte), auf mehrere Jahre verteilte (§ 82b EStDV) nur mit ihrem
 * Anteil – in jedem der gewählten Jahre gleich groß, ab dem Buchungsjahr.
 * Nicht verteilter, nicht aktivierter Aufwand zählt voll im Buchungsjahr.
 *
 * Getrennt von `jahresSummen()`: dort steht der volle Betrag im Jahr des
 * tatsächlichen Zahlungsflusses (Cashflow), hier die steuerliche Verteilung.
 */
export function erhaltungSteuerlich(objektId, jahr) {
  let summe = 0;
  for (const b of buchungenVon(objektId)) {
    if (b.kategorie !== 'erhaltung' || b.aktiviert) continue;
    const bJahr = Number((b.datum || '').slice(0, 4));
    if (!bJahr) continue;
    // Nur gesetzte Werte werden auf 2-5 gedeckelt; ohne Verteilung zaehlt
    // der volle Betrag in genau einem Jahr (jahre = 1, kein Mindestwert 2).
    const jahre = b.verteilenJahre ? Math.min(5, Math.max(2, b.verteilenJahre)) : 1;
    if (jahr >= bJahr && jahr < bJahr + jahre) summe += (b.betrag || 0) / jahre;
  }
  return summe;
}

/* ---------- Anlage-V-Aufstellung ---------- */

/**
 * Einnahmen und Werbungskosten eines Objekts und Jahres, gruppiert nach der
 * Anlage-V-Zuordnung aus KATEGORIEN. Zuarbeit für die Steuererklärung, keine
 * Steuerberatung – Grenzfälle wie die 15-%-Grenze oder § 82b EStDV bleiben
 * Sache des Steuerberaters.
 */
export function anlageVAufstellung(o, jahr) {
  const ist = jahresSummen(o.id, jahr);
  const afaJahr = afaImJahr(o, jahr);

  const bucket = new Map();
  for (const k of KATEGORIEN) {
    if (!k.steuerlich || !k.anlageV) continue;
    const betrag = (ist[k.key] || 0) * k.vorzeichen;
    if (!betrag) continue;
    bucket.set(k.anlageV, (bucket.get(k.anlageV) || 0) + betrag);
  }
  // Erhaltungsaufwand mit der steuerlichen statt der Cashflow-Verteilung
  // ersetzen – § 82b EStDV und aktivierte Buchungen wirken hier, nicht in
  // jahresSummen().
  const erhaltungLabel = KATEGORIEN.find((k) => k.key === 'erhaltung').anlageV;
  const erhaltungCash = (ist.erhaltung || 0);
  const erhaltungSteuer = erhaltungSteuerlich(o.id, jahr);
  bucket.set(erhaltungLabel, (bucket.get(erhaltungLabel) || 0) - erhaltungCash - erhaltungSteuer);

  const einnahmen = [];
  const werbungskosten = [{ label: 'Werbungskosten: AfA', betrag: -afaJahr }];
  for (const [label, betrag] of bucket) {
    (betrag >= 0 ? einnahmen : werbungskosten).push({ label, betrag });
  }
  einnahmen.sort((x, y) => x.label.localeCompare(y.label));
  werbungskosten.sort((x, y) => x.label.localeCompare(y.label));

  const summeEinnahmen = einnahmen.reduce((s, x) => s + x.betrag, 0);
  const summeWerbungskosten = werbungskosten.reduce((s, x) => s + x.betrag, 0);
  return {
    objekt: o, jahr, einnahmen, werbungskosten,
    summeEinnahmen, summeWerbungskosten,
    einkuenfte: summeEinnahmen + summeWerbungskosten,
  };
}

/** Dieselbe Aufstellung über alle Objekte, Zeilen gleichen Labels summiert. */
export function anlageVPortfolio(jahr) {
  const einzel = state.daten.objekte.map((o) => anlageVAufstellung(o, jahr));
  const zusammenfassen = (feld) => {
    const bucket = new Map();
    for (const a of einzel) {
      for (const { label, betrag } of a[feld]) bucket.set(label, (bucket.get(label) || 0) + betrag);
    }
    return [...bucket.entries()]
      .map(([label, betrag]) => ({ label, betrag }))
      .sort((x, y) => x.label.localeCompare(y.label));
  };
  const einnahmen = zusammenfassen('einnahmen');
  const werbungskosten = zusammenfassen('werbungskosten');
  const summeEinnahmen = einnahmen.reduce((s, x) => s + x.betrag, 0);
  const summeWerbungskosten = werbungskosten.reduce((s, x) => s + x.betrag, 0);
  return {
    jahr, objekte: einzel, einnahmen, werbungskosten,
    summeEinnahmen, summeWerbungskosten,
    einkuenfte: summeEinnahmen + summeWerbungskosten,
  };
}
