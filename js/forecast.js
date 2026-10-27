/* Portfolio-Prognose – reine Rechnung, keine Oberfläche.

   Modell je Jahr und Objekt:
     Miete        Vertrag für Vertrag fortgeschrieben. Grundlage ist immer die
                  zuletzt vereinbarte Kondition; ab dem Jahr, in dem sie gilt –
                  frühestens ab dem Startjahr –, wächst sie mit dem
                  Anpassungssatz. Eine vereinbarte Staffel setzt die Basis also
                  neu. Anschließend Abzug der Leerstandsquote.
     Kosten       heutige nicht umlagefähige Kosten, mit Inflation fortgeschrieben.
                  Instandhaltung: der am Objekt erfasste Betrag, sonst der
                  Prozentsatz vom Kaufpreis aus den Parametern.
     Finanzierung aus dem Tilgungsplan, nach Zinsbindung mit dem
                  Anschlusszins des Szenarios.
     Wert         Verkehrswert heute, fortgeschrieben mit der Wertsteigerung.
     Steuer       Miete − Kosten − Zinsen − AfA, mal effektivem Steuersatz.
                  Die AfA endet, wenn das Gebäude abgeschrieben ist.
*/

import { heuteISO } from './util.js';
import {
  state, einheitenVon, finanzierungenVon, verkehrswert, nebenkostenBerechnen,
  aktiveVertraege, aktuelleKondition, besitzMonate,
} from './store.js';
import {
  tilgungsplan, restschuldZu, ersatzGuthabenZu, ersatzEingezahltBis,
} from './finanzmathematik.js';
import { afaImJahr, afaWerte } from './kennzahlen.js';

export const SZENARIEN = [
  { id: 'pessimistisch', name: 'Pessimistisch' },
  { id: 'basis', name: 'Basis' },
  { id: 'optimistisch', name: 'Optimistisch' },
];

/** Abweichungen der Randszenarien von den Basisparametern. */
export const SZENARIO_DELTA = {
  pessimistisch: { mietsteigerung: -1.0, wertsteigerung: -2.0, leerstand: +3, anschlusszins: +1.5, instandhaltungProzent: +0.5 },
  basis: {},
  optimistisch: { mietsteigerung: +1.0, wertsteigerung: +1.5, leerstand: -1, anschlusszins: -1.0, instandhaltungProzent: -0.25 },
};

/** Liest die Basisparameter aus den Portfolio-Einstellungen. */
export function basisParameter() {
  const e = state.daten.einstellungen;
  return {
    jahre: e.forecastJahre ?? 20,
    mietsteigerung: e.mietsteigerung ?? 0,
    wertsteigerung: e.wertsteigerung ?? 0,
    instandhaltungProzent: e.instandhaltungProzent ?? 0,
    leerstand: e.leerstandProzent ?? 0,
    inflation: e.inflation ?? 0,
    anschlusszins: e.anschlusszins ?? 0,
    steuersatz: e.steuersatz ?? 0,
    verkaufNachJahren: e.verkaufNachJahren ?? null,
    verkaufskosten: e.verkaufskosten ?? 0,
  };
}

/**
 * Parameter, die sachlich nicht unter null fallen können.
 * Wert- und Mietsteigerung dürfen dagegen negativ werden – ein fallender
 * Markt ist genau das, was ein pessimistisches Szenario abbilden soll.
 */
const NICHT_NEGATIV = new Set(['leerstand', 'anschlusszins', 'instandhaltungProzent']);

/** Wendet die Szenario-Abweichungen auf die Basisparameter an. */
export function szenarioParameter(basis, id) {
  const delta = SZENARIO_DELTA[id] || {};
  const p = { ...basis };
  for (const [k, v] of Object.entries(delta)) {
    const neu = (p[k] || 0) + v;
    p[k] = NICHT_NEGATIV.has(k) ? Math.max(0, neu) : neu;
  }
  return p;
}

/* ---------- Hilfsfunktionen ---------- */

const wachstum = (rate, jahre) => Math.pow(1 + (rate || 0) / 100, Math.max(0, jahre));

