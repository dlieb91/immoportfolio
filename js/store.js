/* Datenmodell, Zustand und Aenderungsverwaltung.

   Alle Entitaeten liegen als flache Listen mit IDs vor – das haelt
   Verknuepfungen (Objekt -> Einheit -> Mietvertrag) einfach und macht
   die portfolio.json gut lesbar.
*/

import { uid, zeitstempel, heuteISO } from './util.js';
import { planeSpeichern } from './storage.js';
import { tilgungsplan } from './finanzmathematik.js';
import { ausSammelfeldern } from './betriebskosten.js';

export const SCHEMA_VERSION = 16;

export const STANDARD_EINSTELLUNGEN = {
  // Steuern
  steuersatz: 42,             // persoenlicher Grenzsteuersatz in %
  soli: false,                // 5,5 % auf die Einkommensteuer
  kirchensteuer: 0,           // 0, 8 oder 9 %
  // Forecast-Vorgaben
  forecastJahre: 20,
  mietsteigerung: 1.5,        // % p.a.
  wertsteigerung: 2.0,        // % p.a.
  instandhaltungProzent: 1.0, // % vom Kaufpreis p.a.
  leerstandProzent: 2.0,
  // § 558 Abs. 3 BGB: 20 %, in Gebieten mit angespanntem Wohnungsmarkt 15 %
  kappungsgrenzeProzent: 20,
  inflation: 2.0,
  anschlusszins: 4.5,         // % nach Ablauf der Zinsbindung
  // Forward-Darlehen: Zinsaufschlag in Prozentpunkten je Monat Vorlauf, ab dem 13. Monat
  forwardAufschlagMonat: 0.02,
  // Absender der Mieterhöhungs-Schreiben. Bewusst zwei flache Felder: Ein verschachteltes
  // Standardobjekt würde beim flachen Kopieren von allen Portfolios geteilt und beim
  // Tippen verändert. Fehlende Felder füllt laden() mit diesen Vorgaben auf.
  vermieterName: '',
  vermieterAnschrift: '',
  verkaufNachJahren: null,    // Verkaufsszenario im Forecast, leer = kein Verkauf
  verkaufskosten: 3.0,        // % vom Verkaufserlös
  // Nur Vorbelegung beim Anlegen eines Objekts – erfasst wird je Objekt.
  grunderwerbsteuer: 6.5,
  /* Erfahrungswerte, maßgeblich sind die Rechnungen. Notar und Grundbuch
     für den Kauf sind Anschaffungskosten; die Grundschuldbestellung richtet
     sich nach der Darlehenssumme und ist sofort abziehbar. */
  notarkosten: 1.0,           // Notar Kaufvertrag, % vom Kaufpreis
  grundbuchkosten: 0.5,       // Grundbuch Eigentumsumschreibung, % vom Kaufpreis
  grundschuldkosten: 0.4,     // Notar und Grundbuch Grundschuld, % der Darlehenssumme
  maklerProvision: 3.57,
  // Fahrtkosten zum Objekt – BFH IX R 18/15: im Regelfall die vollen Kosten,
  // hier vereinfacht ueber die Pauschale. fahrtModus 'reise' rechnet die
  // gefahrenen km (hin und zurueck), 'pendler' die einfache Entfernung, wie
  // bei einer regelmaessigen Taetigkeitsstaette.
  fahrtModus: 'reise',
  fahrtSatzReise: 0.30,        // €/km, gefahrene Strecke
  fahrtSatzPendler: 0.38,      // €/km, einfache Entfernung, ab 1.1.2026
};

/** Grunderwerbsteuersaetze der Bundeslaender – Auswahlhilfe im Objektformular. */
export const GRUNDERWERBSTEUER = {
  'Baden-Württemberg': 5.0, 'Bayern': 3.5, 'Berlin': 6.0, 'Brandenburg': 6.5,
  'Bremen': 5.5, 'Hamburg': 5.5, 'Hessen': 6.0, 'Mecklenburg-Vorpommern': 6.0,
  'Niedersachsen': 5.0, 'Nordrhein-Westfalen': 6.5, 'Rheinland-Pfalz': 5.0,
  'Saarland': 6.5, 'Sachsen': 5.5, 'Sachsen-Anhalt': 5.0,
  'Schleswig-Holstein': 6.5, 'Thüringen': 5.0,
};

export const state = {
  daten: null,
};

const listener = new Set();

export function abonnieren(fn) {
  listener.add(fn);
  return () => listener.delete(fn);
}

function benachrichtigen() {
  for (const fn of listener) fn(state.daten);
}

/**
 * Zaehler, der bei jeder Datenaenderung hochzaehlt – Schluessel aller
 * Zwischenspeicher.
 *
 * Bewusst kein Zeitstempel: `geaendertAm` hat Millisekundenaufloesung, und
 * zwei aendern()-Aufrufe in derselben Millisekunde sind moeglich (etwa wenn
 * ein Feld schreibt und der nachgelagerte Handler gleich noch einmal). Ein
 * gleich gebliebener Stempel wuerde einen veralteten Cache stehen lassen.
 */
let revision = 0;
export const datenRevision = () => revision;

/** Nach jeder Datenaenderung aufrufen: rendert neu und stoesst Autosave an. */
export function aendern(fn) {
  if (typeof fn === 'function') fn(state.daten);
  state.daten.meta.geaendertAm = zeitstempel();
  /* Zaehlt in der Datei mit, anders als `revision` oben. Der Abgleich
     erkennt daran, ob seit der letzten Uebertragung hier etwas passiert
     ist – ein Zeitstempel taugt dafuer nicht, weil zwei Geraete mit
     auseinanderlaufenden Uhren sonst falsch verglichen wuerden. */
  state.daten.meta.stand = (state.daten.meta.stand || 0) + 1;
  state.daten.meta.geraet = geraeteKennung();
  revision++;
  benachrichtigen();
  planeSpeichern();
}

