/* Buchhaltung – reine Rechnung, keine Oberfläche.

   Führt drei Quellen zu einem Hauptbuch zusammen: die aus den Stammdaten
   abgeleiteten Zahlungen (zahlungen.js), frei erfasste Buchungen
   (`state.daten.buchungen`) und Fahrten zum Objekt (`state.daten.fahrten`).
   Ausserdem drei eigenständige Auswertungen, die auf diesem Hauptbuch
   aufbauen:

     Nebenkostenabrechnung   Vorauszahlung je Einheit gegen die anteiligen
                             umlagefähigen Kosten, nach Wohnfläche verteilt.
     Erhaltungsaufwand       Ampel zur 15-%-Grenze (§ 6 Abs. 1 Nr. 1a EStG):
                             Erhaltungsaufwand binnen drei Jahren ab Kauf
                             über 15 % der Gebäude-Anschaffungskosten kippt
                             rückwirkend vollständig in die AfA. Nur ein
                             Hinweis – die App reklassifiziert nichts von
                             selbst.
     Anlage-V-Aufstellung    Einnahmen und Werbungskosten in der Gliederung
                             der Anlage V, als Zuarbeit fürs Finanzamt oder
                             den Steuerberater – keine Steuerberatung.
*/

import { heuteISO, datumPlus } from './util.js';
import {
  state, objekt as objektMit, einheitMit, einheitName, objektVonEinheit,
  flaecheVon, einheitenVon, mieteEinheit, buchungenVon, fahrtenVon,
  besitzMonate, aktiveVertraege, mieteVon, mieteMoeglichIm,
} from './store.js';
import { kostenJahr } from './betriebskosten.js';
import {
  KATEGORIEN, GRUPPEN, artInfo, zahlungsliste, jahresSummen, fahrtBetrag, monatszahlungen,
} from './zahlungen.js';
import {
  afaWerte, afaImJahr, anschaffungsnahePruefung, gebaeudeAnschaffung, erhaltungSteuerlich,
  afaGebaeudeImJahr, afaGebaeudeStand, afaInventarImJahr, sofortAbziehbar, sofortAbziehbarePosten, sofortDatum,
  spekulationsfrist,
} from './kennzahlen.js';

/* Anlage-V-Zeilen für die beiden neuen Positionen */
const LABEL_INVENTAR = 'Werbungskosten: AfA bewegliche Wirtschaftsgüter';
const LABEL_GELDBESCHAFFUNG = 'Werbungskosten: Geldbeschaffungskosten';

// Die 15-%-Pruefung liegt in kennzahlen.js, weil afaWerte() sie braucht –
// hier nur weitergereicht, damit die Ansichten einen Ort haben.
export { anschaffungsnahePruefung, gebaeudeAnschaffung, erhaltungSteuerlich, spekulationsfrist };

export { KATEGORIEN, GRUPPEN, artInfo, fahrtBetrag };

/* ---------- Hauptbuch ---------- */

/**
 * Abgeleitete Zeilen, freie Buchungen und Fahrten zusammengeführt, neueste
 * zuerst. Dieselbe Filterform wie `zahlungsliste()`, um `herkunft`
 * ('abgeleitet' | 'manuell') erweitert.
 */
