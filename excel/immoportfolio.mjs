/* Blattdefinition der Tabellenfassung von ImmoPortfolio.

   Erzeugt eine eigenstaendige Mappe, in die man Objekte, Mietvertraege und
   Darlehen direkt eintraegt. Sie rechnet dieselben Kennzahlen wie die App:
   Kaufnebenkosten, AfA, Cashflow vor und nach Steuern, monatsgenaue
   Tilgungsplaene, Zahlungen mit Korrekturen und eine Prognose ueber 30 Jahre.

   Massgeblich ist immer das Rechenmodul der App, nie die Dokumentation:
     js/finanzmathematik.js  Tilgungsplan
     js/kennzahlen.js        AfA, Cashflow, Renditen
     js/forecast.js          Prognose
     js/zahlungen.js         Zahlungsebene mit Korrekturen
     js/store.js             Nebenkosten, Miete, Besitzmonate

   Erzeugen:
     node ~/.claude/skills/zahlenkompass-tabelle/werkzeug/erzeuge.mjs \
       excel/immoportfolio.mjs ImmoPortfolio-2026.xlsx --jahr 2026

   Der zweite Parameter von mappe() fuellt die Eingabezellen vor. Leer entsteht
   die Vorlage; das Vergleichsskript nutzt ihn fuer ein Musterportfolio.
*/

import { datumsZahl, spalteName } from '../../../skills/zahlenkompass-tabelle/werkzeug/xlsx.mjs';

/* ---------- Kapazitaet ----------
   Aendern heisst: eine Zahl aendern und neu erzeugen. Kein Zellbezug wird
   von Hand nachgerechnet, alle Zeilennummern leiten sich hieraus ab. */

export const OBJEKTE = 10;
export const EINHEITEN = 30;
export const VERTRAEGE = 30;
export const KONDITIONEN = 3;    // Staffeln je Mietvertrag
export const DARLEHEN = 20;
export const SONDER = 40;        // Sondertilgungen insgesamt
export const JAHRE = 30;         // Prognosehorizont; ergibt JAHRE+1 Zeilen
/* Monatszeilen je Darlehen. Sie laufen ab der AUSZAHLUNG, nicht ab dem Jahr
   der Mappe – ein 2019 ausgezahltes Darlehen braucht also mehr als JAHRE*12
   Zeilen, um bis zum Ende der Prognose zu reichen. 480 deckt eine Auszahlung
   bis zu zehn Jahre vor dem Mappenjahr ab. Reicht es doch einmal nicht, sagt
   das Dashboard es ausdruecklich (Hilfsspalte DarlReichweite). */
export const MONATE = 480;

const JAHRZEILEN = JAHRE + 1;

/* ---------- Marke ---------- */

const NAVY = '14213D';
const NAVY_HELL = '3A4F78';
const GOLD = 'C9A227';
const PAPIER = 'F7F5F0';
const GRAU = '5B6779';
const GRAU_HELL = '8794A7';
const LINIE = 'D8DCE4';
const FELD_RAND = '9DB2D9';
const GERECHNET = 'F2F4F8';
const ROT = 'B91C1C';
const WARN_HG = 'FDECEC';
const HINWEIS_HG = 'FFF6D9';

/* ---------- Zahlenformate ----------
   Der dritte Abschnitt gilt fuer die Null: aus einer nackten 0 wird der
   Gedankenstrich. Nachkommastellen stehen nie in TEXT(), immer hier. */

const F_EURO = '#,##0 "€";-#,##0 "€";"–"';
const F_EURO2 = '#,##0.00 "€";-#,##0.00 "€";"–"';
const F_PROZENT = '0.00 "%";-0.00 "%";"–"';
const F_PROZENT1 = '0.0 "%";-0.0 "%";"–"';
const F_ZAHL1 = '0.0;-0.0;"–"';
const F_ZAHL2 = '0.00;-0.00;"–"';
const F_GANZ = '0;-0;"–"';
const F_DATUM = 'DD.MM.YYYY';
const F_MONAT = 'MM.YYYY';

/* ---------- Stile ---------- */

const S = {
  marke: { schrift: { fett: true, groesse: 8, farbe: GOLD } },
  titel: { schrift: { fett: true, groesse: 18, farbe: NAVY } },
  untertitel: { schrift: { groesse: 10, farbe: GRAU } },
  h2: { schrift: { fett: true, groesse: 12, farbe: NAVY } },
  fein: { schrift: { groesse: 9, farbe: GRAU } },
  feiner: { schrift: { groesse: 8, farbe: GRAU_HELL } },
  feinUmbruch: { schrift: { groesse: 9, farbe: GRAU }, ausrichtung: { umbruch: true, v: 'top' } },
  text: {},
  fett: { schrift: { fett: true } },
  label: { schrift: { groesse: 10 }, ausrichtung: { h: 'left' } },

  kopf: {
    schrift: { fett: true, groesse: 9, farbe: 'FFFFFF' }, fuellung: NAVY,
    ausrichtung: { h: 'center', v: 'center', umbruch: true },
  },
  kopfLinks: {
    schrift: { fett: true, groesse: 9, farbe: 'FFFFFF' }, fuellung: NAVY,
    ausrichtung: { h: 'left', v: 'center', umbruch: true },
  },

  kpiWert: { schrift: { fett: true, groesse: 16, farbe: NAVY }, format: F_EURO },
  kpiText: { schrift: { groesse: 9, farbe: GRAU } },

  /* Ruhiger Grundton. Rot kommt ueber eine bedingte Formatierung dazu, sobald
     wirklich etwas zu beanstanden ist. Traegt die Zelle die Farbe fest, sehen
     Entwarnung und Beanstandung gleich aus – und Gelb behaelt so seine eine
     Bedeutung aus der Legende: von Hand korrigiert. */
  hinweis: { fuellung: GERECHNET, schrift: { groesse: 9, farbe: GRAU } },
  trenner: { fuellung: LINIE },
};

/** Eingabefeld: weiss mit blauem Rand – nur hier wird getippt. */
function feld(format) {
  return {
    fuellung: 'FFFFFF',
    rahmen: { oben: 'thin', unten: 'thin', links: 'thin', rechts: 'thin', farbe: FELD_RAND },
    ausrichtung: { h: format ? 'right' : 'left' },
    ...(format ? { format } : {}),
  };
}

/** Gerechnete Zelle: grau hinterlegt, rechtsbuendig. */
function rechen(format, extra = {}) {
  return {
    fuellung: GERECHNET, ausrichtung: { h: 'right' },
    ...(format ? { format } : {}),
    ...extra,
  };
}

/** Anzeige ohne Hinterlegung – fuer die grossen Zahlenblaetter. */
function anzeige(format, extra = {}) {
  return { ausrichtung: { h: 'right' }, ...(format ? { format } : {}), ...extra };
}

/* Rechenzellen der versteckten Blaetter. Ohne eigenes Format erben sie das
   Format der Zelle, auf die sie zeigen – aus einer Miete wird dann ein auf
   ganze Euro gerundeter Waehrungswert, und genau den schreibt LibreOffice
   beim CSV-Export heraus. Ein festes Format mit sechs Nachkommastellen macht
   Anzeige und Wert gleich; nur so vergleicht das Vergleichsskript wirklich
   das, was die Mappe rechnet. */
const S_ROH = { format: '0.000000' };

const S_FELD = feld();
const S_FELD_EUR = feld(F_EURO);
const S_FELD_PROZ = feld(F_PROZENT);
const S_FELD_DATUM = feld(F_DATUM);
const S_FELD_ZAHL = feld(F_ZAHL1);
const S_FELD_GANZ = feld(F_GANZ);

/* ---------- Zellen ---------- */

const w = (wert, s) => (s ? { w: wert, s } : { w: wert });
const f = (formel, s) => (s ? { f: formel, s } : { f: formel });

/**
 * Baut eine Zeile aus einer Zuordnung Spaltennummer -> Zelle.
 * Spart das Zaehlen von null-Platzhaltern und damit die haeufigste Fehlerquelle.
 */
function reihe(eintraege) {
  const spalten = Object.keys(eintraege).map(Number);
  if (!spalten.length) return [];
  const out = new Array(Math.max(...spalten)).fill(null);
  for (const [k, v] of Object.entries(eintraege)) out[Number(k) - 1] = v;
  return out;
}

/** Gibt jeder Formelzelle ohne eigenen Stil das Rohformat – siehe S_ROH. */
function rohFormatieren(blatt) {
  for (const zeile of blatt.zeilen || []) {
    if (!zeile) continue;
    for (const c of (zeile.zellen || zeile)) {
      if (c && typeof c === 'object' && c.f && !c.s) c.s = S_ROH;
    }
  }
  return blatt;
}

/** Absoluter Bereich fuer benannte Bereiche: bereich('Objekte', 3, 8, 17) */
const bereich = (blatt, spalte, von, bis) => `${blatt}!$${spalteName(spalte)}$${von}:$${spalteName(spalte)}$${bis}`;
const zelle = (blatt, spalte, zeile) => `${blatt}!$${spalteName(spalte)}$${zeile}`;

/** Spaltenbuchstabe – nie von Hand geschrieben. */
const C = spalteName;

const iso = (d) => (d ? datumsZahl(d) : null);

/* ---------- Nachschlagetabellen ---------- */

const OBJEKTTYPEN = ['ETW', 'MFH', 'EFH', 'Gewerbe', 'Grundstück'];
const DARLEHENSARTEN = ['Annuität', 'KfW', 'Endfällig'];
const JANEIN = ['Ja', 'Nein'];
const ANPASSUNG = ['keine', 'Staffel', 'Index'];
const KIRCHENSTEUER = [0, 8, 9];

/* Szenario-Deltas wie forecast.js:35-39 */
const SZENARIEN = [
  // Name, Miete, Wert, Leerstand, Anschlusszins, Instandhaltung
  ['pessimistisch', -1.0, -2.0, 3, 1.5, 0.5],
  ['Basis', 0, 0, 0, 0, 0],
  ['optimistisch', 1.0, 1.5, -1, -1.0, -0.25],
];

/* Grunderwerbsteuer der Bundeslaender wie store.js:36-42 */
const BUNDESLAENDER = [
  ['Baden-Württemberg', 5.0], ['Bayern', 3.5], ['Berlin', 6.0], ['Brandenburg', 6.5],
  ['Bremen', 5.5], ['Hamburg', 5.5], ['Hessen', 6.0], ['Mecklenburg-Vorpommern', 6.0],
  ['Niedersachsen', 5.0], ['Nordrhein-Westfalen', 6.5], ['Rheinland-Pfalz', 5.0],
  ['Saarland', 6.5], ['Sachsen', 5.5], ['Sachsen-Anhalt', 5.0],
  ['Schleswig-Holstein', 6.5], ['Thüringen', 5.0],
];

/* Zahlungsarten wie zahlungen.js:KATEGORIEN (nur die abgeleiteten – die
   Buchungsebene der App bildet die Mappe bewusst noch nicht ab). Neu
   angehaengt statt einsortiert, damit die Indizes 0–9 unveraendert bleiben,
   auf die sollFormel() und die art-Nummern in muster.mjs:KORREKTUREN sich
   beziehen. */
const ZAHLUNGSARTEN = [
  ['Mieteinnahme', 'Einnahmen', 1],
  ['Nebenkosten-Vorauszahlung', 'Einnahmen', 1],
  ['Hausgeld, nicht umlagefähig', 'Bewirtschaftung', -1],
  ['Verwaltung', 'Bewirtschaftung', -1],
  ['Instandhaltung', 'Bewirtschaftung', -1],
  ['Sonstige Kosten', 'Bewirtschaftung', -1],
  ['Zinsen', 'Finanzierung', -1],
  ['Tilgung', 'Finanzierung', -1],
  ['Sondertilgung', 'Finanzierung', -1],
  ['Tilgungsersatzleistung', 'Finanzierung', -1],
  ['Umlagefähige Betriebskosten', 'Bewirtschaftung', -1],
];
const ARTEN = ZAHLUNGSARTEN.length;

const MONATSNAMEN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONATSKURZ = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/* ==========================================================================
   Zeilen- und Spaltenraster
   Alles abgeleitet, nichts gezaehlt.
   ========================================================================== */

/* --- Vorgaben --- */
const V = {};
(() => {
  let r = 6;
  V.h_portfolio = r; V.name = ++r; V.jahr = ++r; V.stichtagEingabe = ++r; V.stichtag = ++r; V.warnJahr = ++r;
  r += 2;
  V.h_steuern = ++r; V.steuersatz = ++r; V.kirche = ++r; V.soli = ++r; V.steuersatzEff = ++r;
  r += 2;
  V.h_szenario = ++r; V.szenario = ++r; V.szenarioText = ++r;
  r += 2;
  V.h_annahmen = ++r; V.mietBasis = ++r; V.wertBasis = ++r; V.inflBasis = ++r;
  V.leerBasis = ++r; V.instandBasis = ++r; V.anschlussBasis = ++r; V.prognoseJahre = ++r;
  r += 2;
  V.h_wirksam = ++r; V.miet = ++r; V.wert = ++r; V.infl = ++r;
  V.leer = ++r; V.instand = ++r; V.anschluss = ++r;
  r += 2;
  V.h_verkauf = ++r; V.verkaufNach = ++r; V.verkaufskosten = ++r;
  r += 2;
  V.h_nk = ++r; V.grest = ++r; V.notar = ++r; V.makler = ++r;
})();

/* --- Objekte --- */
const OBJ_KOPF = 7;
const OBJ_ERSTE = OBJ_KOPF + 1;
const OBJ_LETZTE = OBJ_ERSTE + OBJEKTE - 1;
const EH_H2 = OBJ_LETZTE + 3;
const EH_KOPF = EH_H2 + 1;
const EH_ERSTE = EH_KOPF + 1;
const EH_LETZTE = EH_ERSTE + EINHEITEN - 1;
const OKZ_H2 = EH_LETZTE + 3;
const OKZ_KOPF = OKZ_H2 + 1;
const OKZ_ERSTE = OKZ_KOPF + 1;
const OKZ_LETZTE = OKZ_ERSTE + OBJEKTE - 1;

/* Spalten des Objektblocks */
const O = {
  nr: 2, bez: 3, typ: 4, ort: 5, baujahr: 6, flaeche: 7, kaufdatum: 8, kaufpreis: 9,
  land: 10, grest: 11, notar: 12, makler: 13, weitere: 14, eigenprov: 15,
  grund: 16, afa: 17, modern: 18, gebManuell: 19,
  hausgeld: 20, umlage: 21, verwaltung: 22, instand: 23, sonstige: 24,
  wert: 25, steuer: 26,
  // versteckte Hilfsspalten
  hNk: 28, hInvest: 29, hGrund: 30, hGebaeude: 31, hAfaJahr: 32, hAfaDauer: 33,
  hBewirt: 34, hSteuer: 35, hFlaeche: 36, hKaufJahr: 37, hKaufMonat: 38, hBelegt: 39,
  hLaufend: 40, hInstandBasis: 41, hWertEff: 42, hGrEStSatz: 43,
};

/* Spalten des Einheitenblocks. Eigene Bedeutung auf denselben Blattspalten –
   deshalb liegen die Hilfsspalten der Einheiten NICHT in den sichtbaren
   Spalten des Objektblocks, sondern hinter dessen Hilfsspalten. Sonst stuenden
   neben der Einheitenliste Zahlen, die dort niemand erwartet. */
const E = { nr: 2, objekt: 3, bez: 4, flaeche: 5, zimmer: 6, hObj: 44, hVermietet: 45, hAnzeige: 46 };
const O_LETZTE_SPALTE = E.hAnzeige;

/* Spalten des Kennzahlenblocks */
const K = {
  nr: 2, bez: 3, invest: 4, wert: 5, rest: 6, miete: 7, brutto: 8, netto: 9,
  faktor: 10, prom2: 11, ltv: 12, dscr: 13, cfVor: 14, cfNach: 15, ekRendite: 16,
};

/* --- Mietvertraege --- */
const MV_KOPF = 7;
const MV_ERSTE = MV_KOPF + 1;
const MV_LETZTE = MV_ERSTE + VERTRAEGE - 1;
const MO_H2 = MV_LETZTE + 3;
const MO_KOPF = MO_H2 + 1;
const MO_ERSTE = MO_KOPF + 1;
const MO_LETZTE = MO_ERSTE + OBJEKTE - 1;

const M = { nr: 2, einheit: 3, mieter: 4, beginn: 5, befristet: 6, gekuendigt: 7, anpassung: 8, index: 9 };
/* je Kondition drei Spalten: gilt ab, kalt, NK */
const M_KOND = 10;
const kondSpalte = (i, feldNr) => M_KOND + i * 3 + feldNr;   // feldNr 0=ab 1=kalt 2=nk
const M_NACH_KOND = M_KOND + KONDITIONEN * 3;
const MH = {
  einheitNr: M_NACH_KOND + 1, objNr: M_NACH_KOND + 2, endeEff: M_NACH_KOND + 3,
  satz: M_NACH_KOND + 4, aktiv: M_NACH_KOND + 5, kalt: M_NACH_KOND + 6, nk: M_NACH_KOND + 7,
  key: M_NACH_KOND + 8,     // KONDITIONEN Spalten Stichtagsschluessel
};
const MH_LETZTE = MH.key + KONDITIONEN - 1;

/* --- Darlehen --- */
const D_KOPF = 7;
const D_ERSTE = D_KOPF + 1;
const D_LETZTE = D_ERSTE + DARLEHEN - 1;
const ST_H2 = D_LETZTE + 3;
const ST_KOPF = ST_H2 + 1;
const ST_ERSTE = ST_KOPF + 1;
const ST_LETZTE = ST_ERSTE + SONDER - 1;
const DKZ_H2 = ST_LETZTE + 3;
const DKZ_KOPF = DKZ_H2 + 1;
const DKZ_ERSTE = DKZ_KOPF + 1;
const DKZ_LETZTE = DKZ_ERSTE + DARLEHEN - 1;

const D = {
  nr: 2, objekt: 3, bank: 4, art: 5, betrag: 6, auszahlung: 7, sollzins: 8, tilgung: 9,
  bindung: 10, anschluss: 11, tilgfrei: 12, ersatz: 13, ersatzProzent: 14, ersatzZins: 15,
  sonderrecht: 16,
  hObj: 18, hOhneTilg: 19, hAnschluss: 20, hTilgFrei: 21, hErsatzRate: 22, hErsatzZins: 23,
  hRate1: 24, hAnzeige: 25, hBelegt: 26, hReichweite: 27,
};
const ST = { nr: 2, darlehen: 3, datum: 4, betrag: 5, hDarl: 7, hJahr: 8 };
const DK = {
  nr: 2, bank: 3, betrag: 4, rate: 5, rest: 6, restBindung: 7, volltilgung: 8,
  zinsen: 9, ersatzGuthaben: 10, deckung: 11, sonderJahr: 12, sonderMax: 13,
};

/* ==========================================================================
   Kern – versteckt. Vier Bloecke mit eigener Spaltenzuordnung.
   ========================================================================== */

/* Block A: Nachschlagetabellen, nebeneinander in den obersten Zeilen */
const N_KOPF = 3;
const N_ERSTE = 4;
const NL = {
  typ: 2, art: 3, janein: 4, anpassung: 5, kirche: 6,
  szenario: 8, szMiete: 9, szWert: 10, szLeer: 11, szAnschluss: 12, szInstand: 13,
  land: 15, landSatz: 16,
  zahlart: 18, zahlGruppe: 19, zahlVz: 20,
  monat: 22,
};
const N_LETZTE = N_ERSTE + Math.max(
  OBJEKTTYPEN.length, DARLEHENSARTEN.length, SZENARIEN.length,
  BUNDESLAENDER.length, ZAHLUNGSARTEN.length, MONATSNAMEN.length,
) - 1;

/* Block B: Mietlauf – Vertrag x Jahr */
const ML_H2 = N_LETZTE + 3;
const ML_KOPF = ML_H2 + 1;
const ML_ERSTE = ML_KOPF + 1;
const ML_ZEILEN = VERTRAEGE * JAHRZEILEN;
const ML_LETZTE = ML_ERSTE + ML_ZEILEN - 1;
/** Erste Zeile des Blocks eines Vertrags (0-basiert) */
const mlErste = (v) => ML_ERSTE + v * JAHRZEILEN;

const ML = {
  vertrag: 2, jahr: 3, obj: 4,
  monat: 5,               // MONATE 1..12 in 12 Spalten
  summe: 17,
  // Hilfsspalten, nur in der ersten Zeile je Vertrag belegt
  hBeginn: 19, hEnde: 20, hSatz: 21,
  hKey: 22,               // KONDITIONEN Spalten
};
const ML_KALT = ML.hKey + KONDITIONEN;         // KONDITIONEN Spalten Kaltmiete
const ML_BASIS = ML_KALT + KONDITIONEN;        // KONDITIONEN Spalten Wachstumsbasisjahr
const ML_LETZTE_SPALTE = ML_BASIS + KONDITIONEN - 1;

/* Block C: Mietnebenkosten je Vertrag, nur fuer das Mappenjahr */
const NK_H2 = ML_LETZTE + 3;
const NK_KOPF = NK_H2 + 1;
const NK_ERSTE = NK_KOPF + 1;
const NK_LETZTE = NK_ERSTE + VERTRAEGE - 1;
const NKS = { vertrag: 2, obj: 3, monat: 5 };

/* Block D: Objektjahr – Objekt x Jahr, die Prognose je Objekt */
const OJ_H2 = NK_LETZTE + 3;
const OJ_KOPF = OJ_H2 + 1;
const OJ_ERSTE = OJ_KOPF + 1;
const OJ_ZEILEN = OBJEKTE * JAHRZEILEN;
const OJ_LETZTE = OJ_ERSTE + OJ_ZEILEN - 1;
const ojZeile = (o, t) => OJ_ERSTE + o * JAHRZEILEN + t;

const OJ = {
  obj: 2, jahr: 3, t: 4, anteil: 5,
  miete: 6, bewirt: 7, instand: 8,
  zins: 9, tilgung: 10, sonder: 11, ersatz: 12,
  rest: 13, guthaben: 14, wert: 15, afa: 16,
  einkuenfte: 17, steuer: 18, kapitaldienst: 19,
  cfVor: 20, cfNach: 21, ek: 22, aufbau: 23, ltv: 24,
};

/* Block E: Ist-Kennzahlen je Objekt zum Stichtag */
const IST_H2 = OJ_LETZTE + 3;
const IST_KOPF = IST_H2 + 1;
const IST_ERSTE = IST_KOPF + 1;
const IST_LETZTE = IST_ERSTE + OBJEKTE - 1;

