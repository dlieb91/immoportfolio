/* Zahlungsebene: abgeleitete Zeilen aus den Stammdaten, einzeln korrigierbar,
   plus freie Buchungen und Fahrten – zusammen das Hauptbuch der App.

   Abgeleitete Zeilen speichert die App nicht, sondern nur Abweichungen: Jede
   Zeile entsteht aus Mietvertrag, Kostenfeld oder Tilgungsplan. Trägst du für
   einen Monat einen anderen Betrag ein oder streichst die Zahlung, wird das
   als Korrektur abgelegt und überall dort berücksichtigt, wo dieses Jahr
   gerechnet wird – Cashflow, Steuer und kumulierte Summen.

   Nicht berührt wird der Tilgungsplan selbst: Eine gestrichene Tilgung
   ändert den Cashflow, nicht die rechnerische Restschuld.

   Freie Buchungen (`state.daten.buchungen`) und Fahrten (`state.daten.fahrten`)
   sind dagegen echte Geschäftsvorfälle mit eigenem Datum – sie werden nicht
   korrigiert, sondern bearbeitet oder gelöscht. `jahresSummen()` zählt sie im
   Jahr des tatsächlichen Zahlungsflusses (§ 11 EStG) mit; die zusammengeführte
   Sicht für die Oberfläche liefert `buchhaltung.js`.
*/

import { uid, heuteISO } from './util.js';
import {
  state, einheitenVon, finanzierungenVon, aktiveVertraege, mieteVon,
  objekt as objektMit, einheitMit, einheitName, besitzMonate, darlehenPlan,
  datenRevision,
} from './store.js';

/**
 * Buchungskategorien – abgeleitete Arten (aus den Stammdaten, wie bisher)
 * und frei erfassbare (siehe buchhaltung.js). Eine Tabelle für beide, damit
 * Filter, Summen und die Anlage-V-Zuordnung an einer Stelle stehen.
 *
 * `durchlaufend`  bleibt außerhalb des Cashflows vor/nach Steuern (dafür
 *                 gibt es den separaten Nebenkosten-Saldo).
 * `steuerlich`    zaehlt in die Einkünfte aus Vermietung (Anlage V). Die
 *                 Tilgung mindert den Cashflow, aber nicht die Steuer – sie
 *                 ist keine Werbungskostenposition, ebenso wenig wie eine
 *                 Kaution, die dem Mieter gehört.
 * `umlagefaehig`  fliesst in die Nebenkostenabrechnung je Einheit ein.
 * `abgeleitet`    kommt aus Mietvertrag, Kostenfeld oder Tilgungsplan und
 *                 ist nur korrigierbar, nicht frei buchbar.
 */