export function buchungsliste(filter = {}) {
  const raus = [];

  if (filter.herkunft !== 'manuell') {
    for (const z of zahlungsliste(filter)) {
      raus.push({ ...z, datum: `${z.periode}-01`, herkunft: 'abgeleitet' });
    }
  }

  if (filter.herkunft !== 'abgeleitet') {
    const heute = new Date();
    const bisJahr = filter.bisJahr ?? heute.getFullYear();
    const vonJahr = filter.vonJahr ?? bisJahr;
    const alleJahre = filter.bisJahr === null;

    for (const b of state.daten.buchungen || []) {
      if (filter.objektId && b.objektId !== filter.objektId) continue;
      if (filter.einheitId && b.einheitId !== filter.einheitId) continue;
      if (filter.art && b.kategorie !== filter.art) continue;
      const jahr = Number((b.datum || '').slice(0, 4));
      if (!alleJahre && (jahr < vonJahr || jahr > bisJahr)) continue;
      const o = objektMit(b.objektId);
      const e = b.einheitId ? einheitMit(b.einheitId) : null;
      raus.push({
        id: b.id, datum: b.datum, periode: (b.datum || '').slice(0, 7),
        jahr, monat: Number((b.datum || '').slice(5, 7)), art: b.kategorie, geplant: false,
        objektId: b.objektId, objektName: o?.bezeichnung || 'Ohne Bezeichnung',
        bezugId: b.einheitId || null, bezugText: b.bezeichnung || (e ? einheitName(e) : ''),
        standard: b.betrag || 0, betrag: b.betrag || 0,
        korrigiert: false, entfaellt: false, notiz: b.notiz || '',
        herkunft: 'manuell', quelle: b,
      });
    }

    for (const fa of state.daten.fahrten || []) {
      if (filter.objektId && fa.objektId !== filter.objektId) continue;
      if (filter.art && filter.art !== 'fahrtkosten') continue;
      const jahr = Number((fa.datum || '').slice(0, 4));
      if (!alleJahre && (jahr < vonJahr || jahr > bisJahr)) continue;
      const o = objektMit(fa.objektId);
      const betrag = fahrtBetrag(fa, state.daten.einstellungen);
      raus.push({
        id: fa.id, datum: fa.datum, periode: (fa.datum || '').slice(0, 7),
        jahr, monat: Number((fa.datum || '').slice(5, 7)), art: 'fahrtkosten', geplant: false,
        objektId: fa.objektId, objektName: o?.bezeichnung || 'Ohne Bezeichnung',
        bezugId: null, bezugText: fa.anlass || `${fa.km || 0} km`,
        standard: betrag, betrag,
        korrigiert: false, entfaellt: false, notiz: fa.notiz || '',
        herkunft: 'manuell', quelle: fa,
      });
    }
  }

  if (filter.gruppe) {
    return raus
      .filter((z) => artInfo(z.art).gruppe === filter.gruppe)
      .sort((a, b) => b.datum.localeCompare(a.datum) || a.objektName.localeCompare(b.objektName));
  }
  raus.sort((a, b) => b.datum.localeCompare(a.datum) || a.objektName.localeCompare(b.objektName));
  return raus;
}

/* ---------- Nebenkostenabrechnung ---------- */

/**
 * Vorauszahlung gegen umlagefähige Kosten, je Einheit und Jahr.
 *
 * Die Vorauszahlung kommt monatsweise aus den Mietverträgen dieser Einheit
 * (wie kennzahlen.js:mieteImJahr, nur je Einheit statt je Objekt). Die
 * umlagefähigen Kosten sind am Objekt erfasst, nicht je Einheit – sie werden
 * nach Wohnfläche verteilt, ersatzweise zu gleichen Teilen, wenn keine
 * Fläche hinterlegt ist. Ergebnis positiv heisst Nachzahlung des Mieters,
 * negativ heisst Erstattung durch den Vermieter.
 *
 * Zeitanteilig: War die Einheit nur einen Teil der Besitzmonate vermietet,
 * trägt der Mieter nur diesen Teil der Jahreskosten – den Leerstand trägt
 * der Vermieter (übliche Umlage nach Zeitanteil).
 */
function flaechenanteilVon(e, o) {
  const gesamtFlaeche = flaecheVon(o);
  const anzahlEinheiten = Math.max(1, einheitenVon(o.id).length);
  return gesamtFlaeche ? (e.flaeche || 0) / gesamtFlaeche : 1 / anzahlEinheiten;
}

export function nkAbrechnung(einheitId, jahr) {
  const e = einheitMit(einheitId);
  const o = objektVonEinheit(einheitId);
  if (!e || !o) return null;

  let vorauszahlung = 0, monateVermietet = 0;
  const vertraege = [];
  for (let m = 1; m <= 12; m++) {
    // Vor dem Kauf rechnet der Verkäufer ab, nicht du
    if (!mieteMoeglichIm(o, `${jahr}-${String(m).padStart(2, '0')}`)) continue;
    const stichtag = `${jahr}-${String(m).padStart(2, '0')}-15`;
    const w = mieteEinheit(einheitId, stichtag);
    if (w.nk) vorauszahlung += w.nk;
    if (w.anzahl) monateVermietet++;
    for (const mv of w.vertraege) if (!vertraege.includes(mv)) vertraege.push(mv);
  }

  const ist = jahresSummen(o.id, jahr);
  const flaechenanteil = flaechenanteilVon(e, o);
  const bestand = besitzMonate(o, jahr);
  const zeitanteil = bestand ? Math.min(1, monateVermietet / bestand) : 0;
  const kosten = ist.betriebskostenUmlagefaehig * flaechenanteil * zeitanteil;

  return {
    einheitId, objektId: o.id, jahr,
    vorauszahlung, kosten, ergebnis: kosten - vorauszahlung,
    flaechenanteil, zeitanteil, monateVermietet, vertraege,
  };
}