/**
 * Jahresmiete eines Objekts, Monat für Monat und Vertrag für Vertrag
 * fortgeschrieben.
 *
 * Grundlage ist immer die zuletzt vereinbarte Kondition. Ab dem Jahr, in
 * dem sie gilt – frühestens ab dem Startjahr der Prognose –, wächst die
 * Miete mit dem Anpassungssatz. Eine vereinbarte Staffel setzt die Basis
 * also neu, danach läuft die Fortschreibung von dort weiter.
 *
 * Den Satz liefert der Vertrag selbst, wenn dort eine Indexmiete mit
 * angenommener Anpassung hinterlegt ist; sonst gilt die Portfolio-Annahme.
 * Negative Sätze senken die Miete entsprechend.
 */
function projizierteMiete(o, jahr, params, startJahr) {
  let summe = 0;
  for (const e of einheitenVon(o.id)) {
    for (let m = 1; m <= 12; m++) {
      const stichtag = `${jahr}-${String(m).padStart(2, '0')}-15`;
      for (const mv of aktiveVertraege(e.id, stichtag)) {
        const kondition = aktuelleKondition(mv, stichtag);
        if (!kondition?.kaltmiete) continue;
        const satz = (mv.anpassungTyp === 'index' && mv.indexProzent != null)
          ? mv.indexProzent
          : params.mietsteigerung;
        const konditionsJahr = Number(String(kondition.gueltigAb).slice(0, 4));
        const wachstumAb = Math.max(konditionsJahr, startJahr);
        summe += kondition.kaltmiete * wachstum(satz, jahr - wachstumAb);
      }
    }
  }
  return summe;
}

/** Effektiver Steuersatz eines Objekts unter Prognose-Parametern. */
function steuersatzFuer(o, params) {
  const e = state.daten.einstellungen;
  const basis = o.steuersatzAbweichend ?? params.steuersatz ?? 0;
  const zuschlag = (e.soli ? 5.5 : 0) + (e.kirchensteuer || 0);
  return basis * (1 + zuschlag / 100);
}

/* ---------- Prognose ---------- */

/**
 * @param params      Parametersatz (siehe basisParameter)
 * @param stichtag    Startzeitpunkt, standardmäßig heute
 * @param objektIds   optional: nur diese Objekte rechnen (Einzelbetrachtung)
 */