/**
 * Kennung dieses Geraets – nur zur Anzeige im Konfliktfall („zuletzt
 * geaendert auf: iPad"). Sie steht im localStorage, nicht in der Datei,
 * denn sie beschreibt das Geraet und nicht das Portfolio.
 */
export function geraeteKennung() {
  let k = localStorage.getItem('immo-geraet');
  if (!k) {
    const name = /iPad/.test(navigator.userAgent) ? 'iPad'
      : /iPhone/.test(navigator.userAgent) ? 'iPhone'
      : /Mac/.test(navigator.userAgent) ? 'Mac'
      : /Android/.test(navigator.userAgent) ? 'Android'
      : 'PC';
    k = `${name}-${Math.random().toString(36).slice(2, 7)}`;
    localStorage.setItem('immo-geraet', k);
  }
  return k;
}

/* ---------- Neuanlage & Migration ---------- */

export function neuesPortfolio(name) {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      name: name || 'Mein Portfolio',
      erstelltAm: zeitstempel(),
      geaendertAm: zeitstempel(),
      letztesBackup: null,
      stand: 0,           // zaehlt mit jeder Aenderung – Grundlage des Abgleichs
      geraet: null,       // wo zuletzt geaendert wurde, nur zur Anzeige
    },
    einstellungen: { ...STANDARD_EINSTELLUNGEN },
    objekte: [],
    einheiten: [],
    mietvertraege: [],
    finanzierungen: [],
    dokumente: [],
    protokoll: [],
    zahlungen: [],      // Korrekturen an den abgeleiteten historischen Zahlungen
    buchungen: [],      // frei erfasste Geschaeftsvorfaelle, siehe neueBuchung()
    fahrten: [],        // Fahrten zum Objekt, km-Pauschale statt Betrag
  };
}

