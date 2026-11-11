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

import { heuteISO, datumPlus } from './util.js';
import {
  objekt,
  state, einheitenVon, finanzierungenVon, mieteObjekt, mieteEinheit,
  nebenkostenBerechnen, flaecheVon, verkehrswert, besitzMonate, darlehenPlan,
  mieteVereinbartObjekt,
} from './store.js';
import { restschuldZu, ersatzGuthabenZu, ersatzEingezahltBis } from './finanzmathematik.js';
import { jahresSummen } from './zahlungen.js';
import { kostenJahr } from './betriebskosten.js';

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
/**
 * Gebaeude-Anschaffungskosten **ohne jede Modernisierung**.
 *
 * Das ist zugleich die Bemessungsgrundlage der 15-%-Grenze des
 * § 6 Abs. 1 Nr. 1a EStG – und der Grund, warum sie hier eigenstaendig
 * steht: Wuerde die Pruefung afaWerte() aufrufen, das seinerseits die
 * Pruefung braucht, drehte sich die Rechnung im Kreis.
 */
/**
 * Grundstücksanteil in % des Kaufpreises. Ist die Aufteilung als fester
 * Betrag erfasst (grundstueckBetrag), gilt dieser – ein Kaufpreis, der sich
 * danach ändert, verschiebt dann den Prozentsatz, nicht den Betrag.
 * Die Kaufnebenkosten folgen demselben Verhältnis.
 */
/**
 * Was der Kaufpreis enthält und wie die Kaufnebenkosten darauf entfallen.
 *
 *   Kaufpreis = Immobilie (Grund + Gebäude) + Inventar + Rücklagenanteil
 *
 * - Der Anteil an der **Erhaltungsrücklage** gehört nicht zu den
 *   Anschaffungskosten (H 7.3 EStH, BFH) – eine Geldforderung, keine AfA.
 * - **Inventar** (z. B. Einbauküche) ist ein eigenes Wirtschaftsgut mit
 *   eigener AfA, üblich 10 Jahre (BFH IX R 14/15).
 * - Eine **Eigenprovision** (Provision, die der Käufer vom Vermittler
 *   zurückerhält) mindert den **Kaufpreis** und damit die Anschaffungs-
 *   kosten, nicht aber die Kaufnebenkosten – die bleiben auf den
 *   beurkundeten Kaufpreis berechnet. Sie verteilt sich auf Immobilie und
 *   Inventar, nicht auf den Rücklagenanteil.
 * - **Aktivierungspflichtige Nebenkosten** (Grunderwerbsteuer, Notar und
 *   Grundbuch für Kauf und Eigentum, Makler) werden auf Immobilie und
 *   Inventar im Verhältnis der Kaufpreisanteile verteilt. Sofort abziehbare
 *   Positionen (Geldbeschaffung) bleiben außen vor – siehe sofortAbziehbar().
 *
 * Ohne Inventar, Rücklagenanteil und sofort abziehbare Positionen ist
 * `immobilie` genau Kaufpreis + Nebenkosten − Eigenprovision, wie bisher.
 */
export function anschaffungsAufteilung(o) {
  const nk = nebenkostenBerechnen(o);
  const kp = o?.kaufpreis || 0;
  const inventar = Math.min(kp, Math.max(0, o?.inventar || 0));
  const ruecklage = Math.min(kp - inventar, Math.max(0, o?.ruecklageAnteil || 0));
  const verteilbasis = kp - ruecklage;
  const anteilImmobilie = verteilbasis > 0 ? (kp - inventar - ruecklage) / verteilbasis : 1;
  const eigenprovision = Math.min(verteilbasis, Math.max(0, nk.eigenprovision || 0));
  // Steuerlicher Kaufpreis: beurkundet abzüglich Eigenprovision, anteilig
  const kaufpreisImmobilie = kp - inventar - ruecklage - eigenprovision * anteilImmobilie;
  const kaufpreisInventar = inventar - eigenprovision * (1 - anteilImmobilie);
  const nebenkostenAktiv = nk.summe - nk.sofort;
  return {
    kaufpreis: kp, kaufpreisSteuer: kp - eigenprovision, eigenprovision,
    kaufpreisImmobilie, inventar, ruecklage,
    nebenkostenAktiv, sofort: nk.sofort,
    immobilie: Math.max(0, kaufpreisImmobilie + nebenkostenAktiv * anteilImmobilie),
    inventarAnschaffung: inventar ? Math.max(0, kaufpreisInventar + nebenkostenAktiv * (1 - anteilImmobilie)) : 0,
  };
}

