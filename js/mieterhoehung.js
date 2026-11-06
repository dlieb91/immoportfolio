/* Mieterhöhung bis zur ortsüblichen Vergleichsmiete, § 558 BGB.
   Reine Rechnung, kein DOM.

   Die Vorschrift setzt drei Schranken, die alle gleichzeitig gelten:

   1. **Sperrfrist.** Das Erhöhungsverlangen ist frühestens ein Jahr nach der
      letzten Erhöhung zulässig (§ 558 Abs. 1 S. 2), und die neue Miete wird
      erst wirksam, wenn die bisherige **15 Monate** unverändert galt
      (§ 558 Abs. 1 S. 1). Das sind zwei verschiedene Zeitpunkte, keine
      Alternativen – deshalb nennt diese Rechnung beide.
   2. **Kappungsgrenze.** Höchstens 20 % in drei Jahren (§ 558 Abs. 3),
      in Gebieten mit angespanntem Wohnungsmarkt per Landesverordnung 15 %.
      Bezugspunkt ist die Miete drei Jahre vor dem Wirksamwerden der neuen.
   3. **Ortsübliche Vergleichsmiete.** Die absolute Obergrenze. Sie steht in
      keinem Datensatz dieser App – sie kommt aus dem Mietspiegel und wird
      je Einheit eingetragen. Fehlt sie, kennt die Rechnung nur die
      Kappungsgrenze und sagt das auch.

   **Nicht anwendbar bei Staffel- und Indexmiete**: Dort ist § 558 durch
   § 557a Abs. 2 bzw. § 557b Abs. 2 ausgeschlossen, die Miete folgt der
   Vereinbarung.

   Was hier bewusst fehlt: Modernisierungsumlage (§ 559), Mietpreisbremse
   bei Neuvermietung (§ 556d) und die Formvorschriften des Erhöhungs-
   verlangens. Das ist eine Abschätzung des Spielraums, kein Schreiben. */

import { heuteISO, datumPlus, datum } from './util.js';
import { state, vertragStatus, einheitMit, objektVonEinheit } from './store.js';

/** Kondition, die an einem Stichtag galt – oder null, wenn es keine gibt. */
function konditionAm(mv, stichtag) {
  const gueltige = (mv.konditionen || [])
    .filter((k) => k.gueltigAb && k.gueltigAb <= stichtag)
    .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
  return gueltige.at(-1) || null;
}

/**
 * Beginn der zum Stichtag geltenden Kaltmiete. Eine Kondition, die nur die
 * Nebenkosten-Vorauszahlung ändert, ist keine Mietänderung – sonst liefe die
 * Sperrfrist nach jeder Anpassung der Vorauszahlung neu.
 */
function kaltmieteSeit(mv, stichtag) {
  const gueltige = (mv.konditionen || [])
    .filter((k) => k.gueltigAb && k.gueltigAb <= stichtag)
    .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
  let i = gueltige.length - 1;
  if (i < 0) return null;
  while (i > 0 && (gueltige[i - 1].kaltmiete || 0) === (gueltige[i].kaltmiete || 0)) i--;
  return gueltige[i].gueltigAb;
}

/** Die Kappungsgrenze dieses Objekts: Vorgabe aus den Einstellungen, sofern nichts Eigenes steht. */
export function kappungsgrenzeVon(objekt) {
  const eigen = objekt?.kappungsgrenzeAbweichend;
  return eigen != null ? eigen : (state.daten.einstellungen.kappungsgrenzeProzent ?? 20);
}

/**
 * Spielraum für eine Mieterhöhung. Liefert immer ein Ergebnis mit `moeglich`
 * und, wo es nicht geht, einen Grund im Klartext – ein stilles null wäre für
 * die Oberfläche nutzlos.
 */