/** Fuellt fehlende Felder auf und hebt aeltere Dateien auf die aktuelle Version. */
export function migrieren(daten) {
  if (!daten || typeof daten !== 'object') throw new Error('Ungültige Portfolio-Datei');

  const v = daten.schemaVersion ?? 0;
  if (v > SCHEMA_VERSION) {
    throw new Error(
      `Diese Datei wurde mit einer neueren App-Version erstellt (Schema ${v}). Bitte die App aktualisieren.`
    );
  }

  // Schrittweise Migrationen. Neue Schritte hier anhaengen.
  if (v < 2) {
    // Kaufnebenkosten: feste Prozentfelder -> frei erfassbare Positionen je Objekt
    for (const o of daten.objekte || []) {
      const alt = o.nebenkosten || {};
      if (alt.weitere) continue;
      o.nebenkosten = {
        grunderwerbsteuer: nkPosition('prozent', alt.grunderwerbsteuer ?? null),
        notar: nkPosition('prozent', alt.notarkosten ?? null),
        makler: nkPosition('prozent', alt.maklerProvision ?? null),
        weitere: alt.sonstige
          ? [nkPosition('betrag', alt.sonstige, 'Sonstige Nebenkosten')]
          : [],
      };
    }
    daten.schemaVersion = 2;
  }

  if (v < 3) {
    // Staffelmieten wandern in die Konditionen-Zeitreihe – ein Mechanismus statt zwei
    for (const m of daten.mietvertraege || []) {
      if (Array.isArray(m.staffeln) && m.staffeln.length) {
        m.konditionen = [
          ...(m.konditionen || []),
          ...m.staffeln.map((s) => ({
            id: uid('kond'), gueltigAb: s.gueltigAb,
            kaltmiete: s.kaltmiete, nkVorauszahlung: null, notiz: 'Staffel',
          })),
        ];
      }
      delete m.staffeln;
      delete m.status;          // wird jetzt aus den Daten abgeleitet
      // fehlende Nebenkosten aus der jeweils vorherigen Kondition uebernehmen
      const sortiert = (m.konditionen || []).sort((a, b) => String(a.gueltigAb).localeCompare(String(b.gueltigAb)));
      let letzteNk = null;
      for (const k of sortiert) {
        if (k.nkVorauszahlung == null) k.nkVorauszahlung = letzteNk;
        else letzteNk = k.nkVorauszahlung;
      }
    }
    daten.schemaVersion = 3;
  }

  if (v < 4) {
    // Korrekturen an historischen Zahlungen
    if (!Array.isArray(daten.zahlungen)) daten.zahlungen = [];
    daten.schemaVersion = 4;
  }

  if (v < 5) {
    // Instandhaltung wird wie Hausgeld und Verwaltung monatlich erfasst
    for (const o of daten.objekte || []) {
      const k = o.kosten;
      if (!k) continue;
      if (k.instandhaltungMonat === undefined) {
        k.instandhaltungMonat = k.instandhaltungJahr ? k.instandhaltungJahr / 12 : null;
      }
      delete k.instandhaltungJahr;
    }
    daten.schemaVersion = 5;
  }

  if (v < 6) {
    // Darlehensart Tilgungsersatz mit Ansparkonto
    for (const f of daten.finanzierungen || []) {
      if (f.tilgungsersatzProzent === undefined) f.tilgungsersatzProzent = null;
      if (f.tilgungsersatzZins === undefined) f.tilgungsersatzZins = null;
    }
    daten.schemaVersion = 6;
  }

  if (v < 7) {
    // Tilgungsersatz ist keine eigene Darlehensart mehr, sondern ein Schalter
    for (const f of daten.finanzierungen || []) {
      if (f.mitTilgungsersatz === undefined) f.mitTilgungsersatz = f.art === 'tilgungsersatz';
      if (f.art === 'tilgungsersatz') {
        f.art = 'annuitaet';
        f.tilgungAnfang = 0;
      }
    }
    daten.schemaVersion = 7;
  }

  if (v < 8) {
    /* Tilgungsfreie Anlaufzeit wird als Datum erfasst statt als ganze Jahre –
       ein Mechanismus statt zwei, und monatsgenau statt nur jahresweise.

       Umrechnung so, dass sich an bestehenden Plaenen nichts verschiebt: bei
       N tilgungsfreien Jahren war der letzte tilgungsfreie Monat derselbe
       Kalendermonat wie die Auszahlung, N Jahre spaeter. Getilgt wurde ab
       dem Monat danach – genau das wird der Tilgungsstart. */
    for (const f of daten.finanzierungen || []) {
      if (f.tilgungStart === undefined) f.tilgungStart = null;
      const jahre = f.tilgungsfreieJahre || 0;
      if (jahre && f.auszahlung && !f.tilgungStart) {
        const [j, m] = String(f.auszahlung).split('-').map(Number);
        const [zj, zm] = m === 12 ? [j + jahre + 1, 1] : [j + jahre, m + 1];
        f.tilgungStart = `${zj}-${String(zm).padStart(2, '0')}-01`;
      }
      delete f.tilgungsfreieJahre;
    }
    daten.schemaVersion = 8;
  }

  if (v < 9) {
    // Buchhaltung: freie Buchungen und Fahrten kommen als leere Listen dazu.
    if (!Array.isArray(daten.buchungen)) daten.buchungen = [];
    if (!Array.isArray(daten.fahrten)) daten.fahrten = [];
    daten.schemaVersion = 9;
  }

  if (v < 10) {
    /* Abgleich zwischen Geraeten: ein Zaehler, der mit jeder Aenderung
       steigt. Start bei 1, nicht 0 – so unterscheidet sich eine migrierte
       Datei von einer frisch angelegten und wird beim ersten Abgleich als
       „hat Inhalt" erkannt. */
    if (daten.meta) {
      if (typeof daten.meta.stand !== 'number') daten.meta.stand = 1;
      if (daten.meta.geraet === undefined) daten.meta.geraet = null;
    }
    daten.schemaVersion = 10;
  }

  if (v < 11) {
    /* Soll/Ist bei den Mieten: `eingegangen` tritt an die vorhandenen
       Zahlungskorrekturen. null heisst „nicht verfolgt" und ist genau das,
       was bisher galt – deshalb aendert dieser Schritt keine einzige Zahl. */
    for (const k of daten.zahlungen || []) {
      if (k.eingegangen === undefined) k.eingegangen = null;
    }
    daten.schemaVersion = 11;
  }

  if (v < 12) {
    // Mieterhoehung nach § 558 BGB: zwei Felder, beide ohne Wirkung bis gefuellt.
    for (const o of daten.objekte || []) {
      if (o.kappungsgrenzeAbweichend === undefined) o.kappungsgrenzeAbweichend = null;
    }
    for (const e of daten.einheiten || []) {
      if (e.vergleichsmieteQm === undefined) e.vergleichsmieteQm = null;
    }
    daten.schemaVersion = 12;
  }

  if (v < 13) {
    // Staffel- und Indexvereinbarung im Vertrag. Ohne Wirkung, bis gefuellt.
    for (const mv of daten.mietvertraege || []) {
      if (mv.indexBasisStand === undefined) mv.indexBasisStand = null;
      if (mv.indexBasisDatum === undefined) mv.indexBasisDatum = null;
      if (mv.staffelRhythmusMonate === undefined) mv.staffelRhythmusMonate = 12;
    }
    daten.schemaVersion = 13;
  }

  if (v < 14) {
    /* Die 15-%-Grenze entscheidet jetzt selbst, ob eine Sanierung sofort
       abziehbar ist oder in die AfA wandert (§ 6 Abs. 1 Nr. 1a EStG).

       Die bisherigen Werte waren Vorgaben, keine Entscheidungen: Neue
       Modernisierungen kamen mit angehaktem Kaestchen, neue Buchungen ohne.
       Beide werden deshalb auf „automatisch" gestellt. Wer eine Massnahme
       ausdruecklich anders behandelt wissen will, setzt das in der Zeile –
       und dann bleibt es dabei. */
    for (const o of daten.objekte || []) {
      for (const m of o.modernisierung || []) {
        if (m.aktiviert === true) m.aktiviert = null;
      }
    }
    for (const b of daten.buchungen || []) {
      if (b.kategorie === 'erhaltung' && b.aktiviert === false) b.aktiviert = null;
    }
    daten.schemaVersion = 14;
  }

  if (v < 15) {
    /* Laufende Kosten als einzelne Positionen (betriebskosten.js). Die
       Sammelfelder werden zu monatlichen Positionen mit denselben Beträgen –
       kein Monat und keine Summe verschiebt sich. Die Sammelposten heißen
       ausdrücklich so, damit man sie nach dem Wirtschaftsplan aufteilt. */
    for (const o of daten.objekte || []) {
      if (!Array.isArray(o.betriebskosten)) {
        o.betriebskosten = ausSammelfeldern(o.kosten, () => uid('bk'));
      }
      delete o.kosten;
    }
    daten.schemaVersion = 15;
  }
  if (v < 16) {
    /* Notarkosten in Einzelpositionen. Der bisherige Wert bleibt als „Notar
       Kaufvertrag“ stehen – welcher Teil davon Grundbuch oder Grundschuld
       war, weiß die App nicht; die Karte bittet um Aufteilung. Eine frei
       angelegte, sofort abziehbare Grundschuld-Position wandert in die neue
       feste Position. Bestehende Portfolios bekommen keine geschätzten
       Vorgaben für Grundbuch und Grundschuld, sonst zählte die alte
       Sammel-Vorgabe für Notar & Grundbuch bei neuen Objekten doppelt. */
    for (const o of daten.objekte || []) {
      const nk = o.nebenkosten;
      if (!nk) continue;
      if (!nk.grundbuch) nk.grundbuch = nkPosition('prozent', null);
      if (!nk.grundschuld) {
        const alt = (nk.weitere || []).filter((x) => x.sofort && /grundschuld/i.test(x.bezeichnung || ''));
        if (alt.length === 1 && alt[0].wert != null) {
          nk.grundschuld = alt[0].modus === 'betrag' ? nkPosition('betrag', alt[0].wert) : nkPosition('prozent', null);
          if (alt[0].modus === 'betrag') nk.weitere = nk.weitere.filter((x) => x !== alt[0]);
        } else {
          nk.grundschuld = nkPosition('prozent', null);
        }
      }
    }
    if (daten.einstellungen) {
      if (!('grundbuchkosten' in daten.einstellungen)) daten.einstellungen.grundbuchkosten = null;
      if (!('grundschuldkosten' in daten.einstellungen)) daten.einstellungen.grundschuldkosten = null;
    }
    daten.schemaVersion = 16;
  }

  const basis = neuesPortfolio(daten.meta?.name);
  const zusammen = {
    ...basis,
    ...daten,
    meta: { ...basis.meta, ...(daten.meta || {}) },
    einstellungen: { ...STANDARD_EINSTELLUNGEN, ...(daten.einstellungen || {}) },
  };
  for (const key of [
    'objekte', 'einheiten', 'mietvertraege', 'finanzierungen', 'dokumente', 'protokoll',
    'zahlungen', 'buchungen', 'fahrten',
  ]) {
    if (!Array.isArray(zusammen[key])) zusammen[key] = [];
  }
  zusammen.schemaVersion = SCHEMA_VERSION;
  return zusammen;
}