export function prognose(params, stichtag = heuteISO(), objektIds = null) {
  const startJahr = Number(stichtag.slice(0, 4));
  const letztesJahr = startJahr + (params.jahre || 0);
  const nurDiese = objektIds ? new Set(objektIds) : null;
  const objekte = nurDiese
    ? state.daten.objekte.filter((o) => nurDiese.has(o.id))
    : state.daten.objekte;

  // Tilgungspläne einmal je Szenario rechnen
  const plaene = new Map();
  for (const fin of state.daten.finanzierungen) {
    if (nurDiese && !nurDiese.has(fin.objektId)) continue;
    plaene.set(fin.id, tilgungsplan(fin, params.anschlusszins));
  }

  const verkaufsJahr = params.verkaufNachJahren
    ? startJahr + Number(params.verkaufNachJahren)
    : null;

  /* Eingesetztes Eigenkapital: Gesamtinvestition abzüglich Darlehen.
     Über die Jahre konstant und Nenner der Eigenkapitalrendite. */
  const eigenkapitalEingesetzt = objekte.reduce((summe, o) => {
    const darlehen = finanzierungenVon(o.id).reduce((d, f) => d + (f.betrag || 0), 0);
    return summe + Math.max(0, nebenkostenBerechnen(o).gesamt - darlehen);
  }, 0);

  const jahre = [];
  let kumuliertVor = 0;
  let kumuliertNach = 0;

  for (let jahr = startJahr; jahr <= letztesJahr; jahr++) {
    const t = jahr - startJahr;
    const jahresEnde = `${jahr}-12-31`;
    const zeile = {
      jahr, t,
      miete: 0, bewirtschaftung: 0, instandhaltung: 0,
      zins: 0, tilgung: 0, sondertilgung: 0, tilgungsersatz: 0,
      afa: 0, einkuenfte: 0, steuer: 0,
      verkehrswert: 0, restschuld: 0,
      ersatzGuthaben: 0, ersatzEingezahlt: 0,
      rumpfjahr: false,
      objekte: [],
    };

    for (const o of objekte) {
      /* --- Miete --- */
      let miete = projizierteMiete(o, jahr, params, startJahr);
      miete *= (1 - (params.leerstand || 0) / 100);

      /* --- Kosten ---
         Im Anschaffungsjahr nur für die Besitzmonate, damit nicht zwölf
         Monate Kosten gegen ein Rumpfjahr an Miete stehen. */
      const k = o.kosten || {};
      const laufend = (Math.max(0, (k.hausgeldMonat || 0) - (k.hausgeldUmlagefaehigMonat || 0)) + (k.verwaltungMonat || 0)) * 12
        + (k.sonstigeJahr || 0);
      /* Eine ausdrueckliche 0 heisst „keine Ruecklage ansetzen" und ist etwas
         anderes als ein leeres Feld, das die Pauschale aus den Annahmen zieht. */
      const instandBasis = k.instandhaltungMonat != null
        ? k.instandhaltungMonat * 12
        : ((o.kaufpreis || 0) * (params.instandhaltungProzent || 0) / 100);
      const teuerung = wachstum(params.inflation, t);
      const anteil = besitzMonate(o, jahr) / 12;
      const bewirtschaftung = laufend * teuerung * anteil;
      const instandhaltung = instandBasis * teuerung * anteil;

      /* --- Finanzierung --- */
      let zins = 0, tilgung = 0, sondertilgung = 0, restschuld = 0;
      let tilgungsersatz = 0, ersatzGuthaben = 0, ersatzEingezahlt = 0;
      for (const fin of finanzierungenVon(o.id)) {
        const plan = plaene.get(fin.id);
        if (!plan) continue;
        const j = plan.jahre.find((x) => x.jahr === jahr);
        if (j) {
          zins += j.zins; tilgung += j.tilgung; sondertilgung += j.sondertilgung;
          tilgungsersatz += j.tilgungsersatz || 0;
        }
        restschuld += restschuldZu(plan, jahresEnde, fin.betrag || 0);
        if (plan.mitErsatz) {
          ersatzGuthaben += ersatzGuthabenZu(plan, jahresEnde);
          ersatzEingezahlt += ersatzEingezahltBis(plan, jahresEnde);
        }
      }

      /* --- Wert --- */
      const wert = verkehrswert(o) * wachstum(params.wertsteigerung, t);

      /* --- Abschreibung: anteilig im Anschaffungsjahr, endet nach Ablauf --- */
      const afa = afaImJahr(o, jahr);

      /* --- Steuer --- */
      const einkuenfte = miete - bewirtschaftung - instandhaltung - zins - afa;
      const steuer = einkuenfte * steuersatzFuer(o, params) / 100;

      if (anteil > 0 && anteil < 1) zeile.rumpfjahr = true;
      zeile.miete += miete;
      zeile.bewirtschaftung += bewirtschaftung;
      zeile.instandhaltung += instandhaltung;
      zeile.zins += zins;
      zeile.tilgung += tilgung;
      zeile.sondertilgung += sondertilgung;
      zeile.afa += afa;
      zeile.einkuenfte += einkuenfte;
      zeile.steuer += steuer;
      zeile.verkehrswert += wert;
      zeile.restschuld += restschuld;
      zeile.tilgungsersatz += tilgungsersatz;
      zeile.ersatzGuthaben += ersatzGuthaben;
      zeile.ersatzEingezahlt += ersatzEingezahlt;
      zeile.objekte.push({ objekt: o, miete, wert, restschuld, zins, tilgung, einkuenfte, steuer });
    }

    zeile.kapitaldienst = zeile.zins + zeile.tilgung + zeile.sondertilgung + zeile.tilgungsersatz;
    zeile.cashflowVorSteuer = zeile.miete - zeile.bewirtschaftung - zeile.instandhaltung - zeile.kapitaldienst;
    zeile.cashflowNachSteuer = zeile.cashflowVorSteuer - zeile.steuer;
    kumuliertVor += zeile.cashflowVorSteuer;
    kumuliertNach += zeile.cashflowNachSteuer;
    zeile.kumuliertVorSteuer = kumuliertVor;
    zeile.kumuliertNachSteuer = kumuliertNach;
    zeile.eigenkapital = zeile.verkehrswert - zeile.restschuld;
    // Das Ansparguthaben ist Vermögen, steckt aber nicht in der Immobilie
    zeile.vermoegen = zeile.eigenkapital + zeile.ersatzGuthaben;

    /* Eigenkapitalrendite: Cashflow bezogen auf das eingesetzte Eigenkapital.
       Die zweite Variante zählt den Vermögensaufbau mit, der im Objekt
       bzw. auf dem Ansparkonto bleibt. */
    zeile.eigenkapitalEingesetzt = eigenkapitalEingesetzt;
    zeile.vermoegensaufbau = zeile.tilgung + zeile.sondertilgung + zeile.tilgungsersatz;
    const ek = eigenkapitalEingesetzt;
    zeile.ekRenditeVorSteuer = ek ? zeile.cashflowVorSteuer / ek * 100 : null;
    zeile.ekRenditeNachSteuer = ek ? zeile.cashflowNachSteuer / ek * 100 : null;
    zeile.ekRenditeGesamtVorSteuer = ek ? (zeile.cashflowVorSteuer + zeile.vermoegensaufbau) / ek * 100 : null;
    zeile.ekRenditeGesamtNachSteuer = ek ? (zeile.cashflowNachSteuer + zeile.vermoegensaufbau) / ek * 100 : null;
    zeile.ltv = zeile.verkehrswert ? zeile.restschuld / zeile.verkehrswert * 100 : 0;

    jahre.push(zeile);
  }

  return {
    params,
    startJahr,
    jahre,
    verkauf: verkaufsJahr ? verkaufRechnen(verkaufsJahr, jahre, params, startJahr) : null,
  };
}