export function mieterhoehungsPotenzial(mv, stichtag = heuteISO()) {
  const basis = {
    moeglich: false, grund: null, aktuell: 0,
    verlangenAb: null, wirksamAb: null, letzteAenderung: null,
    kappungsgrenze: null, basisDreiJahre: null, grenzeKappung: null,
    vergleichsmieteQm: null, grenzeVergleich: null,
    neueMiete: null, potenzial: 0, begrenztDurch: null,
  };

  if (!mv || vertragStatus(mv, stichtag) !== 'aktiv') {
    return { ...basis, grund: 'Der Vertrag läuft an diesem Stichtag nicht.' };
  }
  if (mv.anpassungTyp === 'staffel') {
    return { ...basis, grund: 'Staffelmiete – eine Erhöhung nach § 558 BGB ist daneben ausgeschlossen (§ 557a Abs. 2 BGB).' };
  }
  if (mv.anpassungTyp === 'index') {
    return { ...basis, grund: 'Indexmiete – eine Erhöhung nach § 558 BGB ist daneben ausgeschlossen (§ 557b Abs. 2 BGB).' };
  }

  const jetzt = konditionAm(mv, stichtag);
  const aktuell = jetzt?.kaltmiete || 0;
  if (!aktuell) {
    return { ...basis, grund: 'Für diesen Vertrag ist keine Kaltmiete hinterlegt.' };
  }

  /* Massgeblich ist die letzte Mietaenderung, nicht der Vertragsbeginn: Nach
     einer Erhoehung laeuft die Sperrfrist neu. */
  const letzteAenderung = kaltmieteSeit(mv, stichtag) || jetzt.gueltigAb;
  const verlangenAb = datumPlus({ monate: 12 }, isoZuDate(letzteAenderung));
  const wirksamAb = datumPlus({ monate: 15 }, isoZuDate(letzteAenderung));

  const einheit = einheitMit(mv.einheitId);
  const objekt = objektVonEinheit(mv.einheitId);
  const kappungsgrenze = kappungsgrenzeVon(objekt);

  /* Bezugspunkt der Kappungsgrenze ist die Miete drei Jahre vor dem
     Wirksamwerden der neuen – nicht die heutige und nicht die bei
     Vertragsbeginn. */
  const dreiJahreVor = datumPlus({ jahre: -3 }, isoZuDate(wirksamAb));
  const basisDreiJahre = konditionAm(mv, dreiJahreVor)?.kaltmiete || aktuell;
  const grenzeKappung = basisDreiJahre * (1 + kappungsgrenze / 100);

  const flaeche = einheit?.flaeche || null;
  const vergleichsmieteQm = einheit?.vergleichsmieteQm ?? null;
  const grenzeVergleich = (flaeche && vergleichsmieteQm) ? flaeche * vergleichsmieteQm : null;

  const neueMiete = grenzeVergleich != null
    ? Math.min(grenzeKappung, grenzeVergleich)
    : grenzeKappung;
  const begrenztDurch = grenzeVergleich != null && grenzeVergleich < grenzeKappung
    ? 'vergleichsmiete' : 'kappung';

  const potenzial = Math.max(0, neueMiete - aktuell);

  return {
    moeglich: potenzial > 0.005,
    grund: potenzial > 0.005 ? null : 'Die Miete liegt bereits an der zulässigen Obergrenze.',
    aktuell, letzteAenderung, verlangenAb, wirksamAb,
    kappungsgrenze, basisDreiJahre, grenzeKappung,
    vergleichsmieteQm, grenzeVergleich,
    neueMiete, potenzial, begrenztDurch,
    /* Ohne Mietspiegelwert ist die Obergrenze offen – die Zahl ist dann nur
       die Kappungsgrenze und taugt nicht als Forderung. */
    obergrenzeUnbekannt: grenzeVergleich == null,
    flaeche,
  };
}

/** 'YYYY-MM-DD' in ein Date ohne Zeitzonenversatz. */
function isoZuDate(iso) {
  const [j, m, t] = String(iso).split('-').map(Number);
  return new Date(j, (m || 1) - 1, t || 1);
}

/**
 * Alle aktiven Verträge mit Spielraum, deren Sperrfrist in Sicht ist.
 * Fürs Dashboard: Was nicht in den nächsten drei Monaten wirksam werden
 * kann, ist noch keine Handlung.
 */
export function erhoehbareVertraege(stichtag = heuteISO()) {
  const grenze = datumPlus({ monate: 3 }, isoZuDate(stichtag));
  const raus = [];
  for (const mv of state.daten.mietvertraege || []) {
    const p = mieterhoehungsPotenzial(mv, stichtag);
    if (!p.moeglich || p.wirksamAb > grenze) continue;
    raus.push({ mv, ...p });
  }
  return raus.sort((a, b) => b.potenzial - a.potenzial);
}