/** Nebenkostenabrechnung aller Einheiten eines Objekts. */
export function nkAbrechnungObjekt(objektId, jahr) {
  return einheitenVon(objektId)
    .map((e) => nkAbrechnung(e.id, jahr))
    .filter(Boolean);
}

/**
 * Frist der Abrechnung (§ 556 Abs. 3 BGB): Sie muss dem Mieter spätestens
 * zwölf Monate nach Ende des Abrechnungszeitraums zugehen, danach ist eine
 * Nachforderung ausgeschlossen. Abrechnungszeitraum ist hier das Kalenderjahr.
 */
export const abrechnungsFrist = (jahr) => `${jahr + 1}-12-31`;

/** Zustelldatum der Abrechnung einer Einheit für ein Jahr, sonst null. */
export const abrechnungZugestellt = (e, jahr) => e?.nkZugestellt?.[jahr] || null;

/** Die aus der Abrechnung angelegte Buchung (Nachzahlung oder Erstattung), sonst null. */
export function abrechnungsBuchung(einheitId, jahr) {
  return (state.daten.buchungen || []).find((b) => b.einheitId === einheitId && b.nkJahr === jahr
    && (b.kategorie === 'nkNachzahlung' || b.kategorie === 'nkErstattung')) || null;
}

/** Felder der Buchung zum Ergebnis einer Abrechnung – angelegt wird in der Ansicht. */
export function abrechnungsBuchungFelder(n, mieterText) {
  const nach = n.ergebnis >= 0;
  return {
    einheitId: n.einheitId, nkJahr: n.jahr,
    kategorie: nach ? 'nkNachzahlung' : 'nkErstattung',
    betrag: Math.round(Math.abs(n.ergebnis) * 100) / 100,
    bezeichnung: `Nebenkostenabrechnung ${n.jahr}${mieterText ? ' · ' + mieterText : ''}`,
  };
}

/**
 * Angemessene monatliche Vorauszahlung je Einheit (§ 560 Abs. 4 BGB):
 * umlagefähige Jahreskosten laut Positionen zum Stand `stand`, nach
 * Wohnfläche verteilt, durch zwölf, auf volle Euro aufgerundet.
 * `relevant`, wenn der Vorschlag um mindestens 5 € und 5 % abweicht.
 */
export function vorauszahlungVorschlag(einheitId, stand = heuteISO()) {
  const e = einheitMit(einheitId);
  const o = objektVonEinheit(einheitId);
  if (!e || !o) return null;
  const vertraege = aktiveVertraege(einheitId, stand);
  if (!vertraege.length) return null;
  const jahreskosten = kostenJahr(o, stand).betriebskostenUmlagefaehig * flaechenanteilVon(e, o);
  const aktuell = vertraege.reduce((s, mv) => s + mieteVon(mv, stand).nk, 0);
  const vorschlag = Math.ceil(jahreskosten / 12);
  const differenz = vorschlag - aktuell;
  return {
    einheitId, jahreskosten, aktuell, vorschlag, differenz,
    mv: vertraege.length === 1 ? vertraege[0] : null,
    relevant: jahreskosten > 0 && Math.abs(differenz) >= 5 && Math.abs(differenz) >= aktuell * 0.05,
  };
}

/**
 * Laufende Verträge ohne Nebenkosten-Vorauszahlung in Objekten mit
 * umlagefähigen Kosten – dort rechnet die App keine Umlagen, die Kosten
 * stehen allein als Werbungskosten da wie bei Leerstand.
 */
export function ohneVorauszahlung(stand = heuteISO()) {
  const raus = [];
  for (const o of state.daten.objekte) {
    if (!(kostenJahr(o, stand).betriebskostenUmlagefaehig > 0)) continue;
    for (const e of einheitenVon(o.id)) {
      for (const mv of aktiveVertraege(e.id, stand)) {
        if (!mieteVon(mv, stand).nk) raus.push({ o, e, mv });
      }
    }
  }
  return raus;
}

/**
 * Abrechnungen des Vorjahres, die noch nicht als zugestellt vermerkt sind –
 * nur Einheiten mit Vorauszahlung, denn nur dort gilt die Frist.
 */