/**
 * Datum, an dem eine sofort abziehbare Position zählt: das Zahldatum, wenn
 * sie als bezahlt markiert ist, sonst – wie früher – das Kaufdatum.
 */
export function sofortDatum(o, posten) {
  return posten.bezahltAm || o?.kaufdatum || null;
}

/**
 * Sofort abziehbare Kaufnebenkosten – Werbungskosten im Jahr der Zahlung
 * (Abfluss, § 11 EStG), etwa Notar und Grundbuch für die Grundschuld. Ohne
 * Zahldatum gilt das Kaufjahr. `bisMonat` begrenzt auf Zahlungen bis zu
 * diesem Monat (für Rückblicke bis heute).
 */
export function sofortAbziehbarePosten(o, jahr, bisMonat = 12) {
  return nebenkostenBerechnen(o).sofortPosten.filter((p) => {
    const d = sofortDatum(o, p);
    if (!d || Number(d.slice(0, 4)) !== jahr) return false;
    // Ohne Zahldatum zählt der Kauf selbst – der liegt im Besitzzeitraum
    return !p.bezahltAm || Number(d.slice(5, 7)) <= bisMonat;
  });
}

export function sofortAbziehbar(o, jahr, bisMonat = 12) {
  return sofortAbziehbarePosten(o, jahr, bisMonat).reduce((s, p) => s + p.betrag, 0);
}

export function grundstuecksquote(o) {
  const kp = anschaffungsAufteilung(o).kaufpreisImmobilie;
  if (o?.grundstueckBetrag != null && kp > 0) {
    return Math.min(100, Math.max(0, (o.grundstueckBetrag / kp) * 100));
  }
  return o?.grundstuecksanteil ?? 0;
}

export function gebaeudeAnschaffung(o) {
  const anschaffung = anschaffungsAufteilung(o).immobilie;
  const gebaeudeVorgabe = o.gebaeudeanteilManuell != null
    ? Math.min(Math.max(0, o.gebaeudeanteilManuell), anschaffung)
    : null;
  const grundstueck = gebaeudeVorgabe != null
    ? anschaffung - gebaeudeVorgabe
    : anschaffung * (grundstuecksquote(o) / 100);
  return { anschaffung, grundstueck, gebaeude: Math.max(0, anschaffung - grundstueck) };
}

/** Alle Modernisierungen und Erhaltungsbuchungen eines Objekts, einheitlich. */
function massnahmenVon(o) {
  const raus = (o.modernisierung || []).map((m) => ({
    id: m.id, datum: m.datum, bezeichnung: m.bezeichnung || 'Modernisierung',
    betrag: m.betrag || 0, aktiviertManuell: m.aktiviert, quelle: 'modernisierung', eintrag: m,
  }));
  for (const b of state.daten.buchungen || []) {
    if (b.objektId !== o.id || b.kategorie !== 'erhaltung') continue;
    raus.push({
      id: b.id, datum: b.datum, bezeichnung: b.bezeichnung || 'Erhaltungsaufwand',
      betrag: b.betrag || 0, aktiviertManuell: b.aktiviert, quelle: 'buchung', eintrag: b,
    });
  }
  return raus.sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
}

