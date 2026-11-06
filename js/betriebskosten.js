/* Laufende Kosten eines Objekts als einzelne Positionen.

   Jede Position ist eine Kostenart mit Betrag, Zahlweise und dem Merkmal
   „umlagefähig“. Sie ersetzt seit Schema 15 die Sammelfelder von `o.kosten`
   (Hausgeld, davon umlagefähig, Verwaltung, Rücklage, Sonstige pro Jahr).

     { id, art, bezeichnung,
       betrag,                 // je Fälligkeit, nicht je Jahr
       rhythmus,               // 'monatlich' | 'vierteljaehrlich' | 'halbjaehrlich' | 'jaehrlich'
       ersterMonat,            // 1–12, erste Fälligkeit im Jahr
       umlagefaehig,           // auf die Mieter umgelegt (Vorgabe aus der Kostenart)
       imHausgeld }            // Teil des WEG-Hausgelds, wird monatlich gezahlt

   Eine Position im Hausgeld ist immer monatlich: Die Gemeinschaft zieht ein
   Zwölftel des Wirtschaftsplans ein, gleich wann sie selbst die Rechnung
   bezahlt. Direkt bezahlte Positionen stehen im Monat ihrer Fälligkeit.

   Zuordnung zu den Zahlungsarten aus zahlungen.js – darüber laufen Cashflow,
   Buchhaltung, Korrekturen und die Anlage V weiter wie bisher:

     umlagefähig                          → betriebskostenUmlagefaehig
     Verwaltung                           → verwaltung
     Erhaltungsrücklage                   → instandhaltung (steuerlich erst bei Verausgabung)
     übrige, nicht umlagefähig, Hausgeld  → hausgeld
     übrige, nicht umlagefähig, direkt    → sonstige

   Reines Rechenmodul ohne Abhängigkeiten – in Node prüfbar.
*/

/** Kostenarten. `umlage` ist die Vorgabe, je Position überschreibbar. */
export const KOSTENARTEN = [
  // § 2 Betriebskostenverordnung – umlagefähig, wenn der Mietvertrag es vereinbart
  { key: 'grundsteuer', text: 'Grundsteuer', umlage: true, nr: 1 },
  { key: 'wasser', text: 'Wasserversorgung', umlage: true, nr: 2 },
  { key: 'abwasser', text: 'Entwässerung / Abwasser', umlage: true, nr: 3 },
  { key: 'heizung', text: 'Heizung', umlage: true, nr: 4 },
  { key: 'warmwasser', text: 'Warmwasser', umlage: true, nr: 5 },
  { key: 'aufzug', text: 'Aufzug', umlage: true, nr: 7 },
  { key: 'muell', text: 'Straßenreinigung & Müll', umlage: true, nr: 8 },
  { key: 'hausreinigung', text: 'Hausreinigung', umlage: true, nr: 9 },
  { key: 'garten', text: 'Gartenpflege', umlage: true, nr: 10 },
  { key: 'beleuchtung', text: 'Allgemeinstrom / Beleuchtung', umlage: true, nr: 11 },
  { key: 'schornstein', text: 'Schornsteinfeger', umlage: true, nr: 12 },
  { key: 'versicherung', text: 'Sach- & Haftpflichtversicherung', umlage: true, nr: 13 },
  { key: 'hauswart', text: 'Hauswart', umlage: true, nr: 14 },
  { key: 'kabel', text: 'Kabel / Antenne', umlage: true, nr: 15 },
  { key: 'waesche', text: 'Wäschepflege', umlage: true, nr: 16 },
  { key: 'sonstigeBetrieb', text: 'Sonstige Betriebskosten', umlage: true, nr: 17 },
  { key: 'sammelUmlage', text: 'Hausgeld, umlagefähiger Teil (Sammelposten)', umlage: true, sammel: true },
  // nicht umlagefähig
  { key: 'verwaltung', text: 'Verwaltung', umlage: false },
  { key: 'ruecklage', text: 'Erhaltungsrücklage', umlage: false, fest: true },
  { key: 'instandhaltung', text: 'Instandhaltung / Reparaturpauschale', umlage: false },
  { key: 'bank', text: 'Kontoführung & Bankgebühren', umlage: false },
  { key: 'sammelNichtUmlage', text: 'Hausgeld, nicht umlagefähiger Teil (Sammelposten)', umlage: false, sammel: true },
  { key: 'sonstigeNichtUmlage', text: 'Sonstige Kosten, nicht umlagefähig', umlage: false },
];

export const RHYTHMEN = [
  { wert: 'monatlich', text: 'monatlich', abstand: 1 },
  { wert: 'vierteljaehrlich', text: 'vierteljährlich', abstand: 3 },
  { wert: 'halbjaehrlich', text: 'halbjährlich', abstand: 6 },
  { wert: 'jaehrlich', text: 'jährlich', abstand: 12 },
];

/** Gruppen der Übersicht, in dieser Reihenfolge. */
export const GRUPPEN_BK = [
  { key: 'umlage', text: 'Umlagefähig' },
  { key: 'nichtUmlage', text: 'Nicht umlagefähig' },
  { key: 'ruecklage', text: 'Erhaltungsrücklage' },
];

export const kostenart = (key) => KOSTENARTEN.find((a) => a.key === key)
  || { key, text: key || 'Ohne Kostenart', umlage: false };

