/* Kennzahlen und Cashflow – reine Rechnung, keine Oberfläche.

   Grundannahmen (bewusst getroffen, im Text der Ansichten benannt):
   - Umlagefähige Kosten und Nebenkosten-Vorauszahlungen bleiben im Cashflow
     außen vor – dafür gibt es den separaten Nebenkosten-Saldo (`nkSaldo`).
     Steuerlich zählen beide Seiten jedoch mit: vereinnahmte Umlagen als
     Einnahme, umlagefähige Kosten als Werbungskosten. Bei Vollvermietung
     gleicht sich das nahezu aus, bei Leerstand nicht – dann trägt der
     Vermieter die umlagefähigen Kosten selbst und kann sie absetzen.
   - Der Cashflow ist die Ist-Betrachtung zum Stichtag: tatsächlich
     laufende Mietverträge, tatsächliche Rate aus dem Tilgungsplan, plus
     frei erfasste Werbungskosten (Erhaltung, Fahrten, Sonstiges) im Jahr
     des Zahlungsflusses.
   - Steuerlich abzugsfähig sind Bewirtschaftungskosten, Zinsen, AfA und die
     frei erfassten Werbungskosten – die Tilgung ist es nicht, ebenso wenig
     eine Kaution, die dem Mieter gehört.
*/

import { heuteISO } from './util.js';
import {
  state, einheitenVon, finanzierungenVon, mieteObjekt, mieteEinheit,
  nebenkostenBerechnen, flaecheVon, verkehrswert, besitzMonate, darlehenPlan,
} from './store.js';
import { restschuldZu, ersatzGuthabenZu, ersatzEingezahltBis } from './finanzmathematik.js';
import { jahresSummen } from './zahlungen.js';

/* ---------- Anzeigemodus: vor / nach Steuern ---------- */

let modus = localStorage.getItem('immo-steuermodus') || 'vor';

export const steuerModus = () => modus;

export function setSteuerModus(neu) {
  modus = neu === 'nach' ? 'nach' : 'vor';
  localStorage.setItem('immo-steuermodus', modus);
}

/** Der je nach Modus maßgebliche Jahres-Cashflow. */
export const cashflowAktuell = (k) => (modus === 'nach' ? k.cashflowNachSteuer : k.cashflowVorSteuer);

/* ---------- Steuer ---------- */

/**
 * Effektiver Grenzsteuersatz inklusive Soli und Kirchensteuer.
 * Beide werden auf die Einkommensteuer erhoben, nicht auf das Einkommen.
 */
export function effektiverSteuersatz(o) {
  const e = state.daten.einstellungen;
  const basis = o?.steuersatzAbweichend ?? e.steuersatz ?? 0;
  const zuschlag = (e.soli ? 5.5 : 0) + (e.kirchensteuer || 0);
  return basis * (1 + zuschlag / 100);
}

/**
 * Abschreibung: Bemessungsgrundlage und Jahresbetrag.
 * Der Grundstücksanteil wird auf die Anschaffungskosten inkl. Nebenkosten
 * angewendet – die Kaufnebenkosten werden damit im selben Verhältnis wie
 * der Kaufpreis auf Grundstück und Gebäude aufgeteilt, wie es das
 * Finanzamt verlangt.
 *
 * Wahlweise laesst sich der Gebaeudeanteil auch fest vorgeben, etwa aus
 * einem Kaufpreisaufteilungsgutachten, das den Bodenwert unabhaengig vom
 * Kaufpreis ermittelt (Vergleichswert- statt Prozentverfahren). Ist er
 * gesetzt, ersetzt er die prozentuale Ableitung; auf die Anschaffungskosten
 * gedeckelt, damit das Grundstueck rechnerisch nicht negativ wird.
 */