const I = {
  obj: 2, invest: 3, nkSumme: 4, wert: 5, flaeche: 6,
  mieteMonat: 7, runrate: 8, nkMonat: 9, einheiten: 10, vermietet: 11, leerstand: 12,
  bewirtVoll: 13, darlehen: 14, rest: 15,
  zins12: 16, tilgung12: 17, sonder12: 18, ersatz12: 19, kapital12: 20, rateMonat: 21,
  istMiete: 22, istNk: 23, istHausgeld: 24, istVerwaltung: 25, istInstand: 26,
  istSonstige: 27, istBewirt: 28, istZins: 29, istTilgung: 30, istSonder: 31,
  istErsatz: 32, istKapital: 33,
  afaJahr: 34, afaVoll: 35, werbung: 36, einkuenfte: 37, steuersatz: 38, steuer: 39,
  cfVor: 40, cfNach: 41,
  cfRunrate: 42, einkRunrate: 43, steuerRunrate: 44, cfRunrateNach: 45,
  ekEingesetzt: 46, ek: 47, getilgt: 48, ersatzEin: 49, ersatzGut: 50,
  // Umlagefaehige Betriebskosten – Nachzuegler, siehe ZAHLUNGSARTEN oben:
  // steuerlich eine Werbungskostenposition, waehrend istNk (Umlagen) als
  // Einnahme gegenrechnet – wie kennzahlen.js:objektKennzahlen().
  istUmlage: 51,
};

/* Block F: Verkaufsrechnung je Objekt */
const VK_H2 = IST_LETZTE + 3;
const VK_KOPF = VK_H2 + 1;
const VK_ERSTE = VK_KOPF + 1;
const VK_LETZTE = VK_ERSTE + OBJEKTE - 1;
const VK = { obj: 2, brutto: 3, kosten: 4, netto: 5, kumAfa: 6, buchwert: 7, gewinn: 8, steuer: 9, rest: 10 };

/* ==========================================================================
   Tilgung – versteckt. Eine Zeile je Darlehen und Monat.
   ========================================================================== */

const T_KOPF = 3;
const T_ERSTE = T_KOPF + 1;
const T_ZEILEN = DARLEHEN * MONATE;
const T_LETZTE = T_ERSTE + T_ZEILEN - 1;
const tZeile = (d, i) => T_ERSTE + d * MONATE + i;   // i 0-basiert

const T = {
  darlehen: 2, obj: 3, i: 4, datum: 5, jahr: 6,
  bindung: 7, zinssatz: 8, aktiv: 9,
  restAnfang: 10, rate: 11, zins: 12, tilgung: 13, sonder: 14,
  ersatzRate: 15, ertrag: 16, guthaben: 17, restEnde: 18,
};

/* ==========================================================================
   Zahlungen – Ist oben, Korrekturen darunter, gleiche Zeilenordnung.
   ========================================================================== */

const Z_ZEILEN = OBJEKTE * ARTEN;
const ZS_H2 = 6;                       // Summen je Gruppe
const ZS_KOPF = ZS_H2 + 1;
const ZS_ERSTE = ZS_KOPF + 1;
const GRUPPEN = ['Einnahmen', 'Bewirtschaftung', 'Finanzierung'];
const ZS_LETZTE = ZS_ERSTE + GRUPPEN.length;   // eine Zeile mehr fuer den Saldo
const Z_H2 = ZS_LETZTE + 2;
const Z_KOPF = Z_H2 + 1;
const Z_ERSTE = Z_KOPF + 1;
const Z_LETZTE = Z_ERSTE + Z_ZEILEN - 1;
const ZK_H2 = Z_LETZTE + 3;
const ZK_KOPF = ZK_H2 + 1;
const ZK_ERSTE = ZK_KOPF + 1;
const ZK_LETZTE = ZK_ERSTE + Z_ZEILEN - 1;

const Z = { obj: 2, art: 3, gruppe: 4, monat: 5, summe: 17, soll: 19 };
const zZeile = (o, a) => Z_ERSTE + o * ARTEN + a;
const zkZeile = (o, a) => ZK_ERSTE + o * ARTEN + a;

/* ==========================================================================
   Prognose
   ========================================================================== */

const P_KOPF = 8;
const P_ERSTE = P_KOPF + 1;
const P_LETZTE = P_ERSTE + JAHRZEILEN - 1;
const P = {
  jahr: 2, miete: 3, bewirt: 4, instand: 5, zins: 6, tilgung: 7, sonder: 8, ersatz: 9,
  kapitaldienst: 10, afa: 11, einkuenfte: 12, steuer: 13,
  cfVor: 14, cfNach: 15, kumVor: 16, kumNach: 17,
  wert: 18, rest: 19, guthaben: 20, vermoegen: 21, ltv: 22, ekVor: 23, ekNach: 24,
};

/* ==========================================================================
   Tilgungsplan – Anzeige eines Darlehens
   ========================================================================== */

const TP_WAHL = 6;
const TP_KENN = 8;
const TP_KOPF = 14;
const TP_ERSTE = TP_KOPF + 1;
const TP_LETZTE = TP_ERSTE + MONATE - 1;
const TP = {
  i: 2, datum: 3, zinssatz: 4, restAnfang: 5, rate: 6, zins: 7, tilgung: 8,
  sonder: 9, ersatz: 10, guthaben: 11, restEnde: 12,
};

/* ==========================================================================
   Objekte im Detail
   ========================================================================== */

const DET_ERSTE = 6;
const DET_HOEHE = 26;
const detZeile = (o) => DET_ERSTE + o * DET_HOEHE;

/* ==========================================================================
   Benannte Bereiche – keine Formel zeigt auf eine feste fremde Zelle.
   ========================================================================== */

function namenBauen() {
  const n = {
    /* Vorgaben */
    PortfolioName: zelle('Vorgaben', 3, V.name),
    Jahr: zelle('Vorgaben', 3, V.jahr),
    StichtagEingabe: zelle('Vorgaben', 3, V.stichtagEingabe),
    Stichtag: zelle('Vorgaben', 3, V.stichtag),
    SteuersatzBasis: zelle('Vorgaben', 3, V.steuersatz),
    Kirchensteuer: zelle('Vorgaben', 3, V.kirche),
    Soli: zelle('Vorgaben', 3, V.soli),
    SteuersatzEff: zelle('Vorgaben', 3, V.steuersatzEff),
    Szenario: zelle('Vorgaben', 3, V.szenario),
    Mietsteigerung: zelle('Vorgaben', 3, V.miet),
    Wertsteigerung: zelle('Vorgaben', 3, V.wert),
    Inflation: zelle('Vorgaben', 3, V.infl),
    Leerstand: zelle('Vorgaben', 3, V.leer),
    InstandProzent: zelle('Vorgaben', 3, V.instand),
    Anschlusszins: zelle('Vorgaben', 3, V.anschluss),
    PrognoseJahre: zelle('Vorgaben', 3, V.prognoseJahre),
    VerkaufNach: zelle('Vorgaben', 3, V.verkaufNach),
    Verkaufskosten: zelle('Vorgaben', 3, V.verkaufskosten),
    VorgabeGrESt: zelle('Vorgaben', 3, V.grest),
    VorgabeNotar: zelle('Vorgaben', 3, V.notar),
    VorgabeMakler: zelle('Vorgaben', 3, V.makler),

    /* Kern – Nachschlagetabellen */
    Objekttypen: bereich('Kern', NL.typ, N_ERSTE, N_ERSTE + OBJEKTTYPEN.length - 1),
    Darlehensarten: bereich('Kern', NL.art, N_ERSTE, N_ERSTE + DARLEHENSARTEN.length - 1),
    JaNein: bereich('Kern', NL.janein, N_ERSTE, N_ERSTE + JANEIN.length - 1),
    Anpassungsarten: bereich('Kern', NL.anpassung, N_ERSTE, N_ERSTE + ANPASSUNG.length - 1),
    Kirchensaetze: bereich('Kern', NL.kirche, N_ERSTE, N_ERSTE + KIRCHENSTEUER.length - 1),
    Szenarien: bereich('Kern', NL.szenario, N_ERSTE, N_ERSTE + SZENARIEN.length - 1),
    SzenMiete: bereich('Kern', NL.szMiete, N_ERSTE, N_ERSTE + SZENARIEN.length - 1),
    SzenWert: bereich('Kern', NL.szWert, N_ERSTE, N_ERSTE + SZENARIEN.length - 1),
    SzenLeer: bereich('Kern', NL.szLeer, N_ERSTE, N_ERSTE + SZENARIEN.length - 1),
    SzenAnschluss: bereich('Kern', NL.szAnschluss, N_ERSTE, N_ERSTE + SZENARIEN.length - 1),
    SzenInstand: bereich('Kern', NL.szInstand, N_ERSTE, N_ERSTE + SZENARIEN.length - 1),
    Bundeslaender: bereich('Kern', NL.land, N_ERSTE, N_ERSTE + BUNDESLAENDER.length - 1),
    GrEStSatz: bereich('Kern', NL.landSatz, N_ERSTE, N_ERSTE + BUNDESLAENDER.length - 1),
    Zahlungsarten: bereich('Kern', NL.zahlart, N_ERSTE, N_ERSTE + ZAHLUNGSARTEN.length - 1),
    Monatsnamen: bereich('Kern', NL.monat, N_ERSTE, N_ERSTE + MONATSNAMEN.length - 1),

    /* Objekte */
    ObjNr: bereich('Objekte', O.nr, OBJ_ERSTE, OBJ_LETZTE),
    ObjBezeichnung: bereich('Objekte', O.bez, OBJ_ERSTE, OBJ_LETZTE),
    ObjTyp: bereich('Objekte', O.typ, OBJ_ERSTE, OBJ_LETZTE),
    ObjKaufdatum: bereich('Objekte', O.kaufdatum, OBJ_ERSTE, OBJ_LETZTE),
    ObjKaufpreis: bereich('Objekte', O.kaufpreis, OBJ_ERSTE, OBJ_LETZTE),
    ObjHausgeld: bereich('Objekte', O.hausgeld, OBJ_ERSTE, OBJ_LETZTE),
    ObjUmlage: bereich('Objekte', O.umlage, OBJ_ERSTE, OBJ_LETZTE),
    ObjVerwaltung: bereich('Objekte', O.verwaltung, OBJ_ERSTE, OBJ_LETZTE),
    ObjInstand: bereich('Objekte', O.instand, OBJ_ERSTE, OBJ_LETZTE),
    ObjSonstige: bereich('Objekte', O.sonstige, OBJ_ERSTE, OBJ_LETZTE),
    ObjWert: bereich('Objekte', O.wert, OBJ_ERSTE, OBJ_LETZTE),
    ObjInvest: bereich('Objekte', O.hInvest, OBJ_ERSTE, OBJ_LETZTE),
    ObjGrund: bereich('Objekte', O.hGrund, OBJ_ERSTE, OBJ_LETZTE),
    ObjGebaeude: bereich('Objekte', O.hGebaeude, OBJ_ERSTE, OBJ_LETZTE),
    ObjNkSumme: bereich('Objekte', O.hNk, OBJ_ERSTE, OBJ_LETZTE),
    ObjAfaJahr: bereich('Objekte', O.hAfaJahr, OBJ_ERSTE, OBJ_LETZTE),
    ObjAfaDauer: bereich('Objekte', O.hAfaDauer, OBJ_ERSTE, OBJ_LETZTE),
    ObjBewirt: bereich('Objekte', O.hBewirt, OBJ_ERSTE, OBJ_LETZTE),
    ObjSteuersatz: bereich('Objekte', O.hSteuer, OBJ_ERSTE, OBJ_LETZTE),
    ObjFlaeche: bereich('Objekte', O.hFlaeche, OBJ_ERSTE, OBJ_LETZTE),
    ObjKaufJahr: bereich('Objekte', O.hKaufJahr, OBJ_ERSTE, OBJ_LETZTE),
    ObjKaufMonat: bereich('Objekte', O.hKaufMonat, OBJ_ERSTE, OBJ_LETZTE),
    ObjBelegt: bereich('Objekte', O.hBelegt, OBJ_ERSTE, OBJ_LETZTE),
    ObjLaufend: bereich('Objekte', O.hLaufend, OBJ_ERSTE, OBJ_LETZTE),
    ObjInstandBasis: bereich('Objekte', O.hInstandBasis, OBJ_ERSTE, OBJ_LETZTE),
    ObjWertEff: bereich('Objekte', O.hWertEff, OBJ_ERSTE, OBJ_LETZTE),

    /* Einheiten */
    EhNr: bereich('Objekte', E.nr, EH_ERSTE, EH_LETZTE),
    EhFlaeche: bereich('Objekte', E.flaeche, EH_ERSTE, EH_LETZTE),
    EhObj: bereich('Objekte', E.hObj, EH_ERSTE, EH_LETZTE),
    EhVermietet: bereich('Objekte', E.hVermietet, EH_ERSTE, EH_LETZTE),
    EhAnzeige: bereich('Objekte', E.hAnzeige, EH_ERSTE, EH_LETZTE),

    /* Mietvertraege */
    MvEinheitName: bereich('Mietverträge', M.einheit, MV_ERSTE, MV_LETZTE),
    MvBeginn: bereich('Mietverträge', M.beginn, MV_ERSTE, MV_LETZTE),
    MvEinheitNr: bereich('Mietverträge', MH.einheitNr, MV_ERSTE, MV_LETZTE),
    MvObj: bereich('Mietverträge', MH.objNr, MV_ERSTE, MV_LETZTE),
    MvEnde: bereich('Mietverträge', MH.endeEff, MV_ERSTE, MV_LETZTE),
    MvSatz: bereich('Mietverträge', MH.satz, MV_ERSTE, MV_LETZTE),
    MvAktiv: bereich('Mietverträge', MH.aktiv, MV_ERSTE, MV_LETZTE),
    MvKalt: bereich('Mietverträge', MH.kalt, MV_ERSTE, MV_LETZTE),
    MvNk: bereich('Mietverträge', MH.nk, MV_ERSTE, MV_LETZTE),

    /* Darlehen */
    DarlNr: bereich('Darlehen', D.nr, D_ERSTE, D_LETZTE),
    DarlBank: bereich('Darlehen', D.bank, D_ERSTE, D_LETZTE),
    DarlBetrag: bereich('Darlehen', D.betrag, D_ERSTE, D_LETZTE),
    DarlAuszahlung: bereich('Darlehen', D.auszahlung, D_ERSTE, D_LETZTE),
    DarlSollzins: bereich('Darlehen', D.sollzins, D_ERSTE, D_LETZTE),
    DarlTilgung: bereich('Darlehen', D.tilgung, D_ERSTE, D_LETZTE),
    DarlBindung: bereich('Darlehen', D.bindung, D_ERSTE, D_LETZTE),
    DarlSonderrecht: bereich('Darlehen', D.sonderrecht, D_ERSTE, D_LETZTE),
    DarlObj: bereich('Darlehen', D.hObj, D_ERSTE, D_LETZTE),
    DarlOhneTilgung: bereich('Darlehen', D.hOhneTilg, D_ERSTE, D_LETZTE),
    DarlAnschluss: bereich('Darlehen', D.hAnschluss, D_ERSTE, D_LETZTE),
    DarlTilgStart: bereich('Darlehen', D.hTilgFrei, D_ERSTE, D_LETZTE),
    DarlErsatzRate: bereich('Darlehen', D.hErsatzRate, D_ERSTE, D_LETZTE),
    DarlErsatzZins: bereich('Darlehen', D.hErsatzZins, D_ERSTE, D_LETZTE),
    DarlRate1: bereich('Darlehen', D.hRate1, D_ERSTE, D_LETZTE),
    DarlAnzeige: bereich('Darlehen', D.hAnzeige, D_ERSTE, D_LETZTE),
    DarlBelegt: bereich('Darlehen', D.hBelegt, D_ERSTE, D_LETZTE),
    DarlReichweite: bereich('Darlehen', D.hReichweite, D_ERSTE, D_LETZTE),

    /* Sondertilgungen */
    SondDarl: bereich('Darlehen', ST.hDarl, ST_ERSTE, ST_LETZTE),
    SondDatum: bereich('Darlehen', ST.datum, ST_ERSTE, ST_LETZTE),
    SondBetrag: bereich('Darlehen', ST.betrag, ST_ERSTE, ST_LETZTE),
    SondJahr: bereich('Darlehen', ST.hJahr, ST_ERSTE, ST_LETZTE),

    /* Tilgung */
    TilgDarl: bereich('Tilgung', T.darlehen, T_ERSTE, T_LETZTE),
    TilgObj: bereich('Tilgung', T.obj, T_ERSTE, T_LETZTE),
    TilgDatum: bereich('Tilgung', T.datum, T_ERSTE, T_LETZTE),
    TilgJahr: bereich('Tilgung', T.jahr, T_ERSTE, T_LETZTE),
    TilgZins: bereich('Tilgung', T.zins, T_ERSTE, T_LETZTE),
    TilgTilgung: bereich('Tilgung', T.tilgung, T_ERSTE, T_LETZTE),
    TilgSonder: bereich('Tilgung', T.sonder, T_ERSTE, T_LETZTE),
    TilgErsatz: bereich('Tilgung', T.ersatzRate, T_ERSTE, T_LETZTE),
    TilgErtrag: bereich('Tilgung', T.ertrag, T_ERSTE, T_LETZTE),
    TilgAktiv: bereich('Tilgung', T.aktiv, T_ERSTE, T_LETZTE),

    /* Kern – Mietlauf */
    MlVertrag: bereich('Kern', ML.vertrag, ML_ERSTE, ML_LETZTE),
    MlJahr: bereich('Kern', ML.jahr, ML_ERSTE, ML_LETZTE),
    MlObj: bereich('Kern', ML.obj, ML_ERSTE, ML_LETZTE),
    MlSumme: bereich('Kern', ML.summe, ML_ERSTE, ML_LETZTE),

    /* Kern – Mietnebenkosten */
    NkObj: bereich('Kern', NKS.obj, NK_ERSTE, NK_LETZTE),

    /* Kern – Objektjahr */
    OjObj: bereich('Kern', OJ.obj, OJ_ERSTE, OJ_LETZTE),
    OjJahr: bereich('Kern', OJ.jahr, OJ_ERSTE, OJ_LETZTE),
    OjAfa: bereich('Kern', OJ.afa, OJ_ERSTE, OJ_LETZTE),

    /* Zahlungen */
    ZahlObj: bereich('Zahlungen', Z.obj, Z_ERSTE, Z_LETZTE),
    ZahlArt: bereich('Zahlungen', Z.art, Z_ERSTE, Z_LETZTE),
    ZahlSumme: bereich('Zahlungen', Z.summe, Z_ERSTE, Z_LETZTE),
  };

  /* Konditionen je Mietvertrag: eine Zeile in KONDITIONEN genuegt zum Erweitern. */
  for (let i = 0; i < KONDITIONEN; i++) {
    n[`MvAb${i + 1}`] = bereich('Mietverträge', kondSpalte(i, 0), MV_ERSTE, MV_LETZTE);
    n[`MvKalt${i + 1}`] = bereich('Mietverträge', kondSpalte(i, 1), MV_ERSTE, MV_LETZTE);
    n[`MvNkV${i + 1}`] = bereich('Mietverträge', kondSpalte(i, 2), MV_ERSTE, MV_LETZTE);
    n[`MvKey${i + 1}`] = bereich('Mietverträge', MH.key + i, MV_ERSTE, MV_LETZTE);
  }

  /* Monatsspalten: je ein eigener Name, damit keine Formel eine Spalte raet. */
  for (let m = 0; m < 12; m++) {
    n[`MlM${m + 1}`] = bereich('Kern', ML.monat + m, ML_ERSTE, ML_LETZTE);
    n[`NkM${m + 1}`] = bereich('Kern', NKS.monat + m, NK_ERSTE, NK_LETZTE);
  }
  /* Ist-Kennzahlen: je Groesse ein Name */
  for (const [schluessel, spalte] of Object.entries(I)) {
    n['Ist' + schluessel.charAt(0).toUpperCase() + schluessel.slice(1)] =
      bereich('Kern', spalte, IST_ERSTE, IST_LETZTE);
  }
  /* Objektjahr: je Groesse ein Name */
  for (const [schluessel, spalte] of Object.entries(OJ)) {
    n['Oj' + schluessel.charAt(0).toUpperCase() + schluessel.slice(1)] =
      bereich('Kern', spalte, OJ_ERSTE, OJ_LETZTE);
  }
  /* Verkaufsrechnung */
  for (const [schluessel, spalte] of Object.entries(VK)) {
    n['Vk' + schluessel.charAt(0).toUpperCase() + schluessel.slice(1)] =
      bereich('Kern', spalte, VK_ERSTE, VK_LETZTE);
  }
  return n;
}

/* ==========================================================================
   Formelbausteine
   ========================================================================== */

/** Mindesttilgung nach Ablauf der Zinsbindung – finanzmathematik.js:19 */
const MINDEST_TILGUNG = 1;

/** Wachstumsfaktor wie forecast.js:78 – Math.pow(1+r/100, Math.max(0,jahre)) */
const wachstum = (rate, jahre) => `(1+(${rate})/100)^MAX(0,${jahre})`;

/* Datum als Text – NIE ueber TEXT(datum,"TT.MM.JJJJ"). Solche Formatcodes sind
   sprachabhaengig, "TTT" im Deutschen und "DDD" im Englischen. Nur die reinen
   Ziffernmasken "0" und "00" sind unbedenklich, dort gibt es nichts zu
   uebersetzen. Siehe referenzen/vertraeglichkeit.md, Falle 2. */
const datumText = (ref) =>
  `TEXT(DAY(${ref}),"00")&"."&TEXT(MONTH(${ref}),"00")&"."&YEAR(${ref})`;
const monatText = (ref) => `TEXT(MONTH(${ref}),"00")&"."&YEAR(${ref})`;

/** Zugriff auf Vorbelegungsdaten; fehlt etwas, bleibt die Zelle leer. */
function feldWert(liste, i, name, umwandeln = (x) => x) {
  const e = liste?.[i];
  if (!e) return null;
  const v = e[name];
  return v === undefined || v === null || v === '' ? null : umwandeln(v);
}

/**
 * Nachschlagekette ueber die Konditionen eines Mietvertrags.
 * Die jueng­ste Kondition mit "gilt ab" <= Stichtag gewinnt – wie
 * store.js:450 aktuelleKondition(). Die Kette entsteht aus KONDITIONEN,
 * nicht von Hand; eine weitere Staffel ist eine hoehere Zahl.
 */
function kondKette(stichtag, wertFuer, keyFuer, sonst = '0') {
  let aus = sonst;
  for (let i = 0; i < KONDITIONEN; i++) {
    aus = `IF(${stichtag}>=${keyFuer(i)},${wertFuer(i)},${aus})`;
  }
  return aus;
}