/* ---------- Staffelmiete, § 557a BGB ----------

   Die Staffeln werden **erzeugt und als Konditionen abgelegt**, nicht in
   einer eigenen Liste gefuehrt. Die Zeitreihe der Konditionen ist bereits
   die Wahrheit ueber die Miete; eine zweite Liste daneben wuerde frueher
   oder spaeter davon abweichen.

   § 557a verlangt, dass die jeweilige Miete oder die Erhoehung **als
   Geldbetrag** ausgewiesen ist – eine reine Prozentvereinbarung ist
   unwirksam. Darum rechnet der Erzeuger einen Prozentsatz sofort in
   Betraege um; die Prozentangabe ist nur Eingabehilfe. */

export const STAFFEL_MINDEST_MONATE = 12;

/**
 * Erzeugt die Staffelbetraege, ohne etwas zu speichern – damit die
 * Oberflaeche eine Vorschau zeigen kann, bevor der Nutzer zustimmt.
 */
export function staffelVorschau({ ersteAb, rhythmusMonate, modus, wert, anzahl }, basisMiete) {
  const fehler = [];
  if (!ersteAb) fehler.push('Bitte ein Datum für die erste Staffel angeben.');
  if (!(wert > 0)) fehler.push('Die Erhöhung je Staffel muss größer als null sein.');
  if (!(anzahl >= 1)) fehler.push('Es braucht mindestens eine Staffel.');
  if (!(basisMiete > 0)) fehler.push('Für den Vertrag ist keine Kaltmiete hinterlegt.');
  if (!(rhythmusMonate >= STAFFEL_MINDEST_MONATE)) {
    fehler.push('Jede Staffel muss mindestens zwölf Monate gelten (§ 557a Abs. 2 BGB).');
  }
  if (fehler.length) return { fehler, stufen: [] };

  const stufen = [];
  let miete = basisMiete;
  for (let i = 0; i < anzahl; i++) {
    miete = modus === 'prozent' ? miete * (1 + wert / 100) : miete + wert;
    // Auf Cent runden: so steht der Betrag im Vertrag und so wird er gezahlt.
    miete = Math.round(miete * 100) / 100;
    stufen.push({
      gueltigAb: datumPlus({ monate: i * rhythmusMonate }, isoZuDate(ersteAb)),
      kaltmiete: miete,
      stufe: i + 1,
    });
  }
  return { fehler: [], stufen };
}

/* ---------- Indexmiete, § 557b BGB ----------

   Anders als die Staffel wirkt die Indexmiete **nicht von selbst**: Nach
   § 557b Abs. 3 wird die Aenderung erst durch eine Erklaerung in Textform
   wirksam, in der die Indexaenderung und die neue Miete als Geldbetrag
   stehen – geschuldet ist sie erst ab Beginn des **uebernaechsten** Monats
   nach Zugang. Ohne Erklaerung passiert nichts.

   Deshalb schreibt die App hier keine Konditionen voraus. Sie rechnet den
   Betrag aus und erinnert an die Erklaerung; eintragen laesst er sich,
   wenn sie heraus ist. */