export function offeneAbrechnungen(heute = heuteISO()) {
  const jahr = Number(heute.slice(0, 4)) - 1;
  const frist = abrechnungsFrist(jahr);
  const tageRest = Math.round((Date.parse(frist) - Date.parse(heute.slice(0, 10))) / 864e5);
  const liste = [];
  for (const o of state.daten.objekte) {
    for (const e of einheitenVon(o.id)) {
      if (abrechnungZugestellt(e, jahr)) continue;
      const n = nkAbrechnung(e.id, jahr);
      if (n && n.monateVermietet && n.vorauszahlung > 0) liste.push({ o, e, n });
    }
  }
  return { jahr, frist, tageRest, liste };
}

/* ---------- Erhaltungsaufwand: 15-%-Grenze und § 82b EStDV ---------- */

/**
 * Ampel zur 15-%-Grenze anschaffungsnaher Herstellungskosten
 * (§ 6 Abs. 1 Nr. 1a EStG): Erhaltungsaufwand **binnen drei Jahren ab
 * Kauf**, der in Summe 15 % der Gebäude-Anschaffungskosten übersteigt, gilt
 * rückwirkend vollständig als Herstellungskosten – abzuschreiben statt
 * sofort abziehbar. Die Grenze bezieht sich auf die reinen
 * Anschaffungskosten des Gebäudes, ohne spätere aktivierte Modernisierung.
 *
 * `stufe` ist eine Warnung, keine Buchung – die App reklassifiziert nichts
 * von selbst. Ausserhalb des Dreijahresfensters liefert die Funktion null.
 */
/**
 * Ampel zur 15-%-Grenze – nur eine Sicht auf anschaffungsnahePruefung().
 *
 * Frueher zaehlte sie ausschliesslich freie Erhaltungsbuchungen. Die
 * Sanierungen aus der Modernisierungsliste blieben aussen vor, obwohl
 * § 6 Abs. 1 Nr. 1a EStG sie genauso erfasst – eine Luecke, die genau dann
 * auffiel, wenn sie teuer wurde.
 */
export function erhaltungsAmpel(o, stichtag = heuteISO()) {
  if (!o.kaufdatum) return null;
  const p = anschaffungsnahePruefung(o, stichtag);
  if (!p.aktiv) return null;
  return {
    summe: p.summe, grenze: p.grenze, basis: p.basis, quote: p.quote,
    fensterEnde: p.fensterEnde, stufe: p.stufe, offen: p.offen,
    ueberschritten: p.ueberschritten,
  };
}

/**
 * Steuerlich abzugsfähiger Erhaltungsaufwand eines Jahres: aktivierte
 * Buchungen zählen nicht (sie stecken in der AfA, siehe kennzahlen.js:
 * afaWerte), auf mehrere Jahre verteilte (§ 82b EStDV) nur mit ihrem
 * Anteil – in jedem der gewählten Jahre gleich groß, ab dem Buchungsjahr.
 * Nicht verteilter, nicht aktivierter Aufwand zählt voll im Buchungsjahr.
 *
 * Getrennt von `jahresSummen()`: dort steht der volle Betrag im Jahr des
 * tatsächlichen Zahlungsflusses (Cashflow), hier die steuerliche Verteilung.
 */
/**
 * Erhaltungsaufwand, der nach § 82b EStDV noch auf kuenftige Jahre
 * verteilt ist – je Buchung der Restbetrag und das letzte Jahr.
 *
 * Reine Planungsauskunft, kein Warnhinweis: erhaltungSteuerlich() setzt die
 * Jahresanteile ohnehin selbsttaetig an, vergessen kann man sie nicht.
 */
export function verteilungenOffen(objektId, abJahr) {
  const offen = [];
  for (const b of buchungenVon(objektId)) {
    if (b.kategorie !== 'erhaltung' || b.aktiviert || !b.verteilenJahre) continue;
    const bJahr = Number((b.datum || '').slice(0, 4));
    if (!bJahr) continue;
    const jahre = Math.min(5, Math.max(2, b.verteilenJahre));
    const letztes = bJahr + jahre - 1;
    if (letztes < abJahr) continue;
    const proJahr = (b.betrag || 0) / jahre;
    // Angefangen wird mit dem laufenden Jahr, Vorjahre sind abgegolten.
    const restJahre = letztes - Math.max(abJahr, bJahr) + 1;
    offen.push({
      id: b.id,
      bezeichnung: b.bezeichnung || 'Erhaltungsaufwand',
      datum: b.datum,
      gesamt: b.betrag || 0,
      proJahr,
      restbetrag: proJahr * restJahre,
      restJahre,
      letztesJahr: letztes,
    });
  }
  return offen.sort((a, b) => (a.datum || '').localeCompare(b.datum || ''));
}