export const KATEGORIEN = [
  // Einnahmen
  { key: 'miete', text: 'Mieteinnahme', gruppe: 'Einnahmen', vorzeichen: 1, abgeleitet: true, steuerlich: true, anlageV: 'Einnahmen: Miete' },
  { key: 'nebenkosten', text: 'Nebenkosten-Vorauszahlung', gruppe: 'Einnahmen', vorzeichen: 1, abgeleitet: true, durchlaufend: true, steuerlich: true, anlageV: 'Einnahmen: Umlagen' },
  { key: 'nkNachzahlung', text: 'Nebenkosten-Nachzahlung', gruppe: 'Einnahmen', vorzeichen: 1, steuerlich: true, anlageV: 'Einnahmen: Umlagen' },
  { key: 'nkErstattung', text: 'Nebenkosten-Erstattung an Mieter', gruppe: 'Einnahmen', vorzeichen: -1, steuerlich: true, anlageV: 'Einnahmen: Umlagen' },
  { key: 'sonstigeEinnahme', text: 'Sonstige Einnahme', gruppe: 'Einnahmen', vorzeichen: 1, steuerlich: true, anlageV: 'Einnahmen: Sonstiges' },
  // Betriebskosten
  { key: 'betriebskostenUmlagefaehig', text: 'Umlagefähige Betriebskosten', gruppe: 'Betriebskosten', vorzeichen: -1, abgeleitet: true, durchlaufend: true, steuerlich: true, umlagefaehig: true, anlageV: 'Werbungskosten: Betriebskosten' },
  { key: 'hausgeld', text: 'Hausgeld, nicht umlagefähig', gruppe: 'Betriebskosten', vorzeichen: -1, abgeleitet: true, steuerlich: true, anlageV: 'Werbungskosten: Betriebskosten' },
  { key: 'verwaltung', text: 'Verwaltung', gruppe: 'Betriebskosten', vorzeichen: -1, abgeleitet: true, steuerlich: true, anlageV: 'Werbungskosten: Verwaltungskosten' },
  { key: 'grundsteuer', text: 'Grundsteuer', gruppe: 'Betriebskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Betriebskosten' },
  { key: 'versicherung', text: 'Versicherung', gruppe: 'Betriebskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Betriebskosten' },
  { key: 'sonstige', text: 'Sonstige Kosten', gruppe: 'Betriebskosten', vorzeichen: -1, abgeleitet: true, steuerlich: true, anlageV: 'Werbungskosten: Betriebskosten' },
  // Erhaltung – eigene Gruppe wegen 15-%-Grenze und § 82b, siehe buchhaltung.js
  { key: 'erhaltung', text: 'Erhaltungsaufwand / Reparatur', gruppe: 'Erhaltung', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Erhaltungsaufwand' },
  { key: 'instandhaltung', text: 'Instandhaltungsrücklage', gruppe: 'Erhaltung', vorzeichen: -1, abgeleitet: true, steuerlich: true, anlageV: 'Werbungskosten: Erhaltungsaufwand' },
  // Sonstige Werbungskosten
  { key: 'fahrtkosten', text: 'Fahrtkosten', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Fahrtkosten' },
  { key: 'steuerberatung', text: 'Steuerberatung', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Sonstiges' },
  { key: 'rechtsberatung', text: 'Rechtsberatung', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Sonstiges' },
  { key: 'buero', text: 'Büro & Porto', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Sonstiges' },
  { key: 'mitgliedsbeitrag', text: 'Mitgliedsbeitrag (z. B. Haus & Grund)', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Sonstiges' },
  { key: 'kontofuehrung', text: 'Kontoführung', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Sonstiges' },
  { key: 'sonstigeWk', text: 'Sonstige Werbungskosten', gruppe: 'Sonstige Werbungskosten', vorzeichen: -1, steuerlich: true, anlageV: 'Werbungskosten: Sonstiges' },
  // Finanzierung – wie bisher, weiterhin nicht steuerlich abzugsfähig (die Tilgung) bzw. schon (Zinsen)
  { key: 'zins', text: 'Zinsen', gruppe: 'Finanzierung', vorzeichen: -1, abgeleitet: true, steuerlich: true, anlageV: 'Werbungskosten: Schuldzinsen' },
  { key: 'tilgung', text: 'Tilgung', gruppe: 'Finanzierung', vorzeichen: -1, abgeleitet: true, steuerlich: false },
  { key: 'sondertilgung', text: 'Sondertilgung', gruppe: 'Finanzierung', vorzeichen: -1, abgeleitet: true, steuerlich: false },
  { key: 'tilgungsersatz', text: 'Tilgungsersatzleistung', gruppe: 'Finanzierung', vorzeichen: -1, abgeleitet: true, steuerlich: false },
  // Neutral – berührt weder Cashflow-Bewirtschaftung noch die Steuer
  { key: 'kautionErhalten', text: 'Kaution erhalten', gruppe: 'Neutral', vorzeichen: 1, steuerlich: false },
  { key: 'kautionZurueck', text: 'Kaution zurückgezahlt', gruppe: 'Neutral', vorzeichen: -1, steuerlich: false },
  { key: 'privatentnahme', text: 'Privatentnahme', gruppe: 'Neutral', vorzeichen: -1, steuerlich: false },
  { key: 'privateinlage', text: 'Privateinlage', gruppe: 'Neutral', vorzeichen: 1, steuerlich: false },
];

export const artInfo = (key) => KATEGORIEN.find((a) => a.key === key) || { key, text: key, vorzeichen: 1 };
export const GRUPPEN = ['Einnahmen', 'Betriebskosten', 'Erhaltung', 'Sonstige Werbungskosten', 'Finanzierung', 'Neutral'];
/** Nur die abgeleiteten Arten – Grundlage von monatszahlungen(). */
export const ARTEN = KATEGORIEN.filter((k) => k.abgeleitet);

const periode = (jahr, monat) => `${jahr}-${String(monat).padStart(2, '0')}`;
const schluessel = (p, art, bezugId) => `${p}|${art}|${bezugId || ''}`;

/** Laufender Monat als YYYY-MM – alles danach ist geplant, nicht geflossen. */
export const laufenderMonat = () => heuteISO().slice(0, 7);

/* ---------- Korrekturen ---------- */

let korrekturRevision = -1;
let korrekturIndex = new Map();

function index() {
  if (datenRevision() !== korrekturRevision) {
    korrekturIndex = new Map();
    for (const k of state.daten.zahlungen || []) {
      korrekturIndex.set(schluessel(k.periode, k.art, k.bezugId), k);
    }
    korrekturRevision = datenRevision();
  }
  return korrekturIndex;
}

export function korrekturFinden(p, art, bezugId) {
  return index().get(schluessel(p, art, bezugId)) || null;
}

export function neueKorrektur(p, art, objektId, bezugId) {
  return { id: uid('zk'), periode: p, art, objektId, bezugId, betrag: null, entfaellt: false, notiz: '' };
}

/* ---------- Erzeugung ---------- */

/**
 * Alle Zahlungen eines Objekts in einem Monat, Korrekturen bereits angewendet.
 * Liefert auch Zeilen mit Betrag 0, damit gestrichene Zahlungen sichtbar bleiben.
 */
export function monatszahlungen(o, jahr, monat) {
  const p = periode(jahr, monat);
  const stichtag = `${p}-15`;
  const geplant = p > laufenderMonat();
  const raus = [];
  const imBestand = besitzMonate(o, jahr) > 0
    && (!o.kaufdatum || p >= o.kaufdatum.slice(0, 7));

  const zeile = (art, bezugId, bezugText, standard) => {
    const korr = korrekturFinden(p, art, bezugId);
    const betrag = korr ? (korr.entfaellt ? 0 : (korr.betrag ?? standard)) : standard;
    raus.push({
      id: schluessel(p, art, bezugId),
      periode: p, jahr, monat, art, geplant,
      objektId: o.id, objektName: o.bezeichnung || 'Ohne Bezeichnung',
      bezugId, bezugText,
      standard, betrag,
      korrigiert: !!korr && (korr.entfaellt || (korr.betrag != null && Math.abs(korr.betrag - standard) > 0.005)),
      entfaellt: !!korr?.entfaellt,
      notiz: korr?.notiz || '',
    });
  };

  /* Miete und Nebenkosten je laufendem Vertrag */
  for (const e of einheitenVon(o.id)) {
    for (const mv of aktiveVertraege(e.id, stichtag)) {
      const m = mieteVon(mv, stichtag);
      const name = (einheitenVon(o.id).length > 1 ? einheitName(e) + ' · ' : '') + (mv.mieter || 'Ohne Mieter');
      zeile('miete', mv.id, name, m.kalt);
      if (m.nk) zeile('nebenkosten', mv.id, name, m.nk);
    }
  }

  /* Bewirtschaftung, solange das Objekt im Bestand ist */
  if (imBestand) {
    const k = o.kosten || {};
    const umlagefaehig = Math.max(0, k.hausgeldUmlagefaehigMonat || 0);
    const hausgeld = Math.max(0, (k.hausgeldMonat || 0) - umlagefaehig);
    // Umlagefaehig heisst: der Mieter zahlt es letztlich ueber die Vorauszahlung
    // (Art 'nebenkosten'). Steuerlich ist es trotzdem eine Werbungskostenposition –
    // bei Leerstand ist es das sogar ohne Gegenbuchung, siehe kennzahlen.js.
    if (umlagefaehig) zeile('betriebskostenUmlagefaehig', o.id, 'Objekt', umlagefaehig);
    if (hausgeld) zeile('hausgeld', o.id, 'Objekt', hausgeld);
    if (k.verwaltungMonat) zeile('verwaltung', o.id, 'Objekt', k.verwaltungMonat);
    if (k.instandhaltungMonat) zeile('instandhaltung', o.id, 'Objekt', k.instandhaltungMonat);
    if (k.sonstigeJahr) zeile('sonstige', o.id, 'Objekt, ein Zwölftel', k.sonstigeJahr / 12);
  }

  /* Finanzierung aus dem Tilgungsplan */
  for (const fin of finanzierungenVon(o.id)) {
    const plan = darlehenPlan(fin);
    const m = plan.monate.find((x) => x.datum.slice(0, 7) === p);
    if (!m) continue;
    const name = fin.bank || 'Darlehen';
    if (m.zins) zeile('zins', fin.id, name, m.zins);
    if (m.tilgung) zeile('tilgung', fin.id, name, m.tilgung);
    if (m.sondertilgung) zeile('sondertilgung', fin.id, name, m.sondertilgung);
    if (m.tilgungsersatz) zeile('tilgungsersatz', fin.id, name, m.tilgungsersatz);
  }

  // Zeilen, die es nur als Korrektur gibt (z. B. nachträglich erfasst)
  for (const korr of state.daten.zahlungen || []) {
    if (korr.periode !== p || korr.objektId !== o.id) continue;
    if (raus.some((z) => z.art === korr.art && z.bezugId === korr.bezugId)) continue;
    raus.push({
      id: schluessel(p, korr.art, korr.bezugId),
      periode: p, jahr, monat, art: korr.art, geplant,
      objektId: o.id, objektName: o.bezeichnung || 'Ohne Bezeichnung',
      bezugId: korr.bezugId, bezugText: bezugName(korr),
      standard: 0, betrag: korr.entfaellt ? 0 : (korr.betrag || 0),
      korrigiert: true, entfaellt: !!korr.entfaellt, notiz: korr.notiz || '',
      nurKorrektur: true,
    });
  }

  return raus;
}

function bezugName(korr) {
  const e = einheitMit(korr.bezugId);
  if (e) return einheitName(e);
  const mv = state.daten.mietvertraege.find((x) => x.id === korr.bezugId);
  if (mv) return mv.mieter || 'Ohne Mieter';
  const fin = state.daten.finanzierungen.find((x) => x.id === korr.bezugId);
  if (fin) return fin.bank || 'Darlehen';
  return objektMit(korr.bezugId)?.bezeichnung || 'Objekt';
}

/**
 * Zahlungen über einen Zeitraum, optional gefiltert.
 *
 * Standardmäßig endet die Liste im laufenden Monat – künftige Monate des
 * Kalenderjahres sind rechnerisch vorhanden, aber noch nicht geflossen.
 * Mit `mitGeplanten` lassen sie sich einblenden.
 *
 * @param filter { vonJahr, bisJahr, objektId, einheitId, art, nurKorrigiert, mitGeplanten }
 */
export function zahlungsliste(filter = {}) {
  const objekte = filter.objektId
    ? state.daten.objekte.filter((o) => o.id === filter.objektId)
    : state.daten.objekte;

  const heute = new Date();
  const bisJahr = filter.bisJahr ?? heute.getFullYear();
  const vonJahr = filter.vonJahr ?? bisJahr;

  const einheitVertraege = filter.einheitId
    ? new Set(state.daten.mietvertraege.filter((m) => m.einheitId === filter.einheitId).map((m) => m.id))
    : null;

  const raus = [];
  for (const o of objekte) {
    for (let jahr = vonJahr; jahr <= bisJahr; jahr++) {
      for (let monat = 1; monat <= 12; monat++) {
        if (periode(jahr, monat) > laufenderMonat() && !filter.mitGeplanten) continue;
        for (const z of monatszahlungen(o, jahr, monat)) {
          if (filter.art && z.art !== filter.art) continue;
          if (filter.nurKorrigiert && !z.korrigiert) continue;
          if (einheitVertraege && !einheitVertraege.has(z.bezugId)) continue;
          raus.push(z);
        }
      }
    }
  }
  raus.sort((a, b) => b.periode.localeCompare(a.periode)
    || a.objektName.localeCompare(b.objektName)
    || ARTEN.findIndex((x) => x.key === a.art) - ARTEN.findIndex((x) => x.key === b.art));
  return raus;
}

/** Vorzeichenbehafteter Betrag – Einnahmen positiv, Kosten negativ. */
export const wirkung = (z) => z.betrag * artInfo(z.art).vorzeichen;

/* Jahressummen sind der teuerste Pfad der App: die Kapitalbindung ruft sie
   je Objekt fuer jedes Jahr seit dem Kauf auf, und jeder Aufruf laeuft zwoelf
   Monate lang durch alle Vertraege. Deshalb je Objekt und Jahr gemerkt. */
let summenRevision = -1;
const summenCache = new Map();

/**
 * Jahressummen eines Objekts je Zahlungsart, Korrekturen eingerechnet.
 * Grundlage aller historischen Berechnungen.
 *
 * `bisMonat` schneidet das Jahr ab: mit 12 (Vorgabe) ergibt sich der volle
 * Kalenderjahreswert, mit dem laufenden Monat nur das, was bis dahin
 * tatsächlich geflossen ist.
 */
export function jahresSummen(objektId, jahr, bisMonat = 12) {
  if (datenRevision() !== summenRevision) {
    summenCache.clear();
    summenRevision = datenRevision();
  }
  const grenze = Math.max(0, Math.min(12, bisMonat));
  const key = `${objektId}|${jahr}|${grenze}`;
  if (!summenCache.has(key)) summenCache.set(key, jahresSummenRechnen(objektId, jahr, grenze));
  return summenCache.get(key);
}

/**
 * Betrag einer Fahrt aus Kilometern und der Portfolio-Pauschale.
 * Reisekosten (Vorgabe): gefahrene km, also hin und zurueck – der Regelfall
 * laut BFH IX R 18/15. Entfernungspauschale: nur die einfache Strecke, fuer
 * den Ausnahmefall einer regelmaessigen Taetigkeitsstaette am Objekt.
 */
export function fahrtBetrag(fahrt, einstellungen) {
  const km = fahrt.km || 0;
  if (einstellungen?.fahrtModus === 'pendler') {
    return km * (einstellungen.fahrtSatzPendler ?? 0.38);
  }
  const satz = einstellungen?.fahrtSatzReise ?? 0.30;
  return km * satz * (fahrt.hinRueck === false ? 1 : 2);
}

/** Datum faellt in [Jahr-01-01 .. Jahr-bisMonat-Monatsende]. */
function imZeitraum(datum, jahr, bisMonat) {
  if (!datum) return false;
  const j = Number(datum.slice(0, 4));
  const m = Number(datum.slice(5, 7));
  return j === jahr && m <= bisMonat;
}

function jahresSummenRechnen(objektId, jahr, bisMonat) {
  const o = objektMit(objektId);
  const summe = { mieteMonate: 0, korrekturen: 0 };
  for (const k of KATEGORIEN) summe[k.key] = 0;
  if (!o) return summe;

  for (let monat = 1; monat <= bisMonat; monat++) {
    let mieteImMonat = 0;
    for (const z of monatszahlungen(o, jahr, monat)) {
      if (summe[z.art] !== undefined) summe[z.art] += z.betrag;
      if (z.art === 'miete') mieteImMonat += z.betrag;
      if (z.korrigiert) summe.korrekturen++;
    }
    if (mieteImMonat > 0) summe.mieteMonate++;
  }

  // Frei erfasste Buchungen zaehlen im Jahr des tatsaechlichen Zahlungsflusses
  // (§ 11 EStG) – die Verteilung groesseren Erhaltungsaufwands auf mehrere
  // Jahre (§ 82b EStDV) ist eine rein steuerliche Zuordnung und wird erst in
  // kennzahlen.js auf die Einkuenfte angewendet, nicht hier auf den Cashflow.
  for (const b of state.daten.buchungen || []) {
    if (b.objektId !== objektId || !imZeitraum(b.datum, jahr, bisMonat)) continue;
    if (summe[b.kategorie] !== undefined) summe[b.kategorie] += b.betrag || 0;
  }
  for (const f of state.daten.fahrten || []) {
    if (f.objektId !== objektId || !imZeitraum(f.datum, jahr, bisMonat)) continue;
    summe.fahrtkosten += fahrtBetrag(f, state.daten.einstellungen);
  }

  // Umlagen: vereinnahmte Vorauszahlung, Nachzahlung abzueglich Erstattung.
  summe.umlagen = summe.nebenkosten + summe.nkNachzahlung - summe.nkErstattung;

  // Der Katalogeintrag "Sonstige Werbungskosten" ist zugleich der Sammelposten
  // der ganzen Gruppe – erst hier zur Gruppensumme erweitert, damit die reine
  // Kategorie in der Buchungsliste eigenstaendig bleibt.
  const sonstigeWkKategorie = summe.sonstigeWk;
  summe.sonstigeWk = sonstigeWkKategorie + summe.steuerberatung + summe.rechtsberatung
    + summe.buero + summe.mitgliedsbeitrag + summe.kontofuehrung;

  // Nicht umlagefaehige Bewirtschaftung: die bestehenden Kostenfelder plus
  // die frei erfassten, immer landlordseitig getragenen Positionen.
  summe.bewirtschaftung = summe.hausgeld + summe.verwaltung + summe.instandhaltung
    + summe.sonstige + summe.grundsteuer + summe.versicherung;
  summe.kapitaldienst = summe.zins + summe.tilgung + summe.sondertilgung + summe.tilgungsersatz;
  // Frei erfasste Werbungskosten ausserhalb der laufenden Bewirtschaftung –
  // mindern Cashflow wie Einkuenfte gleichermassen.
  summe.werbungskostenFrei = summe.erhaltung + summe.fahrtkosten + summe.sonstigeWk;
  // Nettobewegung der steuerlich neutralen Posten (Kaution, Privatentnahme/-einlage).
  summe.neutral = summe.kautionErhalten - summe.kautionZurueck
    - summe.privatentnahme + summe.privateinlage;

  return summe;
}