export function indexAnpassung(mv, neuerStand, stichtag = heuteISO()) {
  const leer = {
    moeglich: false, grund: null, alteMiete: 0, neueMiete: null, erhoehung: 0,
    basisStand: null, basisDatum: null, neuerStand: neuerStand ?? null,
    veraenderungProzent: null, fruehestensAb: null, wirksamAb: null,
  };
  if (mv?.anpassungTyp !== 'index') {
    return { ...leer, grund: 'Für diesen Vertrag ist keine Indexmiete vereinbart.' };
  }
  if (vertragStatus(mv, stichtag) !== 'aktiv') {
    return { ...leer, grund: 'Der Vertrag läuft an diesem Stichtag nicht.' };
  }

  const jetzt = konditionAm(mv, stichtag);
  const alteMiete = jetzt?.kaltmiete || 0;
  const basisStand = mv.indexBasisStand ?? null;
  const basisDatum = mv.indexBasisDatum || kaltmieteSeit(mv, stichtag) || null;

  /* Ein Jahr unveraendert (§ 557b Abs. 2 S. 1) – ab der letzten
     Mietaenderung, nicht ab Vertragsbeginn. */
  const seit = kaltmieteSeit(mv, stichtag) || mv.beginn;
  const fruehestensAb = seit ? datumPlus({ monate: 12 }, isoZuDate(seit)) : null;
  // Wirksam ab Beginn des uebernaechsten Monats nach Zugang der Erklaerung.
  const wirksamAb = monatsErster(datumPlus({ monate: 2 }, isoZuDate(stichtag)));
  const basisInfo = { ...leer, alteMiete, basisStand, basisDatum, fruehestensAb, wirksamAb };

  if (!alteMiete) return { ...basisInfo, grund: 'Für diesen Vertrag ist keine Kaltmiete hinterlegt.' };
  if (basisStand == null) return { ...basisInfo, grund: 'Trage den Indexstand ein, auf dem die heutige Miete beruht.' };
  if (!(basisStand > 0)) return { ...basisInfo, grund: 'Der Basis-Indexstand muss größer als null sein.' };
  if (neuerStand == null) return { ...basisInfo, grund: 'Trage den aktuellen Indexstand ein.' };

  const veraenderungProzent = (neuerStand / basisStand - 1) * 100;
  const neueMiete = Math.round(alteMiete * (neuerStand / basisStand) * 100) / 100;
  const erhoehung = neueMiete - alteMiete;
  const gesperrt = fruehestensAb && stichtag < fruehestensAb;

  return {
    ...basisInfo, neuerStand, veraenderungProzent, neueMiete, erhoehung,
    moeglich: !gesperrt && erhoehung > 0.005,
    grund: gesperrt
      ? 'Die Miete muss zwölf Monate unverändert gelten – frühestens ab ' + datum(fruehestensAb) + '.'
      : erhoehung > 0.005 ? null : 'Der Index ist nicht gestiegen, es ergibt sich keine Erhöhung.',
  };
}

/** Erster Tag des Monats, in den dieses Datum faellt. */
function monatsErster(iso) {
  return String(iso).slice(0, 7) + '-01';
}

/* ---------- Erinnerungen ----------

   Je nach Vereinbarung etwas voellig anderes:

   - **Staffel**: Die naechste Stufe greift von selbst. Eine Erklaerung
     braucht es nicht – aber der Mieter muss den Betrag kennen, sonst laeuft
     sein Dauerauftrag weiter auf den alten.
   - **Index**: Ohne Erklaerung in Textform passiert gar nichts. Das ist
     keine Hoeflichkeit, sondern Wirksamkeitsvoraussetzung. */

export function anpassungHinweis(mv, stichtag = heuteISO()) {
  if (!mv || vertragStatus(mv, stichtag) !== 'aktiv') return null;

  if (mv.anpassungTyp === 'staffel') {
    const kaltJetzt = konditionAm(mv, stichtag)?.kaltmiete || 0;
    // nur echte Staffelstufen, keine reine Anpassung der Vorauszahlung
    const naechste = (mv.konditionen || [])
      .filter((k) => k.gueltigAb > stichtag && (k.kaltmiete || 0) !== kaltJetzt)
      .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb))[0];
    if (!naechste) return null;
    const tage = Math.round((isoZuDate(naechste.gueltigAb) - isoZuDate(stichtag)) / 86400000);
    if (tage > 90) return null;
    const jetzt = konditionAm(mv, stichtag);
    return {
      art: 'staffel', datum: naechste.gueltigAb, tage,
      alteMiete: jetzt?.kaltmiete || 0, neueMiete: naechste.kaltmiete || 0,
      erklaerungNoetig: false,
    };
  }

  if (mv.anpassungTyp === 'index') {
    const jetzt = konditionAm(mv, stichtag);
    const seit = kaltmieteSeit(mv, stichtag) || mv.beginn;
    if (!seit) return null;
    const fruehestensAb = datumPlus({ monate: 12 }, isoZuDate(seit));
    if (stichtag < fruehestensAb) return null;
    return {
      art: 'index', datum: fruehestensAb, tage: 0,
      alteMiete: jetzt?.kaltmiete || 0, neueMiete: null,
      erklaerungNoetig: true,
    };
  }
  return null;
}

/** Alle Vertraege mit anstehender Staffel oder moeglicher Indexanpassung. */
export function anstehendeAnpassungen(stichtag = heuteISO()) {
  const raus = [];
  for (const mv of state.daten.mietvertraege || []) {
    const h = anpassungHinweis(mv, stichtag);
    if (h) raus.push({ mv, ...h });
  }
  return raus.sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
}