/* ---------- Anlage-V-Aufstellung ---------- */

/**
 * Einnahmen und Werbungskosten eines Objekts und Jahres, gruppiert nach der
 * Anlage-V-Zuordnung aus KATEGORIEN. Zuarbeit für die Steuererklärung, keine
 * Steuerberatung: Die 15-%-Grenze und § 82b EStDV sind eingerechnet, die
 * Beurteilung des Einzelfalls bleibt Sache des Steuerberaters.
 */
/**
 * Herleitung der Werbungskosten – zeigt, woraus jede Position der Anlage V
 * entstanden ist.
 *
 * Die Aufstellung selbst nennt nur Summen. Wer sie prüfen soll – der
 * Steuerberater, das Finanzamt, man selbst im nächsten Jahr – braucht den
 * Weg dahin. Dieser Anhang liefert ihn aus **denselben Quellen**, aus denen
 * anlageVAufstellung() seine Summen bildet; beides muss deshalb auf den Cent
 * übereinstimmen, und genau das prüft die Testsammlung.
 *
 * Drei Arten von Positionen:
 *   afa        – die Rechnung: Bemessungsgrundlage × Satz, zeitanteilig
 *   erhaltung  – je Maßnahme, mit der Verteilung nach § 82b EStDV
 *   posten     – die einzelnen Zahlungen, monatlich oder frei erfasst
 */
const eur0 = (v) => `${Math.round(v).toLocaleString('de-DE')} €`;