export function afaWerte(o) {
  const nk = nebenkostenBerechnen(o);
  const anschaffung = nk.gesamt;
  const gebaeudeVorgabe = o.gebaeudeanteilManuell != null
    ? Math.min(Math.max(0, o.gebaeudeanteilManuell), anschaffung)
    : null;
  const grundstueck = gebaeudeVorgabe != null
    ? anschaffung - gebaeudeVorgabe
    : anschaffung * ((o.grundstuecksanteil ?? 0) / 100);
  // Aktivierte Erhaltungsbuchungen zaehlen wie Modernisierungspositionen zur
  // AfA-Bemessung – ohne zweiten Mechanismus: keine Buchung wird gespiegelt
  // oder dupliziert, afaWerte() liest lediglich beide Quellen zusammen. Eine
  // spaeter geaenderte oder geloeschte Buchung wirkt sich damit automatisch aus.
  const modernisierung = (o.modernisierung || [])
    .filter((m) => m.aktiviert !== false)
    .reduce((s, m) => s + (m.betrag || 0), 0)
    + (state.daten.buchungen || [])
      .filter((b) => b.objektId === o.id && b.kategorie === 'erhaltung' && b.aktiviert)
      .reduce((s, b) => s + (b.betrag || 0), 0);
  const gebaeude = Math.max(0, anschaffung - grundstueck) + modernisierung;
  return {
    anschaffung, grundstueck, gebaeude, modernisierung,
    afaJahr: gebaeude * ((o.afaSatz ?? 0) / 100),
    afaDauer: o.afaSatz ? 100 / o.afaSatz : 0,
  };
}

/**
 * Besitzmonate eines Kalenderjahres bis einschließlich `bisMonat`.
 * Mit bisMonat = 12 ist das die volle Besitzdauer des Jahres.
 */
export function besitzMonateBis(o, jahr, bisMonat = 12) {
  const grenze = Math.max(0, Math.min(12, bisMonat));
  if (!o?.kaufdatum) return grenze;
  const kaufjahr = Number(o.kaufdatum.slice(0, 4));
  const kaufmonat = Number(o.kaufdatum.slice(5, 7));
  if (jahr < kaufjahr) return 0;
  return Math.max(0, grenze - (jahr === kaufjahr ? kaufmonat : 1) + 1);
}

/**
 * Abschreibung eines bestimmten Kalenderjahres. Im Anschaffungsjahr
 * zeitanteilig ab dem Kaufmonat, nach Ablauf der Nutzungsdauer null.
 *
 * `bisMonat` schneidet das Jahr ab – gebraucht für den bis heute
 * aufgelaufenen Anteil. Mit der Vorgabe 12 ergibt sich der volle Jahreswert.
 */
export function afaImJahr(o, jahr, bisMonat = 12) {
  const a = afaWerte(o);
  if (!a.afaDauer || !a.afaJahr) return 0;
  const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : jahr;
  if (jahr < kaufjahr) return 0;
  if (jahr >= kaufjahr + a.afaDauer) return 0;
  return a.afaJahr * besitzMonateBis(o, jahr, bisMonat) / 12;
}

/**
 * Tatsächliche Mieteinnahmen eines Kalenderjahres, Monat für Monat.
 * Berücksichtigt Vertragsbeginn und -ende, Leerstand und Staffeln
 * innerhalb des Jahres – ein angeschnittenes Jahr wird nicht auf zwölf
 * Monate hochgerechnet.
 */
export function mieteImJahr(objektId, jahr) {
  let kalt = 0, nk = 0, monate = 0;
  const einheiten = einheitenVon(objektId);
  for (const e of einheiten) {
    for (let m = 1; m <= 12; m++) {
      const stichtag = `${jahr}-${String(m).padStart(2, '0')}-15`;
      // Summe aller gleichzeitig laufenden Verträge – WG-tauglich
      const w = mieteEinheit(e.id, stichtag);
      if (!w.anzahl) continue;
      kalt += w.kalt;
      nk += w.nk;
      if (w.kalt) monate++;   // je Einheit und Monat höchstens einmal
    }
  }
  return { kalt, nk, monate, einheiten: einheiten.length, moeglich: einheiten.length * 12 };
}

/* ---------- Objekt ---------- */

/**
 * Alle Kennzahlen eines Objekts zum Stichtag. Jahreswerte, sofern nicht
 * anders benannt; die Ansichten teilen für Monatswerte durch 12.
 */