/**
 * 15-%-Grenze nach § 6 Abs. 1 Nr. 1a EStG.
 *
 * Instandsetzungs- und Modernisierungsaufwand binnen **drei Jahren ab
 * Anschaffung** ist sofort abziehbarer Erhaltungsaufwand, **solange** er
 * 15 % der Gebaeude-Anschaffungskosten nicht uebersteigt. Wird die Grenze
 * gerissen, kippen **alle** Massnahmen des Fensters rueckwirkend in
 * Herstellungskosten und wirken nur noch ueber die AfA – nicht nur der
 * ueberschiessende Teil.
 *
 * Bewusste Vereinfachungen, die der Nutzer kennen muss:
 * - Das Gesetz rechnet **netto**. Diese App fuehrt durchweg Bruttobetraege;
 *   bei Rechnungen mit Umsatzsteuer liegt die tatsaechliche Quote also
 *   niedriger als die hier gezeigte. Die Anzeige sagt das dazu.
 * - **Jaehrlich ueblicherweise anfallende Erhaltungsarbeiten** und echte
 *   **Erweiterungen** bleiben nach Satz 2 aussen vor. Welche Massnahme
 *   darunter faellt, kann die App nicht entscheiden – dafuer gibt es den
 *   Schalter an der Zeile.
 */
export function anschaffungsnahePruefung(o, stichtag = heuteISO()) {
  const g = gebaeudeAnschaffung(o);
  const grenze = g.gebaeude * 0.15;
  const alle = massnahmenVon(o);

  let fensterEnde = null;
  if (o.kaufdatum) {
    const [j, m, t] = o.kaufdatum.split('-').map(Number);
    fensterEnde = datumPlus({ jahre: 3 }, new Date(j, (m || 1) - 1, t || 1));
  }
  const imFenster = (d) => !!(fensterEnde && d && d >= o.kaufdatum && d < fensterEnde);

  /* Nur Massnahmen im Fenster zaehlen in die Grenze – und nur solche, die
     nicht ohnehin von Hand als Herstellungskosten gesetzt sind: Eine echte
     Erweiterung ist nie Erhaltungsaufwand und faellt nach Satz 2 heraus. */
  const imFensterListe = alle.filter((x) => imFenster(x.datum) && x.aktiviertManuell !== true);
  const summe = imFensterListe.reduce((s, x) => s + x.betrag, 0);
  const ueberschritten = grenze > 0 && summe > grenze;
  const quote = grenze ? (summe / grenze) * 100 : 0;

  const massnahmen = alle.map((x) => {
    const drin = imFenster(x.datum);
    /* true/false sind ausdrueckliche Entscheidungen des Nutzers und gehen
       vor. Ohne Angabe entscheidet die Grenze: gerissen heisst aktiviert,
       sonst sofort abziehbar. Ausserhalb des Fensters greift die Regel
       nicht, dann bleibt es Erhaltungsaufwand. */
    const aktiviert = x.aktiviertManuell === true ? true
      : x.aktiviertManuell === false ? false
      : (drin && ueberschritten);
    return { ...x, imFenster: drin, aktiviert, automatisch: x.aktiviertManuell == null };
  });

  return {
    basis: g.gebaeude, grenze, summe, quote, fensterEnde, ueberschritten,
    offen: Math.max(0, grenze - summe),
    aktiv: !!fensterEnde && stichtag < fensterEnde && stichtag >= o.kaufdatum,
    stufe: quote >= 100 ? 'rot' : quote >= 80 ? 'gelb' : 'gruen',
    massnahmen,
  };
}

/** Summe der Massnahmen, die als Herstellungskosten in die AfA gehen. */
export function aktivierteMassnahmen(o, stichtag = heuteISO()) {
  return anschaffungsnahePruefung(o, stichtag).massnahmen
    .filter((x) => x.aktiviert)
    .reduce((s, x) => s + x.betrag, 0);
}