export function werbungskostenHerleitung(o, jahr) {
  const raus = [];

  /* --- Abschreibung --- */
  const a = afaWerte(o);
  const stand = afaGebaeudeStand(o, jahr);
  const afaBetrag = stand.betrag;
  if (afaBetrag) {
    const monate = stand.monate;
    raus.push({
      label: 'Werbungskosten: AfA',
      betrag: -afaBetrag,
      art: 'afa',
      rechnung: {
        anschaffung: a.anschaffung,
        grundstueck: a.grundstueck,
        modernisierung: stand.modernisierung,
        gebaeude: stand.basis,
        satz: o.afaSatz ?? 0,
        dauer: a.afaDauer,
        afaVoll: stand.afaVoll,
        monate,
        betrag: afaBetrag,
      },
    });
  }

  /* --- Inventar: eigene AfA (z. B. Einbauküche, 10 Jahre) --- */
  const afaInventar = afaInventarImJahr(o, jahr);
  if (afaInventar) {
    raus.push({
      label: LABEL_INVENTAR, art: 'inventar', betrag: -afaInventar,
      posten: [{
        text: 'Mitgekauftes Inventar', betrag: afaInventar,
        hinweis: `${eur0(a.inventar)} inkl. anteiliger Nebenkosten über ${a.inventarDauer} Jahre`,
      }],
    });
  }

  /* --- Geldbeschaffungskosten des Kaufs: sofort im Jahr der Zahlung --- */
  const geldbeschaffung = sofortAbziehbarePosten(o, jahr);
  if (geldbeschaffung.length) {
    const posten = geldbeschaffung.map((p) => ({
      text: p.text, betrag: p.betrag, datum: sofortDatum(o, p),
      hinweis: p.bezahltAm ? 'bezahlt · sofort abziehbar, kein Teil der Anschaffungskosten'
        : 'ohne Zahldatum im Kaufjahr · sofort abziehbar, kein Teil der Anschaffungskosten',
    }));
    raus.push({
      label: LABEL_GELDBESCHAFFUNG, art: 'geldbeschaffung', posten,
      betrag: -posten.reduce((s, x) => s + x.betrag, 0),
    });
  }

  /* --- Erhaltungsaufwand, steuerlich (§ 82b EStDV und 15-%-Grenze) ---
     Quelle sind die Maßnahmen aus anschaffungsnahePruefung(): die Buchungen
     der Kategorie Erhaltung **und** die Modernisierungen. Genau daraus bildet
     erhaltungSteuerlich() seine Summe. Hier nur die Buchungen zu lesen hatte
     den Anhang von der Aufstellung abweichen lassen, sobald eine Sanierung
     als Modernisierung erfasst war. */
  const pruefung = anschaffungsnahePruefung(o);
  const erhaltungPosten = [];
  const aktiviert = [];
  for (const m of pruefung.massnahmen) {
    const mJahr = Number((m.datum || '').slice(0, 4));
    if (!mJahr) continue;
    if (m.aktiviert) {
      /* Aktiviert heisst: nicht sofort abziehbar, sondern über die AfA.
         Das ist keine Werbungskostenposition – aber die Frage „wo sind
         meine 25.000 € geblieben?" beantwortet der Anhang trotzdem, als
         eigener Hinweis ausserhalb der Aufstellung. */
      if (mJahr === jahr) {
        aktiviert.push({
          datum: m.datum, text: m.bezeichnung, betrag: m.betrag,
          zusatz: m.automatisch ? '15-%-Grenze überschritten' : 'von Hand aktiviert',
        });
      }
      continue;
    }
    const verteilen = m.quelle === 'buchung' ? m.eintrag.verteilenJahre : null;
    const jahre = verteilen ? Math.min(5, Math.max(2, verteilen)) : 1;
    if (jahr < mJahr || jahr >= mJahr + jahre) continue;
    erhaltungPosten.push({
      datum: m.datum, text: m.bezeichnung,
      gesamt: m.betrag,
      verteilenJahre: jahre > 1 ? jahre : null,
      jahrVon: mJahr, jahrBis: mJahr + jahre - 1,
      /* `betrag` heisst hier wie ueberall „was in diesem Jahr zaehlt" –
         bei Verteilung also der Jahresanteil, nicht die Rechnungssumme.
         Ein eigener Feldname brach die Darstellung, sobald Posten
         verschiedener Herkunft in derselben Position landeten. */
      betrag: m.betrag / jahre,
      hinweis: jahre > 1 ? `auf ${jahre} Jahre verteilt (§ 82b EStDV)` : null,
    });
  }
  if (erhaltungPosten.length) {
    const label = KATEGORIEN.find((k) => k.key === 'erhaltung').anlageV;
    raus.push({
      label, art: 'erhaltung', posten: erhaltungPosten,
      betrag: -erhaltungPosten.reduce((s, x) => s + x.betrag, 0),
      /* Der Verweis steht immer dabei, auch wenn die Grenze weit entfernt
         ist: Wer die Herleitung liest, soll wissen, dass es sie gibt. */
      grenze: pruefung.grenze ? {
        betrag: pruefung.grenze, verbraucht: pruefung.summe, offen: pruefung.offen,
        bis: pruefung.fensterEnde, aktiv: pruefung.aktiv,
      } : null,
    });
  }
  if (aktiviert.length) {
    /* Kein Posten der Aufstellung – `art: 'hinweis'` sagt das der Ansicht
       und hält die Deckungsprobe sauber. */
    raus.push({
      label: 'Aktivierter Erhaltungsaufwand', art: 'hinweis', posten: aktiviert,
      betrag: 0,
      text: 'In die AfA-Bemessungsgrundlage eingeflossen, nicht sofort abziehbar '
        + '(anschaffungsnahe Herstellungskosten, § 6 Abs. 1 Nr. 1a EStG).',
    });
  }

  /* --- Alle übrigen Werbungskosten: die einzelnen Zahlungen ---
     Gesammelt wird aus derselben Quelle wie jahresSummen(): Monat für
     Monat aus monatszahlungen(), dazu die frei erfassten Buchungen und
     Fahrten. Erhaltungsaufwand bleibt aussen vor, er steht oben mit
     seiner steuerlichen Verteilung. */
  const eimer = new Map();
  const dazu = (key, posten) => {
    const k = KATEGORIEN.find((x) => x.key === key);
    if (!k || !k.steuerlich || !k.anlageV || k.vorzeichen >= 0 || key === 'erhaltung') return;
    if (!eimer.has(k.anlageV)) eimer.set(k.anlageV, []);
    eimer.get(k.anlageV).push(posten);
  };

  // Monatliche, abgeleitete Zahlungen – je Kategorie zusammengefasst
  const proKategorie = new Map();
  for (let monat = 1; monat <= 12; monat++) {
    for (const z of monatszahlungen(o, jahr, monat)) {
      const wert = z.ist ?? z.betrag;
      if (!wert) continue;
      if (!proKategorie.has(z.art)) proKategorie.set(z.art, []);
      proKategorie.get(z.art).push({ monat, betrag: wert, korrigiert: z.korrigiert, text: z.bezugText });
    }
  }
  for (const [art, zeilen] of proKategorie) {
    const betraege = zeilen.map((z) => z.betrag);
    const gleich = betraege.every((b) => Math.abs(b - betraege[0]) < 0.005);
    const summe = betraege.reduce((s, b) => s + b, 0);
    if (gleich && !zeilen.some((z) => z.korrigiert)) {
      // Regelfall: zwölf gleiche Monate – eine Zeile genügt. Die Namen
      // sagen, was dahintersteht (bei Kosten: die Positionen am Objekt).
      const namen = [...new Set(zeilen.map((z) => z.text).filter(Boolean))].join(', ');
      dazu(art, {
        text: `${zeilen.length} × ${betraege[0].toFixed(2).replace('.', ',')} €`,
        zusatz: [namen, monatsSpanne(zeilen)].filter(Boolean).join(' · '),
        betrag: summe,
      });
    } else {
      for (const z of zeilen) {
        dazu(art, {
          text: MONATE[z.monat - 1] + ' ' + jahr,
          zusatz: z.korrigiert ? 'korrigiert' : (z.text || null),
          betrag: z.betrag,
        });
      }
    }
  }

  // Frei erfasste Buchungen und Fahrten
  for (const b of buchungenVon(o.id)) {
    if (b.kategorie === 'erhaltung') continue;
    if (Number((b.datum || '').slice(0, 4)) !== jahr) continue;
    dazu(b.kategorie, {
      text: b.bezeichnung || artInfo(b.kategorie).text,
      /* Das Datum steht als eigenes Feld, nicht im Zusatztext: Formatieren
         ist Sache der Ansicht, dieses Modul kennt util.js nicht. */
      datum: b.datum, betrag: b.betrag || 0, beleg: b.belegNr || null,
    });
  }
  for (const f of fahrtenVon(o.id)) {
    if (Number((f.datum || '').slice(0, 4)) !== jahr) continue;
    const e = state.daten.einstellungen;
    const satz = e.fahrtModus === 'pendler' ? (e.fahrtSatzPendler ?? 0.38) : (e.fahrtSatzReise ?? 0.30);
    const mal = e.fahrtModus === 'pendler' ? 1 : (f.hinRueck === false ? 1 : 2);
    dazu('fahrtkosten', {
      text: f.anlass || 'Fahrt',
      datum: f.datum,
      zusatz: `${f.km || 0} km × ${satz.toFixed(2).replace('.', ',')} €`
        + (mal === 2 ? ' × 2 (hin und zurück)' : ''),
      betrag: fahrtBetrag(f, e),
    });
  }

  for (const [label, posten] of eimer) {
    raus.push({
      label, art: 'posten', posten,
      betrag: -posten.reduce((s, x) => s + x.betrag, 0),
    });
  }

  /* Gleiche Anlage-V-Position, mehrere Quellen: Erhaltungsaufwand entsteht
     aus freien Buchungen *und* aus der monatlichen Instandhaltungsrücklage,
     beide tragen dasselbe Etikett. Ohne Zusammenfassung stünde die Position
     zweimal im Anhang – die Summe stimmte, der Ausdruck wäre trotzdem
     falsch zu lesen. */
  const zusammen = [];
  for (const pos of raus) {
    const da = pos.art === 'hinweis' ? null : zusammen.find((x) => x.label === pos.label && x.art !== 'hinweis');
    if (!da) { zusammen.push(pos); continue; }
    da.betrag += pos.betrag;
    da.posten = [...(da.posten || []), ...(pos.posten || [])];
    // Die AfA-Rechnung bleibt erhalten, falls sie den Erstplatz hatte.
    if (pos.rechnung && !da.rechnung) da.rechnung = pos.rechnung;
  }

  zusammen.sort((x, y) => {
    // Hinweise ans Ende, sie gehören nicht zur Summe.
    if ((x.art === 'hinweis') !== (y.art === 'hinweis')) return x.art === 'hinweis' ? 1 : -1;
    return x.label.localeCompare(y.label);
  });
  return zusammen;
}

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** „Jan–Dez" bzw. „Okt–Dez" – die Spanne, über die eine Zeile läuft. */
function monatsSpanne(zeilen) {
  if (!zeilen.length) return null;
  const von = Math.min(...zeilen.map((z) => z.monat));
  const bis = Math.max(...zeilen.map((z) => z.monat));
  return von === bis ? MONATE[von - 1] : `${MONATE[von - 1]}–${MONATE[bis - 1]}`;
}

