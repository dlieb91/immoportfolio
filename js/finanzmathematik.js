/* Tilgungsrechnung – reine Funktionen, keine Oberfläche.

   Konvention: Die erste Rate wird im Monat NACH der Auszahlung fällig,
   Zinsen werden monatlich auf die Restschuld zu Monatsbeginn berechnet
   (nachschüssige Annuität, monatliche Verrechnung).

   Nach Ablauf der Zinsbindung läuft die bisherige Rate weiter, sofern sie
   noch mindestens MINDEST_TILGUNG der Restschuld tilgt. Sonst wird sie auf
   Zins + Mindesttilgung angehoben.

   Ist ein Tilgungsstart hinterlegt, fließen bis dahin nur Zinsen; im Monat
   des Tilgungsstarts wird die Rate als Annuität auf die dann offene
   Restschuld neu bestimmt.
*/

const MAX_MONATE = 12 * 60;   // Notbremse: 60 Jahre

/**
 * Mindesttilgung nach Ablauf der Zinsbindung, in Prozent der Restschuld.
 * Ohne sie käme die Tilgung bei einem kräftigen Zinssprung fast zum
 * Erliegen – eine Bank würde das nicht mittragen.
 */
export const MINDEST_TILGUNG = 1;

const monatsSchluessel = (jahr, monat) => `${jahr}-${String(monat).padStart(2, '0')}`;

/** Addiert Monate auf ein Jahr/Monat-Paar. */
function plusMonat(jahr, monat) {
  return monat === 12 ? [jahr + 1, 1] : [jahr, monat + 1];
}

/**
 * Anfängliche Monatsrate einer Annuität: Betrag × (Zins + Tilgung) / 12.
 */
export function annuitaet(betrag, sollzins, tilgung) {
  return (betrag || 0) * ((sollzins || 0) + (tilgung || 0)) / 100 / 12;
}

/**
 * Vollständiger Tilgungsplan.
 *
 * @param fin            Finanzierungsobjekt aus dem Store
 * @param anschlusszins  Portfolio-Vorgabe in %, greift nach Ablauf der Zinsbindung,
 *                       sofern am Darlehen kein eigener Wert hinterlegt ist
 */