/**
 * Erhaltungsaufwand, wie er steuerlich im Jahr wirkt.
 *
 * Quelle sind **beide** Listen: frei erfasste Erhaltungsbuchungen und die
 * Sanierungen aus der Modernisierungsliste. Welche davon sofort abziehbar
 * sind, entscheidet die 15-%-Pruefung; aktivierte wirken nur ueber die AfA
 * und bleiben hier aussen vor.
 */
export function erhaltungSteuerlich(objektId, jahr) {
  const o = objekt(objektId);
  if (!o) return 0;
  let summe = 0;
  for (const x of anschaffungsnahePruefung(o).massnahmen) {
    if (x.aktiviert) continue;
    const xJahr = Number((x.datum || '').slice(0, 4));
    if (!xJahr) continue;
    /* Verteilung nach § 82b EStDV gibt es nur an freien Buchungen. Nur
       gesetzte Werte werden auf 2–5 gedeckelt; ohne Verteilung zaehlt der
       volle Betrag in genau einem Jahr. */
    const v = x.quelle === 'buchung' ? x.eintrag.verteilenJahre : null;
    const jahre = v ? Math.min(5, Math.max(2, v)) : 1;
    if (jahr >= xJahr && jahr < xJahr + jahre) summe += x.betrag / jahre;
  }
  return summe;
}

/**
 * Eingesetztes Eigenkapital eines Objekts:
 *
 *   Kaufpreis + Nebenkosten (abzüglich Eigenprovision) + Sanierung − Darlehen
 *
 * Sanierung heißt: alle Maßnahmen der Karte „Modernisierung & Sanierung“,
 * gleich wie sie steuerlich behandelt werden (sofort abgesetzt oder über die
 * AfA). Das Geld dafür ist eingesetzt, egal was das Finanzamt daraus macht.
 *
 * Erhaltungs-Buchungen zählen hier **nicht**: Sie sind Zahlungen und mindern
 * bereits den geflossenen Cashflow – hier mitgezählt, stünden sie doppelt da.
 * Die Maßnahmen der Sanierungskarte haben dagegen keine Zahlung in der
 * Buchhaltung und tauchten bisher nirgends als eingesetztes Geld auf.
 *
 * Eine Stelle für alle: Übersicht, Kapitalbindung und Forecast rechneten
 * dieselbe Zahl bisher je für sich.
 */
export function eingesetztesKapital(o) {
  const investition = nebenkostenBerechnen(o).gesamt;
  const sanierung = (o.modernisierung || []).reduce((s, m) => s + (m.betrag || 0), 0);
  const darlehen = finanzierungenVon(o.id).reduce((s, f) => s + (f.betrag || 0), 0);
  return { investition, sanierung, darlehen, eingesetzt: Math.max(0, investition + sanierung - darlehen) };
}