/** Vorgabe beim Anlegen oder beim Wechsel der Kostenart. */
export function artVorgabe(art) {
  const a = kostenart(art);
  return {
    umlagefaehig: a.fest ? false : !!a.umlage,
    rhythmus: art === 'grundsteuer' ? 'vierteljaehrlich' : (art === 'versicherung' ? 'jaehrlich' : 'monatlich'),
    ersterMonat: art === 'grundsteuer' ? 2 : 1,
  };
}

/** Eine neue, leere Position. */
export function neuePosition(id, art = 'sonstigeBetrieb', imHausgeld = false) {
  return { id, art, bezeichnung: '', betrag: null, imHausgeld, ...artVorgabe(art) };
}

/** Erhaltungsrücklage ist nie umlagefähig, egal was in der Position steht. */
export const istUmlagefaehig = (pos) => pos.art !== 'ruecklage' && !!pos.umlagefaehig;

/** Monate (1–12), in denen die Position fällig ist. */
export function faelligeMonate(pos) {
  if (pos.imHausgeld) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const abstand = (RHYTHMEN.find((r) => r.wert === pos.rhythmus) || RHYTHMEN[0]).abstand;
  const start = Math.min(12, Math.max(1, Math.round(pos.ersterMonat || 1)));
  const raus = [];
  for (let i = 0; i < 12; i += abstand) raus.push(((start - 1 + i) % 12) + 1);
  return raus.sort((a, b) => a - b);
}

/** Zahlungen je Jahr: 12, 4, 2 oder 1. */
export const zahlungenProJahr = (pos) => faelligeMonate(pos).length;

export const jahresbetrag = (pos) => (pos.betrag || 0) * zahlungenProJahr(pos);

export function betragImMonat(pos, monat) {
  return faelligeMonate(pos).includes(monat) ? (pos.betrag || 0) : 0;
}

/** Gruppe der Übersicht: umlage | nichtUmlage | ruecklage */
export function gruppeVon(pos) {
  if (pos.art === 'ruecklage') return 'ruecklage';
  return istUmlagefaehig(pos) ? 'umlage' : 'nichtUmlage';
}

/** Zahlungsart in zahlungen.js, siehe Kopfkommentar. */
export function zahlungsart(pos) {
  if (pos.art === 'ruecklage') return 'instandhaltung';
  if (istUmlagefaehig(pos)) return 'betriebskostenUmlagefaehig';
  if (pos.art === 'verwaltung') return 'verwaltung';
  return pos.imHausgeld ? 'hausgeld' : 'sonstige';
}

export const positionen = (o) => (Array.isArray(o?.betriebskosten) ? o.betriebskosten : []);

/** Anzeigename: eigene Bezeichnung, sonst die Kostenart. */
export const positionName = (pos) => (pos.bezeichnung || '').trim() || kostenart(pos.art).text;

/**
 * Volle Jahreswerte je Zahlungsart – Grundlage der Renditen und des
 * Forecasts. `ruecklageGesetzt` unterscheidet „keine Rücklage-Position“
 * (der Forecast setzt die Pauschale an) von einer Position mit 0 €.
 */
export function kostenJahr(o) {
  const raus = {
    betriebskostenUmlagefaehig: 0, hausgeld: 0, verwaltung: 0, instandhaltung: 0, sonstige: 0,
    ruecklageGesetzt: false,
  };
  for (const pos of positionen(o)) {
    if (pos.art === 'ruecklage' && pos.betrag != null) raus.ruecklageGesetzt = true;
    raus[zahlungsart(pos)] += jahresbetrag(pos);
  }
  return raus;
}

/**
 * Summen je Zahlungsart für einen Monat, dazu die Namen der Positionen –
 * für die Monatszeilen der Buchhaltung und die Herleitung der Anlage V.
 */
export function monatsSummen(o, monat) {
  const raus = new Map();
  for (const pos of positionen(o)) {
    const betrag = betragImMonat(pos, monat);
    if (!betrag) continue;
    const art = zahlungsart(pos);
    const e = raus.get(art) || { betrag: 0, namen: [] };
    e.betrag += betrag;
    e.namen.push(positionName(pos));
    raus.set(art, e);
  }
  return raus;
}

/**
 * Sammelfelder bis Schema 14 → Positionen. Alle übernommenen Positionen
 * sind monatlich, damit sich kein Monat und keine Summe verschiebt.
 * `neueId` liefert eindeutige Kennungen.
 */
export function ausSammelfeldern(k, neueId, imHausgeld = true) {
  if (!k) return [];
  const raus = [];
  const pos = (art, betrag, extra = {}) => raus.push({
    id: neueId(), art, bezeichnung: '', betrag,
    rhythmus: 'monatlich', ersterMonat: 1,
    umlagefaehig: !!kostenart(art).umlage, imHausgeld, ...extra,
  });
  const umlage = Math.max(0, k.hausgeldUmlagefaehigMonat || 0);
  const nichtUmlage = Math.max(0, (k.hausgeldMonat || 0) - umlage);
  if (umlage) pos('sammelUmlage', umlage);
  if (nichtUmlage) pos('sammelNichtUmlage', nichtUmlage);
  if (k.verwaltungMonat) pos('verwaltung', k.verwaltungMonat);
  // leer bleibt leer: dann setzt der Forecast die Pauschale an
  if (k.instandhaltungMonat != null) pos('ruecklage', k.instandhaltungMonat);
  if (k.sonstigeJahr) pos('sonstigeNichtUmlage', k.sonstigeJahr / 12, { imHausgeld: false });
  return raus;
}