export function objektKennzahlen(o, stichtag = heuteISO()) {
  const jahr = Number(stichtag.slice(0, 4));
  const nk = nebenkostenBerechnen(o);
  const flaeche = flaecheVon(o);
  const wert = verkehrswert(o);
  const miete = mieteObjekt(o.id, stichtag);      // Momentaufnahme
  // Das Kalenderjahr kommt aus der Zahlungsebene – dort sind Korrekturen
  // an einzelnen Monaten bereits eingerechnet.
  const ist = jahresSummen(o.id, jahr);

  /* Bewirtschaftung – nur der nicht umlagefähige Teil.
     Für das Kalenderjahr anteilig nach Besitzmonaten, damit ein
     Anschaffungsjahr nicht zwölf Monate Kosten gegen zehn Monate Miete
     stellt. Die Volljahreswerte bleiben Grundlage aller Renditen. */
  const k = o.kosten || {};
  const hausgeldVoll = Math.max(0, (k.hausgeldMonat || 0) - (k.hausgeldUmlagefaehigMonat || 0)) * 12;
  const verwaltungVoll = (k.verwaltungMonat || 0) * 12;
  const instandhaltungVoll = (k.instandhaltungMonat || 0) * 12;
  const sonstigeVoll = k.sonstigeJahr || 0;
  const bewirtschaftungVoll = hausgeldVoll + verwaltungVoll + instandhaltungVoll + sonstigeVoll;

  const hausgeldNichtUmlagefaehig = ist.hausgeld;
  const verwaltung = ist.verwaltung;
  const instandhaltung = ist.instandhaltung;
  const sonstige = ist.sonstige;
  const grundsteuer = ist.grundsteuer;
  const versicherung = ist.versicherung;
  const bewirtschaftung = ist.bewirtschaftung;

  /* Finanzierung – einmal für das Kalenderjahr, einmal für die
     kommenden zwölf Monate. Verhältniszahlen brauchen ein volles Jahr,
     sonst verzerrt ein angeschnittenes Jahr den Zähler. */
  let darlehenssumme = 0, restschuld = 0, rateMonat = 0;
  let zins12 = 0, tilgung12 = 0, sondertilgung12 = 0, tilgungsersatz12 = 0;
  let ersatzEingezahlt = 0, ersatzGuthaben = 0, mitErsatz = false;
  for (const fin of finanzierungenVon(o.id)) {
    const plan = darlehenPlan(fin);
    darlehenssumme += fin.betrag || 0;
    restschuld += restschuldZu(plan, stichtag, fin.betrag || 0);
    if (plan.mitErsatz) {
      mitErsatz = true;
      ersatzEingezahlt += ersatzEingezahltBis(plan, stichtag);
      ersatzGuthaben += ersatzGuthabenZu(plan, stichtag);
    }
    const kommende = plan.monate.filter((m) => m.datum > stichtag).slice(0, 12);
    for (const m of kommende) {
      zins12 += m.zins; tilgung12 += m.tilgung;
      sondertilgung12 += m.sondertilgung; tilgungsersatz12 += m.tilgungsersatz;
    }
    if (kommende[0]) rateMonat += kommende[0].rate;
  }
  // Kalenderjahr aus der Zahlungsebene, laufende zwölf Monate aus dem Plan
  const zins = ist.zins;
  const tilgung = ist.tilgung;
  const sondertilgung = ist.sondertilgung;
  const tilgungsersatz = ist.tilgungsersatz;
  const kapitaldienst = ist.kapitaldienst;
  const kapitaldienst12 = zins12 + tilgung12 + sondertilgung12 + tilgungsersatz12;

  /* Steuer – alles bezogen auf das Kalenderjahr des Stichtags.
     Umlagen (vereinnahmte NK-Vorauszahlung, ggf. Nachzahlung/Erstattung) und
     die davon umlagefaehigen Betriebskosten sind fuer den Cashflow ein
     durchlaufender Posten, steuerlich aber beides: Einnahme wie
     Werbungskosten – bei Leerstand ist genau das der Unterschied, siehe
     Modul-Kopfkommentar. Frei erfasste Werbungskosten (Erhaltung, Fahrten,
     sonstige) mindern beides gleichermassen. */
  const afa = afaWerte(o);
  const afaJahr = afaImJahr(o, jahr);
  const werbungskosten = bewirtschaftung + ist.betriebskostenUmlagefaehig
    + zins + afaJahr + ist.werbungskostenFrei;
  const einkuenfte = ist.miete + ist.umlagen - werbungskosten;
  const steuersatz = effektiverSteuersatz(o);
  const steuer = einkuenfte * steuersatz / 100;
  // Bei Vollvermietung nahe null; bei Leerstand negativ, weil die
  // umlagefaehigen Kosten dann am Vermieter haengen bleiben.
  const nkSaldo = ist.umlagen - ist.betriebskostenUmlagefaehig;

  /* Cashflow des Kalenderjahres. Umlagen/umlagefaehige Betriebskosten bleiben
     bewusst aussen vor (das ist der Nebenkosten-Saldo oben); freie
     Werbungskosten wie Reparaturen oder Fahrten sind echte Abfluesse und
     zaehlen mit. */
  const kaltmieteJahr = ist.miete;
  const cashflowVorSteuer = kaltmieteJahr - bewirtschaftung - ist.werbungskostenFrei - kapitaldienst;
  const cashflowNachSteuer = cashflowVorSteuer - steuer;

  /* Laufende zwölf Monate – Grundlage aller Verhältniszahlen. Rechnet mit
     den stabilen, wiederkehrenden Feldern (Miete, Kostenfelder, Tilgungsplan)
     und bewusst ohne frei erfasste Buchungen – die sind einzelne historische
     Vorfälle ohne Wiederholungsmuster und würden die Kennzahl verzerren. */
  const kaltmieteRunrate = miete.kalt * 12;
  const cashflowRunrate = kaltmieteRunrate - bewirtschaftungVoll - kapitaldienst12;
  const einkuenfteRunrate = kaltmieteRunrate - bewirtschaftungVoll - zins12 - afa.afaJahr;
  const steuerRunrate = einkuenfteRunrate * steuersatz / 100;
  const cashflowRunrateNachSteuer = cashflowRunrate - steuerRunrate;

  /* Kapital */
  const getilgt = Math.max(0, darlehenssumme - restschuld);
  const eigenkapitalEingesetzt = Math.max(0, nk.gesamt - darlehenssumme);
  const eigenkapital = wert - restschuld;

  return {
    objekt: o,
    jahr,
    monateVermietet: ist.mieteMonate,
    korrekturen: ist.korrekturen,
    /* Angeschnitten heisst: das Objekt war nicht das ganze Kalenderjahr im
       Bestand. Nicht gemeint ist Leerstand – eine ganzjaehrig leerstehende
       Wohnung hat null vermietete Monate, ist aber kein Rumpfjahr. */
    angeschnitten: besitzMonate(o, jahr) < 12,
    // Basis
    kaufpreis: o.kaufpreis || 0,
    investition: nk.gesamt,
    nebenkosten: nk.summe,
    eigenprovision: nk.eigenprovision,
    verkehrswert: wert,
    flaeche,
    // Miete
    kaltmieteMonat: miete.kalt,
    kaltmieteJahr,                 // tatsächlich im Kalenderjahr
    kaltmieteRunrate,              // 12 × aktuelle Monatsmiete
    nkMonat: miete.nk,
    einheiten: miete.einheiten,
    vermietet: miete.vermietet,
    leerstand: miete.leerstand,
    // Kosten – Kalenderjahr anteilig, Volljahr für Verhältniszahlen
    hausgeldNichtUmlagefaehig, verwaltung, instandhaltung, sonstige, grundsteuer, versicherung, bewirtschaftung,
    bewirtschaftungVoll, monateBesitz: besitzMonate(o, jahr),
    // Nebenkosten steuerlich: Umlagen als Einnahme, umlagefaehige Kosten als
    // Werbungskosten, beide ausserhalb des Cashflows. nkSaldo ist die
    // tatsaechliche Differenz – bei Leerstand negativ.
    umlagen: ist.umlagen, betriebskostenUmlagefaehig: ist.betriebskostenUmlagefaehig, nkSaldo,
    // Frei erfasste Werbungskosten – je Gruppe und in Summe
    erhaltung: ist.erhaltung, fahrtkosten: ist.fahrtkosten, sonstigeWk: ist.sonstigeWk,
    werbungskostenFrei: ist.werbungskostenFrei, neutral: ist.neutral,
    // Finanzierung
    darlehenssumme, restschuld, zins, tilgung, sondertilgung, tilgungsersatz,
    kapitaldienst, rateMonat,
    zins12, tilgung12, sondertilgung12, tilgungsersatz12, kapitaldienst12,
    getilgt,
    // Tilgungsersatz: eingezahlt ohne Verzinsung, Guthaben mit
    mitErsatz,
    ersatzEingezahlt,
    ersatzGuthaben,
    ersatzErtrag: ersatzGuthaben - ersatzEingezahlt,
    getilgtProzent: darlehenssumme ? getilgt / darlehenssumme * 100 : 0,
    // laufende zwölf Monate
    cashflowRunrate, cashflowRunrateNachSteuer, einkuenfteRunrate, steuerRunrate,
    // Steuer
    afaJahr, afaVoll: afa.afaJahr, afaBemessung: afa.gebaeude, afaGrundstueck: afa.grundstueck,
    werbungskosten, einkuenfte, steuersatz, steuer,
    // Ergebnis
    cashflowVorSteuer, cashflowNachSteuer,
    // Kapital
    eigenkapitalEingesetzt, eigenkapital,
    // Renditen – alle auf Basis der laufenden zwölf Monate, damit ein
    // angeschnittenes Anschaffungsjahr sie nicht verzerrt
    bruttorendite: nk.gesamt ? kaltmieteRunrate / nk.gesamt * 100 : 0,
    bruttorenditeKaufpreis: o.kaufpreis ? kaltmieteRunrate / o.kaufpreis * 100 : 0,
    nettorendite: nk.gesamt ? (kaltmieteRunrate - bewirtschaftungVoll) / nk.gesamt * 100 : 0,
    kaufpreisfaktor: kaltmieteRunrate ? (o.kaufpreis || 0) / kaltmieteRunrate : 0,
    kaufpreisfaktorGesamt: kaltmieteRunrate ? nk.gesamt / kaltmieteRunrate : 0,
    mieteProM2: flaeche ? miete.kalt / flaeche : 0,
    ltv: wert ? restschuld / wert * 100 : 0,
    dscr: kapitaldienst12 ? (kaltmieteRunrate - bewirtschaftungVoll) / kapitaldienst12 : null,
    // Cash-on-Cash: laufender Cashflow auf das eingesetzte Eigenkapital
    ekRenditeCashflow: eigenkapitalEingesetzt ? cashflowRunrateNachSteuer / eigenkapitalEingesetzt * 100 : null,
    ekRenditeVorSteuer: eigenkapitalEingesetzt ? cashflowRunrate / eigenkapitalEingesetzt * 100 : null,
    // zusätzlich der Anteil, der als Vermögen aufgebaut wird
    ekRenditeGesamt: eigenkapitalEingesetzt
      ? (cashflowRunrateNachSteuer + tilgung12 + sondertilgung12 + tilgungsersatz12) / eigenkapitalEingesetzt * 100
      : null,
    ekRenditeGesamtVorSteuer: eigenkapitalEingesetzt
      ? (cashflowRunrate + tilgung12 + sondertilgung12 + tilgungsersatz12) / eigenkapitalEingesetzt * 100
      : null,
  };
}