export function laden(daten) {
  state.daten = migrieren(daten);
  revision++;          // ausgetauschte Daten machen jeden Zwischenspeicher ungueltig
  benachrichtigen();
  return state.daten;
}

/* ---------- Kaufnebenkosten (je Objekt) ---------- */

/**
 * modus: 'prozent' (vom Kaufpreis) oder 'betrag' (fester Euro-Betrag).
 * Optional `bezahlt` (Haken) und `bezahltAm` (ISO-Datum): Das Zahldatum legt
 * fest, in welchem Jahr eine sofort abziehbare Position zählt (§ 11 EStG).
 */
export function nkPosition(modus = 'prozent', wert = null, bezeichnung = '') {
  const p = { modus, wert };
  if (bezeichnung) { p.id = uid('nk'); p.bezeichnung = bezeichnung; }
  return p;
}

function nkBetrag(pos, kaufpreis) {
  if (!pos || pos.wert == null) return 0;
  return pos.modus === 'betrag' ? pos.wert : (kaufpreis || 0) * pos.wert / 100;
}

/**
 * Rechnet die Nebenkosten eines Objekts in Euro um.
 * Liefert Einzelbetraege, Summe, Quote und Gesamtinvestition.
 *
 * Eine Eigenprovision – eine nachtraeglich an den Erwerber zurueckfliessende
 * Kaufpreisreduktion – mindert nur die Gesamtinvestition, nicht die Summe der
 * Nebenkosten: Grunderwerbsteuer, Notar und Makler wurden auf den
 * beurkundeten Kaufpreis festgesetzt und bleiben unangetastet.
 */
export function nebenkostenBerechnen(obj) {
  const kp = obj.kaufpreis || 0;
  const nk = obj.nebenkosten || {};
  const weitere = (nk.weitere || []).map((p) => ({ ...p, betrag: nkBetrag(p, kp) }));
  /* Die Grundschuldbestellung richtet sich nach der Darlehenssumme, nicht
     nach dem Kaufpreis: Prozent beziehen sich hier auf die Summe der
     Darlehen des Objekts. */
  const darlehenssumme = obj.id
    ? (state.daten?.finanzierungen || []).filter((f) => f.objektId === obj.id).reduce((s, f) => s + (f.betrag || 0), 0)
    : 0;
  const posten = {
    grunderwerbsteuer: nkBetrag(nk.grunderwerbsteuer, kp),
    notar: nkBetrag(nk.notar, kp),
    grundbuch: nkBetrag(nk.grundbuch, kp),
    grundschuld: nkBetrag(nk.grundschuld, darlehenssumme),
    makler: nkBetrag(nk.makler, kp),
  };
  const summe = posten.grunderwerbsteuer + posten.notar + posten.grundbuch + posten.grundschuld + posten.makler
    + weitere.reduce((s, p) => s + p.betrag, 0);
  /* Sofort abziehbar sind Kosten der Finanzierung, nicht des Erwerbs –
     die Grundschuldbestellung und frei angelegte Positionen mit dem Haken
     „sofort abziehbar“ (Geldbeschaffungskosten). Sie gehören zur
     Gesamtinvestition, nicht zu den Anschaffungskosten. */
  const zahlung = (pos) => (pos?.bezahlt && pos.bezahltAm ? pos.bezahltAm : null);
  const sofortPosten = [
    ...(posten.grundschuld ? [{ text: 'Grundschuldbestellung (Notar & Grundbuch)', betrag: posten.grundschuld, bezahltAm: zahlung(nk.grundschuld) }] : []),
    ...weitere.filter((p) => p.sofort && p.betrag).map((p) => ({ text: p.bezeichnung || 'Kaufnebenkosten', betrag: p.betrag, bezahltAm: zahlung(p) })),
  ];
  const sofort = sofortPosten.reduce((s, p) => s + p.betrag, 0);
  /* Noch nicht als bezahlt markiert – nur Positionen mit einem Betrag. */
  const offenPosten = [
    ['Grunderwerbsteuer', nk.grunderwerbsteuer, posten.grunderwerbsteuer],
    ['Notar Kaufvertrag', nk.notar, posten.notar],
    ['Grundbuch Eigentumsumschreibung', nk.grundbuch, posten.grundbuch],
    ['Grundschuldbestellung', nk.grundschuld, posten.grundschuld],
    ['Maklerprovision', nk.makler, posten.makler],
    ...weitere.map((p) => [p.bezeichnung || 'Weitere Position', p, p.betrag]),
  ].filter(([, pos, betrag]) => betrag > 0 && !pos?.bezahlt).map(([text, , betrag]) => ({ text, betrag }));
  const offen = offenPosten.reduce((s, p) => s + p.betrag, 0);
  const eigenprovision = obj.eigenprovision || 0;
  return {
    ...posten,
    weitere,
    summe,
    sofort,
    sofortPosten,
    offen,
    offenPosten,
    darlehenssumme,
    eigenprovision,
    quote: kp ? (summe / kp) * 100 : 0,
    gesamt: Math.max(0, kp + summe - eigenprovision),
  };
}

