/* Musterportfolio fuer den Vergleich zwischen Mappe und App.

   Eine Quelle, zwei Gestalten: `fuerMappe` fuellt die Eingabezellen der
   Tabelle, `fuerApp` ergibt eine portfolio.json, wie die App sie laedt.
   Beides aus denselben Zahlen – sonst vergleicht man zwei Tippfehler.

   Absichtlich enthalten sind die Faelle, die erfahrungsgemaess auseinander
   laufen:
     - Kauf im laufenden Jahr (Rumpfjahr, anteilige AfA und Kosten)
     - Staffelmiete mit einem "gilt ab" in der Zukunft
     - Indexmiete mit eigenem Anpassungssatz
     - befristeter Vertrag, der im Prognosezeitraum endet
     - leerstehende Einheit
     - Zinsbindung, die innerhalb des Horizonts ablaeuft
     - verzoegerter Tilgungsstart (tilgungsfreie Anlaufzeit)
     - Sondertilgung
     - endfaelliges Darlehen
     - Darlehen mit Tilgungsersatz und verzinstem Ansparkonto
     - Objekt mit abweichendem Steuersatz
     - manueller Gebäudeanteil aus einem Kaufpreisaufteilungsgutachten
     - Eigenprovision (Kaufpreisreduktion ohne Auswirkung auf die Nebenkosten)
     - korrigierte und gestrichene Zahlungen
*/

export const JAHR = 2026;
export const STICHTAG = '2026-08-05';

export const EINSTELLUNGEN = {
  steuersatz: 42,
  kirchensteuer: 9,
  soli: 'Ja',
  szenario: 'Basis',
  mietsteigerung: 1.5,
  wertsteigerung: 2.0,
  inflation: 2.0,
  leerstand: 2.0,
  instandhaltung: 1.0,
  anschlusszins: 4.5,
  prognoseJahre: 30,
  verkaufNach: 12,
  verkaufskosten: 3.0,
  grest: 6.5,
  notar: 1.5,
  makler: 3.57,
};

export const OBJEKTE = [
  {
    bezeichnung: 'ETW Musterstraße 12', typ: 'ETW', ort: 'München', baujahr: 1998,
    flaeche: 68, kaufdatum: '2019-04-15', kaufpreis: 320000,
    bundesland: 'Bayern', notar: 1.5, makler: 3.57, weitereNk: 2500,
    // Nachtraeglich zurueckgeflossene Provision: mindert die Gesamtinvestition,
    // nicht die auf den beurkundeten Kaufpreis festgesetzten Nebenkosten.
    eigenprovision: 5000,
    grundstuecksanteil: 20, afaSatz: 2, modernisierung: 18000,
    hausgeld: 280, umlagefaehig: 60, verwaltung: 25, instandhaltung: 60, sonstige: 400,
    verkehrswert: 395000, steuersatz: null,
  },
  {
    bezeichnung: 'MFH Ringweg 4', typ: 'MFH', ort: 'Essen', baujahr: 1965,
    flaeche: 310, kaufdatum: '2026-03-10', kaufpreis: 890000,
    bundesland: 'Nordrhein-Westfalen', notar: 1.8, makler: null, weitereNk: 0,
    grundstuecksanteil: 25, afaSatz: 3.226, modernisierung: 0,
    hausgeld: 0, umlagefaehig: 0, verwaltung: 180, instandhaltung: 0, sonstige: 1200,
    verkehrswert: null, steuersatz: null,
  },
  {
    bezeichnung: 'ETW Seeweg 9', typ: 'ETW', ort: 'Leipzig', baujahr: 2012,
    flaeche: 54, kaufdatum: '2022-09-01', kaufpreis: 245000,
    bundesland: null, grest: 5.5, notar: 1.5, makler: 3.57, weitereNk: 0,
    // Kaufpreisaufteilungsgutachten mit festem Gebäudewert statt Prozentsatz –
    // grundstuecksanteil bleibt gesetzt, wird aber vom manuellen Wert überschrieben.
    grundstuecksanteil: 18, gebaeudeanteilManuell: 150000, afaSatz: 2, modernisierung: 0,
    hausgeld: 195, umlagefaehig: 45, verwaltung: 22, instandhaltung: 40, sonstige: 0,
    verkehrswert: 268000, steuersatz: 30,
  },
];

/* Die Flaechen der Einheiten summieren sich je Objekt auf die Objektflaeche –
   dann liefern flaecheVon() der App und die Mappe denselben Wert. */
export const EINHEITEN = [
  { objektIndex: 0, bezeichnung: 'Wohnung', flaeche: 68, zimmer: 3 },
  { objektIndex: 1, bezeichnung: 'WE 1', flaeche: 110, zimmer: 4 },
  { objektIndex: 1, bezeichnung: 'WE 2', flaeche: 105, zimmer: 4 },
  { objektIndex: 1, bezeichnung: 'WE 3', flaeche: 95, zimmer: 3 },
  { objektIndex: 2, bezeichnung: 'Wohnung', flaeche: 54, zimmer: 2 },
];