/** Dieselbe Rechnung wie kapitalbindung, über alle Objekte des Portfolios. */
export function kapitalbindungPortfolio(stichtag = heuteISO()) {
  let vor = 0, nach = 0, eingesetzt = 0, monate = 0, abMonat = null;
  for (const o of state.daten.objekte) {
    const kb = kapitalbindung(o, stichtag);
    vor += kb.kumuliertVorSteuer;
    nach += kb.kumuliertNachSteuer;
    eingesetzt += kb.eingesetzt;
    // Längste Besitzdauer im Portfolio – sie bestimmt den Zeitraum der Kachel
    monate = Math.max(monate, kb.monate);
    if (kb.abMonat && (abMonat === null || kb.abMonat < abMonat)) abMonat = kb.abMonat;
  }
  return {
    abMonat, bis: stichtag.slice(0, 7), monate,
    eingesetzt,
    kumuliertVorSteuer: vor,
    kumuliertNachSteuer: nach,
    gebundenVorSteuer: eingesetzt - vor,
    gebundenNachSteuer: eingesetzt - nach,
  };
}

/**
 * Cashflows, die seit dem Kauf **bis zum Stichtag tatsächlich geflossen**
 * sind, und das daraus abgeleitete heute gebundene Kapital.
 *
 * Künftige Monate bleiben außen vor: Im laufenden Jahr zählt nur bis zum
 * Stichtagsmonat. Ein Objekt, dessen Kauf noch bevorsteht, liefert deshalb
 * null – anders als die Jahreswerte, die immer das ganze Kalenderjahr
 * ansetzen.
 *
 * Näherung: für vergangene Jahre werden die heutigen Kostensätze und der
 * heutige Steuersatz unterstellt. Mieten und Zinsen stammen dagegen aus
 * den tatsächlich erfassten Konditionen und dem Tilgungsplan. Die Steuer
 * wird zeitanteilig angesetzt, obwohl sie erst mit der Veranlagung fließt.
 */