/* ---------- Vorlagen fuer Entitaeten ---------- */

export function neuesObjekt(einstellungen = STANDARD_EINSTELLUNGEN) {
  return {
    id: uid('obj'),
    bezeichnung: '',
    strasse: '', plz: '', ort: '',
    typ: 'ETW',                    // ETW | MFH | EFH | Gewerbe | Grundstueck
    baujahr: null,
    energieklasse: '',             // A+ … H laut Energieausweis, '' = nicht angegeben
    mehrereEinheiten: false,
    flaeche: null, zimmer: null,   // bei Einzelobjekten
    /* Übergang von Nutzen und Lasten: Beginn von Besitz, Miete, Kosten,
       AfA und der Dreijahresfrist der 15-%-Grenze. */
    kaufdatum: heuteISO(),
    /* Notarielle Beurkundung des Kaufvertrags: Anschaffung im Sinne des
       § 23 EStG, Beginn der Spekulationsfrist. Leer = Kaufdatum. */
    kaufvertragDatum: null,
    kaufpreis: null,
    // Leer = Vorgabe aus den Einstellungen. Gilt je Gemeinde, nicht je Portfolio.
    kappungsgrenzeAbweichend: null,
    // Nachtraegliche Kaufpreisreduktion, etwa eine zurueckflieszende Provision.
    // Mindert die Anschaffungskosten, nicht die auf den beurkundeten Kaufpreis
    // festgesetzten Nebenkosten.
    eigenprovision: null,
    // Je Objekt frei erfassbar: jede Position wahlweise in % vom Kaufpreis
    // oder als fester Betrag, dazu beliebig viele eigene Positionen.
    nebenkosten: {
      grunderwerbsteuer: nkPosition('prozent', einstellungen.grunderwerbsteuer),
      notar: nkPosition('prozent', einstellungen.notarkosten),
      grundbuch: nkPosition('prozent', einstellungen.grundbuchkosten ?? null),
      grundschuld: nkPosition('prozent', einstellungen.grundschuldkosten ?? null),
      makler: nkPosition('prozent', einstellungen.maklerProvision),
      weitere: [],                 // {id, bezeichnung, modus, wert}
    },
    grundstuecksanteil: 20,        // % der Anschaffungskosten, nicht abschreibbar
    /* Fester Grundstücksanteil am Kaufpreis in €. Gesetzt, wenn die Aufteilung
       als Betrag eingegeben wurde; dann wird grundstuecksanteil daraus
       nachgeführt (kennzahlen.js:grundstuecksquote). Leer = der Prozentsatz gilt. */
    grundstueckBetrag: null,
    /* Im Kaufpreis enthalten, aber kein Gebäude und kein Grundstück:
       mitgekauftes Inventar (eigene AfA, Vorgabe 10 Jahre) und der
       übernommene Anteil an der Erhaltungsrücklage (keine AfA, H 7.3 EStH). */
    inventar: null,
    inventarNutzungsdauer: 10,
    ruecklageAnteil: null,
    gebaeudeanteilManuell: null,   // € · leer = aus grundstuecksanteil abgeleitet
    afaSatz: 2,                    // % p.a.
    // {id, datum, betrag, bezeichnung, aktiviert} – aktiviert wie bei den
    // Buchungen: null heisst, die 15-%-Grenze entscheidet.
    modernisierung: [],
    werte: [],                     // {datum, wert, quelle} – Verkehrswert-Historie
    // Laufende Kosten als einzelne Positionen, siehe betriebskosten.js
    betriebskosten: [],
    steuersatzAbweichend: null,    // ueberschreibt den Portfolio-Steuersatz
    bilder: [],                    // {datei, titel, haupt}
    tags: [],
    notizen: '',
    angelegtAm: zeitstempel(),
  };
}

export function neueEinheit(objektId, bezeichnung = '') {
  return {
    id: uid('einh'),
    objektId,
    bezeichnung,
    lage: '',
    flaeche: null,
    zimmer: null,
    implizit: false,   // true = automatisch angelegte Einheit eines Einzelobjekts
    // Ortsuebliche Vergleichsmiete in € je m², aus dem Mietspiegel. Ohne sie
    // begrenzt nur die Kappungsgrenze – die Obergrenze bleibt dann offen.
    vergleichsmieteQm: null,
    notizen: '',
  };
}