export const VERTRAEGE = [
  /* Staffelmiete: die dritte Kondition greift erst 2028 */
  {
    einheitIndex: 0, mieter: 'Schmidt', beginn: '2019-06-01',
    befristetBis: null, gekuendigtZum: null, anpassung: 'Staffel', indexProzent: null,
    ab1: '2019-06-01', kalt1: 780, nk1: 150,
    ab2: '2023-07-01', kalt2: 880, nk2: 175,
    ab3: '2028-07-01', kalt3: 960, nk3: 190,
  },
  /* laeuft seit dem Kauf des MFH */
  {
    einheitIndex: 1, mieter: 'Yilmaz', beginn: '2021-02-01',
    befristetBis: null, gekuendigtZum: null, anpassung: 'keine', indexProzent: null,
    ab1: '2021-02-01', kalt1: 720, nk1: 210,
  },
  /* befristet – endet mitten im Prognosezeitraum */
  {
    einheitIndex: 2, mieter: 'Brandt', beginn: '2024-05-01',
    befristetBis: '2029-04-30', gekuendigtZum: null, anpassung: 'keine', indexProzent: null,
    ab1: '2024-05-01', kalt1: 690, nk1: 200,
  },
  /* WE 3 bleibt leer – kein Vertrag */
  /* Indexmiete mit eigenem Satz */
  {
    einheitIndex: 4, mieter: 'Novak', beginn: '2022-10-01',
    befristetBis: null, gekuendigtZum: null, anpassung: 'Index', indexProzent: 2.8,
    ab1: '2022-10-01', kalt1: 545, nk1: 135,
  },
];

export const DARLEHEN = [
  /* Annuitaet, Zinsbindung laeuft 2029 aus, mit Sondertilgung */
  {
    objektIndex: 0, bank: 'Sparkasse', art: 'Annuität', betrag: 256000,
    auszahlung: '2019-04-01', sollzins: 1.85, tilgung: 2.5,
    zinsbindungBis: '2029-03-31', anschlusszins: null, tilgungStart: null,
    tilgungsersatz: 'Nein', sonderrecht: 5,
  },
  /* verzoegerter Tilgungsstart: erste Rate 04/2026, getilgt ab 04/2028.
     Die 24 Raten davor tragen nur Zinsen und entlasten den Cashflow. */
  {
    objektIndex: 1, bank: 'Volksbank', art: 'Annuität', betrag: 620000,
    auszahlung: '2026-03-01', sollzins: 3.65, tilgung: 2.0,
    zinsbindungBis: '2036-02-28', anschlusszins: null, tilgungStart: '2028-04-01',
    tilgungsersatz: 'Nein', sonderrecht: 5,
  },
  /* endfaellig, laeuft bis zum Bindungsende */
  {
    objektIndex: 1, bank: 'KfW', art: 'Endfällig', betrag: 100000,
    auszahlung: '2026-03-01', sollzins: 2.4, tilgung: 0,
    zinsbindungBis: '2036-02-28', anschlusszins: null, tilgungStart: null,
    tilgungsersatz: 'Nein', sonderrecht: 0,
  },
  /* Tilgungsersatz auf ein verzinstes Ansparkonto, eigener Anschlusszins */
  {
    objektIndex: 2, bank: 'Direktbank', art: 'Annuität', betrag: 190000,
    auszahlung: '2022-09-01', sollzins: 2.1, tilgung: 2.0,
    zinsbindungBis: '2032-08-31', anschlusszins: 5.2, tilgungStart: null,
    tilgungsersatz: 'Ja', ersatzProzent: 2.2, ersatzZins: 3.0, sonderrecht: 5,
  },
];

export const SONDERTILGUNGEN = [
  { darlehenIndex: 0, datum: '2024-11-15', betrag: 8000 },
  { darlehenIndex: 0, datum: '2027-06-10', betrag: 6000 },
  { darlehenIndex: 3, datum: '2028-03-20', betrag: 5000 },
];

/* Korrekturen: art ist die Nummer der Zahlungsart (1 = Miete, 3 = Hausgeld, …).
   Sie sitzen nur auf Objekten, die je Art genau einen Bezug haben – sonst
   liesse sich die Zeile der Mappe keiner Korrektur der App zuordnen. */
export const KORREKTUREN = [
  { objektIndex: 0, art: 1, monat: 3, betrag: 0 },      // Mietausfall im März
  { objektIndex: 0, art: 3, monat: 7, betrag: 340 },    // höheres Hausgeld im Juli
  { objektIndex: 2, art: 5, monat: 9, betrag: 1250 },   // Instandhaltung im September
];