/* ---------- Verkaufsszenario ---------- */

/**
 * Verkauf aller Objekte im angegebenen Jahr.
 * Innerhalb der zehnjährigen Spekulationsfrist ist der Gewinn zu versteuern;
 * Bemessungsgrundlage ist der Buchwert nach bereits geltend gemachter AfA.
 */
function verkaufRechnen(verkaufsJahr, jahre, params, startJahr) {
  const zeile = jahre.find((z) => z.jahr === verkaufsJahr);
  if (!zeile) return null;

  let erloes = 0, restschuld = 0, steuer = 0, buchwerte = 0;
  const details = [];

  for (const eintrag of zeile.objekte) {
    const o = eintrag.objekt;
    const brutto = eintrag.wert;
    const kosten = brutto * (params.verkaufskosten || 0) / 100;
    const netto = brutto - kosten;

    const kaufjahr = o.kaufdatum ? Number(o.kaufdatum.slice(0, 4)) : startJahr;
    let kumAfa = 0;
    for (let j = kaufjahr; j < verkaufsJahr; j++) kumAfa += afaImJahr(o, j);
    // Anschaffungskosten inkl. aktivierter Modernisierung – wie afaWerte() sie
    // als Bemessungsgrundlage ansetzt, sonst weicht der Buchwert von der
    // tatsächlich abgeschriebenen Basis ab.
    const a = afaWerte(o);
    const anschaffung = a.gebaeude + a.grundstueck;
    const buchwert = Math.max(0, anschaffung - kumAfa);

    const haltedauer = verkaufsJahr - kaufjahr;
    const steuerpflichtig = haltedauer < 10;
    const gewinn = netto - buchwert;
    const objSteuer = steuerpflichtig && gewinn > 0 ? gewinn * steuersatzFuer(o, params) / 100 : 0;

    erloes += netto;
    restschuld += eintrag.restschuld;
    steuer += objSteuer;
    buchwerte += buchwert;
    details.push({
      objekt: o, brutto, kosten, netto, buchwert, gewinn,
      haltedauer, steuerpflichtig, steuer: objSteuer,
      restschuld: eintrag.restschuld,
    });
  }

  return {
    jahr: verkaufsJahr,
    erloes, restschuld, steuer, buchwerte,
    netto: erloes - restschuld - steuer,
    details,
    kumulierterCashflow: zeile.kumuliertNachSteuer,
    gesamtergebnis: erloes - restschuld - steuer + zeile.kumuliertNachSteuer,
  };
}