export function afaWerte(o) {
  const g = gebaeudeAnschaffung(o);
  /* Modernisierungen und Erhaltungsbuchungen werden nicht gespiegelt oder
     dupliziert – afaWerte() liest beide Quellen zusammen, und ob eine
     Massnahme aktiviert ist, entscheidet die 15-%-Pruefung. Eine spaeter
     geaenderte oder geloeschte Position wirkt sich damit automatisch aus. */
  const modernisierung = aktivierteMassnahmen(o);
  const gebaeude = g.gebaeude + modernisierung;
  const auf = anschaffungsAufteilung(o);
  const inventarDauer = Math.max(1, o.inventarNutzungsdauer || 10);
  return {
    anschaffung: g.anschaffung, grundstueck: g.grundstueck, gebaeude, modernisierung,
    afaJahr: gebaeude * ((o.afaSatz ?? 0) / 100),
    afaDauer: o.afaSatz ? 100 / o.afaSatz : 0,
    inventar: auf.inventarAnschaffung,
    inventarDauer,
    inventarAfaJahr: auf.inventarAnschaffung / inventarDauer,
    ruecklage: auf.ruecklage,
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
  return afaGebaeudeImJahr(o, jahr, bisMonat) + afaInventarImJahr(o, jahr, bisMonat);
}

/** Gebäude-AfA eines Jahres (§ 7 Abs. 4 EStG). */
export function afaGebaeudeImJahr(o, jahr, bisMonat = 12) {
  return afaGebaeudeStand(o, jahr, bisMonat).betrag;
}

/**
 * Aktivierte Maßnahmen mit dem Jahr, ab dem sie abgeschrieben werden: das
 * Jahr der Maßnahme, frühestens das Kaufjahr.
 */
function aktivierteMitJahr(o) {
  const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : null;
  return anschaffungsnahePruefung(o).massnahmen
    .filter((x) => x.aktiviert && x.betrag)
    .map((x) => {
      const j = Number(String(x.datum || '').slice(0, 4)) || kaufjahr;
      return { betrag: x.betrag, abJahr: kaufjahr != null && j != null ? Math.max(j, kaufjahr) : j };
    });
}

/**
 * Gebäude-AfA eines Jahres, aufgeschlüsselt.
 *
 * Nachträgliche Herstellungskosten – aktivierte Modernisierung, auch
 * anschaffungsnahe nach § 6 Abs. 1 Nr. 1a EStG – erhöhen die Bemessungs-
 * grundlage erst ab dem Jahr, in dem sie anfallen, dann aber mit dem vollen
 * Jahresbetrag, als wären sie zu Jahresbeginn aufgewendet (R 7.4 Abs. 9
 * EStR). Frühere Jahre bleiben unberührt. Im Kaufjahr gilt für alles die
 * Zeitanteiligkeit ab dem Kaufmonat.
 *
 * Vereinfachung: Jede Maßnahme läuft mit dem AfA-Satz des Gebäudes über
 * dieselbe Dauer ab ihrem Jahr. In Summe wird so die erhöhte
 * Bemessungsgrundlage abgeschrieben.
 */
export function afaGebaeudeStand(o, jahr, bisMonat = 12) {
  const a = afaWerte(o);
  const satz = (o.afaSatz ?? 0) / 100;
  const dauer = a.afaDauer;
  const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : null;
  const monate = besitzMonateBis(o, jahr, bisMonat);
  const laeuft = (abJahr) => !!dauer && (abJahr == null || (jahr >= abJahr && jahr < abJahr + dauer));

  let basis = 0, modernisierung = 0;
  const grund = a.gebaeude - a.modernisierung;
  if (grund > 0 && laeuft(kaufjahr)) basis += grund;
  for (const m of aktivierteMitJahr(o)) {
    if (!laeuft(m.abJahr)) continue;
    basis += m.betrag;
    modernisierung += m.betrag;
  }
  const afaVoll = basis * satz;
  return { betrag: afaVoll * monate / 12, basis, modernisierung, afaVoll, monate };
}

/**
 * Volle Jahres-AfA des Gebäudes nach dem Stand im Jahr `jahr` – ohne
 * Maßnahmen, die erst später kommen. Für die Kennzahlen der laufenden zwölf
 * Monate.
 */
export function afaGebaeudeVoll(o, jahr) {
  const a = afaWerte(o);
  const satz = (o.afaSatz ?? 0) / 100;
  const spaeter = aktivierteMitJahr(o).filter((m) => m.abJahr != null && m.abJahr > jahr)
    .reduce((s, m) => s + m.betrag, 0);
  const basis = a.gebaeude - spaeter;
  return { basis, afaVoll: basis * satz };
}

/** AfA des mitgekauften Inventars (§ 7 Abs. 1 EStG), eigene Nutzungsdauer. */
export function afaInventarImJahr(o, jahr, bisMonat = 12) {
  const a = afaWerte(o);
  return afaLinear(o, jahr, bisMonat, a.inventarAfaJahr, a.inventar ? a.inventarDauer : 0);
}

/* Linear ab dem Kaufmonat. Im letzten Jahr nur der Rest, damit in Summe
   nie mehr als die Bemessungsgrundlage abgeschrieben wird. */
function afaLinear(o, jahr, bisMonat, jahresbetrag, dauer) {
  if (!dauer || !jahresbetrag) return 0;
  const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : jahr;
  if (jahr < kaufjahr) return 0;
  if (jahr >= kaufjahr + dauer) return 0;
  return jahresbetrag * besitzMonateBis(o, jahr, bisMonat) / 12;
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

/* ---------- Spekulationsfrist ---------- */

/**
 * Spekulationsfrist nach § 23 EStG – taggenau.
 *
 * Steuerpflichtig ist ein Veräußerungsgewinn, wenn zwischen Anschaffung und
 * Veräußerung **nicht mehr als** zehn Jahre liegen. Maßgeblich sind die
 * obligatorischen Geschäfte, also die **notarielle Beurkundung** des
 * Kaufvertrags (`kaufvertragDatum`), nicht der Übergang von Nutzen und
 * Lasten (`kaufdatum`). Ohne Beurkundungsdatum rechnet die Frist ersatzweise
 * ab dem Kaufdatum – `ausVertrag` sagt, welches gilt.
 *
 * Bei Beurkundung am 15.04.2016 ist ein Verkauf am 15.04.2026 noch
 * steuerpflichtig und erst ab dem 16.04.2026 frei – daher der Tag Zuschlag.
 * Für den Verkauf zählt ebenfalls das Datum des Verkaufsvertrags.
 */
export function spekulationsfrist(o, stichtag = heuteISO()) {
  const basis = o?.kaufvertragDatum || o?.kaufdatum;
  if (!basis) return null;
  /* datumPlus() erwartet ein Date, kein ISO-Datum – die Zerlegung in
     Jahr/Monat/Tag vermeidet die Zeitzonenverschiebung von new Date(string). */
  const [j, m, t] = basis.split('-').map(Number);
  const zehnJahre = datumPlus({ jahre: 10 }, new Date(j, (m || 1) - 1, t || 1));
  const [j2, m2, t2] = zehnJahre.split('-').map(Number);
  const steuerfreiAb = datumPlus({ tage: 1 }, new Date(j2, m2 - 1, t2));
  const steuerfrei = stichtag >= steuerfreiAb;
  const tageRest = steuerfrei ? 0
    : Math.round((new Date(steuerfreiAb) - new Date(stichtag)) / 86400000);
  return { steuerfreiAb, steuerfrei, tageRest, basis, ausVertrag: !!o.kaufvertragDatum };
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
  const k = kostenJahr(o, stichtag);
  const hausgeldVoll = k.hausgeld;
  const verwaltungVoll = k.verwaltung;
  const instandhaltungVoll = k.instandhaltung;
  const sonstigeVoll = k.sonstige;
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
  /* Ohne die Erhaltungsrücklage: Ihre Einzahlung ist keine Werbungskosten,
     erst die Verausgabung durch die Gemeinschaft (BFH IX R 19/24). */
  /* Erhaltungsaufwand zaehlt hier mit seinem **steuerlichen** Betrag, nicht
     mit dem gezahlten: Die Verteilung nach § 82b EStDV und die 15-%-Grenze
     wirken auf die Einkuenfte, nicht auf den Cashflow. Frueher stand hier
     ist.werbungskostenFrei mit dem Zahlungsbetrag – dadurch wichen
     Kennzahlen und Anlage V voneinander ab. */
  const erhaltungSteuer = erhaltungSteuerlich(o.id, jahr);
  const werbungskostenFreiSteuerlich = erhaltungSteuer + ist.fahrtkosten + ist.sonstigeWkGesamt
    + sofortAbziehbar(o, jahr);
  const werbungskosten = ist.bewirtschaftungSteuerlich + ist.betriebskostenUmlagefaehig
    + zins + afaJahr + werbungskostenFreiSteuerlich;
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
  /* Die Runrate fragt „was bringt das, wenn es läuft?" – deshalb die
     vereinbarte Miete, nicht die heute schon fließende. Kosten und
     Kapitaldienst stehen hier ohnehin mit zwölf Monaten; davor null Miete
     zu setzen, weil der Mieter erst nächsten Monat einzieht, verglich zwei
     verschiedene Zeitpunkte und machte die Kennzahlen vor dem Einzug
     unbrauchbar. */
  const mieteVereinbart = mieteVereinbartObjekt(o.id, stichtag);
  const kaltmieteRunrate = mieteVereinbart.kalt * 12;
  const cashflowRunrate = kaltmieteRunrate - bewirtschaftungVoll - kapitaldienst12;
  // Auch hier ohne die Ruecklage – siehe werbungskosten oben (BFH IX R 19/24).
  const afaStand = afaGebaeudeVoll(o, jahr);
  const einkuenfteRunrate = kaltmieteRunrate - (bewirtschaftungVoll - instandhaltungVoll)
    - zins12 - afaStand.afaVoll;
  const steuerRunrate = einkuenfteRunrate * steuersatz / 100;
  const cashflowRunrateNachSteuer = cashflowRunrate - steuerRunrate;

  /* Kapital */
  const getilgt = Math.max(0, darlehenssumme - restschuld);
  const kapital = eingesetztesKapital(o);
  const eigenkapitalEingesetzt = kapital.eingesetzt;
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
    sanierung: kapital.sanierung,
    nebenkosten: nk.summe,
    eigenprovision: nk.eigenprovision,
    verkehrswert: wert,
    flaeche,
    // Miete
    kaltmieteMonat: miete.kalt,
    kaltmieteJahr,                 // tatsächlich im Kalenderjahr
    kaltmieteRunrate,              // 12 × vereinbarte Monatsmiete
    kaltmieteVereinbart: mieteVereinbart.kalt,
    // true, wenn die Runrate auf einem noch nicht begonnenen Vertrag beruht
    mieteNochKuenftig: mieteVereinbart.kuenftig,
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
    /* Offene Mieten. Wo der Eingang verfolgt wird, enthalten Miete und
       Einkuenfte oben bereits nur das tatsaechlich Geflossene – das hier ist
       die Gegenprobe: was noch aussteht und seit wann. */
    mietrueckstand: ist.mietrueckstand || 0, rueckstandSeit: ist.rueckstandSeit || null,
    // Frei erfasste Werbungskosten – je Gruppe und in Summe
    // Die Cashflow-Zeile "Sonstiges" meint die ganze Gruppe, nicht nur
    // die gleichnamige Einzelkategorie – siehe zahlungen.js.
    erhaltung: ist.erhaltung, fahrtkosten: ist.fahrtkosten, sonstigeWk: ist.sonstigeWkGesamt,
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
    afaJahr, afaVoll: afaStand.afaVoll, afaBemessung: afaStand.basis, afaGrundstueck: afa.grundstueck,
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
  let vor = 0, steuerwirkung = 0, eingesetzt = 0, monate = 0, abMonat = null;
  for (const o of state.daten.objekte) {
    const kb = kapitalbindung(o, stichtag);
    vor += kb.kumuliertVorSteuer;
    steuerwirkung += kb.steuerwirkung;
    eingesetzt += kb.eingesetzt;
    // Längste Besitzdauer im Portfolio – sie bestimmt den Zeitraum der Kachel
    monate = Math.max(monate, kb.monate);
    if (kb.abMonat && (abMonat === null || kb.abMonat < abMonat)) abMonat = kb.abMonat;
  }
  return {
    abMonat, bis: letzterMonat(stichtag), monate,
    eingesetzt,
    kumuliertVorSteuer: vor,
    steuerwirkung,
    kumuliertNachSteuer: vor + steuerwirkung,
    gebundenVorSteuer: eingesetzt - vor,
    gebundenNachSteuer: eingesetzt - vor - steuerwirkung,
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
/**
 * Der letzte abgeschlossene Monat vor diesem Stichtag, als 'YYYY-MM'.
 * Im Januar ist das der Dezember des Vorjahres.
 */
function letzterMonat(stichtag) {
  const j = Number(stichtag.slice(0, 4));
  const m = Number(stichtag.slice(5, 7));
  return m > 1 ? `${j}-${String(m - 1).padStart(2, '0')}` : `${j - 1}-12`;
}

export function kapitalbindung(o, stichtag = heuteISO()) {
  const bisJahr = Number(stichtag.slice(0, 4));
  /* Nur **abgeschlossene** Monate. Am 2. November ist der November noch
     nicht geflossen; ihn voll mitzuzählen hieße, Kosten und Abschreibung
     für einen Monat anzusetzen, der gerade erst begonnen hat. */
  const bisMonat = Number(stichtag.slice(5, 7)) - 1;
  const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : bisJahr;
  const steuersatz = effektiverSteuersatz(o);

  let vor = 0, steuerwirkung = 0, monate = 0;
  for (let j = kaufjahr; j <= bisJahr; j++) {
    const grenze = j === bisJahr ? bisMonat : 12;
    const ist = jahresSummen(o.id, j, grenze);
    // Wie objektKennzahlen(): Umlagen/umlagefaehige Kosten bleiben im
    // Cashflow aussen vor, zaehlen aber in den Einkuenften; frei erfasste
    // Werbungskosten mindern beides.
    const cfVor = ist.miete - ist.bewirtschaftung - ist.werbungskostenFrei - ist.kapitaldienst;
    const einkuenfte = ist.miete + ist.umlagen - ist.bewirtschaftungSteuerlich
      - ist.betriebskostenUmlagefaehig - ist.zins
      // wie oben: steuerlicher Erhaltungsaufwand, nicht der gezahlte
      - (erhaltungSteuerlich(o.id, j) + ist.fahrtkosten + ist.sonstigeWkGesamt)
      - (besitzMonateBis(o, j, grenze) ? sofortAbziehbar(o, j, grenze) : 0)
      - afaImJahr(o, j, grenze);
    vor += cfVor;
    /* Getrennt gefuehrt, nicht eingerechnet: Eine Erstattung auf Verluste
       dieses Jahres fliesst fruehestens mit der Veranlagung im naechsten.
       Sie gehoert deshalb nicht in eine Zahl, die „geflossen" heisst. */
    steuerwirkung += -einkuenfte * steuersatz / 100;
    monate += besitzMonateBis(o, j, grenze);
  }

  // Über die Jahre konstant, deshalb ohne Stichtag gerechnet
  const eingesetzt = eingesetztesKapital(o).eingesetzt;

  return {
    monate,
    abMonat: o.kaufdatum ? o.kaufdatum.slice(0, 7) : null,
    bis: letzterMonat(stichtag),
    jahre: bisJahr - kaufjahr + 1,
    kumuliertVorSteuer: vor,
    // Erwartete Steuerwirkung, noch nicht geflossen – siehe oben.
    steuerwirkung,
    kumuliertNachSteuer: vor + steuerwirkung,
    eingesetzt,
    gebundenVorSteuer: eingesetzt - vor,
    gebundenNachSteuer: eingesetzt - vor - steuerwirkung,
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
    sanierung: summe('sanierung'),
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
    kaltmieteVereinbart: summe('kaltmieteVereinbart'),
    // true, sobald irgendein Objekt seine Runrate aus einem künftigen Vertrag zieht
    mieteNochKuenftig: objekte.some((k) => k.mieteNochKuenftig),
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
    mietrueckstand: summe('mietrueckstand'),
    rueckstandSeit: objekte.map((k) => k.rueckstandSeit).filter(Boolean).sort()[0] || null,
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