/* ---------- Gestalt für die Mappe ---------- */

export function fuerMappe() {
  return {
    name: 'Musterportfolio',
    jahr: JAHR,
    stichtag: STICHTAG,
    ...EINSTELLUNGEN,
    objekte: OBJEKTE,
    einheiten: EINHEITEN.map((e) => ({ ...e, objekt: OBJEKTE[e.objektIndex].bezeichnung })),
    vertraege: VERTRAEGE.map((v) => {
      const e = EINHEITEN[v.einheitIndex];
      return { ...v, einheit: `${e.bezeichnung} (${OBJEKTE[e.objektIndex].bezeichnung})` };
    }),
    darlehen: DARLEHEN.map((d) => ({ ...d, objekt: OBJEKTE[d.objektIndex].bezeichnung })),
    sondertilgungen: SONDERTILGUNGEN.map((s) => ({
      ...s,
      darlehen: `${s.darlehenIndex + 1} · ${DARLEHEN[s.darlehenIndex].bank}`,
    })),
    korrekturen: KORREKTUREN.map((k) => ({ ...k, objekt: k.objektIndex + 1 })),
  };
}

/* ---------- Gestalt für die App ---------- */

const GRUNDERWERBSTEUER = {
  'Baden-Württemberg': 5.0, Bayern: 3.5, Berlin: 6.0, Brandenburg: 6.5,
  Bremen: 5.5, Hamburg: 5.5, Hessen: 6.0, 'Mecklenburg-Vorpommern': 6.0,
  Niedersachsen: 5.0, 'Nordrhein-Westfalen': 6.5, 'Rheinland-Pfalz': 5.0,
  Saarland: 6.5, Sachsen: 5.5, 'Sachsen-Anhalt': 5.0,
  'Schleswig-Holstein': 6.5, Thüringen: 5.0,
};

/** Dieselbe Vorrangregel wie in der Mappe: eigener Satz, sonst Land, sonst Vorgabe. */
function grestSatz(o) {
  if (o.grest != null) return o.grest;
  if (o.bundesland) return GRUNDERWERBSTEUER[o.bundesland] ?? EINSTELLUNGEN.grest;
  return EINSTELLUNGEN.grest;
}

const ARTEN_KEYS = ['miete', 'nebenkosten', 'hausgeld', 'verwaltung', 'instandhaltung',
  'sonstige', 'zins', 'tilgung', 'sondertilgung', 'tilgungsersatz'];