export function tilgungsplan(fin, anschlusszins = null) {
  const betrag = fin?.betrag || 0;
  const start = fin?.auszahlung;
  const leer = { monate: [], jahre: [], rateStart: 0, zinsenGesamt: 0, laufzeitMonate: 0, volltilgung: null };
  if (!betrag || !start) return leer;

  const zinsProzent = fin.sollzins || 0;
  const anschlussProzent = fin.anschlusszins ?? anschlusszins ?? zinsProzent;
  const tilgProzent = fin.tilgungAnfang || 0;
  const endfaellig = fin.art === 'endfaellig';

  /* Tilgungsersatz: als Option an jedem Darlehen. Es wird nicht getilgt,
     stattdessen fließt ein fester Prozentsatz des Darlehensbetrags auf ein
     verzinstes Konto. Die Restschuld bleibt konstant, die Zinslast ebenfalls.
     (`art === 'tilgungsersatz'` stammt aus einer Zwischenfassung.) */
  const mitErsatz = !!fin.mitTilgungsersatz || fin.art === 'tilgungsersatz';
  const ohneTilgung = endfaellig || mitErsatz;
  const ersatzRate = mitErsatz ? betrag * (fin.tilgungsersatzProzent || 0) / 100 / 12 : 0;
  const ersatzZinsMonat = (fin.tilgungsersatzZins || 0) / 100 / 12;
  let ersatzGuthaben = 0;
  let ersatzEingezahlt = 0;
  /* Tilgungsstart: bis dahin werden nur die Zinsen gezahlt. Das entlastet den
     Cashflow der Anlaufmonate spuerbar – die Rate ist in dieser Zeit um den
     Tilgungsanteil kleiner. Verglichen wird auf Monatsebene, ein Datum
     mitten im Monat heisst also „ab diesem Monat wird getilgt".
     Leer = es wird von der ersten Rate an getilgt. */
  const tilgungAbMonat = fin.tilgungStart ? String(fin.tilgungStart).slice(0, 7) : null;

  // Sondertilgungen nach Monat bündeln
  const sonder = new Map();
  for (const s of fin.sondertilgungen || []) {
    if (!s.datum || !s.betrag) continue;
    const key = s.datum.slice(0, 7);
    sonder.set(key, (sonder.get(key) || 0) + s.betrag);
  }

  let [jahr, monat] = start.split('-').map(Number);
  let rest = betrag;
  let rate = ohneTilgung ? 0 : annuitaet(betrag, zinsProzent, tilgProzent);
  let zinssatzAktuell = zinsProzent;
  let umgestellt = false;
  let warTilgungsfrei = false;

  const monate = [];
  let zinsenGesamt = 0;

  for (let i = 0; i < MAX_MONATE && rest > 0.005; i++) {
    [jahr, monat] = plusMonat(jahr, monat);
    const key = monatsSchluessel(jahr, monat);
    const stichtag = `${key}-01`;

    // Zinsbindung abgelaufen -> Anschlusszins
    const inBindung = !fin.zinsbindungBis || stichtag <= fin.zinsbindungBis;

    // Endfällige Darlehen und Tilgungsersatz laufen bis zum Bindungsende.
    if (ohneTilgung && (fin.zinsbindungBis ? !inBindung : i >= 12 * 30)) break;

    if (!inBindung && !umgestellt) {
      zinssatzAktuell = anschlussProzent;
      umgestellt = true;
      // Die Rate bleibt bestehen, solange sie noch mindestens die
      // Mindesttilgung trägt; andernfalls wird sie auf
      // Zins + Mindesttilgung der Restschuld angehoben.
      if (!ohneTilgung) {
        const mindestRate = rest * (zinssatzAktuell + MINDEST_TILGUNG) / 100 / 12;
        if (rate < mindestRate) rate = mindestRate;
      }
    }

    const zins = rest * zinssatzAktuell / 100 / 12;
    zinsenGesamt += zins;

    const tilgungsfrei = ohneTilgung || (tilgungAbMonat && key < tilgungAbMonat);
    if (tilgungsfrei) {
      warTilgungsfrei = true;
    } else if (warTilgungsfrei) {
      /* Uebergang in die Tilgung: die Rate wird neu bestimmt – Annuitaet auf
         die dann noch offene Restschuld, mit dem dann geltenden Zinssatz.
         Ab hier steigt die Rate also um den Tilgungsanteil. */
      rate = annuitaet(rest, zinssatzAktuell, tilgProzent);
      warTilgungsfrei = false;
    }

    /* Ansparkonto: erst verzinsen, dann die Rate gutschreiben */
    const ersatzErtrag = ersatzGuthaben * ersatzZinsMonat;
    ersatzGuthaben += ersatzErtrag + ersatzRate;
    ersatzEingezahlt += ersatzRate;

    let tilgung = tilgungsfrei ? 0 : Math.max(0, rate - zins);
    if (tilgung > rest) tilgung = rest;

    const restNachRate = rest - tilgung;
    let sondertilgung = Math.min(sonder.get(key) || 0, restNachRate);
    const restEnde = restNachRate - sondertilgung;

    monate.push({
      key, datum: stichtag, jahr,
      restschuldAnfang: rest,
      rate: (tilgungsfrei ? zins : Math.min(rate, zins + tilgung)) + ersatzRate,
      zins, tilgung, sondertilgung,
      tilgungsersatz: ersatzRate,
      ersatzErtrag,
      ersatzGuthaben,
      ersatzEingezahlt,
      restschuldEnde: restEnde,
      zinssatz: zinssatzAktuell,
      inBindung,
    });

    rest = restEnde;
  }

  // Jahresweise verdichten
  const jahreMap = new Map();
  for (const m of monate) {
    if (!jahreMap.has(m.jahr)) {
      jahreMap.set(m.jahr, {
        jahr: m.jahr, rate: 0, zins: 0, tilgung: 0, sondertilgung: 0,
        tilgungsersatz: 0, ersatzErtrag: 0,
        restschuldAnfang: m.restschuldAnfang, restschuldEnde: m.restschuldEnde,
        ersatzGuthaben: m.ersatzGuthaben, ersatzEingezahlt: m.ersatzEingezahlt,
        zinssatz: m.zinssatz,
      });
    }
    const j = jahreMap.get(m.jahr);
    j.rate += m.rate; j.zins += m.zins; j.tilgung += m.tilgung; j.sondertilgung += m.sondertilgung;
    j.tilgungsersatz += m.tilgungsersatz; j.ersatzErtrag += m.ersatzErtrag;
    j.restschuldEnde = m.restschuldEnde;
    j.ersatzGuthaben = m.ersatzGuthaben;
    j.ersatzEingezahlt = m.ersatzEingezahlt;
    j.zinssatz = m.zinssatz;
  }

  const letzter = monate.at(-1);
  return {
    monate,
    jahre: [...jahreMap.values()],
    rateStart: monate[0]?.rate || 0,
    zinsenGesamt,
    laufzeitMonate: monate.length,
    volltilgung: letzter && letzter.restschuldEnde <= 0.005 ? letzter.datum : null,
    mitErsatz,
    ersatzEingezahltGesamt: letzter?.ersatzEingezahlt || 0,
    ersatzGuthabenEnde: letzter?.ersatzGuthaben || 0,
  };
}