export function kapitalbindung(o, stichtag = heuteISO()) {
  const bisJahr = Number(stichtag.slice(0, 4));
  const bisMonat = Number(stichtag.slice(5, 7));
  const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : bisJahr;
  const steuersatz = effektiverSteuersatz(o);

  let vor = 0, nach = 0, monate = 0;
  for (let j = kaufjahr; j <= bisJahr; j++) {
    const grenze = j === bisJahr ? bisMonat : 12;
    const ist = jahresSummen(o.id, j, grenze);
    // Wie objektKennzahlen(): Umlagen/umlagefaehige Kosten bleiben im
    // Cashflow aussen vor, zaehlen aber in den Einkuenften; frei erfasste
    // Werbungskosten mindern beides.
    const cfVor = ist.miete - ist.bewirtschaftung - ist.werbungskostenFrei - ist.kapitaldienst;
    const einkuenfte = ist.miete + ist.umlagen - ist.bewirtschaftung - ist.betriebskostenUmlagefaehig
      - ist.zins - ist.werbungskostenFrei - afaImJahr(o, j, grenze);
    vor += cfVor;
    nach += cfVor - einkuenfte * steuersatz / 100;
    monate += besitzMonateBis(o, j, grenze);
  }

  // Über die Jahre konstant, deshalb ohne Stichtag gerechnet
  const darlehen = finanzierungenVon(o.id).reduce((s, f) => s + (f.betrag || 0), 0);
  const eingesetzt = Math.max(0, nebenkostenBerechnen(o).gesamt - darlehen);

  return {
    monate,
    abMonat: o.kaufdatum ? o.kaufdatum.slice(0, 7) : null,
    bis: stichtag.slice(0, 7),
    jahre: bisJahr - kaufjahr + 1,
    kumuliertVorSteuer: vor,
    kumuliertNachSteuer: nach,
    eingesetzt,
    gebundenVorSteuer: eingesetzt - vor,
    gebundenNachSteuer: eingesetzt - nach,
  };
}