export function neuerMietvertrag(einheitId, beginn = heuteISO()) {
  return {
    id: uid('mv'),
    einheitId,
    mieter: '',
    beginn,
    ende: null,
    unbefristet: true,
    gekuendigtZum: null,
    // Zeitreihe: jede Aenderung der Miete ist ein weiterer Eintrag.
    // Staffelmieten sind schlicht Eintraege mit Datum in der Zukunft.
    konditionen: [{ id: uid('kond'), gueltigAb: beginn, kaltmiete: null, nkVorauszahlung: null, notiz: '' }],
    kaution: null,
    anpassungTyp: 'keine',        // keine | staffel | index
    indexProzent: null,           // angenommene Anpassung p. a. bei Indexmiete
    /* Indexmiete: der Verbraucherpreisindex, auf dem die aktuell geltende
       Miete fuszt. Daraus rechnet die App die naechste Anpassung aus – den
       aktuellen Indexstand holt man beim Statistischen Bundesamt. */
    indexBasisStand: null,
    indexBasisDatum: null,
    /* Staffelmiete: Gedaechtnis des Erzeugers. Die Staffeln selbst stehen
       als Konditionen in der Zeitreihe oben – eine zweite Liste waere eine
       zweite Wahrheit ueber dieselbe Miete. */
    staffelRhythmusMonate: 12,
    notizen: '',
  };
}

export function neueFinanzierung(objektId) {
  return {
    id: uid('fin'),
    objektId,
    bank: '',
    darlehensnummer: '',
    art: 'annuitaet',              // annuitaet | kfw | endfaellig
                                   // Tilgungsersatz ist seit Schema 7 keine Art,
                                   // sondern der Schalter mitTilgungsersatz.
    betrag: null,
    auszahlung: heuteISO(),
    sollzins: null,                // % p.a.
    tilgungAnfang: 2,              // % p.a.
    zinsbindungBis: null,
    anschlusszins: null,           // leer = Portfolio-Vorgabe
    // Bis dahin nur Zinsen; leer = Tilgung ab der ersten Rate.
    tilgungStart: null,
    // Tilgungsersatz: statt zu tilgen wird auf ein verzinstes Konto gespart
    mitTilgungsersatz: false,
    tilgungsersatzProzent: null,   // % p.a. vom Darlehensbetrag
    tilgungsersatzZins: null,      // % p.a. Verzinsung des Guthabens
    sondertilgungMaxProzent: 5,
    sondertilgungen: [],           // {datum, betrag}
    notizen: '',
  };
}

/**
 * Frei erfasster Geschaeftsvorfall – Gegenstueck zu den aus den Stammdaten
 * abgeleiteten Zahlungen. `datum` ist der Zufluss-/Abflusstag (§ 11 EStG),
 * nicht der Monat wie bei den Korrekturen in `zahlungen`.
 */
export function neueBuchung(objektId, datum = heuteISO()) {
  return {
    id: uid('buch'),
    datum,
    objektId,
    einheitId: null,               // fuer die Nebenkostenabrechnung, sonst leer
    kategorie: null,                // Schluessel aus buchhaltung.js:KATEGORIEN
    bezeichnung: '',
    betrag: null,                  // immer positiv, das Vorzeichen liefert die Kategorie
    belegNr: '',
    notiz: '',
    // Erhaltungsaufwand: entweder auf Jahre verteilen (§ 82b EStDV) oder
    // aktivieren – nie beides.
    verteilenJahre: null,          // 2–5
    /* null = die 15-%-Grenze entscheidet (§ 6 Abs. 1 Nr. 1a EStG).
       true/false sind ausdrueckliche Entscheidungen und gehen vor:
       true fuer echte Erweiterungen, false fuer jaehrlich uebliche
       Erhaltungsarbeiten – beide bleiben nach Satz 2 aussen vor. */
    aktiviert: null,
  };
}

/** Fahrt zum Objekt – der Betrag wird aus km und der Portfolio-Pauschale gerechnet. */
export function neueFahrt(objektId, datum = heuteISO()) {
  return {
    id: uid('fahrt'),
    datum,
    objektId,
    km: null,
    hinRueck: true,
    anlass: '',
    notiz: '',
  };
}

/* ---------- Zugriffshelfer ---------- */

export const objekt = (id) => state.daten.objekte.find((o) => o.id === id);
export const einheitenVon = (objektId) => state.daten.einheiten.filter((e) => e.objektId === objektId);
export const finanzierungenVon = (objektId) => state.daten.finanzierungen.filter((f) => f.objektId === objektId);
export const mietvertraegeVon = (einheitId) => state.daten.mietvertraege.filter((m) => m.einheitId === einheitId);
export const buchungenVon = (objektId) => state.daten.buchungen.filter((b) => b.objektId === objektId);
export const fahrtenVon = (objektId) => state.daten.fahrten.filter((f) => f.objektId === objektId);

export const einheitMit = (id) => state.daten.einheiten.find((e) => e.id === id);
export const mietvertragMit = (id) => state.daten.mietvertraege.find((m) => m.id === id);

export function objektVonEinheit(einheitId) {
  const e = einheitMit(einheitId);
  return e ? objekt(e.objektId) : null;
}

export function mietvertraegeZuObjekt(objektId) {
  const ids = new Set(einheitenVon(objektId).map((e) => e.id));
  return state.daten.mietvertraege.filter((m) => ids.has(m.einheitId));
}

/**
 * Jedes Objekt braucht mindestens eine Einheit, an der Mietvertraege haengen.
 * Bei Einzelobjekten wird sie automatisch und unsichtbar angelegt.
 */
export function einheitSicherstellen(objektId) {
  const vorhanden = einheitenVon(objektId);
  if (vorhanden.length) return vorhanden[0];
  const o = objekt(objektId);
  const e = neueEinheit(objektId, o?.bezeichnung || 'Einheit');
  e.implizit = true;
  e.flaeche = o?.flaeche ?? null;
  e.zimmer = o?.zimmer ?? null;
  state.daten.einheiten.push(e);
  return e;
}

