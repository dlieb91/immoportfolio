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

import { heuteISO, datumPlus } from './util.js';
import { state, vertragStatus, einheitMit, objektVonEinheit } from './store.js';

/** Kondition, die an einem Stichtag galt – oder null, wenn es keine gibt. */
function konditionAm(mv, stichtag) {
  const gueltige = (mv.konditionen || [])
    .filter((k) => k.gueltigAb && k.gueltigAb <= stichtag)
    .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
  return gueltige.at(-1) || null;
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
  const letzteAenderung = jetzt.gueltigAb;
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