/* ---------- Portfolio ---------- */

export function portfolioKennzahlen(stichtag = heuteISO()) {
  const objekte = state.daten.objekte.map((o) => objektKennzahlen(o, stichtag));

  const summe = (feld) => objekte.reduce((s, k) => s + (k[feld] || 0), 0);

  const investition = summe('investition');
  const verkehrswertGesamt = summe('verkehrswert');
  const restschuld = summe('restschuld');
  const kaltmieteJahr = summe('kaltmieteJahr');
  const kaltmieteRunrate = summe('kaltmieteRunrate');
  const bewirtschaftung = summe('bewirtschaftung');
  const bewirtschaftungVoll = summe('bewirtschaftungVoll');
  const eigenkapitalEingesetzt = summe('eigenkapitalEingesetzt');
  const kapitaldienst = summe('kapitaldienst');
  const kapitaldienst12 = summe('kapitaldienst12');
  const cashflowRunrate = summe('cashflowRunrate');
  const cashflowRunrateNachSteuer = summe('cashflowRunrateNachSteuer');
  const cashflowVorSteuer = summe('cashflowVorSteuer');
  const cashflowNachSteuer = summe('cashflowNachSteuer');
  const einheiten = summe('einheiten');
  const vermietet = summe('vermietet');

  return {
    objekte,
    anzahl: objekte.length,
    investition,
    kaufpreis: summe('kaufpreis'),
    eigenprovision: summe('eigenprovision'),
    verkehrswert: verkehrswertGesamt,
    flaeche: summe('flaeche'),
    restschuld,
    darlehenssumme: summe('darlehenssumme'),
    eigenkapital: verkehrswertGesamt - restschuld,
    eigenkapitalEingesetzt,
    wertzuwachs: verkehrswertGesamt - summe('kaufpreis'),
    jahr: Number(stichtag.slice(0, 4)),
    angeschnitten: objekte.some((k) => k.angeschnitten),
    kaltmieteJahr,
    kaltmieteRunrate,
    kaltmieteMonat: summe('kaltmieteMonat'),
    bewirtschaftung,
    zins: summe('zins'),
    tilgung: summe('tilgung'),
    sondertilgung: summe('sondertilgung'),
    kapitaldienst,
    afaJahr: summe('afaJahr'),
    steuer: summe('steuer'),
    einkuenfte: summe('einkuenfte'),
    umlagen: summe('umlagen'),
    betriebskostenUmlagefaehig: summe('betriebskostenUmlagefaehig'),
    nkSaldo: summe('nkSaldo'),
    erhaltung: summe('erhaltung'),
    fahrtkosten: summe('fahrtkosten'),
    sonstigeWk: summe('sonstigeWk'),
    werbungskostenFrei: summe('werbungskostenFrei'),
    cashflowVorSteuer,
    cashflowNachSteuer,
    einheiten, vermietet, leerstand: einheiten - vermietet,
    bruttorendite: investition ? kaltmieteRunrate / investition * 100 : 0,
    nettorendite: investition ? (kaltmieteRunrate - bewirtschaftungVoll) / investition * 100 : 0,
    kaufpreisfaktor: kaltmieteRunrate ? summe('kaufpreis') / kaltmieteRunrate : 0,
    kaufpreisfaktorGesamt: kaltmieteRunrate ? investition / kaltmieteRunrate : 0,
    ltv: verkehrswertGesamt ? restschuld / verkehrswertGesamt * 100 : 0,
    dscr: kapitaldienst12 ? (kaltmieteRunrate - bewirtschaftungVoll) / kapitaldienst12 : null,
    vermietungsquote: einheiten ? vermietet / einheiten * 100 : 0,
    getilgt: summe('getilgt'),
    tilgungsersatz: summe('tilgungsersatz'),
    ersatzEingezahlt: summe('ersatzEingezahlt'),
    ersatzGuthaben: summe('ersatzGuthaben'),
    ersatzErtrag: summe('ersatzErtrag'),
    mitErsatz: objekte.some((k) => k.mitErsatz),
    kapitaldienst12, cashflowRunrate, cashflowRunrateNachSteuer,
    ekRenditeCashflow: eigenkapitalEingesetzt ? cashflowRunrateNachSteuer / eigenkapitalEingesetzt * 100 : null,
    ekRenditeVorSteuer: eigenkapitalEingesetzt ? cashflowRunrate / eigenkapitalEingesetzt * 100 : null,
    ekRenditeGesamt: eigenkapitalEingesetzt
      ? (cashflowRunrateNachSteuer + summe('tilgung12') + summe('sondertilgung12') + summe('tilgungsersatz12'))
        / eigenkapitalEingesetzt * 100
      : null,
    ekRenditeGesamtVorSteuer: eigenkapitalEingesetzt
      ? (cashflowRunrate + summe('tilgung12') + summe('sondertilgung12') + summe('tilgungsersatz12'))
        / eigenkapitalEingesetzt * 100
      : null,
  };
}