/** Anzeigename einer Einheit – implizite Einheiten zeigen den Objektnamen. */
export function einheitName(e) {
  if (!e) return '–';
  if (e.implizit || !e.bezeichnung) return objekt(e.objektId)?.bezeichnung || 'Objekt';
  return e.bezeichnung;
}

/* ---------- Objekt-Helfer ---------- */

/** Gesamtflaeche: bei Mehr-Einheiten-Objekten die Summe der Einheiten. */
export function flaecheVon(o) {
  if (o.mehrereEinheiten) {
    const summe = einheitenVon(o.id).reduce((s, e) => s + (e.flaeche || 0), 0);
    if (summe > 0) return summe;
  }
  return o.flaeche || 0;
}

/** Zuletzt erfasster Verkehrswert, sonst der Kaufpreis. */
export function verkehrswert(o) {
  const werte = (o.werte || []).filter((w) => w.wert != null);
  if (!werte.length) return o.kaufpreis || 0;
  return [...werte].sort((a, b) => String(a.datum).localeCompare(String(b.datum))).at(-1).wert;
}

export function hauptbild(o) {
  const bilder = o.bilder || [];
  return bilder.find((b) => b.haupt) || bilder[0] || null;
}

/**
 * Monate, in denen das Objekt im Kalenderjahr im Bestand war.
 * Im Anschaffungsjahr ab dem Kaufmonat, davor null, danach zwoelf.
 */
export function besitzMonate(o, jahr) {
  if (!o?.kaufdatum) return 12;
  const kaufjahr = Number(o.kaufdatum.slice(0, 4));
  const kaufmonat = Number(o.kaufdatum.slice(5, 7));
  if (jahr < kaufjahr) return 0;
  if (jahr > kaufjahr) return 12;
  return 13 - kaufmonat;
}

/**
 * Gehört das Objekt im Monat `periode` ('JJJJ-MM') schon zum Bestand?
 * Der Kaufmonat zählt voll – wie bei den Kosten und der AfA. Ein vor dem
 * Kauf begonnener, übernommener Mietvertrag bringt erst ab hier Miete.
 */
export function imBestandIm(o, periode) {
  return !o?.kaufdatum || periode >= o.kaufdatum.slice(0, 7);
}

/* ---------- Tilgungsplaene mit Zwischenspeicher ---------- */

let planRevision = -1;
const planCache = new Map();

export function darlehenPlan(fin) {
  if (revision !== planRevision) {
    planCache.clear();
    planRevision = revision;
  }
  if (!planCache.has(fin.id)) {
    planCache.set(fin.id, tilgungsplan(fin, state.daten.einstellungen.anschlusszins));
  }
  return planCache.get(fin.id);
}

/* ---------- Mietvertraege ---------- */

/** Vertragsende unter Beruecksichtigung einer Kuendigung. */
export function vertragsEnde(mv) {
  const kandidaten = [mv.gekuendigtZum, mv.unbefristet ? null : mv.ende].filter(Boolean);
  if (!kandidaten.length) return null;
  return kandidaten.sort()[0];
}

/** 'zukuenftig' | 'aktiv' | 'beendet' – immer aus den Daten abgeleitet. */
export function vertragStatus(mv, stichtag = heuteISO()) {
  if (mv.beginn && mv.beginn > stichtag) return 'zukuenftig';
  const ende = vertragsEnde(mv);
  if (ende && ende < stichtag) return 'beendet';
  return 'aktiv';
}

/** Die zum Stichtag gueltige Kondition (juengster Eintrag mit gueltigAb <= Stichtag). */
export function aktuelleKondition(mv, stichtag = heuteISO()) {
  const liste = (mv.konditionen || [])
    .filter((k) => k.gueltigAb && k.gueltigAb <= stichtag)
    .sort((a, b) => String(a.gueltigAb).localeCompare(String(b.gueltigAb)));
  return liste.at(-1) || null;
}

/** Naechste geplante Mietanpassung nach dem Stichtag. */
export function naechsteAnpassung(mv, stichtag = heuteISO()) {
  return (mv.konditionen || [])
    .filter((k) => k.gueltigAb && k.gueltigAb > stichtag)
    .sort((a, b) => String(a.gueltigAb).localeCompare(String(b.gueltigAb)))[0] || null;
}

/** Kaltmiete und Nebenkosten eines Vertrags zum Stichtag – 0, wenn nicht aktiv. */
export function mieteVon(mv, stichtag = heuteISO()) {
  if (vertragStatus(mv, stichtag) !== 'aktiv') return { kalt: 0, nk: 0, warm: 0 };
  const k = aktuelleKondition(mv, stichtag);
  const kalt = k?.kaltmiete || 0;
  const nk = k?.nkVorauszahlung || 0;
  return { kalt, nk, warm: kalt + nk };
}

/**
 * Alle zum Stichtag laufenden Vertraege einer Einheit, aeltester zuerst.
 * Mehrere gleichzeitig sind zulaessig – etwa bei einer WG, in der jedes
 * Zimmer einen eigenen Vertrag hat.
 */
export function aktiveVertraege(einheitId, stichtag = heuteISO()) {
  return state.daten.mietvertraege
    .filter((m) => m.einheitId === einheitId && vertragStatus(m, stichtag) === 'aktiv')
    .sort((a, b) => String(a.beginn).localeCompare(String(b.beginn)));
}

/** Der zuletzt begonnene laufende Vertrag – fuer Anzeigen, die genau einen brauchen. */
export function aktiverVertrag(einheitId, stichtag = heuteISO()) {
  return aktiveVertraege(einheitId, stichtag).at(-1) || null;
}