/** Angespartes Guthaben der Tilgungsersatzleistung zu einem Stichtag. */
export function ersatzGuthabenZu(plan, stichtag) {
  let wert = 0;
  for (const m of plan.monate) {
    if (m.datum > stichtag) break;
    wert = m.ersatzGuthaben;
  }
  return wert;
}

/** Bis zum Stichtag eingezahlte Tilgungsersatzleistungen, ohne Verzinsung. */
export function ersatzEingezahltBis(plan, stichtag) {
  let wert = 0;
  for (const m of plan.monate) {
    if (m.datum > stichtag) break;
    wert = m.ersatzEingezahlt;
  }
  return wert;
}

/** Restschuld zu einem Stichtag (YYYY-MM-DD). */
export function restschuldZu(plan, stichtag, betrag = 0) {
  if (!plan.monate.length) return betrag;
  if (stichtag < plan.monate[0].datum) return plan.monate[0].restschuldAnfang;
  let rest = plan.monate[0].restschuldAnfang;
  for (const m of plan.monate) {
    if (m.datum > stichtag) break;
    rest = m.restschuldEnde;
  }
  return rest;
}

/** Summe der Zinsen bis zu einem Stichtag. */
export function zinsenBis(plan, stichtag) {
  let summe = 0;
  for (const m of plan.monate) {
    if (m.datum > stichtag) break;
    summe += m.zins;
  }
  return summe;
}

/**
 * Kennzahlen eines Darlehens zum Stichtag.
 *
 * Der Tilgungsplan wird übergeben statt hier gerechnet – so kann der Aufrufer
 * den Zwischenspeicher des Stores nutzen, statt den Plan je Ansicht mehrfach
 * neu aufzubauen (bis zu 720 Monatszeilen je Darlehen).
 */
export function darlehenKennzahlen(fin, stichtag, plan) {
  const restschuld = restschuldZu(plan, stichtag, fin.betrag || 0);
  const laufend = plan.monate.find((m) => m.datum > stichtag) || plan.monate.at(-1) || null;

  return {
    plan,
    rateAktuell: laufend ? laufend.rate : 0,
    rateStart: plan.rateStart,
    restschuld,
    getilgt: (fin.betrag || 0) - restschuld,
    zinsenGezahlt: zinsenBis(plan, stichtag),
    zinsenGesamt: plan.zinsenGesamt,
    restschuldZinsbindung: fin.zinsbindungBis ? restschuldZu(plan, fin.zinsbindungBis, fin.betrag || 0) : null,
    volltilgung: plan.volltilgung,
    laufzeitJahre: plan.laufzeitMonate / 12,
  };
}

/**
 * Prüft, ob die Sondertilgungen eines Jahres das vereinbarte Recht überschreiten.
 * Liefert die betroffenen Jahre.
 */
export function sondertilgungPruefen(fin) {
  const max = (fin.sondertilgungMaxProzent || 0) / 100 * (fin.betrag || 0);
  if (!max) return [];
  const proJahr = new Map();
  for (const s of fin.sondertilgungen || []) {
    if (!s.datum || !s.betrag) continue;
    const jahr = s.datum.slice(0, 4);
    proJahr.set(jahr, (proJahr.get(jahr) || 0) + s.betrag);
  }
  return [...proJahr.entries()]
    .filter(([, betrag]) => betrag > max + 0.01)
    .map(([jahr, betrag]) => ({ jahr, betrag, max }));
}