/* ==========================================================================
   Blatt: Vorgaben
   ========================================================================== */

function blattVorgaben(jahr, daten) {
  const b = {
    name: 'Vorgaben', registerfarbe: NAVY_HELL, gitternetz: false,
    spalten: [{ breite: 2 }, { breite: 36 }, { breite: 16 }, { breite: 3 }, { breite: 62 }],
    zeilen: [],
  };
  const z = b.zeilen;
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };
  for (let i = 0; i < V.makler + 2; i++) z.push([]);

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Vorgaben', S.titel) }));
  setz(4, reihe({ 2: f('"ImmoPortfolio · Tabellenfassung "&Jahr&" · alles, was für die ganze Mappe gilt"', S.untertitel) }));

  const h2 = (nr, text) => setz(nr, reihe({ 2: w(text, S.h2) }));
  const eingabe = (nr, label, zelleObj, hinweis) => setz(nr, reihe({
    2: w(label, S.label), 3: zelleObj, 5: hinweis ? w(hinweis, S.fein) : null,
  }));
  const gerechnet = (nr, label, formel, format, hinweis) => setz(nr, reihe({
    2: w(label, S.label), 3: f(formel, rechen(format)), 5: hinweis ? w(hinweis, S.fein) : null,
  }));

  h2(V.h_portfolio, 'Portfolio');
  eingabe(V.name, 'Name', w(daten?.name ?? null, S_FELD), 'Erscheint auf der Übersicht und im Dashboard.');
  eingabe(V.jahr, 'Jahr der Mappe', w(daten?.jahr ?? jahr, feld(F_GANZ)), 'Zahlungen und Cashflow gelten für dieses Jahr, die Prognose startet hier.');
  eingabe(V.stichtagEingabe, 'Stichtag', w(iso(daten?.stichtag), S_FELD_DATUM), 'Leer lassen = heute. Maßgeblich für Restschuld, laufende Miete und alle Renditen.');
  gerechnet(V.stichtag, 'wirksamer Stichtag', 'IF(StichtagEingabe="",TODAY(),StichtagEingabe)', F_DATUM);
  /* Die Warnzeile traegt ihre Farbe ueber die bedingte Formatierung unten, nicht
     ueber den Zellstil. Sonst steht im Normalfall – Stichtag passt zum Jahr –
     ein leerer roter Kasten da, und der Leser sucht einen Fehler, den es nicht
     gibt. Der Text ist ohnehin schon bedingt. */
  setz(V.warnJahr, reihe({
    3: f('IF(YEAR(Stichtag)=Jahr,"","Achtung")',
      { schrift: { groesse: 9, farbe: NAVY }, ausrichtung: { h: 'center' } }),
    5: f('IF(YEAR(Stichtag)=Jahr,"",'
      + '"Der Stichtag liegt nicht im Jahr der Mappe. Jahreswerte und Stichtagswerte passen dann nicht zusammen.")',
      { schrift: { groesse: 9, farbe: NAVY } }),
  }));

  h2(V.h_steuern, 'Steuern');
  eingabe(V.steuersatz, 'Persönlicher Grenzsteuersatz', w(daten?.steuersatz ?? 42, S_FELD_PROZ));
  eingabe(V.kirche, 'Kirchensteuer', w(daten?.kirchensteuer ?? 0, S_FELD_PROZ), '0, 8 oder 9 Prozent – auf die Einkommensteuer, nicht auf das Einkommen.');
  eingabe(V.soli, 'Solidaritätszuschlag', w(daten?.soli ?? 'Nein', S_FELD), '5,5 Prozent auf die Einkommensteuer.');
  gerechnet(V.steuersatzEff, 'effektiver Steuersatz',
    'SteuersatzBasis*(1+(IF(Soli="Ja",5.5,0)+Kirchensteuer)/100)', F_PROZENT,
    'Gilt für alle Objekte ohne eigenen Satz.');

  h2(V.h_szenario, 'Szenario');
  eingabe(V.szenario, 'Gewähltes Szenario', w(daten?.szenario ?? 'Basis', S_FELD), 'Die ganze Mappe rechnet mit diesem Szenario – auch die Tilgungspläne.');
  setz(V.szenarioText, reihe({
    5: w('Zum Vergleich der drei Szenarien schaltest du hier um und liest das Dashboard erneut.', S.feiner),
  }));

  h2(V.h_annahmen, 'Annahmen (Basis)');
  eingabe(V.mietBasis, 'Mietsteigerung p. a.', w(daten?.mietsteigerung ?? 1.5, S_FELD_PROZ), 'Negative Werte senken die Miete.');
  eingabe(V.wertBasis, 'Wertsteigerung p. a.', w(daten?.wertsteigerung ?? 2.0, S_FELD_PROZ));
  eingabe(V.inflBasis, 'Inflation p. a.', w(daten?.inflation ?? 2.0, S_FELD_PROZ), 'Schreibt die Bewirtschaftungskosten fort.');
  eingabe(V.leerBasis, 'Leerstandsquote', w(daten?.leerstand ?? 2.0, S_FELD_PROZ), 'Nur in der Prognose, nicht in den Ist-Zahlungen.');
  eingabe(V.instandBasis, 'Instandhaltung vom Kaufpreis p. a.', w(daten?.instandhaltung ?? 1.0, S_FELD_PROZ), 'Greift nur, wenn das Feld am Objekt leer ist. Eine ausdrückliche 0 setzt keine Rücklage an.');
  eingabe(V.anschlussBasis, 'Anschlusszins', w(daten?.anschlusszins ?? 4.5, S_FELD_PROZ), 'Nach Ablauf der Zinsbindung, sofern am Darlehen nichts anderes steht.');
  eingabe(V.prognoseJahre, 'Prognosejahre', w(daten?.prognoseJahre ?? 20, feld(F_GANZ)), `Höchstens ${JAHRE}. Die Tabelle rechnet immer bis ${JAHRE}, zeigt aber nur so viele Jahre.`);

  h2(V.h_wirksam, 'Im gewählten Szenario wirksam');
  const delta = (name) => `INDEX(${name},MATCH(Szenario,Szenarien,0))`;
  const basis = (nr) => `$${C(3)}$${nr}`;
  gerechnet(V.miet, 'Mietsteigerung p. a.', `${basis(V.mietBasis)}+${delta('SzenMiete')}`, F_PROZENT);
  gerechnet(V.wert, 'Wertsteigerung p. a.', `${basis(V.wertBasis)}+${delta('SzenWert')}`, F_PROZENT);
  gerechnet(V.infl, 'Inflation p. a.', `${basis(V.inflBasis)}`, F_PROZENT);
  gerechnet(V.leer, 'Leerstandsquote', `MAX(0,${basis(V.leerBasis)}+${delta('SzenLeer')})`, F_PROZENT);
  gerechnet(V.instand, 'Instandhaltung p. a.', `MAX(0,${basis(V.instandBasis)}+${delta('SzenInstand')})`, F_PROZENT);
  gerechnet(V.anschluss, 'Anschlusszins', `MAX(0,${basis(V.anschlussBasis)}+${delta('SzenAnschluss')})`, F_PROZENT);

  h2(V.h_verkauf, 'Verkauf (freiwillig)');
  eingabe(V.verkaufNach, 'Verkauf nach Jahren', w(daten?.verkaufNach ?? null, feld(F_GANZ)), 'Leer lassen = kein Verkauf. Innerhalb von zehn Jahren wird der Gewinn versteuert.');
  eingabe(V.verkaufskosten, 'Verkaufskosten', w(daten?.verkaufskosten ?? 3.0, S_FELD_PROZ), 'Vom Verkaufserlös.');

  h2(V.h_nk, 'Kaufnebenkosten – Vorbelegung');
  eingabe(V.grest, 'Grunderwerbsteuer', w(daten?.grest ?? 6.5, S_FELD_PROZ), 'Gilt, wenn am Objekt weder Prozentsatz noch Bundesland steht.');
  eingabe(V.notar, 'Notar und Grundbuch', w(daten?.notar ?? 1.5, S_FELD_PROZ));
  eingabe(V.makler, 'Maklerprovision', w(daten?.makler ?? 3.57, S_FELD_PROZ));

  b.pruefungen = [
    { bereich: `${C(3)}${V.kirche}`, quelle: 'Kirchensaetze', titel: 'Kirchensteuer', hinweis: '0, 8 oder 9 Prozent' },
    { bereich: `${C(3)}${V.soli}`, quelle: 'JaNein', titel: 'Solidaritätszuschlag', hinweis: 'Ja oder Nein' },
    { bereich: `${C(3)}${V.szenario}`, quelle: 'Szenarien', titel: 'Szenario', hinweis: 'pessimistisch, Basis oder optimistisch' },
  ];
  b.bedingt = [
    /* Rot nur, wenn der Stichtag wirklich aus dem Jahr faellt. */
    {
      bereich: `${C(3)}${V.warnJahr} ${C(5)}${V.warnJahr}`,
      formel: 'YEAR(Stichtag)<>Jahr',
      stil: { fuellung: WARN_HG, schrift: { farbe: ROT } }, rang: 1,
    },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Objekte  (Objekte · Einheiten · Kennzahlen je Objekt)
   ========================================================================== */

function blattObjekte(daten) {
  const b = {
    name: 'Objekte', registerfarbe: NAVY_HELL, gitternetz: false,
    fixieren: { spalte: 3 },
    zeilen: [],
  };

  b.spalten = [];
  const breite = (spalte, wert, versteckt) => { b.spalten[spalte - 1] = versteckt ? { breite: wert, versteckt: true } : { breite: wert }; };
  b.spalten[0] = { breite: 2 };
  breite(O.nr, 5); breite(O.bez, 28); breite(O.typ, 12); breite(O.ort, 18); breite(O.baujahr, 9);
  breite(O.flaeche, 10); breite(O.kaufdatum, 12); breite(O.kaufpreis, 14);
  breite(O.land, 20); breite(O.grest, 11); breite(O.notar, 10); breite(O.makler, 10); breite(O.weitere, 12);
  breite(O.eigenprov, 14);
  breite(O.grund, 12); breite(O.afa, 10); breite(O.modern, 13); breite(O.gebManuell, 15);
  breite(O.hausgeld, 12); breite(O.umlage, 13); breite(O.verwaltung, 12); breite(O.instand, 13); breite(O.sonstige, 12);
  breite(O.wert, 14); breite(O.steuer, 12);
  for (let s = 27; s <= O_LETZTE_SPALTE; s++) breite(s, 12, true);

  const z = b.zeilen;
  for (let i = 0; i < OKZ_LETZTE + 2; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Objekte', S.titel) }));
  setz(4, reihe({ 2: f('"Stammdaten, Einheiten und Kennzahlen · "&Jahr', S.untertitel) }));

  /* --- Block A: Objekte --- */
  setz(OBJ_KOPF - 1, reihe({ 2: w('A · Stammdaten', S.h2), 8: w('weiß mit blauem Rand = hier wird getippt', S.feiner) }));
  setz(OBJ_KOPF, reihe({
    [O.nr]: w('Nr', S.kopf), [O.bez]: w('Bezeichnung', S.kopfLinks), [O.typ]: w('Typ', S.kopf),
    [O.ort]: w('Ort', S.kopfLinks), [O.baujahr]: w('Baujahr', S.kopf), [O.flaeche]: w('Fläche m²', S.kopf),
    [O.kaufdatum]: w('Kaufdatum', S.kopf), [O.kaufpreis]: w('Kaufpreis', S.kopf),
    [O.land]: w('Bundesland', S.kopfLinks), [O.grest]: w('GrESt %', S.kopf), [O.notar]: w('Notar %', S.kopf),
    [O.makler]: w('Makler %', S.kopf), [O.weitere]: w('Weitere NK €', S.kopf),
    [O.eigenprov]: w('Eigenprovision €', S.kopf),
    [O.grund]: w('Grundstück %', S.kopf), [O.afa]: w('AfA %', S.kopf), [O.modern]: w('Modernis. €', S.kopf),
    [O.gebManuell]: w('Gebäude € (manuell)', S.kopf),
    [O.hausgeld]: w('Hausgeld/M', S.kopf), [O.umlage]: w('davon umlagef./M', S.kopf),
    [O.verwaltung]: w('Verwaltung/M', S.kopf), [O.instand]: w('Instandh./M', S.kopf), [O.sonstige]: w('Sonstige/Jahr', S.kopf),
    [O.wert]: w('Verkehrswert', S.kopf), [O.steuer]: w('Steuersatz %', S.kopf),
  }));

  for (let i = 0; i < OBJEKTE; i++) {
    const r = OBJ_ERSTE + i;
    const q = daten?.objekte;
    const c = (spalte) => `$${C(spalte)}${r}`;
    setz(r, reihe({
      [O.nr]: w(i + 1, { ...rechen(F_GANZ), schrift: { farbe: GRAU } }),
      [O.bez]: w(feldWert(q, i, 'bezeichnung'), S_FELD),
      [O.typ]: w(feldWert(q, i, 'typ'), S_FELD),
      [O.ort]: w(feldWert(q, i, 'ort'), S_FELD),
      [O.baujahr]: w(feldWert(q, i, 'baujahr'), feld(F_GANZ)),
      [O.flaeche]: w(feldWert(q, i, 'flaeche'), S_FELD_ZAHL),
      [O.kaufdatum]: w(feldWert(q, i, 'kaufdatum', iso), S_FELD_DATUM),
      [O.kaufpreis]: w(feldWert(q, i, 'kaufpreis'), S_FELD_EUR),
      [O.land]: w(feldWert(q, i, 'bundesland'), S_FELD),
      [O.grest]: w(feldWert(q, i, 'grest'), S_FELD_PROZ),
      [O.notar]: w(feldWert(q, i, 'notar'), S_FELD_PROZ),
      [O.makler]: w(feldWert(q, i, 'makler'), S_FELD_PROZ),
      [O.weitere]: w(feldWert(q, i, 'weitereNk'), S_FELD_EUR),
      [O.eigenprov]: w(feldWert(q, i, 'eigenprovision'), S_FELD_EUR),
      [O.grund]: w(feldWert(q, i, 'grundstuecksanteil') ?? 20, S_FELD_PROZ),
      [O.afa]: w(feldWert(q, i, 'afaSatz') ?? 2, S_FELD_PROZ),
      [O.modern]: w(feldWert(q, i, 'modernisierung'), S_FELD_EUR),
      [O.gebManuell]: w(feldWert(q, i, 'gebaeudeanteilManuell'), S_FELD_EUR),
      [O.hausgeld]: w(feldWert(q, i, 'hausgeld'), S_FELD_EUR),
      [O.umlage]: w(feldWert(q, i, 'umlagefaehig'), S_FELD_EUR),
      [O.verwaltung]: w(feldWert(q, i, 'verwaltung'), S_FELD_EUR),
      [O.instand]: w(feldWert(q, i, 'instandhaltung'), S_FELD_EUR),
      [O.sonstige]: w(feldWert(q, i, 'sonstige'), S_FELD_EUR),
      [O.wert]: w(feldWert(q, i, 'verkehrswert'), S_FELD_EUR),
      [O.steuer]: w(feldWert(q, i, 'steuersatz'), S_FELD_PROZ),

      /* Hilfsspalten – jede rechnet genau eine Groesse */
      [O.hGrEStSatz]: f(`IF(${c(O.grest)}<>"",${c(O.grest)},`
        + `IF(${c(O.land)}="",VorgabeGrESt,IFERROR(INDEX(GrEStSatz,MATCH(${c(O.land)},Bundeslaender,0)),VorgabeGrESt)))`),
      [O.hNk]: f(`${c(O.kaufpreis)}*(${c(O.hGrEStSatz)}`
        + `+IF(${c(O.notar)}="",VorgabeNotar,${c(O.notar)})`
        + `+IF(${c(O.makler)}="",VorgabeMakler,${c(O.makler)}))/100+${c(O.weitere)}`),
      /* Eigenprovision mindert nur die Gesamtinvestition, nicht die
         Nebenkosten (hNk) – die stehen auf dem beurkundeten Kaufpreis fest.
         Wie store.js:nebenkostenBerechnen(). */
      [O.hInvest]: f(`MAX(0,${c(O.kaufpreis)}+${c(O.hNk)}-${c(O.eigenprov)})`),
      /* Manueller Gebäudeanteil (Kaufpreisaufteilungsgutachten) ersetzt die
         prozentuale Ableitung, gedeckelt auf die Anschaffungskosten – wie
         kennzahlen.js:afaWerte(). */
      [O.hGrund]: f(`IF(${c(O.gebManuell)}="",${c(O.hInvest)}*${c(O.grund)}/100,`
        + `${c(O.hInvest)}-MIN(MAX(0,${c(O.gebManuell)}),${c(O.hInvest)}))`),
      [O.hGebaeude]: f(`MAX(0,${c(O.hInvest)}-${c(O.hGrund)})+${c(O.modern)}`),
      [O.hAfaJahr]: f(`${c(O.hGebaeude)}*${c(O.afa)}/100`),
      [O.hAfaDauer]: f(`IF(${c(O.afa)}=0,0,100/${c(O.afa)})`),
      [O.hBewirt]: f(`(MAX(0,${c(O.hausgeld)}-${c(O.umlage)})+${c(O.verwaltung)}+${c(O.instand)})*12+${c(O.sonstige)}`),
      [O.hLaufend]: f(`(MAX(0,${c(O.hausgeld)}-${c(O.umlage)})+${c(O.verwaltung)})*12+${c(O.sonstige)}`),
      /* ISNUMBER statt >0 – eine ausdrueckliche 0 ist ein gueltiger Wert und
         darf nicht wie eine leere Zelle die Pauschale ziehen. Siehe forecast.js. */
      [O.hInstandBasis]: f(`IF(ISNUMBER(${c(O.instand)}),${c(O.instand)}*12,${c(O.kaufpreis)}*InstandProzent/100)`),
      [O.hSteuer]: f(`IF(${c(O.steuer)}="",SteuersatzEff,${c(O.steuer)}*(1+(IF(Soli="Ja",5.5,0)+Kirchensteuer)/100))`),
      [O.hFlaeche]: f(`IF(SUMIF(EhObj,${c(O.nr)},EhFlaeche)>0,SUMIF(EhObj,${c(O.nr)},EhFlaeche),${c(O.flaeche)})`),
      [O.hKaufJahr]: f(`IF(${c(O.kaufdatum)}="",0,YEAR(${c(O.kaufdatum)}))`),
      [O.hKaufMonat]: f(`IF(${c(O.kaufdatum)}="",1,MONTH(${c(O.kaufdatum)}))`),
      [O.hBelegt]: f(`IF(${c(O.bez)}="",0,1)`),
      [O.hWertEff]: f(`IF(${c(O.wert)}="",${c(O.kaufpreis)},${c(O.wert)})`),
    }));
  }

  /* --- Block B: Einheiten --- */
  setz(EH_H2, reihe({
    2: w('B · Einheiten', S.h2),
    5: w('Ein Objekt mit nur einer Wohnung braucht trotzdem eine Zeile – die Mietverträge hängen daran.', S.feiner),
  }));
  setz(EH_KOPF, reihe({
    [E.nr]: w('Nr', S.kopf), [E.objekt]: w('Objekt', S.kopfLinks), [E.bez]: w('Bezeichnung', S.kopfLinks),
    [E.flaeche]: w('Fläche m²', S.kopf), [E.zimmer]: w('Zimmer', S.kopf),
  }));
  for (let i = 0; i < EINHEITEN; i++) {
    const r = EH_ERSTE + i;
    const q = daten?.einheiten;
    const c = (spalte) => `$${C(spalte)}${r}`;
    setz(r, reihe({
      [E.nr]: w(i + 1, { ...rechen(F_GANZ), schrift: { farbe: GRAU } }),
      [E.objekt]: w(feldWert(q, i, 'objekt'), S_FELD),
      [E.bez]: w(feldWert(q, i, 'bezeichnung'), S_FELD),
      [E.flaeche]: w(feldWert(q, i, 'flaeche'), S_FELD_ZAHL),
      [E.zimmer]: w(feldWert(q, i, 'zimmer'), S_FELD_ZAHL),
      [E.hObj]: f(`IFERROR(MATCH(${c(E.objekt)},ObjBezeichnung,0),0)`),
      [E.hVermietet]: f(`IF(COUNTIFS(MvEinheitNr,${c(E.nr)},MvAktiv,1)>0,1,0)`),
      [E.hAnzeige]: f(`IF(${c(E.bez)}="","",${c(E.bez)}&" ("&${c(E.objekt)}&")")`),
    }));
  }

  /* --- Block C: Kennzahlen je Objekt --- */
  setz(OKZ_H2, reihe({
    2: f(`"C · Kennzahlen je Objekt zum "&${datumText('Stichtag')}`, S.h2),
    8: w('gerechnet – hier wird nichts eingetragen', S.feiner),
  }));
  setz(OKZ_KOPF, reihe({
    [K.nr]: w('Nr', S.kopf), [K.bez]: w('Bezeichnung', S.kopfLinks), [K.invest]: w('Investition', S.kopf),
    [K.wert]: w('Verkehrswert', S.kopf), [K.rest]: w('Restschuld', S.kopf), [K.miete]: w('Kaltmiete/M', S.kopf),
    [K.brutto]: w('Brutto­rendite', S.kopf), [K.netto]: w('Netto­rendite', S.kopf), [K.faktor]: w('Kaufpreis­faktor', S.kopf),
    [K.prom2]: w('€/m²', S.kopf), [K.ltv]: w('Beleihung', S.kopf), [K.dscr]: w('DSCR', S.kopf),
    [K.cfVor]: w('CF/M vor St.', S.kopf), [K.cfNach]: w('CF/M nach St.', S.kopf), [K.ekRendite]: w('EK-Rendite', S.kopf),
  }));
  for (let i = 0; i < OBJEKTE; i++) {
    const r = OKZ_ERSTE + i;
    const n = i + 1;
    const ist = (name) => `INDEX(Ist${name},${n})`;
    const leer = (formel, format) => f(`IF(INDEX(ObjBelegt,${n})=0,"",${formel})`, anzeige(format));
    setz(r, reihe({
      [K.nr]: w(n, { ...anzeige(F_GANZ), schrift: { farbe: GRAU } }),
      [K.bez]: f(`IF(INDEX(ObjBelegt,${n})=0,"–",INDEX(ObjBezeichnung,${n}))`),
      [K.invest]: leer(ist('Invest'), F_EURO),
      [K.wert]: leer(ist('Wert'), F_EURO),
      [K.rest]: leer(ist('Rest'), F_EURO),
      [K.miete]: leer(ist('MieteMonat'), F_EURO),
      [K.brutto]: leer(`IF(${ist('Invest')}=0,0,${ist('Runrate')}/${ist('Invest')}*100)`, F_PROZENT),
      [K.netto]: leer(`IF(${ist('Invest')}=0,0,(${ist('Runrate')}-${ist('BewirtVoll')})/${ist('Invest')}*100)`, F_PROZENT),
      [K.faktor]: leer(`IF(${ist('Runrate')}=0,0,INDEX(ObjKaufpreis,${n})/${ist('Runrate')})`, F_ZAHL1),
      [K.prom2]: leer(`IF(${ist('Flaeche')}=0,0,${ist('MieteMonat')}/${ist('Flaeche')})`, F_EURO2),
      [K.ltv]: leer(`IF(${ist('Wert')}=0,0,${ist('Rest')}/${ist('Wert')}*100)`, F_PROZENT1),
      [K.dscr]: leer(`IF(${ist('Kapital12')}=0,0,(${ist('Runrate')}-${ist('BewirtVoll')})/${ist('Kapital12')})`, F_ZAHL2),
      [K.cfVor]: leer(`${ist('CfVor')}/12`, F_EURO),
      [K.cfNach]: leer(`${ist('CfNach')}/12`, F_EURO),
      [K.ekRendite]: leer(`IF(${ist('EkEingesetzt')}=0,0,${ist('CfRunrateNach')}/${ist('EkEingesetzt')}*100)`, F_PROZENT),
    }));
  }

  b.pruefungen = [
    { bereich: `${C(O.typ)}${OBJ_ERSTE}:${C(O.typ)}${OBJ_LETZTE}`, quelle: 'Objekttypen', titel: 'Typ', hinweis: 'Aus der Liste wählen' },
    { bereich: `${C(O.land)}${OBJ_ERSTE}:${C(O.land)}${OBJ_LETZTE}`, quelle: 'Bundeslaender', titel: 'Bundesland', hinweis: 'Setzt die Grunderwerbsteuer; ein eigener Prozentsatz geht vor' },
    { bereich: `${C(E.objekt)}${EH_ERSTE}:${C(E.objekt)}${EH_LETZTE}`, quelle: 'ObjBezeichnung', titel: 'Objekt', hinweis: 'Aus der Liste der Objekte wählen' },
  ];
  b.bedingt = [
    {
      bereich: `${C(K.cfVor)}${OKZ_ERSTE}:${C(K.cfNach)}${OKZ_LETZTE}`,
      formel: `${C(K.cfVor)}${OKZ_ERSTE}<0`, stil: { schrift: { farbe: ROT } }, rang: 1,
    },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Mietverträge
   ========================================================================== */

function blattMietvertraege(daten) {
  const b = {
    name: 'Mietverträge', registerfarbe: NAVY_HELL, gitternetz: false,
    fixieren: { spalte: 4 }, zeilen: [], spalten: [],
  };
  const breite = (spalte, wert, versteckt) => { b.spalten[spalte - 1] = versteckt ? { breite: wert, versteckt: true } : { breite: wert }; };
  b.spalten[0] = { breite: 2 };
  breite(M.nr, 5); breite(M.einheit, 30); breite(M.mieter, 20); breite(M.beginn, 12);
  breite(M.befristet, 13); breite(M.gekuendigt, 13); breite(M.anpassung, 12); breite(M.index, 10);
  for (let i = 0; i < KONDITIONEN; i++) {
    breite(kondSpalte(i, 0), 12); breite(kondSpalte(i, 1), 12); breite(kondSpalte(i, 2), 11);
  }
  for (let s = M_NACH_KOND + 1; s <= MH_LETZTE; s++) breite(s, 12, true);

  const z = b.zeilen;
  for (let i = 0; i < MO_LETZTE + 2; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Mietverträge', S.titel) }));
  setz(4, reihe({ 2: w('Eine Zeile je Vertrag. Staffelmieten sind weitere Konditionen mit späterem "gilt ab".', S.untertitel) }));

  const kopf = { [M.nr]: w('Nr', S.kopf), [M.einheit]: w('Einheit', S.kopfLinks), [M.mieter]: w('Mieter', S.kopfLinks),
    [M.beginn]: w('Beginn', S.kopf), [M.befristet]: w('befristet bis', S.kopf), [M.gekuendigt]: w('gekündigt zum', S.kopf),
    [M.anpassung]: w('Anpassung', S.kopf), [M.index]: w('Index % p.a.', S.kopf) };
  for (let i = 0; i < KONDITIONEN; i++) {
    kopf[kondSpalte(i, 0)] = w(`gilt ab ${i + 1}`, S.kopf);
    kopf[kondSpalte(i, 1)] = w(`kalt ${i + 1}`, S.kopf);
    kopf[kondSpalte(i, 2)] = w(`NK ${i + 1}`, S.kopf);
  }
  setz(MV_KOPF - 1, reihe({ 2: w('A · Verträge', S.h2) }));
  setz(MV_KOPF, reihe(kopf));

  for (let i = 0; i < VERTRAEGE; i++) {
    const r = MV_ERSTE + i;
    const q = daten?.vertraege;
    const c = (spalte) => `$${C(spalte)}${r}`;
    const eintrag = {
      [M.nr]: w(i + 1, { ...rechen(F_GANZ), schrift: { farbe: GRAU } }),
      [M.einheit]: w(feldWert(q, i, 'einheit'), S_FELD),
      [M.mieter]: w(feldWert(q, i, 'mieter'), S_FELD),
      [M.beginn]: w(feldWert(q, i, 'beginn', iso), S_FELD_DATUM),
      [M.befristet]: w(feldWert(q, i, 'befristetBis', iso), S_FELD_DATUM),
      [M.gekuendigt]: w(feldWert(q, i, 'gekuendigtZum', iso), S_FELD_DATUM),
      [M.anpassung]: w(feldWert(q, i, 'anpassung'), S_FELD),
      [M.index]: w(feldWert(q, i, 'indexProzent'), S_FELD_PROZ),
      [MH.einheitNr]: f(`IFERROR(MATCH(${c(M.einheit)},EhAnzeige,0),0)`),
      [MH.objNr]: f(`IF(${c(MH.einheitNr)}=0,0,INDEX(EhObj,${c(MH.einheitNr)}))`),
      [MH.endeEff]: f(`IF(AND(${c(M.befristet)}="",${c(M.gekuendigt)}=""),0,`
        + `IF(${c(M.befristet)}="",${c(M.gekuendigt)},`
        + `IF(${c(M.gekuendigt)}="",${c(M.befristet)},MIN(${c(M.befristet)},${c(M.gekuendigt)}))))`),
      [MH.satz]: f(`IF(AND(${c(M.anpassung)}="Index",${c(M.index)}<>""),${c(M.index)},Mietsteigerung)`),
      [MH.aktiv]: f(`IF(OR(${c(M.beginn)}="",${c(M.beginn)}>Stichtag),0,`
        + `IF(AND(${c(MH.endeEff)}>0,${c(MH.endeEff)}<Stichtag),0,1))`),
      [MH.kalt]: f(`IF(${c(MH.aktiv)}=0,0,`
        + kondKette('Stichtag', (k) => c(kondSpalte(k, 1)), (k) => c(MH.key + k)) + ')'),
      [MH.nk]: f(`IF(${c(MH.aktiv)}=0,0,`
        + kondKette('Stichtag', (k) => c(kondSpalte(k, 2)), (k) => c(MH.key + k)) + ')'),
    };
    for (let k = 0; k < KONDITIONEN; k++) {
      eintrag[kondSpalte(k, 0)] = w(feldWert(q, i, `ab${k + 1}`, iso), S_FELD_DATUM);
      eintrag[kondSpalte(k, 1)] = w(feldWert(q, i, `kalt${k + 1}`), S_FELD_EUR);
      eintrag[kondSpalte(k, 2)] = w(feldWert(q, i, `nk${k + 1}`), S_FELD_EUR);
      /* Stichtagsschluessel: leere Konditionen ans Ende, nie nach vorn */
      eintrag[MH.key + k] = f(`IF(${c(kondSpalte(k, 0))}="",999999,${c(kondSpalte(k, 0))})`);
    }
    setz(r, reihe(eintrag));
  }

  /* --- Block B: Miete je Objekt --- */
  setz(MO_H2, reihe({ 2: f(`"B · Miete je Objekt zum "&${datumText('Stichtag')}`, S.h2) }));
  setz(MO_KOPF, reihe({
    2: w('Nr', S.kopf), 3: w('Objekt', S.kopfLinks), 4: w('Einheiten', S.kopf), 5: w('vermietet', S.kopf),
    6: w('leer', S.kopf), 7: w('Kaltmiete/M', S.kopf), 8: w('NK/M', S.kopf), 9: w('Warmmiete/M', S.kopf),
    10: w('€/m²', S.kopf),
  }));
  for (let i = 0; i < OBJEKTE; i++) {
    const r = MO_ERSTE + i;
    const n = i + 1;
    const ist = (name) => `INDEX(Ist${name},${n})`;
    const leer = (formel, format) => f(`IF(INDEX(ObjBelegt,${n})=0,"",${formel})`, anzeige(format));
    setz(r, reihe({
      2: w(n, { ...anzeige(F_GANZ), schrift: { farbe: GRAU } }),
      3: f(`IF(INDEX(ObjBelegt,${n})=0,"–",INDEX(ObjBezeichnung,${n}))`),
      4: leer(ist('Einheiten'), F_GANZ),
      5: leer(ist('Vermietet'), F_GANZ),
      6: leer(ist('Leerstand'), F_GANZ),
      7: leer(ist('MieteMonat'), F_EURO),
      8: leer(ist('NkMonat'), F_EURO),
      9: leer(`${ist('MieteMonat')}+${ist('NkMonat')}`, F_EURO),
      10: leer(`IF(${ist('Flaeche')}=0,0,${ist('MieteMonat')}/${ist('Flaeche')})`, F_EURO2),
    }));
  }

  b.pruefungen = [
    { bereich: `${C(M.einheit)}${MV_ERSTE}:${C(M.einheit)}${MV_LETZTE}`, quelle: 'EhAnzeige', titel: 'Einheit', hinweis: 'Aus der Liste der Einheiten wählen' },
    { bereich: `${C(M.anpassung)}${MV_ERSTE}:${C(M.anpassung)}${MV_LETZTE}`, quelle: 'Anpassungsarten', titel: 'Anpassung', hinweis: 'Bei Index zählt der eigene Satz, sonst die Annahme aus den Vorgaben' },
  ];
  b.bedingt = [
    {
      bereich: `${C(M.nr)}${MV_ERSTE}:${C(M.index)}${MV_LETZTE}`,
      formel: `AND($${C(M.beginn)}${MV_ERSTE}<>"",$${C(MH.aktiv)}${MV_ERSTE}=0)`,
      stil: { schrift: { farbe: GRAU_HELL, kursiv: true } }, rang: 1,
    },
    {
      bereich: `${C(6)}${MO_ERSTE}:${C(6)}${MO_LETZTE}`,
      formel: `${C(6)}${MO_ERSTE}>0`, stil: { fuellung: WARN_HG, schrift: { farbe: ROT } }, rang: 1,
    },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Darlehen  (Darlehen · Sondertilgungen · Kennzahlen je Darlehen)
   ========================================================================== */

function blattDarlehen(daten) {
  const b = {
    name: 'Darlehen', registerfarbe: NAVY_HELL, gitternetz: false,
    fixieren: { spalte: 4 }, zeilen: [], spalten: [],
  };
  const breite = (spalte, wert, versteckt) => { b.spalten[spalte - 1] = versteckt ? { breite: wert, versteckt: true } : { breite: wert }; };
  b.spalten[0] = { breite: 2 };
  breite(D.nr, 5); breite(D.objekt, 28); breite(D.bank, 18); breite(D.art, 12); breite(D.betrag, 14);
  breite(D.auszahlung, 12); breite(D.sollzins, 11); breite(D.tilgung, 12); breite(D.bindung, 13);
  breite(D.anschluss, 14); breite(D.tilgfrei, 13); breite(D.ersatz, 14); breite(D.ersatzProzent, 13);
  breite(D.ersatzZins, 13); breite(D.sonderrecht, 14);
  for (let s = 17; s <= D.hReichweite; s++) breite(s, 12, true);

  const z = b.zeilen;
  for (let i = 0; i < DKZ_LETZTE + 2; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Darlehen', S.titel) }));
  setz(4, reihe({ 2: w('Nachschüssige Annuität, monatlich verrechnet. Die erste Rate fällt im Monat nach der Auszahlung an.', S.untertitel) }));

  setz(D_KOPF - 1, reihe({ 2: w('A · Darlehen', S.h2) }));
  setz(D_KOPF, reihe({
    [D.nr]: w('Nr', S.kopf), [D.objekt]: w('Objekt', S.kopfLinks), [D.bank]: w('Bank', S.kopfLinks),
    [D.art]: w('Art', S.kopf), [D.betrag]: w('Betrag', S.kopf), [D.auszahlung]: w('Auszahlung', S.kopf),
    [D.sollzins]: w('Sollzins %', S.kopf), [D.tilgung]: w('Tilgung %', S.kopf), [D.bindung]: w('Zinsbindung bis', S.kopf),
    [D.anschluss]: w('eig. Anschluss %', S.kopf), [D.tilgfrei]: w('Tilgungsstart', S.kopf),
    [D.ersatz]: w('Tilgungsersatz', S.kopf), [D.ersatzProzent]: w('Ersatz % p.a.', S.kopf),
    [D.ersatzZins]: w('Verzinsung %', S.kopf), [D.sonderrecht]: w('Sondertilgung % p.a.', S.kopf),
  }));

  for (let i = 0; i < DARLEHEN; i++) {
    const r = D_ERSTE + i;
    const q = daten?.darlehen;
    const c = (spalte) => `$${C(spalte)}${r}`;
    setz(r, reihe({
      [D.nr]: w(i + 1, { ...rechen(F_GANZ), schrift: { farbe: GRAU } }),
      [D.objekt]: w(feldWert(q, i, 'objekt'), S_FELD),
      [D.bank]: w(feldWert(q, i, 'bank'), S_FELD),
      [D.art]: w(feldWert(q, i, 'art'), S_FELD),
      [D.betrag]: w(feldWert(q, i, 'betrag'), S_FELD_EUR),
      [D.auszahlung]: w(feldWert(q, i, 'auszahlung', iso), S_FELD_DATUM),
      [D.sollzins]: w(feldWert(q, i, 'sollzins'), S_FELD_PROZ),
      [D.tilgung]: w(feldWert(q, i, 'tilgung'), S_FELD_PROZ),
      [D.bindung]: w(feldWert(q, i, 'zinsbindungBis', iso), S_FELD_DATUM),
      [D.anschluss]: w(feldWert(q, i, 'anschlusszins'), S_FELD_PROZ),
      [D.tilgfrei]: w(feldWert(q, i, 'tilgungStart', iso), S_FELD_DATUM),
      [D.ersatz]: w(feldWert(q, i, 'tilgungsersatz'), S_FELD),
      [D.ersatzProzent]: w(feldWert(q, i, 'ersatzProzent'), S_FELD_PROZ),
      [D.ersatzZins]: w(feldWert(q, i, 'ersatzZins'), S_FELD_PROZ),
      [D.sonderrecht]: w(feldWert(q, i, 'sonderrecht') ?? 5, S_FELD_PROZ),

      [D.hObj]: f(`IFERROR(MATCH(${c(D.objekt)},ObjBezeichnung,0),0)`),
      /* Endfaellig und Tilgungsersatz tilgen nicht – finanzmathematik.js:57-58 */
      [D.hOhneTilg]: f(`IF(OR(${c(D.art)}="Endfällig",${c(D.ersatz)}="Ja"),1,0)`),
      [D.hAnschluss]: f(`IF(${c(D.anschluss)}="",Anschlusszins,${c(D.anschluss)})`),
      /* Tilgungsstart auf den Monatsanfang normiert – verglichen wird auf
         Monatsebene, wie in finanzmathematik.js */
      [D.hTilgFrei]: f(`IF(OR(${c(D.tilgfrei)}="",${c(D.auszahlung)}=""),0,`
        + `DATE(YEAR(${c(D.tilgfrei)}),MONTH(${c(D.tilgfrei)}),1))`),
      [D.hErsatzRate]: f(`IF(${c(D.ersatz)}="Ja",${c(D.betrag)}*${c(D.ersatzProzent)}/100/12,0)`),
      [D.hErsatzZins]: f(`IF(${c(D.ersatz)}="Ja",${c(D.ersatzZins)}/100/12,0)`),
      [D.hRate1]: f(`IF(${c(D.hOhneTilg)}=1,0,${c(D.betrag)}*(${c(D.sollzins)}+${c(D.tilgung)})/100/12)`),
      [D.hAnzeige]: f(`IF(${c(D.betrag)}="","",${c(D.nr)}&" · "&IF(${c(D.bank)}="","Darlehen",${c(D.bank)}))`),
      [D.hBelegt]: f(`IF(OR(${c(D.betrag)}="",${c(D.betrag)}=0,${c(D.auszahlung)}=""),0,1)`),
      /* Die Monatszeilen laufen ab der Auszahlung. Reicht dieses Fenster nicht
         bis zum Ende der Prognose und laeuft das Darlehen dort noch, fehlen
         Zins und Tilgung – das Dashboard sagt es dann ausdruecklich. */
      [D.hReichweite]: f(`IF(AND(${c(D.hBelegt)}=1,`
        + `SUMIFS(TilgAktiv,TilgDarl,${c(D.nr)})>=${MONATE},`
        + `EOMONTH(${c(D.auszahlung)},${MONATE - 1})+1<DATE(Jahr+MIN(PrognoseJahre,${JAHRE}),12,1)),1,0)`),
    }));
  }

  /* --- Block B: Sondertilgungen --- */
  setz(ST_H2, reihe({
    2: w('B · Sondertilgungen', S.h2),
    5: w('Werden im Monat des Datums verrechnet, höchstens bis zur Restschuld.', S.feiner),
  }));
  setz(ST_KOPF, reihe({
    [ST.nr]: w('Nr', S.kopf), [ST.darlehen]: w('Darlehen', S.kopfLinks), [ST.datum]: w('Datum', S.kopf),
    [ST.betrag]: w('Betrag', S.kopf),
  }));
  for (let i = 0; i < SONDER; i++) {
    const r = ST_ERSTE + i;
    const q = daten?.sondertilgungen;
    const c = (spalte) => `$${C(spalte)}${r}`;
    setz(r, reihe({
      [ST.nr]: w(i + 1, { ...rechen(F_GANZ), schrift: { farbe: GRAU } }),
      [ST.darlehen]: w(feldWert(q, i, 'darlehen'), S_FELD),
      [ST.datum]: w(feldWert(q, i, 'datum', iso), S_FELD_DATUM),
      [ST.betrag]: w(feldWert(q, i, 'betrag'), S_FELD_EUR),
      [ST.hDarl]: f(`IFERROR(MATCH(${c(ST.darlehen)},DarlAnzeige,0),0)`),
      [ST.hJahr]: f(`IF(${c(ST.datum)}="",0,YEAR(${c(ST.datum)}))`),
    }));
  }

  /* --- Block C: Kennzahlen je Darlehen --- */
  setz(DKZ_H2, reihe({ 2: f(`"C · Kennzahlen je Darlehen zum "&${datumText('Stichtag')}`, S.h2) }));
  setz(DKZ_KOPF, reihe({
    [DK.nr]: w('Nr', S.kopf), [DK.bank]: w('Bank', S.kopfLinks), [DK.betrag]: w('Betrag', S.kopf),
    [DK.rate]: w('Rate/Monat', S.kopf), [DK.rest]: w('Restschuld', S.kopf),
    [DK.restBindung]: w('Rest bei Bindungsende', S.kopf), [DK.volltilgung]: w('Volltilgung', S.kopf),
    [DK.zinsen]: w('Zinsen gesamt', S.kopf), [DK.ersatzGuthaben]: w('Ersatz-Guthaben', S.kopf),
    [DK.deckung]: w('Deckung', S.kopf), [DK.sonderJahr]: w('Sonder­tilgung Jahr', S.kopf),
    [DK.sonderMax]: w('davon zulässig', S.kopf),
  }));
  for (let i = 0; i < DARLEHEN; i++) {
    const r = DKZ_ERSTE + i;
    const n = i + 1;
    const leer = (formel, format) => f(`IF(INDEX(DarlBelegt,${n})=0,"",${formel})`, anzeige(format));
    const bisStichtag = (name) => `SUMIFS(${name},TilgDarl,${n},TilgDatum,"<="&Stichtag)`;
    const rest = `MAX(0,INDEX(DarlBetrag,${n})-${bisStichtag('TilgTilgung')}-${bisStichtag('TilgSonder')})`;
    const naechster = 'EOMONTH(Stichtag,0)+1';
    const imMonat = (name) => `SUMIFS(${name},TilgDarl,${n},TilgDatum,${naechster})`;
    setz(r, reihe({
      [DK.nr]: w(n, { ...anzeige(F_GANZ), schrift: { farbe: GRAU } }),
      [DK.bank]: f(`IF(INDEX(DarlBelegt,${n})=0,"–",IF(INDEX(DarlBank,${n})="","Darlehen",INDEX(DarlBank,${n})))`),
      [DK.betrag]: leer(`INDEX(DarlBetrag,${n})`, F_EURO),
      [DK.rate]: leer(`${imMonat('TilgZins')}+${imMonat('TilgTilgung')}+${imMonat('TilgErsatz')}`, F_EURO),
      [DK.rest]: leer(rest, F_EURO),
      [DK.restBindung]: leer(`IF(INDEX(DarlBindung,${n})="","",`
        + `MAX(0,INDEX(DarlBetrag,${n})`
        + `-SUMIFS(TilgTilgung,TilgDarl,${n},TilgDatum,"<="&INDEX(DarlBindung,${n}))`
        + `-SUMIFS(TilgSonder,TilgDarl,${n},TilgDatum,"<="&INDEX(DarlBindung,${n}))))`, F_EURO),
      [DK.volltilgung]: leer(`IF(SUMIFS(TilgAktiv,TilgDarl,${n})>=${MONATE},"über ${JAHRE} Jahre",`
        + monatText(`EOMONTH(INDEX(DarlAuszahlung,${n}),SUMIFS(TilgAktiv,TilgDarl,${n})-1)+1`) + ')', null),
      [DK.zinsen]: leer(`SUMIFS(TilgZins,TilgDarl,${n})`, F_EURO),
      [DK.ersatzGuthaben]: leer(`IF(INDEX(DarlErsatzRate,${n})=0,"",`
        + `${bisStichtag('TilgErsatz')}+${bisStichtag('TilgErtrag')})`, F_EURO),
      [DK.deckung]: leer(`IF(OR(INDEX(DarlErsatzRate,${n})=0,${rest}=0),"",`
        + `(${bisStichtag('TilgErsatz')}+${bisStichtag('TilgErtrag')})/${rest}*100)`, F_PROZENT1),
      [DK.sonderJahr]: leer(`SUMIFS(SondBetrag,SondDarl,${n},SondJahr,Jahr)`, F_EURO),
      [DK.sonderMax]: leer(`INDEX(DarlBetrag,${n})*INDEX(DarlSonderrecht,${n})/100`, F_EURO),
    }));
  }

  b.pruefungen = [
    { bereich: `${C(D.objekt)}${D_ERSTE}:${C(D.objekt)}${D_LETZTE}`, quelle: 'ObjBezeichnung', titel: 'Objekt', hinweis: 'Aus der Liste der Objekte wählen' },
    { bereich: `${C(D.art)}${D_ERSTE}:${C(D.art)}${D_LETZTE}`, quelle: 'Darlehensarten', titel: 'Art', hinweis: 'Endfällig tilgt nicht' },
    { bereich: `${C(D.ersatz)}${D_ERSTE}:${C(D.ersatz)}${D_LETZTE}`, quelle: 'JaNein', titel: 'Tilgungsersatz', hinweis: 'Statt zu tilgen wird auf ein verzinstes Konto eingezahlt' },
    { bereich: `${C(ST.darlehen)}${ST_ERSTE}:${C(ST.darlehen)}${ST_LETZTE}`, quelle: 'DarlAnzeige', titel: 'Darlehen', hinweis: 'Aus der Liste der Darlehen wählen' },
  ];
  b.bedingt = [
    {
      bereich: `${C(DK.sonderJahr)}${DKZ_ERSTE}:${C(DK.sonderJahr)}${DKZ_LETZTE}`,
      formel: `AND(ISNUMBER($${C(DK.sonderMax)}${DKZ_ERSTE}),$${C(DK.sonderJahr)}${DKZ_ERSTE}>$${C(DK.sonderMax)}${DKZ_ERSTE})`,
      stil: { fuellung: WARN_HG, schrift: { farbe: ROT } }, rang: 1,
    },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Tilgung (versteckt)
   Der Rechenkern der Finanzierung – eine Zeile je Darlehen und Monat,
   Zeile fuer Zeile nachgebaut aus finanzmathematik.js:87-148.
   ========================================================================== */

function blattTilgung() {
  const b = {
    name: 'Tilgung', versteckt: true, gitternetz: false,
    fixieren: { zeile: T_KOPF }, zeilen: [], spalten: [],
  };
  b.spalten[0] = { breite: 2 };
  /* Breit genug, damit die Werte auch beim CSV-Export ungerundet erscheinen –
     LibreOffice schreibt „wie angezeigt", und im Standardformat haengt die
     Anzeige von der Spaltenbreite ab. Das Blatt ist ohnehin ausgeblendet. */
  for (let s = 2; s <= T.restEnde; s++) b.spalten[s - 1] = { breite: 20 };

  const z = b.zeilen;
  z.push(reihe({ 2: w('Tilgung – Rechenkern, nicht bearbeiten', S.h2) }));
  z.push([]);
  z.push(reihe({
    [T.darlehen]: w('Darl', S.kopf), [T.obj]: w('Obj', S.kopf), [T.i]: w('Monat i', S.kopf),
    [T.datum]: w('Datum', S.kopf), [T.jahr]: w('Jahr', S.kopf), [T.bindung]: w('in Bindung', S.kopf),
    [T.zinssatz]: w('Zinssatz', S.kopf), [T.aktiv]: w('aktiv', S.kopf),
    [T.restAnfang]: w('Rest Anfang', S.kopf), [T.rate]: w('Rate', S.kopf), [T.zins]: w('Zins', S.kopf),
    [T.tilgung]: w('Tilgung', S.kopf), [T.sonder]: w('Sondertilgung', S.kopf),
    [T.ersatzRate]: w('Ersatzrate', S.kopf), [T.ertrag]: w('Ertrag', S.kopf),
    [T.guthaben]: w('Guthaben', S.kopf), [T.restEnde]: w('Rest Ende', S.kopf),
  }));

  for (let d = 0; d < DARLEHEN; d++) {
    const n = d + 1;
    const idx = (name) => `INDEX(${name},${n})`;
    for (let i = 0; i < MONATE; i++) {
      const r = tZeile(d, i);
      const vor = r - 1;
      const c = (spalte) => `$${C(spalte)}${r}`;
      const p = (spalte) => `$${C(spalte)}${vor}`;

      /* Die erste Rate faellt im Monat NACH der Auszahlung an – :88 */
      const datum = `IF(${idx('DarlBelegt')}=0,0,EOMONTH(${idx('DarlAuszahlung')},${i})+1)`;

      /* Endfaellige Darlehen und Tilgungsersatz laufen bis zum Bindungsende,
         ohne Bindung ueber den ganzen Horizont – :96 */
      const aktiv = `IF(${idx('DarlBelegt')}=0,0,`
        + `IF(${idx('DarlOhneTilgung')}=1,IF(${idx('DarlBindung')}="",1,${c(T.bindung)}),`
        + `IF(${c(T.restAnfang)}>0.005,1,0)))`;

      /* Rate: bleibt bestehen, wird beim Wechsel auf den Anschlusszins auf
         mindestens Zins + Mindesttilgung angehoben und im Monat des
         Tilgungsstarts als Annuitaet auf die offene Restschuld neu bestimmt. */
      const rateBasis = i === 0
        ? idx('DarlRate1')
        : `IF(AND(${c(T.bindung)}=0,${p(T.bindung)}=1),`
          + `MAX(${p(T.rate)},${c(T.restAnfang)}*(${c(T.zinssatz)}+${MINDEST_TILGUNG})/100/12),${p(T.rate)})`;

      /* Vor dem Tilgungsstart fliessen nur Zinsen. Im ersten Monat kann es
         keine tilgungsfreie Vorlaufzeit geben, deshalb dort ohne Neubestimmung. */
      const rateFormel = i === 0
        ? rateBasis
        : `IF(AND(${idx('DarlTilgStart')}>0,${c(T.datum)}=${idx('DarlTilgStart')}),`
          + `${c(T.restAnfang)}*(${c(T.zinssatz)}+${idx('DarlTilgung')})/100/12,${rateBasis})`;

      const tilgungsfrei = `OR(${idx('DarlOhneTilgung')}=1,`
        + `AND(${idx('DarlTilgStart')}>0,${c(T.datum)}<${idx('DarlTilgStart')}))`;

      z[r - 1] = reihe({
        [T.darlehen]: w(n),
        [T.obj]: f(idx('DarlObj')),
        [T.i]: w(i + 1),
        [T.datum]: f(datum, { format: F_MONAT }),
        [T.jahr]: f(`IF(${c(T.datum)}=0,0,YEAR(${c(T.datum)}))`),
        [T.bindung]: f(`IF(${idx('DarlBindung')}="",1,IF(${c(T.datum)}<=${idx('DarlBindung')},1,0))`),
        [T.zinssatz]: f(`IF(${c(T.bindung)}=1,${idx('DarlSollzins')},${idx('DarlAnschluss')})`),
        [T.aktiv]: f(aktiv),
        [T.restAnfang]: f(i === 0
          ? `IF(${idx('DarlBelegt')}=0,0,${idx('DarlBetrag')})`
          : `IF(${p(T.aktiv)}=0,0,${p(T.restEnde)})`),
        [T.rate]: f(`IF(${c(T.aktiv)}=0,0,IF(${idx('DarlOhneTilgung')}=1,0,${rateFormel}))`),
        [T.zins]: f(`IF(${c(T.aktiv)}=0,0,${c(T.restAnfang)}*${c(T.zinssatz)}/100/12)`),
        [T.tilgung]: f(`IF(${c(T.aktiv)}=0,0,IF(${tilgungsfrei},0,`
          + `MIN(MAX(0,${c(T.rate)}-${c(T.zins)}),${c(T.restAnfang)})))`),
        [T.sonder]: f(`IF(${c(T.aktiv)}=0,0,MIN(`
          + `SUMIFS(SondBetrag,SondDarl,${n},SondDatum,">="&${c(T.datum)},SondDatum,"<="&EOMONTH(${c(T.datum)},0)),`
          + `${c(T.restAnfang)}-${c(T.tilgung)}))`),
        [T.ersatzRate]: f(`IF(${c(T.aktiv)}=0,0,${idx('DarlErsatzRate')})`),
        /* Ansparkonto: erst verzinsen, dann die Rate gutschreiben – :122-123 */
        [T.ertrag]: f(i === 0 ? '0' : `IF(${c(T.aktiv)}=0,0,${p(T.guthaben)}*${idx('DarlErsatzZins')})`),
        [T.guthaben]: f(i === 0
          ? `IF(${c(T.aktiv)}=0,0,${c(T.ertrag)}+${c(T.ersatzRate)})`
          : `IF(${c(T.aktiv)}=0,0,${p(T.guthaben)}+${c(T.ertrag)}+${c(T.ersatzRate)})`),
        [T.restEnde]: f(`IF(${c(T.aktiv)}=0,0,${c(T.restAnfang)}-${c(T.tilgung)}-${c(T.sonder)})`),
      });
    }
  }
  return rohFormatieren(b);
}

/* ==========================================================================
   Blatt: Kern (versteckt)
   Fuenf Bloecke mit eigener Spaltenzuordnung – siehe die Konstanten oben.
   ========================================================================== */

function blattKern(jahr) {
  const b = { name: 'Kern', versteckt: true, gitternetz: false, zeilen: [], spalten: [] };
  b.spalten[0] = { breite: 2 };
  for (let s = 2; s <= 50; s++) b.spalten[s - 1] = { breite: 20 };

  const z = b.zeilen;
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };
  for (let i = 0; i < VK_LETZTE + 2; i++) z.push([]);

  setz(1, reihe({ 2: w('Kern – Nachschlagetabellen und Rechenblöcke, nicht bearbeiten', S.h2) }));

  /* --- Block A: Nachschlagetabellen --- */
  setz(N_KOPF, reihe({
    [NL.typ]: w('Objekttyp', S.kopf), [NL.art]: w('Darlehensart', S.kopf), [NL.janein]: w('Ja/Nein', S.kopf),
    [NL.anpassung]: w('Anpassung', S.kopf), [NL.kirche]: w('Kirchensteuer', S.kopf),
    [NL.szenario]: w('Szenario', S.kopf), [NL.szMiete]: w('Δ Miete', S.kopf), [NL.szWert]: w('Δ Wert', S.kopf),
    [NL.szLeer]: w('Δ Leerstand', S.kopf), [NL.szAnschluss]: w('Δ Anschluss', S.kopf), [NL.szInstand]: w('Δ Instand', S.kopf),
    [NL.land]: w('Bundesland', S.kopf), [NL.landSatz]: w('GrESt %', S.kopf),
    [NL.zahlart]: w('Zahlungsart', S.kopf), [NL.zahlGruppe]: w('Gruppe', S.kopf), [NL.zahlVz]: w('Vorzeichen', S.kopf),
    [NL.monat]: w('Monat', S.kopf),
  }));
  for (let i = 0; i < N_LETZTE - N_ERSTE + 1; i++) {
    const eintrag = {};
    if (i < OBJEKTTYPEN.length) eintrag[NL.typ] = w(OBJEKTTYPEN[i]);
    if (i < DARLEHENSARTEN.length) eintrag[NL.art] = w(DARLEHENSARTEN[i]);
    if (i < JANEIN.length) eintrag[NL.janein] = w(JANEIN[i]);
    if (i < ANPASSUNG.length) eintrag[NL.anpassung] = w(ANPASSUNG[i]);
    if (i < KIRCHENSTEUER.length) eintrag[NL.kirche] = w(KIRCHENSTEUER[i]);
    if (i < SZENARIEN.length) {
      const [name, dm, dw, dl, da, di] = SZENARIEN[i];
      eintrag[NL.szenario] = w(name);
      eintrag[NL.szMiete] = w(dm); eintrag[NL.szWert] = w(dw); eintrag[NL.szLeer] = w(dl);
      eintrag[NL.szAnschluss] = w(da); eintrag[NL.szInstand] = w(di);
    }
    if (i < BUNDESLAENDER.length) {
      eintrag[NL.land] = w(BUNDESLAENDER[i][0]); eintrag[NL.landSatz] = w(BUNDESLAENDER[i][1]);
    }
    if (i < ZAHLUNGSARTEN.length) {
      eintrag[NL.zahlart] = w(ZAHLUNGSARTEN[i][0]);
      eintrag[NL.zahlGruppe] = w(ZAHLUNGSARTEN[i][1]);
      eintrag[NL.zahlVz] = w(ZAHLUNGSARTEN[i][2]);
    }
    if (i < MONATSNAMEN.length) eintrag[NL.monat] = w(MONATSNAMEN[i]);
    setz(N_ERSTE + i, reihe(eintrag));
  }

  /* --- Block B: Mietlauf – projizierte Miete je Vertrag und Jahr ---
     Nachgebaut aus forecast.js:93-111: Monat fuer Monat, Vertrag fuer
     Vertrag, Grundlage ist die zum Stichtag geltende Kondition. */
  setz(ML_H2, reihe({ 2: w('B · Mietlauf (Vertrag × Jahr, Monat für Monat)', S.h2) }));
  const mlKopf = {
    [ML.vertrag]: w('Vertrag', S.kopf), [ML.jahr]: w('Jahr', S.kopf), [ML.obj]: w('Objekt', S.kopf),
    [ML.summe]: w('Summe', S.kopf),
    [ML.hBeginn]: w('Beginn', S.kopf), [ML.hEnde]: w('Ende', S.kopf), [ML.hSatz]: w('Satz', S.kopf),
  };
  for (let m = 0; m < 12; m++) mlKopf[ML.monat + m] = w(MONATSKURZ[m], S.kopf);
  for (let k = 0; k < KONDITIONEN; k++) {
    mlKopf[ML.hKey + k] = w(`Key ${k + 1}`, S.kopf);
    mlKopf[ML_KALT + k] = w(`Kalt ${k + 1}`, S.kopf);
    mlKopf[ML_BASIS + k] = w(`Basisjahr ${k + 1}`, S.kopf);
  }
  setz(ML_KOPF, reihe(mlKopf));

  for (let v = 0; v < VERTRAEGE; v++) {
    const n = v + 1;
    const hz = mlErste(v);                       // Hilfszeile: die erste Zeile des Vertrags
    const h = (spalte) => `$${C(spalte)}$${hz}`;
    for (let t = 0; t < JAHRZEILEN; t++) {
      const r = mlErste(v) + t;
      const jahrZelle = `$${C(ML.jahr)}${r}`;
      const eintrag = {
        [ML.vertrag]: w(n),
        [ML.jahr]: f(`Jahr+${t}`),
        [ML.obj]: f(`INDEX(MvObj,${n})`),
      };
      for (let m = 0; m < 12; m++) {
        const tag = `DATE(${jahrZelle},${m + 1},15)`;
        const kette = kondKette(tag,
          (k) => `${h(ML_KALT + k)}*${wachstum(h(ML.hSatz), `${jahrZelle}-${h(ML_BASIS + k)}`)}`,
          (k) => h(ML.hKey + k));
        eintrag[ML.monat + m] = f(`IF(${h(ML.hBeginn)}=0,0,`
          + `IF(OR(${tag}<${h(ML.hBeginn)},AND(${h(ML.hEnde)}>0,${tag}>${h(ML.hEnde)})),0,${kette}))`);
      }
      eintrag[ML.summe] = f(`SUM($${C(ML.monat)}${r}:$${C(ML.monat + 11)}${r})`);

      if (t === 0) {
        eintrag[ML.hBeginn] = f(`IF(INDEX(MvBeginn,${n})="",0,INDEX(MvBeginn,${n}))`);
        eintrag[ML.hEnde] = f(`INDEX(MvEnde,${n})`);
        eintrag[ML.hSatz] = f(`INDEX(MvSatz,${n})`);
        for (let k = 0; k < KONDITIONEN; k++) {
          eintrag[ML.hKey + k] = f(`INDEX(MvKey${k + 1},${n})`);
          eintrag[ML_KALT + k] = f(`INDEX(MvKalt${k + 1},${n})`);
          /* Wachstum laeuft ab dem Jahr der Kondition, fruehestens ab dem Startjahr */
          eintrag[ML_BASIS + k] = f(`MAX(YEAR(INDEX(MvAb${k + 1},${n})),Jahr)`);
        }
      }
      setz(r, reihe(eintrag));
    }
  }

  /* --- Block C: Nebenkosten-Vorauszahlung je Vertrag, nur fuer das Mappenjahr --- */
  setz(NK_H2, reihe({ 2: f('"C · Nebenkosten-Vorauszahlung je Vertrag · "&Jahr', S.h2) }));
  const nkKopf = { [NKS.vertrag]: w('Vertrag', S.kopf), [NKS.obj]: w('Objekt', S.kopf) };
  for (let m = 0; m < 12; m++) nkKopf[NKS.monat + m] = w(MONATSKURZ[m], S.kopf);
  setz(NK_KOPF, reihe(nkKopf));
  for (let v = 0; v < VERTRAEGE; v++) {
    const n = v + 1;
    const eintrag = { [NKS.vertrag]: w(n), [NKS.obj]: f(`INDEX(MvObj,${n})`) };
    for (let m = 0; m < 12; m++) {
      const tag = `DATE(Jahr,${m + 1},15)`;
      const kette = kondKette(tag, (k) => `INDEX(MvNkV${k + 1},${n})`, (k) => `INDEX(MvKey${k + 1},${n})`);
      eintrag[NKS.monat + m] = f(`IF(INDEX(MvBeginn,${n})="",0,`
        + `IF(OR(${tag}<INDEX(MvBeginn,${n}),AND(INDEX(MvEnde,${n})>0,${tag}>INDEX(MvEnde,${n}))),0,${kette}))`);
    }
    setz(NK_ERSTE + v, reihe(eintrag));
  }

  /* --- Block D: Objektjahr – die Prognose je Objekt, wie forecast.js:158-256 --- */
  setz(OJ_H2, reihe({ 2: w('D · Objektjahr (Objekt × Jahr) – Prognose je Objekt', S.h2) }));
  setz(OJ_KOPF, reihe({
    [OJ.obj]: w('Objekt', S.kopf), [OJ.jahr]: w('Jahr', S.kopf), [OJ.t]: w('t', S.kopf),
    [OJ.anteil]: w('Besitzanteil', S.kopf), [OJ.miete]: w('Miete', S.kopf),
    [OJ.bewirt]: w('Bewirtschaftung', S.kopf), [OJ.instand]: w('Instandhaltung', S.kopf),
    [OJ.zins]: w('Zins', S.kopf), [OJ.tilgung]: w('Tilgung', S.kopf), [OJ.sonder]: w('Sondertilgung', S.kopf),
    [OJ.ersatz]: w('Tilgungsersatz', S.kopf), [OJ.rest]: w('Restschuld', S.kopf),
    [OJ.guthaben]: w('Guthaben', S.kopf), [OJ.wert]: w('Verkehrswert', S.kopf), [OJ.afa]: w('AfA', S.kopf),
    [OJ.einkuenfte]: w('Einkünfte', S.kopf), [OJ.steuer]: w('Steuer', S.kopf),
    [OJ.kapitaldienst]: w('Kapitaldienst', S.kopf), [OJ.cfVor]: w('CF vor St.', S.kopf),
    [OJ.cfNach]: w('CF nach St.', S.kopf), [OJ.ek]: w('Eigenkapital', S.kopf),
    [OJ.aufbau]: w('Vermögensaufbau', S.kopf), [OJ.ltv]: w('LTV', S.kopf),
  }));

  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    const idx = (name) => `INDEX(${name},${n})`;
    for (let t = 0; t < JAHRZEILEN; t++) {
      const r = ojZeile(o, t);
      const c = (spalte) => `$${C(spalte)}${r}`;
      const j = c(OJ.jahr);
      const teuerung = wachstum('Inflation', String(t));
      const summeTilg = (name) => `SUMIFS(${name},TilgObj,${n},TilgJahr,${j})`;
      const kumTilg = (name) => `SUMIFS(${name},TilgObj,${n},TilgJahr,"<="&${j})`;

      setz(r, reihe({
        [OJ.obj]: w(n),
        [OJ.jahr]: f(`Jahr+${t}`),
        [OJ.t]: w(t),
        /* Besitzmonate im Kalenderjahr – store.js:407-414 */
        [OJ.anteil]: f(`IF(${idx('ObjKaufJahr')}=0,0,`
          + `IF(${j}<${idx('ObjKaufJahr')},0,IF(${j}>${idx('ObjKaufJahr')},12,13-${idx('ObjKaufMonat')})))/12`),
        [OJ.miete]: f(`SUMIFS(MlSumme,MlObj,${n},MlJahr,${j})*(1-Leerstand/100)`),
        [OJ.bewirt]: f(`${idx('ObjLaufend')}*${teuerung}*${c(OJ.anteil)}`),
        [OJ.instand]: f(`${idx('ObjInstandBasis')}*${teuerung}*${c(OJ.anteil)}`),
        [OJ.zins]: f(summeTilg('TilgZins')),
        [OJ.tilgung]: f(summeTilg('TilgTilgung')),
        [OJ.sonder]: f(summeTilg('TilgSonder')),
        [OJ.ersatz]: f(summeTilg('TilgErsatz')),
        [OJ.rest]: f(`MAX(0,SUMIF(DarlObj,${n},DarlBetrag)-${kumTilg('TilgTilgung')}-${kumTilg('TilgSonder')})`),
        [OJ.guthaben]: f(`${kumTilg('TilgErsatz')}+${kumTilg('TilgErtrag')}`),
        [OJ.wert]: f(`${idx('ObjWertEff')}*${wachstum('Wertsteigerung', String(t))}`),
        /* AfA: im Kaufjahr zeitanteilig, Ende nach Ablauf der Dauer – kennzahlen.js:74-83 */
        [OJ.afa]: f(`IF(OR(${idx('ObjAfaDauer')}=0,${idx('ObjAfaJahr')}=0,${j}<${idx('ObjKaufJahr')},`
          + `${j}>=${idx('ObjKaufJahr')}+${idx('ObjAfaDauer')}),0,`
          + `IF(${j}=${idx('ObjKaufJahr')},${idx('ObjAfaJahr')}*(13-${idx('ObjKaufMonat')})/12,${idx('ObjAfaJahr')}))`),
        [OJ.einkuenfte]: f(`${c(OJ.miete)}-${c(OJ.bewirt)}-${c(OJ.instand)}-${c(OJ.zins)}-${c(OJ.afa)}`),
        [OJ.steuer]: f(`${c(OJ.einkuenfte)}*${idx('ObjSteuersatz')}/100`),
        [OJ.kapitaldienst]: f(`${c(OJ.zins)}+${c(OJ.tilgung)}+${c(OJ.sonder)}+${c(OJ.ersatz)}`),
        [OJ.cfVor]: f(`${c(OJ.miete)}-${c(OJ.bewirt)}-${c(OJ.instand)}-${c(OJ.kapitaldienst)}`),
        [OJ.cfNach]: f(`${c(OJ.cfVor)}-${c(OJ.steuer)}`),
        [OJ.ek]: f(`${c(OJ.wert)}-${c(OJ.rest)}`),
        [OJ.aufbau]: f(`${c(OJ.tilgung)}+${c(OJ.sonder)}+${c(OJ.ersatz)}`),
        [OJ.ltv]: f(`IF(${c(OJ.wert)}=0,0,${c(OJ.rest)}/${c(OJ.wert)}*100)`),
      }));
    }
  }

  /* --- Block E: Ist-Kennzahlen je Objekt zum Stichtag, wie kennzahlen.js:114-261 --- */
  setz(IST_H2, reihe({ 2: w('E · Ist-Kennzahlen je Objekt zum Stichtag', S.h2) }));
  const istKopf = {};
  for (const [name, spalte] of Object.entries(I)) istKopf[spalte] = w(name, S.kopf);
  setz(IST_KOPF, reihe(istKopf));

  const naechsterMonat = 'EOMONTH(Stichtag,0)+1';
  const inZwoelf = 'DATE(YEAR(Stichtag)+1,MONTH(Stichtag),DAY(Stichtag))';

  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    const r = IST_ERSTE + o;
    const c = (spalte) => `$${C(spalte)}${r}`;
    const idx = (name) => `INDEX(${name},${n})`;
    const zahl = (art) => `INDEX(ZahlSumme,${o * ARTEN + art + 1})`;
    const bisStichtag = (name) => `SUMIFS(${name},TilgObj,${n},TilgDatum,"<="&Stichtag)`;
    const naechste12 = (name) => `SUMIFS(${name},TilgObj,${n},TilgDatum,">"&Stichtag,TilgDatum,"<="&${inZwoelf})`;
    const imMonat = (name) => `SUMIFS(${name},TilgObj,${n},TilgDatum,${naechsterMonat})`;

    setz(r, reihe({
      [I.obj]: w(n),
      [I.invest]: f(idx('ObjInvest')),
      [I.nkSumme]: f(idx('ObjNkSumme')),
      [I.wert]: f(idx('ObjWertEff')),
      [I.flaeche]: f(idx('ObjFlaeche')),
      [I.mieteMonat]: f(`SUMIF(MvObj,${n},MvKalt)`),
      [I.runrate]: f(`${c(I.mieteMonat)}*12`),
      [I.nkMonat]: f(`SUMIF(MvObj,${n},MvNk)`),
      [I.einheiten]: f(`COUNTIF(EhObj,${n})`),
      [I.vermietet]: f(`SUMIF(EhObj,${n},EhVermietet)`),
      [I.leerstand]: f(`${c(I.einheiten)}-${c(I.vermietet)}`),
      [I.bewirtVoll]: f(idx('ObjBewirt')),
      [I.darlehen]: f(`SUMIF(DarlObj,${n},DarlBetrag)`),
      [I.rest]: f(`MAX(0,${c(I.darlehen)}-${bisStichtag('TilgTilgung')}-${bisStichtag('TilgSonder')})`),
      [I.zins12]: f(naechste12('TilgZins')),
      [I.tilgung12]: f(naechste12('TilgTilgung')),
      [I.sonder12]: f(naechste12('TilgSonder')),
      [I.ersatz12]: f(naechste12('TilgErsatz')),
      [I.kapital12]: f(`${c(I.zins12)}+${c(I.tilgung12)}+${c(I.sonder12)}+${c(I.ersatz12)}`),
      [I.rateMonat]: f(`${imMonat('TilgZins')}+${imMonat('TilgTilgung')}+${imMonat('TilgErsatz')}`),

      /* Kalenderjahr aus der Zahlungsebene – Korrekturen sind dort schon drin */
      [I.istMiete]: f(zahl(0)),
      [I.istNk]: f(zahl(1)),
      [I.istHausgeld]: f(zahl(2)),
      [I.istVerwaltung]: f(zahl(3)),
      [I.istInstand]: f(zahl(4)),
      [I.istSonstige]: f(zahl(5)),
      [I.istBewirt]: f(`${c(I.istHausgeld)}+${c(I.istVerwaltung)}+${c(I.istInstand)}+${c(I.istSonstige)}`),
      [I.istZins]: f(zahl(6)),
      [I.istTilgung]: f(zahl(7)),
      [I.istSonder]: f(zahl(8)),
      [I.istErsatz]: f(zahl(9)),
      [I.istKapital]: f(`${c(I.istZins)}+${c(I.istTilgung)}+${c(I.istSonder)}+${c(I.istErsatz)}`),
      [I.istUmlage]: f(zahl(10)),

      [I.afaJahr]: f(`INDEX(OjAfa,${o * JAHRZEILEN + 1})`),
      [I.afaVoll]: f(idx('ObjAfaJahr')),
      /* Umlagefaehige Betriebskosten sind Werbungskosten, die Umlagen
         (istNk) die Gegen-Einnahme – wie kennzahlen.js:objektKennzahlen().
         Fuer den Cashflow (cfVor unten) bleiben beide aussen vor. */
      [I.werbung]: f(`${c(I.istBewirt)}+${c(I.istUmlage)}+${c(I.istZins)}+${c(I.afaJahr)}`),
      [I.einkuenfte]: f(`${c(I.istMiete)}+${c(I.istNk)}-${c(I.werbung)}`),
      [I.steuersatz]: f(idx('ObjSteuersatz')),
      [I.steuer]: f(`${c(I.einkuenfte)}*${c(I.steuersatz)}/100`),
      [I.cfVor]: f(`${c(I.istMiete)}-${c(I.istBewirt)}-${c(I.istKapital)}`),
      [I.cfNach]: f(`${c(I.cfVor)}-${c(I.steuer)}`),

      /* Laufende zwoelf Monate – Grundlage aller Verhaeltniszahlen */
      [I.cfRunrate]: f(`${c(I.runrate)}-${c(I.bewirtVoll)}-${c(I.kapital12)}`),
      [I.einkRunrate]: f(`${c(I.runrate)}-${c(I.bewirtVoll)}-${c(I.zins12)}-${c(I.afaVoll)}`),
      [I.steuerRunrate]: f(`${c(I.einkRunrate)}*${c(I.steuersatz)}/100`),
      [I.cfRunrateNach]: f(`${c(I.cfRunrate)}-${c(I.steuerRunrate)}`),

      [I.ekEingesetzt]: f(`MAX(0,${c(I.invest)}-${c(I.darlehen)})`),
      [I.ek]: f(`${c(I.wert)}-${c(I.rest)}`),
      [I.getilgt]: f(`MAX(0,${c(I.darlehen)}-${c(I.rest)})`),
      [I.ersatzEin]: f(bisStichtag('TilgErsatz')),
      [I.ersatzGut]: f(`${c(I.ersatzEin)}+${bisStichtag('TilgErtrag')}`),
    }));
  }

  /* --- Block F: Verkaufsrechnung je Objekt, wie forecast.js:276-318 --- */
  setz(VK_H2, reihe({ 2: w('F · Verkaufsrechnung je Objekt', S.h2) }));
  const vkKopf = {};
  for (const [name, spalte] of Object.entries(VK)) vkKopf[spalte] = w(name, S.kopf);
  setz(VK_KOPF, reihe(vkKopf));
  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    const r = VK_ERSTE + o;
    const c = (spalte) => `$${C(spalte)}${r}`;
    const versatz = `${o * JAHRZEILEN}+MIN(VerkaufNach,${JAHRE})+1`;
    const verkaufsJahr = `Jahr+MIN(VerkaufNach,${JAHRE})`;
    const ohne = (formel) => `IF(OR(VerkaufNach="",VerkaufNach=0),0,${formel})`;
    setz(r, reihe({
      [VK.obj]: w(n),
      [VK.brutto]: f(ohne(`INDEX(OjWert,${versatz})`)),
      [VK.kosten]: f(`${c(VK.brutto)}*Verkaufskosten/100`),
      [VK.netto]: f(`${c(VK.brutto)}-${c(VK.kosten)}`),
      /* Kumulierte AfA ab dem KAUFJAHR, nicht erst ab dem Jahr der Mappe –
         forecast.js:291 summiert von kaufjahr bis verkaufsJahr-1. Der Block
         Objektjahr beginnt erst beim Mappenjahr, deshalb hier geschlossen:
         im Kaufjahr anteilig, danach volle Jahre bis zum Ende der Nutzungsdauer.
         -INT(-Dauer) rundet auf, weil AfA nur fuer jahr < kaufjahr+Dauer anfaellt. */
      [VK.kumAfa]: f(ohne(
        `IF(OR(INDEX(ObjKaufJahr,${n})=0,INDEX(ObjAfaDauer,${n})=0,`
        + `MIN((${verkaufsJahr})-1,INDEX(ObjKaufJahr,${n})-INT(-INDEX(ObjAfaDauer,${n}))-1)<INDEX(ObjKaufJahr,${n})),0,`
        + `INDEX(ObjAfaJahr,${n})*((13-INDEX(ObjKaufMonat,${n}))/12`
        + `+MAX(0,MIN((${verkaufsJahr})-1,INDEX(ObjKaufJahr,${n})-INT(-INDEX(ObjAfaDauer,${n}))-1)-INDEX(ObjKaufJahr,${n}))))`)),
      /* Anschaffung = Grundstück + Gebäude – wie afaWerte() sie ansetzt,
         also inklusive aktivierter Modernisierung (kennzahlen.js). */
      [VK.buchwert]: f(`MAX(0,INDEX(ObjGrund,${n})+INDEX(ObjGebaeude,${n})-${c(VK.kumAfa)})`),
      [VK.gewinn]: f(`${c(VK.netto)}-${c(VK.buchwert)}`),
      /* Spekulationsfrist: unter zehn Jahren Haltedauer wird der Gewinn versteuert */
      [VK.steuer]: f(ohne(`IF(AND((${verkaufsJahr})-INDEX(ObjKaufJahr,${n})<10,${c(VK.gewinn)}>0),`
        + `${c(VK.gewinn)}*INDEX(ObjSteuersatz,${n})/100,0)`)),
      [VK.rest]: f(ohne(`INDEX(OjRest,${versatz})`)),
    }));
  }
  return rohFormatieren(b);
}

/* ==========================================================================
   Blatt: Zahlungen  (Ist oben, Korrekturen darunter)
   ========================================================================== */

function blattZahlungen(daten) {
  const b = {
    name: 'Zahlungen', registerfarbe: NAVY_HELL, gitternetz: false,
    fixieren: { zeile: Z_KOPF, spalte: 4 }, zeilen: [], spalten: [],
  };
  b.spalten[0] = { breite: 2 };
  b.spalten[Z.obj - 1] = { breite: 26 };
  b.spalten[Z.art - 1] = { breite: 26 };
  b.spalten[Z.gruppe - 1] = { breite: 15 };
  for (let m = 0; m < 12; m++) b.spalten[Z.monat + m - 1] = { breite: 11 };
  b.spalten[Z.summe - 1] = { breite: 14 };
  b.spalten[Z.summe] = { breite: 2 };
  for (let m = 0; m < 12; m++) b.spalten[Z.soll + m - 1] = { breite: 11, versteckt: true };

  const z = b.zeilen;
  for (let i = 0; i < ZK_LETZTE + 2; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: f('"Zahlungen "&Jahr', S.titel) }));
  setz(4, reihe({ 2: w('Abgeleitet aus Mietverträgen, Kostenfeldern und Tilgungsplänen. Korrekturen trägst du unten ein.', S.untertitel) }));

  const monatsKopf = (extra = {}) => {
    const k = { ...extra };
    for (let m = 0; m < 12; m++) k[Z.monat + m] = w(MONATSKURZ[m], S.kopf);
    return k;
  };

  /* --- Summen je Gruppe --- */
  setz(ZS_H2, reihe({ 2: w('A · Summen je Gruppe', S.h2) }));
  setz(ZS_KOPF, reihe(monatsKopf({ [Z.obj]: w('Gruppe', S.kopfLinks), [Z.summe]: w('Jahr', S.kopf) })));
  GRUPPEN.forEach((gruppe, i) => {
    const r = ZS_ERSTE + i;
    const eintrag = { [Z.obj]: w(gruppe, S.fett) };
    for (let m = 0; m < 12; m++) {
      const sp = C(Z.monat + m);
      eintrag[Z.monat + m] = f(
        `SUMIFS($${sp}$${Z_ERSTE}:$${sp}$${Z_LETZTE},$${C(Z.gruppe)}$${Z_ERSTE}:$${C(Z.gruppe)}$${Z_LETZTE},$${C(Z.obj)}${r})`,
        anzeige(F_EURO));
    }
    eintrag[Z.summe] = f(`SUM($${C(Z.monat)}${r}:$${C(Z.monat + 11)}${r})`, anzeige(F_EURO, { schrift: { fett: true } }));
    setz(r, eintrag && reihe(eintrag));
  });
  const saldoZeile = ZS_ERSTE + GRUPPEN.length;
  const saldoEintrag = { [Z.obj]: w('Saldo', S.fett) };
  for (let m = 0; m < 12; m++) {
    const sp = C(Z.monat + m);
    saldoEintrag[Z.monat + m] = f(
      `$${sp}$${ZS_ERSTE}-$${sp}$${ZS_ERSTE + 1}-$${sp}$${ZS_ERSTE + 2}`,
      anzeige(F_EURO, { schrift: { fett: true } }));
  }
  saldoEintrag[Z.summe] = f(`SUM($${C(Z.monat)}${saldoZeile}:$${C(Z.monat + 11)}${saldoZeile})`,
    anzeige(F_EURO, { schrift: { fett: true } }));
  saldoEintrag[Z.summe + 2] = w('einschließlich der durchlaufenden Nebenkosten', S.feiner);
  setz(saldoZeile, reihe(saldoEintrag));

  /* --- Ist --- */
  setz(Z_H2, reihe({
    2: w('B · Tatsächliche Zahlungen', S.h2),
    5: w('Ein korrigierter Monat wird gelb hinterlegt.', S.feiner),
  }));
  setz(Z_KOPF, reihe(monatsKopf({
    [Z.obj]: w('Objekt', S.kopfLinks), [Z.art]: w('Zahlungsart', S.kopfLinks),
    [Z.gruppe]: w('Gruppe', S.kopfLinks), [Z.summe]: w('Jahr', S.kopf),
  })));

  const imBestand = (n, m) => `AND(INDEX(ObjKaufJahr,${n})>0,`
    + `DATE(Jahr,${m + 1},1)>=DATE(INDEX(ObjKaufJahr,${n}),INDEX(ObjKaufMonat,${n}),1))`;

  /** Der abgeleitete Betrag einer Zahlungsart – zahlungen.js:96-126 */
  function sollFormel(n, art, m) {
    const monat = m + 1;
    switch (art) {
      case 0: return `SUMIFS(MlM${monat},MlObj,${n},MlJahr,Jahr)`;
      case 1: return `SUMIF(NkObj,${n},NkM${monat})`;
      case 2: return `IF(${imBestand(n, m)},MAX(0,INDEX(ObjHausgeld,${n})-INDEX(ObjUmlage,${n})),0)`;
      case 3: return `IF(${imBestand(n, m)},INDEX(ObjVerwaltung,${n}),0)`;
      case 4: return `IF(${imBestand(n, m)},INDEX(ObjInstand,${n}),0)`;
      case 5: return `IF(${imBestand(n, m)},INDEX(ObjSonstige,${n})/12,0)`;
      case 6: return `SUMIFS(TilgZins,TilgObj,${n},TilgDatum,DATE(Jahr,${monat},1))`;
      case 7: return `SUMIFS(TilgTilgung,TilgObj,${n},TilgDatum,DATE(Jahr,${monat},1))`;
      case 8: return `SUMIFS(TilgSonder,TilgObj,${n},TilgDatum,DATE(Jahr,${monat},1))`;
      case 9: return `SUMIFS(TilgErsatz,TilgObj,${n},TilgDatum,DATE(Jahr,${monat},1))`;
      default: return `IF(${imBestand(n, m)},INDEX(ObjUmlage,${n}),0)`;
    }
  }

  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    for (let a = 0; a < ARTEN; a++) {
      const r = zZeile(o, a);
      const rk = zkZeile(o, a);
      const eintrag = {
        [Z.obj]: a === 0
          ? f(`IF(INDEX(ObjBelegt,${n})=0,"– Objekt ${n} –",INDEX(ObjBezeichnung,${n}))`, S.fett)
          : null,
        [Z.art]: w(ZAHLUNGSARTEN[a][0], S.fein),
        [Z.gruppe]: w(ZAHLUNGSARTEN[a][1], S.fein),
      };
      for (let m = 0; m < 12; m++) {
        const korr = `$${C(Z.monat + m)}${rk}`;
        const soll = `$${C(Z.soll + m)}${r}`;
        eintrag[Z.soll + m] = f(sollFormel(n, a, m), S_ROH);
        eintrag[Z.monat + m] = f(`IF(${korr}="",${soll},${korr})`, anzeige(F_EURO));
      }
      eintrag[Z.summe] = f(`SUM($${C(Z.monat)}${r}:$${C(Z.monat + 11)}${r})`,
        anzeige(F_EURO, { schrift: { fett: true } }));
      setz(r, reihe(eintrag));
    }
  }

  /* --- Korrekturen --- */
  setz(ZK_H2, reihe({
    2: w('C · Korrekturen', S.h2),
    5: w('Leer = wie gerechnet · 0 = Zahlung entfällt · Zahl = abweichender Betrag.', S.feiner),
  }));
  setz(ZK_KOPF, reihe(monatsKopf({
    [Z.obj]: w('Objekt', S.kopfLinks), [Z.art]: w('Zahlungsart', S.kopfLinks), [Z.gruppe]: w('Gruppe', S.kopfLinks),
  })));
  const korrekturen = daten?.korrekturen || [];
  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    for (let a = 0; a < ARTEN; a++) {
      const r = zkZeile(o, a);
      const eintrag = {
        [Z.obj]: a === 0
          ? f(`IF(INDEX(ObjBelegt,${n})=0,"– Objekt ${n} –",INDEX(ObjBezeichnung,${n}))`, S.fett)
          : null,
        [Z.art]: w(ZAHLUNGSARTEN[a][0], S.fein),
        [Z.gruppe]: w(ZAHLUNGSARTEN[a][1], S.fein),
      };
      for (let m = 0; m < 12; m++) {
        const treffer = korrekturen.find((k) => k.objekt === n && k.art === a + 1 && k.monat === m + 1);
        eintrag[Z.monat + m] = w(treffer ? treffer.betrag : null, S_FELD_EUR);
      }
      setz(r, reihe(eintrag));
    }
  }

  b.bedingt = [
    {
      bereich: `${C(Z.monat)}${Z_ERSTE}:${C(Z.monat + 11)}${Z_LETZTE}`,
      formel: `${C(Z.monat)}${ZK_ERSTE}<>""`,
      stil: { fuellung: HINWEIS_HG }, rang: 1,
    },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Tilgungsplan – ein Darlehen per Auswahl
   ========================================================================== */

function blattTilgungsplan() {
  const b = {
    name: 'Tilgungsplan', registerfarbe: GOLD, gitternetz: false,
    fixieren: { zeile: TP_KOPF }, zeilen: [], spalten: [],
  };
  b.spalten[0] = { breite: 2 };
  b.spalten[TP.i - 1] = { breite: 8 };
  b.spalten[TP.datum - 1] = { breite: 12 };
  b.spalten[TP.zinssatz - 1] = { breite: 11 };
  for (let s = TP.restAnfang; s <= TP.restEnde; s++) b.spalten[s - 1] = { breite: 14 };
  b.spalten[TP.restEnde] = { breite: 2 };
  b.spalten[TP.restEnde + 1] = { breite: 10, versteckt: true };

  const wahlZelle = `$${C(TP.restEnde + 2)}$${TP_WAHL}`;
  const pos = (i) => `(${wahlZelle}-1)*${MONATE}+${i + 1}`;

  const z = b.zeilen;
  for (let i = 0; i < TP_LETZTE + 2; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Tilgungsplan', S.titel) }));
  setz(4, reihe({ 2: w('Nachschüssige Annuität, Monat für Monat. Nach Ablauf der Zinsbindung läuft die Rate weiter, solange sie mindestens 1 % tilgt.', S.untertitel) }));

  setz(TP_WAHL, reihe({
    [TP.i]: w('Darlehen', S.label),
    [TP.datum]: w(null, S_FELD),
    /* Leeres Feld heisst „das erste Darlehen". Ohne diesen Fall faende MATCH
       den ersten LEEREN Eintrag der Auswahlliste und zeigte ein Darlehen,
       das es gar nicht gibt. */
    [TP.restEnde + 2]: f(`IF($${C(TP.datum)}$${TP_WAHL}="",1,`
      + `IFERROR(MATCH($${C(TP.datum)}$${TP_WAHL},DarlAnzeige,0),1))`),
    [TP.restAnfang]: w('← aus der Liste wählen, leer = das erste', S.fein),
  }));

  const wahl = wahlZelle;
  const summe = (name, extra = '') => `SUMIFS(${name},TilgDarl,${wahl}${extra})`;
  const naechster = 'EOMONTH(Stichtag,0)+1';
  const bisStichtag = (name) => `SUMIFS(${name},TilgDarl,${wahl},TilgDatum,"<="&Stichtag)`;
  const rest = `MAX(0,INDEX(DarlBetrag,${wahl})-${bisStichtag('TilgTilgung')}-${bisStichtag('TilgSonder')})`;

  /* Zwei Kennzahlen je Zeile. Die Beschriftung laeuft ueber drei verbundene
     Spalten – die Spaltenbreiten gehoeren dem Tilgungsplan darunter und sind
     fuer einen Text wie „Restschuld bei Bindungsende" viel zu schmal. */
  const KENNZAHLEN = [
    ['Darlehensbetrag', `INDEX(DarlBetrag,${wahl})`, F_EURO],
    ['Sollzins', `INDEX(DarlSollzins,${wahl})`, F_PROZENT],
    ['Anfangstilgung', `INDEX(DarlTilgung,${wahl})`, F_PROZENT],
    ['Rate im nächsten Monat',
      `SUMIFS(TilgZins,TilgDarl,${wahl},TilgDatum,${naechster})`
      + `+SUMIFS(TilgTilgung,TilgDarl,${wahl},TilgDatum,${naechster})`
      + `+SUMIFS(TilgErsatz,TilgDarl,${wahl},TilgDatum,${naechster})`, F_EURO],
    ['Restschuld heute', rest, F_EURO],
    ['davon getilgt', `INDEX(DarlBetrag,${wahl})-${rest}`, F_EURO],
    ['Restschuld bei Bindungsende',
      `IF(INDEX(DarlBindung,${wahl})="",0,MAX(0,INDEX(DarlBetrag,${wahl})`
      + `-SUMIFS(TilgTilgung,TilgDarl,${wahl},TilgDatum,"<="&INDEX(DarlBindung,${wahl}))`
      + `-SUMIFS(TilgSonder,TilgDarl,${wahl},TilgDatum,"<="&INDEX(DarlBindung,${wahl}))))`, F_EURO],
    ['Zinsen über die ganze Laufzeit', summe('TilgZins'), F_EURO],
    ['Laufzeit in Monaten', summe('TilgAktiv'), F_GANZ],
    ['Sondertilgungsrecht p. a.',
      `INDEX(DarlBetrag,${wahl})*INDEX(DarlSonderrecht,${wahl})/100`, F_EURO],
    ['Tilgungsersatz eingezahlt', bisStichtag('TilgErsatz'), F_EURO],
    ['Guthaben mit Verzinsung',
      `${bisStichtag('TilgErsatz')}+${bisStichtag('TilgErtrag')}`, F_EURO],
  ];
  const KPI_LINKS = 2;
  const KPI_RECHTS = 7;          // eine Spalte Abstand, sonst klebt der Betrag am nächsten Text
  const KPI_BREITE = 3;          // verbundene Spalten je Beschriftung
  b.verbunden = [];
  KENNZAHLEN.forEach(([label, formel, format], i) => {
    const nr = TP_KENN + Math.floor(i / 2);
    const spalte = i % 2 === 0 ? KPI_LINKS : KPI_RECHTS;
    const vorhanden = z[nr - 1]?.length ? z[nr - 1] : [];
    const neu = reihe({
      [spalte]: w(label, S.kpiText),
      [spalte + KPI_BREITE]: f(formel, anzeige(format, { schrift: { fett: true, farbe: NAVY } })),
    });
    const laenge = Math.max(vorhanden.length, neu.length);
    const aus = new Array(laenge).fill(null);
    for (let k = 0; k < laenge; k++) aus[k] = neu[k] ?? vorhanden[k] ?? null;
    z[nr - 1] = aus;
    b.verbunden.push(`${C(spalte)}${nr}:${C(spalte + KPI_BREITE - 1)}${nr}`);
  });

  setz(TP_KOPF, reihe({
    [TP.i]: w('Monat', S.kopf), [TP.datum]: w('Fällig', S.kopf), [TP.zinssatz]: w('Zinssatz', S.kopf),
    [TP.restAnfang]: w('Restschuld Anfang', S.kopf), [TP.rate]: w('Rate', S.kopf), [TP.zins]: w('Zins', S.kopf),
    [TP.tilgung]: w('Tilgung', S.kopf), [TP.sonder]: w('Sondertilgung', S.kopf),
    [TP.ersatz]: w('Tilgungsersatz', S.kopf), [TP.guthaben]: w('Guthaben', S.kopf),
    [TP.restEnde]: w('Restschuld Ende', S.kopf),
  }));

  for (let i = 0; i < MONATE; i++) {
    const r = TP_ERSTE + i;
    const holen = (name) => `INDEX(${name},${pos(i)})`;
    const leer = (formel, format) => f(`IF(${holen('TilgAktiv')}=0,"",${formel})`, anzeige(format));
    /* Angezeigte Rate wie finanzmathematik.js:136 */
    const rate = `IF(${holen('TilgTilgung')}=0,${holen('TilgZins')},${holen('TilgZins')}+${holen('TilgTilgung')})`
      + `+${holen('TilgErsatz')}`;
    setz(r, reihe({
      [TP.i]: leer(String(i + 1), F_GANZ),
      [TP.datum]: leer(holen('TilgDatum'), F_MONAT),
      [TP.zinssatz]: leer(`INDEX(Tilgung!$${C(T.zinssatz)}$${T_ERSTE}:$${C(T.zinssatz)}$${T_LETZTE},${pos(i)})`, F_PROZENT),
      [TP.restAnfang]: leer(`INDEX(Tilgung!$${C(T.restAnfang)}$${T_ERSTE}:$${C(T.restAnfang)}$${T_LETZTE},${pos(i)})`, F_EURO),
      [TP.rate]: leer(rate, F_EURO),
      [TP.zins]: leer(holen('TilgZins'), F_EURO),
      [TP.tilgung]: leer(holen('TilgTilgung'), F_EURO),
      [TP.sonder]: leer(holen('TilgSonder'), F_EURO),
      [TP.ersatz]: leer(holen('TilgErsatz'), F_EURO),
      [TP.guthaben]: leer(`INDEX(Tilgung!$${C(T.guthaben)}$${T_ERSTE}:$${C(T.guthaben)}$${T_LETZTE},${pos(i)})`, F_EURO),
      [TP.restEnde]: leer(`INDEX(Tilgung!$${C(T.restEnde)}$${T_ERSTE}:$${C(T.restEnde)}$${T_LETZTE},${pos(i)})`, F_EURO),
    }));
  }

  b.pruefungen = [
    { bereich: `${C(TP.datum)}${TP_WAHL}`, quelle: 'DarlAnzeige', titel: 'Darlehen', hinweis: 'Aus der Liste der Darlehen wählen' },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Objekte im Detail – zehn zeichengleiche Bloecke untereinander
   ========================================================================== */

function blattDetail() {
  const b = {
    name: 'Objekte im Detail', registerfarbe: GOLD, gitternetz: false,
    zeilen: [], spalten: [{ breite: 2 }, { breite: 30 }, { breite: 16 }, { breite: 3 },
      { breite: 30 }, { breite: 16 }],
  };
  const z = b.zeilen;
  for (let i = 0; i < detZeile(OBJEKTE) + 2; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Objekte im Detail', S.titel) }));
  setz(4, reihe({
    2: f(`"Je Objekt ein Block von ${DET_HOEHE} Zeilen · Objekt 1 beginnt in Zeile ${DET_ERSTE}"`, S.untertitel),
  }));

  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    const oben = detZeile(o);
    const ist = (name) => `INDEX(Ist${name},${n})`;
    const belegt = `INDEX(ObjBelegt,${n})=0`;
    const leer = (formel, format) => f(`IF(${belegt},"",${formel})`, anzeige(format));

    /* Zwei Spaltenpaare je Zeile: links B/C, rechts E/F */
    const paar = (versatz, links, rechts) => {
      const eintrag = {};
      if (links) { eintrag[2] = links[0]; eintrag[3] = links[1]; }
      if (rechts) { eintrag[5] = rechts[0]; eintrag[6] = rechts[1]; }
      setz(oben + versatz, reihe(eintrag));
    };
    const zeileLabel = (text) => w(text, S.kpiText);

    setz(oben, reihe({
      2: f(`IF(${belegt},"– Objekt ${n} ist nicht belegt –",INDEX(ObjBezeichnung,${n}))`,
        { schrift: { fett: true, groesse: 13, farbe: NAVY } }),
    }));
    setz(oben + 1, reihe({
      2: f(`IF(${belegt},"",INDEX(ObjTyp,${n})&" · "&INDEX(ObjBezeichnung,${n}))`, S.fein),
      5: f(`IF(${belegt},"","Kauf: "&TEXT(DAY(INDEX(ObjKaufdatum,${n})),"00")&"."`
        + `&TEXT(MONTH(INDEX(ObjKaufdatum,${n})),"00")&"."&YEAR(INDEX(ObjKaufdatum,${n})))`, S.fein),
    }));

    setz(oben + 3, reihe({
      2: w('Kennzahlen', S.kopfLinks), 3: w('', S.kopf),
      5: f('"Cashflow "&Jahr', S.kopfLinks), 6: w('', S.kopf),
    }));
    paar(4, [zeileLabel('Kaufpreis'), leer(`INDEX(ObjKaufpreis,${n})`, F_EURO)],
      [zeileLabel('Kaltmiete'), leer(ist('IstMiete'), F_EURO)]);
    paar(5, [zeileLabel('Kaufnebenkosten'), leer(ist('NkSumme'), F_EURO)],
      [zeileLabel('− Bewirtschaftung'), leer(`-${ist('IstBewirt')}`, F_EURO)]);
    paar(6, [zeileLabel('Gesamtinvestition'), leer(ist('Invest'), F_EURO)],
      [zeileLabel('− Zinsen'), leer(`-${ist('IstZins')}`, F_EURO)]);
    paar(7, [zeileLabel('Verkehrswert'), leer(ist('Wert'), F_EURO)],
      [zeileLabel('− Tilgung und Sondertilgung'), leer(`-${ist('IstTilgung')}-${ist('IstSonder')}-${ist('IstErsatz')}`, F_EURO)]);
    paar(8, [zeileLabel('Fläche'), leer(ist('Flaeche'), F_ZAHL1)],
      [w('= Cashflow vor Steuern', S.fett), leer(ist('CfVor'), F_EURO, )]);
    paar(9, [zeileLabel('Kaltmiete je Monat'), leer(ist('MieteMonat'), F_EURO)],
      [zeileLabel('AfA (mindert nur die Steuer)'), leer(`-${ist('AfaJahr')}`, F_EURO)]);
    paar(10, [zeileLabel('Miete je m²'), leer(`IF(${ist('Flaeche')}=0,0,${ist('MieteMonat')}/${ist('Flaeche')})`, F_EURO2)],
      [zeileLabel('= Einkünfte aus Vermietung'), leer(ist('Einkuenfte'), F_EURO)]);
    paar(11, [zeileLabel('Bruttorendite'), leer(`IF(${ist('Invest')}=0,0,${ist('Runrate')}/${ist('Invest')}*100)`, F_PROZENT)],
      [zeileLabel('Steuer (negativ = Erstattung)'), leer(ist('Steuer'), F_EURO)]);
    paar(12, [zeileLabel('Nettorendite'), leer(`IF(${ist('Invest')}=0,0,(${ist('Runrate')}-${ist('BewirtVoll')})/${ist('Invest')}*100)`, F_PROZENT)],
      [w('= Cashflow nach Steuern', S.fett), leer(ist('CfNach'), F_EURO)]);
    paar(13, [zeileLabel('Kaufpreisfaktor'), leer(`IF(${ist('Runrate')}=0,0,INDEX(ObjKaufpreis,${n})/${ist('Runrate')})`, F_ZAHL1)],
      [zeileLabel('je Monat nach Steuern'), leer(`${ist('CfNach')}/12`, F_EURO)]);

    setz(oben + 15, reihe({
      2: w('Finanzierung', S.kopfLinks), 3: w('', S.kopf),
      5: w('Eingesetztes Kapital', S.kopfLinks), 6: w('', S.kopf),
    }));
    paar(16, [zeileLabel('Darlehenssumme'), leer(ist('Darlehen'), F_EURO)],
      [zeileLabel('Eigenkapital eingesetzt'), leer(ist('EkEingesetzt'), F_EURO)]);
    paar(17, [zeileLabel('Restschuld'), leer(ist('Rest'), F_EURO)],
      [zeileLabel('Eigenkapital heute'), leer(ist('Ek'), F_EURO)]);
    paar(18, [zeileLabel('davon getilgt'), leer(ist('Getilgt'), F_EURO)],
      [zeileLabel('EK-Rendite (Cashflow)'),
        leer(`IF(${ist('EkEingesetzt')}=0,0,${ist('CfRunrateNach')}/${ist('EkEingesetzt')}*100)`, F_PROZENT)]);
    paar(19, [zeileLabel('Rate je Monat'), leer(ist('RateMonat'), F_EURO)],
      [zeileLabel('EK-Rendite mit Tilgung'),
        leer(`IF(${ist('EkEingesetzt')}=0,0,(${ist('CfRunrateNach')}+${ist('Tilgung12')}+${ist('Sonder12')}+${ist('Ersatz12')})/${ist('EkEingesetzt')}*100)`, F_PROZENT)]);
    paar(20, [zeileLabel('Beleihungsauslauf'), leer(`IF(${ist('Wert')}=0,0,${ist('Rest')}/${ist('Wert')}*100)`, F_PROZENT1)],
      [zeileLabel('Tilgungsersatz eingezahlt'), leer(ist('ErsatzEin'), F_EURO)]);
    paar(21, [zeileLabel('Kapitaldienstdeckung DSCR'),
      leer(`IF(${ist('Kapital12')}=0,0,(${ist('Runrate')}-${ist('BewirtVoll')})/${ist('Kapital12')})`, F_ZAHL2)],
    [zeileLabel('Guthaben mit Verzinsung'), leer(ist('ErsatzGut'), F_EURO)]);
    paar(22, [zeileLabel('Einheiten / davon vermietet'),
      leer(`${ist('Einheiten')}&" / "&${ist('Vermietet')}`, null)], null);

    setz(oben + 24, reihe({ 2: w('', S.trenner), 3: w('', S.trenner), 4: w('', S.trenner), 5: w('', S.trenner), 6: w('', S.trenner) }));
  }
  return b;
}

/* ==========================================================================
   Blatt: Prognose
   ========================================================================== */

function blattPrognose() {
  const VP_H2 = P_LETZTE + 3;
  const VP_KOPF = VP_H2 + 1;
  const VP_ERSTE = VP_KOPF + 1;

  const b = {
    name: 'Prognose', registerfarbe: GOLD, gitternetz: false,
    fixieren: { zeile: P_KOPF, spalte: 2 }, zeilen: [], spalten: [],
  };
  b.spalten[0] = { breite: 2 };
  b.spalten[P.jahr - 1] = { breite: 8 };
  for (let s = P.miete; s <= P.ekNach; s++) b.spalten[s - 1] = { breite: 14 };

  const z = b.zeilen;
  for (let i = 0; i < VP_ERSTE + OBJEKTE + 4; i++) z.push([]);
  const setz = (nr, inhalt) => { z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: w('Prognose', S.titel) }));
  setz(4, reihe({ 2: f('"Szenario: "&Szenario&" · Start "&Jahr&" · Annahmen und Umschalter stehen auf dem Blatt Vorgaben"', S.untertitel) }));
  setz(6, reihe({ 2: w('A · Jahr für Jahr über das ganze Portfolio', S.h2) }));

  setz(P_KOPF, reihe({
    [P.jahr]: w('Jahr', S.kopf), [P.miete]: w('Miete', S.kopf), [P.bewirt]: w('Bewirt­schaftung', S.kopf),
    [P.instand]: w('Instand­haltung', S.kopf), [P.zins]: w('Zins', S.kopf), [P.tilgung]: w('Tilgung', S.kopf),
    [P.sonder]: w('Sonder­tilgung', S.kopf), [P.ersatz]: w('Tilgungs­ersatz', S.kopf),
    [P.kapitaldienst]: w('Kapital­dienst', S.kopf), [P.afa]: w('AfA', S.kopf),
    [P.einkuenfte]: w('Einkünfte', S.kopf), [P.steuer]: w('Steuer', S.kopf),
    [P.cfVor]: w('CF vor St.', S.kopf), [P.cfNach]: w('CF nach St.', S.kopf),
    [P.kumVor]: w('kumuliert vor St.', S.kopf), [P.kumNach]: w('kumuliert nach St.', S.kopf),
    [P.wert]: w('Verkehrswert', S.kopf), [P.rest]: w('Restschuld', S.kopf),
    [P.guthaben]: w('Ersatz-Guthaben', S.kopf), [P.vermoegen]: w('Vermögen', S.kopf),
    [P.ltv]: w('Beleihung', S.kopf), [P.ekVor]: w('EK-Rendite vor St.', S.kopf),
    [P.ekNach]: w('EK-Rendite nach St.', S.kopf),
  }));

  for (let t = 0; t < JAHRZEILEN; t++) {
    const r = P_ERSTE + t;
    const c = (spalte) => `$${C(spalte)}${r}`;
    const j = c(P.jahr);
    const uebers = `${t}>PrognoseJahre`;
    const summe = (name) => `SUMIFS(${name},OjJahr,${j})`;
    const zeig = (formel, format) => f(`IF(${uebers},"",${formel})`, anzeige(format));
    setz(r, reihe({
      [P.jahr]: f(`IF(${uebers},"",Jahr+${t})`, anzeige(F_GANZ, { schrift: { fett: true } })),
      [P.miete]: zeig(summe('OjMiete'), F_EURO),
      [P.bewirt]: zeig(summe('OjBewirt'), F_EURO),
      [P.instand]: zeig(summe('OjInstand'), F_EURO),
      [P.zins]: zeig(summe('OjZins'), F_EURO),
      [P.tilgung]: zeig(summe('OjTilgung'), F_EURO),
      [P.sonder]: zeig(summe('OjSonder'), F_EURO),
      [P.ersatz]: zeig(summe('OjErsatz'), F_EURO),
      [P.kapitaldienst]: zeig(summe('OjKapitaldienst'), F_EURO),
      [P.afa]: zeig(summe('OjAfa'), F_EURO),
      [P.einkuenfte]: zeig(summe('OjEinkuenfte'), F_EURO),
      [P.steuer]: zeig(summe('OjSteuer'), F_EURO),
      [P.cfVor]: zeig(summe('OjCfVor'), F_EURO),
      [P.cfNach]: zeig(summe('OjCfNach'), F_EURO),
      [P.kumVor]: zeig(t === 0 ? c(P.cfVor) : `$${C(P.kumVor)}${r - 1}+${c(P.cfVor)}`, F_EURO),
      [P.kumNach]: zeig(t === 0 ? c(P.cfNach) : `$${C(P.kumNach)}${r - 1}+${c(P.cfNach)}`, F_EURO),
      [P.wert]: zeig(summe('OjWert'), F_EURO),
      [P.rest]: zeig(summe('OjRest'), F_EURO),
      [P.guthaben]: zeig(summe('OjGuthaben'), F_EURO),
      [P.vermoegen]: zeig(`${c(P.wert)}-${c(P.rest)}+${c(P.guthaben)}`, F_EURO),
      [P.ltv]: zeig(`IF(${c(P.wert)}=0,0,${c(P.rest)}/${c(P.wert)}*100)`, F_PROZENT1),
      [P.ekVor]: zeig(`IF(SUM(IstEkEingesetzt)=0,0,${c(P.cfVor)}/SUM(IstEkEingesetzt)*100)`, F_PROZENT),
      [P.ekNach]: zeig(`IF(SUM(IstEkEingesetzt)=0,0,${c(P.cfNach)}/SUM(IstEkEingesetzt)*100)`, F_PROZENT),
    }));
  }

  /* --- Verkaufsrechnung --- */
  setz(VP_H2, reihe({
    2: f('IF(OR(VerkaufNach="",VerkaufNach=0),"B · Verkauf – auf dem Blatt Vorgaben eintragen",'
      + '"B · Verkauf im Jahr "&(Jahr+VerkaufNach))', S.h2),
  }));
  setz(VP_KOPF, reihe({
    2: w('Objekt', S.kopfLinks), 3: w('Erlös brutto', S.kopf), 4: w('Verkaufskosten', S.kopf),
    5: w('Erlös netto', S.kopf), 6: w('AfA bis dahin', S.kopf), 7: w('Buchwert', S.kopf),
    8: w('Gewinn', S.kopf), 9: w('Steuer', S.kopf), 10: w('Restschuld', S.kopf), 11: w('bleibt', S.kopf),
  }));
  for (let o = 0; o < OBJEKTE; o++) {
    const n = o + 1;
    const r = VP_ERSTE + o;
    const v = (name) => `INDEX(Vk${name},${n})`;
    const leer = (formel, format) => f(`IF(INDEX(ObjBelegt,${n})=0,"",${formel})`, anzeige(format));
    setz(r, reihe({
      2: f(`IF(INDEX(ObjBelegt,${n})=0,"–",INDEX(ObjBezeichnung,${n}))`),
      3: leer(v('Brutto'), F_EURO), 4: leer(`-${v('Kosten')}`, F_EURO), 5: leer(v('Netto'), F_EURO),
      6: leer(v('KumAfa'), F_EURO), 7: leer(v('Buchwert'), F_EURO), 8: leer(v('Gewinn'), F_EURO),
      9: leer(`-${v('Steuer')}`, F_EURO), 10: leer(`-${v('Rest')}`, F_EURO),
      11: leer(`${v('Netto')}-${v('Steuer')}-${v('Rest')}`, F_EURO),
    }));
  }
  const summeZeile = VP_ERSTE + OBJEKTE;
  setz(summeZeile, reihe({
    2: w('Summe', S.fett),
    3: f('SUM(VkBrutto)', anzeige(F_EURO, { schrift: { fett: true } })),
    9: f('-SUM(VkSteuer)', anzeige(F_EURO, { schrift: { fett: true } })),
    10: f('-SUM(VkRest)', anzeige(F_EURO, { schrift: { fett: true } })),
    11: f('SUM(VkNetto)-SUM(VkSteuer)-SUM(VkRest)', anzeige(F_EURO, { schrift: { fett: true, farbe: NAVY } })),
  }));
  setz(summeZeile + 2, reihe({
    2: w('Innerhalb von zehn Jahren Haltedauer wird der Gewinn versteuert; Bemessungsgrundlage ist der Buchwert nach bereits geltend gemachter AfA.', S.feiner),
  }));

  b.bedingt = [
    {
      bereich: `${C(P.cfVor)}${P_ERSTE}:${C(P.kumNach)}${P_LETZTE}`,
      formel: `AND(ISNUMBER(${C(P.cfVor)}${P_ERSTE}),${C(P.cfVor)}${P_ERSTE}<0)`,
      stil: { schrift: { farbe: ROT } }, rang: 1,
    },
  ];
  return b;
}

/* ==========================================================================
   Blatt: Dashboard
   ========================================================================== */

function blattDashboard() {
  const b = {
    name: 'Dashboard', registerfarbe: GOLD, gitternetz: false, zeilen: [],
    /* K ist die versteckte Hilfsspalte der Hinweise: dort steht die Zahl, auf
       die sich Text und Farbe stuetzen. Sonst stuende dieselbe COUNTIFS zweimal
       da – einmal in der Formel, einmal in der Bedingung – und beide koennten
       auseinanderlaufen. */
    spalten: [{ breite: 2 }, { breite: 30 }, { breite: 17 }, { breite: 3 },
      { breite: 30 }, { breite: 17 }, { breite: 3 }, { breite: 30 }, { breite: 17 },
      { breite: 2 }, { versteckt: true }],
  };
  const HILF = 11;
  const z = b.zeilen;
  const setz = (nr, inhalt) => { while (z.length < nr) z.push([]); z[nr - 1] = inhalt; };

  setz(2, reihe({ 2: w('ZAHLENKOMPASS', S.marke) }));
  setz(3, reihe({ 2: f('IF(PortfolioName="","Dashboard",PortfolioName)', S.titel) }));
  setz(4, reihe({ 2: f('"Stand "&' + datumText('Stichtag') + '&" · Szenario "&Szenario', S.untertitel) }));

  let r = 5;
  const abschnitt = (titel) => { r += 1; setz(r, reihe({ 2: w(titel, S.h2) })); r += 1; };
  const zeileDrei = (a, bb, cc) => {
    r += 1;
    const eintrag = {};
    if (a) { eintrag[2] = w(a[0], S.kpiText); eintrag[3] = f(a[1], anzeige(a[2], { schrift: { fett: true, farbe: NAVY } })); }
    if (bb) { eintrag[5] = w(bb[0], S.kpiText); eintrag[6] = f(bb[1], anzeige(bb[2], { schrift: { fett: true, farbe: NAVY } })); }
    if (cc) { eintrag[8] = w(cc[0], S.kpiText); eintrag[9] = f(cc[1], anzeige(cc[2], { schrift: { fett: true, farbe: NAVY } })); }
    setz(r, reihe(eintrag));
    return r;
  };

  abschnitt('Bestand');
  zeileDrei(
    ['Objekte', 'SUM(ObjBelegt)', F_GANZ],
    ['Einheiten', 'SUM(IstEinheiten)', F_GANZ],
    ['Fläche gesamt', 'SUM(IstFlaeche)', F_ZAHL1]);
  zeileDrei(
    ['Gesamtinvestition', 'SUM(IstInvest)', F_EURO],
    ['Verkehrswert', 'SUM(IstWert)', F_EURO],
    ['Wertzuwachs', 'SUM(IstWert)-SUM(ObjKaufpreis)', F_EURO]);

  abschnitt('Finanzierung');
  zeileDrei(
    ['Darlehenssumme', 'SUM(IstDarlehen)', F_EURO],
    ['Restschuld', 'SUM(IstRest)', F_EURO],
    ['davon getilgt', 'SUM(IstGetilgt)', F_EURO]);
  zeileDrei(
    ['Beleihungsauslauf', 'IF(SUM(IstWert)=0,0,SUM(IstRest)/SUM(IstWert)*100)', F_PROZENT1],
    ['Eigenkapital heute', 'SUM(IstWert)-SUM(IstRest)', F_EURO],
    ['Eigenkapital eingesetzt', 'SUM(IstEkEingesetzt)', F_EURO]);
  const zDscr = zeileDrei(
    ['Kapitaldienst (12 Monate)', 'SUM(IstKapital12)', F_EURO],
    ['Kapitaldienstdeckung DSCR',
      'IF(SUM(IstKapital12)=0,0,(SUM(IstRunrate)-SUM(IstBewirtVoll))/SUM(IstKapital12))', F_ZAHL2],
    ['Tilgungsersatz-Guthaben', 'SUM(IstErsatzGut)', F_EURO]);

  abschnitt('Miete und Rendite');
  zeileDrei(
    ['Kaltmiete je Monat', 'SUM(IstMieteMonat)', F_EURO],
    ['Kaltmiete auf zwölf Monate', 'SUM(IstRunrate)', F_EURO],
    ['Vermietungsquote', 'IF(SUM(IstEinheiten)=0,0,SUM(IstVermietet)/SUM(IstEinheiten)*100)', F_PROZENT1]);
  zeileDrei(
    ['Bruttomietrendite', 'IF(SUM(IstInvest)=0,0,SUM(IstRunrate)/SUM(IstInvest)*100)', F_PROZENT],
    ['Nettomietrendite', 'IF(SUM(IstInvest)=0,0,(SUM(IstRunrate)-SUM(IstBewirtVoll))/SUM(IstInvest)*100)', F_PROZENT],
    ['Kaufpreisfaktor', 'IF(SUM(IstRunrate)=0,0,SUM(ObjKaufpreis)/SUM(IstRunrate))', F_ZAHL1]);
  const zRendite = zeileDrei(
    ['EK-Rendite (Cashflow)',
      'IF(SUM(IstEkEingesetzt)=0,0,SUM(IstCfRunrateNach)/SUM(IstEkEingesetzt)*100)', F_PROZENT],
    ['EK-Rendite mit Tilgung',
      'IF(SUM(IstEkEingesetzt)=0,0,(SUM(IstCfRunrateNach)+SUM(IstTilgung12)+SUM(IstSonder12)+SUM(IstErsatz12))/SUM(IstEkEingesetzt)*100)', F_PROZENT],
    ['Leerstand (Einheiten)', 'SUM(IstLeerstand)', F_GANZ]);

  abschnitt('Cashflow');
  r += 1;
  setz(r, reihe({
    3: w('vor Steuern', S.kopf), 6: w('nach Steuern', S.kopf), 9: w('je Monat nach Steuern', S.kopf),
  }));
  const zCfErste = zeileDrei(
    ['laufendes Jahr', 'SUM(IstCfVor)', F_EURO],
    [' ', 'SUM(IstCfNach)', F_EURO],
    [' ', 'SUM(IstCfNach)/12', F_EURO]);
  zeileDrei(
    ['Folgejahr (volles Jahr)', 'SUMIFS(OjCfVor,OjJahr,Jahr+1)', F_EURO],
    [' ', 'SUMIFS(OjCfNach,OjJahr,Jahr+1)', F_EURO],
    [' ', 'SUMIFS(OjCfNach,OjJahr,Jahr+1)/12', F_EURO]);
  const zCfLetzte = zeileDrei(
    ['Zehnjahresschnitt',
      'SUMIFS(OjCfVor,OjJahr,">="&(Jahr+1),OjJahr,"<="&(Jahr+10))/10', F_EURO],
    [' ', 'SUMIFS(OjCfNach,OjJahr,">="&(Jahr+1),OjJahr,"<="&(Jahr+10))/10', F_EURO],
    [' ', 'SUMIFS(OjCfNach,OjJahr,">="&(Jahr+1),OjJahr,"<="&(Jahr+10))/120', F_EURO]);
  r += 1;
  setz(r, reihe({
    2: w('Das laufende Jahr kann angeschnitten sein – im Anschaffungsjahr stehen weniger als zwölf Monate Miete gegen zwölf Monate Kosten. Für die laufende Belastung ist das Folgejahr die aussagekräftige Zahl.', S.feiner),
  }));

  abschnitt('Hinweise');
  /* Je Hinweis eine Zahl in der versteckten Spalte K, darauf stuetzen sich Text
     und Farbe. Null heisst Entwarnung – die bleibt grau; alles darueber faerbt
     die bedingte Formatierung rot. Der Grundton liegt auf B bis I, damit das
     Band unter dem ganzen Satz durchlaeuft und der Text nicht aus einer
     dreissig Zeichen breiten Zelle herauslaeuft. */
  const hinweisZeilen = [];
  const hinweis = (zaehler, entwarnung, meldung) => {
    r += 1;
    const zelle = `${C(HILF)}${r}`;
    const eintrag = { 2: f(`IF(${zelle}=0,"${entwarnung}",${zelle}&" ${meldung}")`, S.hinweis) };
    for (let s = 3; s <= 9; s++) eintrag[s] = w(null, S.hinweis);
    eintrag[HILF] = f(zaehler, anzeige(F_GANZ));
    setz(r, reihe(eintrag));
    hinweisZeilen.push(r);
  };

  const bindungZwei = 'COUNTIFS(DarlBindung,">"&Stichtag,DarlBindung,'
    + '"<="&DATE(YEAR(Stichtag)+2,MONTH(Stichtag),DAY(Stichtag)))';

  hinweis('SUM(IstLeerstand)',
    'Alle Einheiten sind vermietet.',
    'Einheit(en) ohne laufenden Mietvertrag.');
  hinweis(bindungZwei,
    'Keine Zinsbindung läuft in den nächsten zwei Jahren aus.',
    'Zinsbindung(en) laufen in den nächsten zwei Jahren aus.');
  hinweis('COUNTIFS(MvEnde,">"&Stichtag,MvEnde,"<="&(Stichtag+180))',
    'Kein Mietvertrag endet in den nächsten 180 Tagen.',
    'Mietvertrag/-verträge enden in den nächsten 180 Tagen.');
  hinweis('COUNTIFS(ObjBelegt,1,ObjWert,"")',
    'Für jedes Objekt ist ein Verkehrswert erfasst.',
    'Objekt(e) ohne Verkehrswert – dort wird mit dem Kaufpreis gerechnet.');
  hinweis('COUNTIFS(ObjBelegt,1,ObjKaufdatum,"")',
    'Für jedes Objekt ist ein Kaufdatum erfasst.',
    'Objekt(e) ohne Kaufdatum – AfA und Besitzmonate bleiben dort null.');
  hinweis('SUM(DarlReichweite)',
    'Alle Tilgungspläne reichen bis zum Ende der Prognose.',
    `Darlehen läuft/laufen über die gerechneten ${MONATE / 12} Jahre ab Auszahlung hinaus – `
    + 'Zins und Tilgung fehlen dort am Ende der Prognose. '
    + 'Prognosejahre verringern oder die Mappe mit mehr Monaten neu erzeugen.');

  const hErste = hinweisZeilen[0];
  const hLetzte = hinweisZeilen[hinweisZeilen.length - 1];
  const rot = { schrift: { farbe: ROT } };

  b.bedingt = [
    /* Beanstandung: Spalte K zaehlt etwas – dieselbe Lesart wie in der Legende. */
    {
      bereich: `${C(2)}${hErste}:${C(9)}${hLetzte}`,
      formel: `$${C(HILF)}${hErste}>0`,
      stil: { fuellung: WARN_HG, schrift: { farbe: ROT } }, rang: 1,
    },
    /* Negativer Cashflow rot – so wie auf den Blaettern Objekte und Prognose.
       Je Spalte eine Regel: bei mehreren Bereichen in einem sqref bezieht Excel
       die relative Formel auf den ersten davon. */
    { bereich: `${C(3)}${zCfErste}:${C(3)}${zCfLetzte}`, formel: `${C(3)}${zCfErste}<0`, stil: rot, rang: 1 },
    { bereich: `${C(6)}${zCfErste}:${C(6)}${zCfLetzte}`, formel: `${C(6)}${zCfErste}<0`, stil: rot, rang: 1 },
    { bereich: `${C(9)}${zCfErste}:${C(9)}${zCfLetzte}`, formel: `${C(9)}${zCfErste}<0`, stil: rot, rang: 1 },
    /* Kapitaldienstdeckung unter eins: die Miete traegt den Kapitaldienst nicht.
       Die Null ohne Finanzierung ist keine Beanstandung, daher die Untergrenze. */
    {
      bereich: `${C(6)}${zDscr}`,
      formel: `AND(${C(6)}${zDscr}>0,${C(6)}${zDscr}<1)`, stil: rot, rang: 1,
    },
    /* Negative Eigenkapitalrendite. */
    { bereich: `${C(3)}${zRendite}`, formel: `${C(3)}${zRendite}<0`, stil: rot, rang: 1 },
    { bereich: `${C(6)}${zRendite}`, formel: `${C(6)}${zRendite}<0`, stil: rot, rang: 1 },
  ];

  return b;
}

/* ==========================================================================
   Blatt: Übersicht – das Deckblatt
   ========================================================================== */

function blattUebersicht(jahr) {
  const b = {
    name: 'Übersicht', registerfarbe: GOLD, gitternetz: false,
    spalten: [{ breite: 2 }, { breite: 4 }, { breite: 32 }, { breite: 2 }, { breite: 86 }],
    zeilen: [],
  };
  const z = b.zeilen;
  const leerzeile = () => z.push([]);
  const titelZeile = (text, stil) => z.push(reihe({ 3: w(text, stil) }));
  const h2 = (text) => { leerzeile(); z.push(reihe({ 3: w(text, S.h2) })); };
  const schritt = (nr, was, wie) => z.push(reihe({
    2: w(nr, { schrift: { fett: true, groesse: 11, farbe: GOLD }, ausrichtung: { h: 'right' } }),
    3: w(was, S.fett), 5: w(wie, S.feinUmbruch),
  }));
  const punkt = (was, wie) => z.push(reihe({
    2: w('·', { schrift: { fett: true, farbe: GOLD }, ausrichtung: { h: 'right' } }),
    3: w(was, S.text), 5: w(wie, S.feinUmbruch),
  }));
  const farbe = (hex, rand, was, wie) => z.push(reihe({
    2: w('', rand ? { fuellung: hex, rahmen: { oben: 'thin', unten: 'thin', links: 'thin', rechts: 'thin', farbe: FELD_RAND } } : { fuellung: hex }),
    3: w(was, S.text), 5: w(wie, S.feinUmbruch),
  }));

  leerzeile();
  z.push(reihe({ 3: w('ZAHLENKOMPASS', S.marke) }));
  titelZeile('ImmoPortfolio', S.titel);
  z.push(reihe({ 3: f(`"Immobilien-Portfolio "&Jahr&" · Tabellenfassung für Excel und Google Sheets"`, S.untertitel) }));

  h2('So richtest du die Mappe ein');
  schritt(1, 'Vorgaben ausfüllen', 'Name, Jahr, Steuersatz und die Annahmen für die Prognose. Der Stichtag darf leer bleiben – dann rechnet die Mappe mit dem heutigen Tag.');
  schritt(2, 'Objekte eintragen', 'Blatt Objekte, Block A. Kaufpreis, Kaufdatum und Fläche genügen für den Anfang. Die Grunderwerbsteuer kommt aus dem Bundesland, wenn du keinen eigenen Prozentsatz einträgst.');
  schritt(3, 'Einheiten anlegen', 'Blatt Objekte, Block B. Auch ein Objekt mit nur einer Wohnung braucht eine Zeile – die Mietverträge hängen daran.');
  schritt(4, 'Mietverträge erfassen', 'Bis zu drei Konditionen je Vertrag. Eine Staffel ist einfach eine weitere Kondition mit späterem "gilt ab".');
  schritt(5, 'Darlehen erfassen', 'Betrag, Auszahlung, Sollzins und Anfangstilgung reichen. Sondertilgungen stehen im Block darunter.');
  schritt(6, 'Ablesen', 'Dashboard für das Ganze, Objekte im Detail für einzelne Immobilien, Prognose für die Zukunft.');

  h2('Die Blätter');
  punkt('Vorgaben', 'Alles, was für die ganze Mappe gilt: Steuern, Annahmen, Szenario, Verkauf.');
  punkt('Objekte', 'A Stammdaten · B Einheiten · C Kennzahlen je Objekt im Vergleich.');
  punkt('Mietverträge', 'A Verträge mit Staffeln · B Miete je Objekt.');
  punkt('Darlehen', 'A Darlehen · B Sondertilgungen · C Kennzahlen je Darlehen.');
  punkt('Tilgungsplan', 'Ein Darlehen zur Auswahl, Monat für Monat.');
  punkt('Zahlungen', 'A Summen je Gruppe · B tatsächliche Zahlungen · C Korrekturen.');
  punkt('Objekte im Detail', `Je Objekt ein Block von ${DET_HOEHE} Zeilen. Objekt 1 beginnt in Zeile ${DET_ERSTE}.`);
  punkt('Prognose', 'Jahr für Jahr über das Portfolio, dazu die Verkaufsrechnung.');
  punkt('Dashboard', 'Bestand, Finanzierung, Rendite, Cashflow und Hinweise auf einen Blick.');

  h2('So liest du die Farben');
  farbe('FFFFFF', true, 'Weiß mit blauem Rand', 'Eingabe – nur hier wird getippt.');
  farbe(GERECHNET, false, 'Grau', 'Gerechnet. Eine Änderung hier zerstört die Formel.');
  farbe(HINWEIS_HG, false, 'Gelb', 'Ein Wert wurde von Hand korrigiert.');
  farbe(WARN_HG, false, 'Rot', 'Beanstandung: negativer Cashflow, Leerstand, Kapitaldienstdeckung unter eins, '
    + 'überschrittenes Sondertilgungsrecht, unpassender Stichtag. Steht nichts in Rot, gibt es nichts zu tun.');
  leerzeile();
  z.push(reihe({ 3: w('Die Mappe ist bewusst nicht geschützt.', S.text), 5: w('Google Sheets übernimmt einen Blattschutz beim Import nur halb; eine Sperre, die mal greift und mal nicht, verwirrt mehr, als sie nützt. Die Farbe genügt.', S.feinUmbruch) }));

  h2('So wird gerechnet');
  punkt('Cashflow', 'Kaltmiete − nicht umlagefähige Bewirtschaftung − Zinsen − Tilgung = Cashflow vor Steuern. Die Tilgung mindert den Cashflow, aber nicht die Steuer; die AfA mindert die Steuer, aber nicht den Cashflow.');
  punkt('Steuer', 'Kaltmiete − Bewirtschaftung − Zinsen − AfA = Einkünfte aus Vermietung, mal effektivem Steuersatz. Soli und Kirchensteuer kommen auf die Einkommensteuer, nicht auf das Einkommen.');
  punkt('Abschreibung', 'Der Grundstücksanteil wird auf die Anschaffungskosten inkl. Nebenkosten angewendet – die Kaufnebenkosten werden damit im selben Verhältnis wie der Kaufpreis auf Grundstück und Gebäude aufgeteilt. Liegt stattdessen ein fester Gebäudewert aus einem Kaufpreisaufteilungsgutachten vor, ersetzt „Gebäude € (manuell)" den Grundstücksanteil. Im Kaufjahr wird ab dem Kaufmonat zeitanteilig abgeschrieben.');
  punkt('Tilgung', 'Nachschüssige Annuität, monatlich verrechnet. Die erste Rate fällt im Monat nach der Auszahlung an. Nach Ablauf der Zinsbindung läuft die bisherige Rate weiter, solange sie mindestens 1 % der Restschuld tilgt.');
  punkt('Renditen', 'Rechnen immer mit zwölf mal der aktuellen Monatsmiete, damit ein angeschnittenes Anschaffungsjahr sie nicht verzerrt.');
  punkt('Nebenkosten', 'Umlagefähige Kosten und Nebenkosten-Vorauszahlungen sind ein durchlaufender Posten und bleiben im Cashflow außen vor.');
  punkt('Eigenprovision', 'Eine nachträgliche Kaufpreisreduktion mindert die Gesamtinvestition und damit AfA-Bemessungsgrundlage und eingesetztes Eigenkapital – die Kaufnebenkosten bleiben unangetastet, denn Grunderwerbsteuer, Notar und Makler wurden auf den beurkundeten Kaufpreis festgesetzt.');

  h2('Grenzen dieser Mappe');
  punkt('Ein Szenario zur Zeit', 'Der Umschalter auf dem Blatt Vorgaben ändert die ganze Mappe – auch die Tilgungspläne, weil der Anschlusszins vom Szenario abhängt. Die drei Szenarien vergleichst du durch Umschalten.');
  punkt('Ein Kalenderjahr', 'Zahlungen, Korrekturen und der Cashflow-Block gelten für das Jahr auf dem Blatt Vorgaben. Ein anderes Jahr ist eine neu erzeugte Mappe.');
  punkt('Zahlungen je Objekt und Art', 'Mehrere Mietverträge oder Darlehen eines Objekts erscheinen summiert, nicht einzeln.');
  punkt('Keine Buchungsebene', 'Die App führt seit Kurzem ein Hauptbuch mit frei erfassten Buchungen und Fahrten – Reparaturen, Fahrtkosten, Nebenkostenabrechnung, Anlage-V-Export. Diese Mappe bildet nur die aus den Stammdaten abgeleiteten Zahlungen ab, wie zuvor. Die umlagefähigen Betriebskosten sind hier trotzdem als Werbungskosten berücksichtigt, siehe Blatt Objekte.');
  punkt('Platz', `${OBJEKTE} Objekte, ${EINHEITEN} Einheiten, ${VERTRAEGE} Mietverträge mit je ${KONDITIONEN} Konditionen, ${DARLEHEN} Darlehen, ${SONDER} Sondertilgungen.`);
  punkt('Zeitraum', `Die Prognose reicht ${JAHRE} Jahre. Ein Tilgungsplan wird über ${MONATE / 12} Jahre ab seiner Auszahlung gerechnet – für ein Darlehen, das lange vor dem Jahr der Mappe ausgezahlt wurde, kann das am Ende der Prognose knapp werden. Das Dashboard sagt es, wenn es so ist.`);
  punkt('Ein Verkehrswert je Objekt', 'Keine Werthistorie, ein Feld für aktivierte Modernisierungen statt einer Liste.');
  punkt('Keine Anhänge', 'Bilder, Dokumente und das Änderungsprotokoll bleiben Sache der App.');

  leerzeile();
  leerzeile();
  z.push(reihe({
    3: w('Erzeugt vom Skill zahlenkompass-tabelle · Funktioniert in Excel und in Google Sheets · Keine Makros', S.feiner),
  }));
  return b;
}

/* ==========================================================================
   Die Mappe
   ========================================================================== */

export function mappe(jahr, daten = null) {
  const blaetter = [
    blattUebersicht(jahr),
    blattVorgaben(jahr, daten),
    blattObjekte(daten),
    blattMietvertraege(daten),
    blattDarlehen(daten),
    blattTilgungsplan(),
    blattZahlungen(daten),
    blattDetail(),
    blattPrognose(),
    blattDashboard(),
    blattKern(jahr),
    blattTilgung(),
  ];
  return { blaetter, namen: namenBauen() };
}

/* Raster fuer das Vergleichsskript: wo steht was. Damit der Vergleich
   dieselben abgeleiteten Zeilennummern benutzt wie die Blattdefinition und
   nicht eigene, die davon auseinanderlaufen koennen. */
export const RASTER = {
  OBJEKTE, EINHEITEN, VERTRAEGE, KONDITIONEN, DARLEHEN, SONDER, JAHRE, JAHRZEILEN, MONATE, ARTEN,
  ZAHLUNGSARTEN,
  T, T_ERSTE, tZeile,
  ML, ML_ERSTE, mlErste,
  OJ, OJ_ERSTE, ojZeile,
  I, IST_ERSTE,
  VK, VK_ERSTE,
  Z, Z_ERSTE, zZeile, ZK_ERSTE, zkZeile,
  P, P_ERSTE,
};

export { namenBauen };