/** Miete einer Einheit: Summe aller gleichzeitig laufenden Vertraege. */
export function mieteEinheit(einheitId, stichtag = heuteISO()) {
  const vertraege = aktiveVertraege(einheitId, stichtag);
  let kalt = 0, nk = 0;
  for (const mv of vertraege) {
    const m = mieteVon(mv, stichtag);
    kalt += m.kalt;
    nk += m.nk;
  }
  return { kalt, nk, warm: kalt + nk, vertraege, anzahl: vertraege.length };
}

/** Mieteinnahmen eines Objekts zum Stichtag, summiert ueber alle Einheiten. */
/**
 * Vereinbarte Miete einer Einheit – die geltende, sonst die nächste
 * unterschriebene.
 *
 * Gebraucht für die Runrate und alles, was darauf fußt (Bruttomietrendite,
 * Faktor, DSCR, EK-Rendite). Die reine Momentaufnahme taugt dafür nicht:
 * Kosten und Kapitaldienst werden dort aufs volle Jahr gerechnet, und
 * davor null Miete zu stellen, weil der Mieter erst nächsten Monat
 * einzieht, vergleicht zwei verschiedene Zeitpunkte miteinander.
 *
 * Beendete Verträge zählen nicht – nur was gilt oder noch kommt.
 */
export function mieteVereinbartEinheit(einheitId, stichtag = heuteISO()) {
  const laufend = mieteEinheit(einheitId, stichtag);
  if (laufend.anzahl) return { kalt: laufend.kalt, nk: laufend.nk, kuenftig: false };

  /* Alle kuenftigen Vertraege dieser Einheit, die am selben Tag beginnen:
     In einer WG haengen mehrere Zimmervertraege an derselben Einheit und
     laufen nebeneinander – nur den ersten zu nehmen unterschlaege den Rest.
     Spaetere Starttermine bleiben aussen vor, sonst summierte man
     Nachmieter zu Bestandsmietern hinzu. */
  const kuenftige = state.daten.mietvertraege
    .filter((m) => m.einheitId === einheitId && vertragStatus(m, stichtag) === 'zukuenftig')
    .sort((a, b) => String(a.beginn).localeCompare(String(b.beginn)));
  if (!kuenftige.length) return { kalt: 0, nk: 0, kuenftig: false };

  const start = kuenftige[0].beginn;
  let kalt = 0, nk = 0;
  for (const mv of kuenftige) {
    if (mv.beginn !== start) continue;
    const erste = [...(mv.konditionen || [])]
      .sort((a, b) => String(a.gueltigAb).localeCompare(String(b.gueltigAb)))[0];
    kalt += erste?.kaltmiete || 0;
    nk += erste?.nkVorauszahlung || 0;
  }
  return { kalt, nk, kuenftig: true };
}

/** Dasselbe über alle Einheiten eines Objekts. */
export function mieteVereinbartObjekt(objektId, stichtag = heuteISO()) {
  let kalt = 0, nk = 0, kuenftig = false;
  for (const e of einheitenVon(objektId)) {
    const m = mieteVereinbartEinheit(e.id, stichtag);
    kalt += m.kalt; nk += m.nk;
    if (m.kuenftig && m.kalt) kuenftig = true;
  }
  return { kalt, nk, warm: kalt + nk, kuenftig };
}

export function mieteObjekt(objektId, stichtag = heuteISO()) {
  let kalt = 0, nk = 0, vermietet = 0, vertraege = 0;
  const einheiten = einheitenVon(objektId);
  for (const e of einheiten) {
    const m = mieteEinheit(e.id, stichtag);
    if (!m.anzahl) continue;
    kalt += m.kalt; nk += m.nk; vermietet++; vertraege += m.anzahl;
  }
  return {
    kalt, nk, warm: kalt + nk,
    einheiten: einheiten.length,
    vermietet,
    vertraege,
    leerstand: einheiten.length - vermietet,
  };
}

/* ---------- Aenderungsprotokoll ---------- */

export function protokollieren(bezugId, was, alt, neu) {
  state.daten.protokoll.push({
    id: uid('log'),
    zeit: zeitstempel(),
    bezugId,
    was,
    alt: alt ?? null,
    neu: neu ?? null,
  });
  if (state.daten.protokoll.length > 2000) state.daten.protokoll.splice(0, 500);
}

/**
 * Protokolleinträge zu einem Bezug, neueste zuerst.
 * Vor dem Sortieren wird umgedreht, damit bei gleichem Zeitstempel
 * (mehrere Änderungen in derselben Millisekunde) der zuletzt
 * eingefügte Eintrag oben steht – Array.sort ist stabil.
 */
export function protokollEintraege(bezugId) {
  return state.daten.protokoll
    .filter((p) => !bezugId || p.bezugId === bezugId)
    .reverse()
    .sort((a, b) => String(b.zeit).localeCompare(String(a.zeit)));
}

/* ---------- Dokumente ---------- */

export const DOKUMENT_KATEGORIEN = [
  'Kaufvertrag', 'Grundbuch', 'Teilungserklärung', 'Exposé', 'Grundriss',
  'Mietvertrag', 'Übergabeprotokoll', 'Nebenkostenabrechnung',
  'Darlehensvertrag', 'Rechnung', 'Beleg', 'Steuerunterlagen', 'Sonstiges',
];

export function neuesDokument(bezugTyp, bezugId) {
  return {
    id: uid('dok'),
    bezugTyp,          // objekt | mietvertrag | finanzierung
    bezugId,
    datei: '',
    titel: '',
    kategorie: 'Sonstiges',
    datum: heuteISO(),
    groesse: 0,
    notiz: '',
  };
}

export function dokumenteVon(bezugTyp, bezugId) {
  return state.daten.dokumente
    .filter((d) => d.bezugTyp === bezugTyp && d.bezugId === bezugId)
    .sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
}