export function anlageVAufstellung(o, jahr) {
  const ist = jahresSummen(o.id, jahr);
  const afaJahr = afaGebaeudeImJahr(o, jahr);
  const afaInventar = afaInventarImJahr(o, jahr);
  const geldbeschaffung = sofortAbziehbar(o, jahr);

  const bucket = new Map();
  for (const k of KATEGORIEN) {
    if (!k.steuerlich || !k.anlageV) continue;
    const betrag = (ist[k.key] || 0) * k.vorzeichen;
    if (!betrag) continue;
    bucket.set(k.anlageV, (bucket.get(k.anlageV) || 0) + betrag);
  }
  /* Erhaltungsaufwand mit der steuerlichen statt der Cashflow-Verteilung
     **ersetzen** – § 82b EStDV und aktivierte Buchungen wirken hier, nicht
     in jahresSummen().

     Die Schleife oben hat den Zahlungsbetrag bereits als -erhaltungCash in
     den Eimer gelegt. Er wird deshalb wieder hinzugerechnet und erst dann
     durch den steuerlichen Betrag ersetzt. Ihn stattdessen ein zweites Mal
     abzuziehen verdoppelte jede im laufenden Jahr gebuchte Reparatur. */
  const erhaltungLabel = KATEGORIEN.find((k) => k.key === 'erhaltung').anlageV;
  const erhaltungCash = (ist.erhaltung || 0);
  const erhaltungSteuer = erhaltungSteuerlich(o.id, jahr);
  const ohneErhaltung = (bucket.get(erhaltungLabel) || 0) + erhaltungCash;
  if (erhaltungSteuer || ohneErhaltung) bucket.set(erhaltungLabel, ohneErhaltung - erhaltungSteuer);
  else bucket.delete(erhaltungLabel);

  const einnahmen = [];
  const werbungskosten = [{ label: 'Werbungskosten: AfA', betrag: -afaJahr }];
  if (afaInventar) werbungskosten.push({ label: LABEL_INVENTAR, betrag: -afaInventar });
  if (geldbeschaffung) werbungskosten.push({ label: LABEL_GELDBESCHAFFUNG, betrag: -geldbeschaffung });
  for (const [label, betrag] of bucket) {
    (betrag >= 0 ? einnahmen : werbungskosten).push({ label, betrag });
  }
  einnahmen.sort((x, y) => x.label.localeCompare(y.label));
  werbungskosten.sort((x, y) => x.label.localeCompare(y.label));

  const summeEinnahmen = einnahmen.reduce((s, x) => s + x.betrag, 0);
  const summeWerbungskosten = werbungskosten.reduce((s, x) => s + x.betrag, 0);
  return {
    objekt: o, jahr, einnahmen, werbungskosten,
    summeEinnahmen, summeWerbungskosten,
    einkuenfte: summeEinnahmen + summeWerbungskosten,
  };
}

/** Dieselbe Aufstellung über alle Objekte, Zeilen gleichen Labels summiert. */
export function anlageVPortfolio(jahr) {
  const einzel = state.daten.objekte.map((o) => anlageVAufstellung(o, jahr));
  const zusammenfassen = (feld) => {
    const bucket = new Map();
    for (const a of einzel) {
      for (const { label, betrag } of a[feld]) bucket.set(label, (bucket.get(label) || 0) + betrag);
    }
    return [...bucket.entries()]
      .map(([label, betrag]) => ({ label, betrag }))
      .sort((x, y) => x.label.localeCompare(y.label));
  };
  const einnahmen = zusammenfassen('einnahmen');
  const werbungskosten = zusammenfassen('werbungskosten');
  const summeEinnahmen = einnahmen.reduce((s, x) => s + x.betrag, 0);
  const summeWerbungskosten = werbungskosten.reduce((s, x) => s + x.betrag, 0);
  return {
    jahr, objekte: einzel, einnahmen, werbungskosten,
    summeEinnahmen, summeWerbungskosten,
    einkuenfte: summeEinnahmen + summeWerbungskosten,
  };
}