export function fuerApp() {
  const objekte = OBJEKTE.map((o, i) => ({
    id: `obj-${i + 1}`,
    bezeichnung: o.bezeichnung, typ: o.typ, ort: o.ort ?? '', baujahr: o.baujahr ?? null,
    mehrereEinheiten: true,
    flaeche: o.flaeche ?? null, zimmer: null,
    kaufdatum: o.kaufdatum, kaufpreis: o.kaufpreis,
    eigenprovision: o.eigenprovision ?? null,
    nebenkosten: {
      grunderwerbsteuer: { modus: 'prozent', wert: grestSatz(o) },
      notar: { modus: 'prozent', wert: o.notar ?? EINSTELLUNGEN.notar },
      makler: { modus: 'prozent', wert: o.makler ?? EINSTELLUNGEN.makler },
      weitere: o.weitereNk ? [{ id: `nk-${i}`, bezeichnung: 'Weitere', modus: 'betrag', wert: o.weitereNk }] : [],
    },
    grundstuecksanteil: o.grundstuecksanteil,
    gebaeudeanteilManuell: o.gebaeudeanteilManuell ?? null,
    afaSatz: o.afaSatz,
    modernisierung: o.modernisierung
      ? [{ id: `mod-${i}`, datum: o.kaufdatum, betrag: o.modernisierung, bezeichnung: 'Sanierung', aktiviert: true }]
      : [],
    werte: o.verkehrswert ? [{ datum: STICHTAG, wert: o.verkehrswert, quelle: 'Muster' }] : [],
    kosten: {
      hausgeldMonat: o.hausgeld || null,
      hausgeldUmlagefaehigMonat: o.umlagefaehig || null,
      verwaltungMonat: o.verwaltung || null,
      instandhaltungMonat: o.instandhaltung ?? null,
      sonstigeJahr: o.sonstige || null,
    },
    steuersatzAbweichend: o.steuersatz ?? null,
    bilder: [], tags: [], notizen: '', angelegtAm: `${STICHTAG}T00:00:00.000Z`,
  }));

  const einheiten = EINHEITEN.map((e, i) => ({
    id: `einh-${i + 1}`, objektId: objekte[e.objektIndex].id,
    bezeichnung: e.bezeichnung, lage: '', flaeche: e.flaeche, zimmer: e.zimmer,
    implizit: false, notizen: '',
  }));

  const mietvertraege = VERTRAEGE.map((v, i) => {
    const konditionen = [];
    for (let k = 1; k <= 3; k++) {
      if (v[`ab${k}`]) {
        konditionen.push({
          id: `kond-${i}-${k}`, gueltigAb: v[`ab${k}`],
          kaltmiete: v[`kalt${k}`] ?? null, nkVorauszahlung: v[`nk${k}`] ?? null, notiz: '',
        });
      }
    }
    return {
      id: `mv-${i + 1}`, einheitId: einheiten[v.einheitIndex].id,
      mieter: v.mieter, beginn: v.beginn,
      ende: v.befristetBis ?? null,
      unbefristet: !v.befristetBis,
      gekuendigtZum: v.gekuendigtZum ?? null,
      konditionen, kaution: null,
      anpassungTyp: v.anpassung === 'Index' ? 'index' : (v.anpassung === 'Staffel' ? 'staffel' : 'keine'),
      indexProzent: v.indexProzent ?? null,
      notizen: '',
    };
  });

  const finanzierungen = DARLEHEN.map((d, i) => ({
    id: `fin-${i + 1}`, objektId: objekte[d.objektIndex].id,
    bank: d.bank, darlehensnummer: '',
    art: d.art === 'Endfällig' ? 'endfaellig' : (d.art === 'KfW' ? 'kfw' : 'annuitaet'),
    betrag: d.betrag, auszahlung: d.auszahlung,
    sollzins: d.sollzins, tilgungAnfang: d.tilgung,
    zinsbindungBis: d.zinsbindungBis ?? null,
    anschlusszins: d.anschlusszins ?? null,
    tilgungStart: d.tilgungStart ?? null,
    mitTilgungsersatz: d.tilgungsersatz === 'Ja',
    tilgungsersatzProzent: d.ersatzProzent ?? null,
    tilgungsersatzZins: d.ersatzZins ?? null,
    sondertilgungMaxProzent: d.sonderrecht ?? 0,
    sondertilgungen: SONDERTILGUNGEN
      .filter((s) => s.darlehenIndex === i)
      .map((s, k) => ({ id: `st-${i}-${k}`, datum: s.datum, betrag: s.betrag })),
    notizen: '',
  }));

  /* Korrekturen brauchen den Bezug, den die Zahlungsebene erwartet:
     Miete am Mietvertrag, Bewirtschaftung am Objekt, Finanzierung am Darlehen. */
  const zahlungen = KORREKTUREN.map((k, i) => {
    const art = ARTEN_KEYS[k.art - 1];
    const objektId = objekte[k.objektIndex].id;
    let bezugId = objektId;
    if (art === 'miete' || art === 'nebenkosten') {
      const mv = mietvertraege.find((m) => {
        const e = einheiten.find((x) => x.id === m.einheitId);
        return e.objektId === objektId;
      });
      bezugId = mv.id;
    } else if (['zins', 'tilgung', 'sondertilgung', 'tilgungsersatz'].includes(art)) {
      bezugId = finanzierungen.find((fi) => fi.objektId === objektId).id;
    }
    return {
      id: `zk-${i}`, periode: `${JAHR}-${String(k.monat).padStart(2, '0')}`,
      art, objektId, bezugId, betrag: k.betrag, entfaellt: false, notiz: '',
    };
  });

  return {
    schemaVersion: 8,
    meta: {
      name: 'Musterportfolio', erstelltAm: `${STICHTAG}T00:00:00.000Z`,
      geaendertAm: `${STICHTAG}T00:00:00.000Z`, letztesBackup: null,
    },
    einstellungen: {
      steuersatz: EINSTELLUNGEN.steuersatz,
      soli: EINSTELLUNGEN.soli === 'Ja',
      kirchensteuer: EINSTELLUNGEN.kirchensteuer,
      forecastJahre: EINSTELLUNGEN.prognoseJahre,
      mietsteigerung: EINSTELLUNGEN.mietsteigerung,
      wertsteigerung: EINSTELLUNGEN.wertsteigerung,
      instandhaltungProzent: EINSTELLUNGEN.instandhaltung,
      leerstandProzent: EINSTELLUNGEN.leerstand,
      inflation: EINSTELLUNGEN.inflation,
      anschlusszins: EINSTELLUNGEN.anschlusszins,
      verkaufNachJahren: EINSTELLUNGEN.verkaufNach,
      verkaufskosten: EINSTELLUNGEN.verkaufskosten,
      grunderwerbsteuer: EINSTELLUNGEN.grest,
      notarkosten: EINSTELLUNGEN.notar,
      maklerProvision: EINSTELLUNGEN.makler,
    },
    objekte, einheiten, mietvertraege, finanzierungen,
    dokumente: [], protokoll: [], zahlungen,
  };
}
