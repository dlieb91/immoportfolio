/* Mieterhöhungs-Schreiben – der Text, nicht seine Darstellung.
   Reine Funktionen, keine Oberfläche.

   Die Rechnung steht in mieterhoehung.js. Dieses Modul **formuliert** nur:
   Beträge und Fristen kommen unverändert aus mieterhoehungsPotenzial(),
   indexAnpassung() und den Konditionen des Vertrags. Eine zweite Rechnung
   hier ergäbe ein Schreiben, das von der Karte daneben abweicht.

   Drei Arten, rechtlich völlig verschieden:

     verlangen  § 558 BGB, Zustimmungsverlangen. Braucht Textform (§ 558a
                Abs. 1) und eine **Begründung** (hier: der Mietspiegel). Der
                Mieter muss zustimmen; bis zum Ablauf des zweiten Kalender-
                monats nach Zugang hat er Zeit (§ 558b Abs. 2), die erhöhte
                Miete gilt ab dem dritten (§ 558b Abs. 1).
     index      § 557b BGB, Erklärung. Wirkt **ohne Zustimmung**, aber nur in
                Textform und nur, wenn die Indexänderung und die Miete als
                Geldbetrag darin stehen (Abs. 3 S. 2). Gilt ab dem übernächsten
                Monat nach Zugang (Abs. 3 S. 3).
     staffel    § 557a BGB. Die Staffel wirkt kraft Vertrag, eine Erklärung ist
                **rechtlich nicht nötig**. Es entsteht eine Ankündigung als
                Höflichkeit – und der Text sagt, dass sie keine ist.

   Fristen werden vom Briefdatum gerechnet. Entscheidend ist der Zugang; wer
   erst im Folgemonat ankommt, verschiebt alles um einen Monat. Das steht in
   den Hinweisen, nicht im Brief.

   Ergebnis ist immer ein Objekt, nie ein Fehler:
     fehlt   – Angaben, ohne die es keinen Brief gibt (Absender, Mietspiegelwert)
     offen   – der Brief steht, ist aber noch nicht versandfertig (eine Lücke,
               ein zu früher Termin)
     bereit  – weder noch
*/

import { eur, num, datum, heuteISO } from './util.js';
import { state, objektVonEinheit, einheitMit, einheitName } from './store.js';
import { mieterhoehungsPotenzial, indexAnpassung } from './mieterhoehung.js';

const pad = (n) => String(n).padStart(2, '0');

/** Erster Tag des Monats, `plus` Monate nach dem des Datums. */
function monatErster(iso, plus = 0) {
  const [j, m] = iso.split('-').map(Number);
  const z = j * 12 + (m - 1) + plus;
  return `${Math.floor(z / 12)}-${pad((z % 12) + 1)}-01`;
}

/** Letzter Tag des Monats, `plus` Monate nach dem des Datums. */
function monatLetzter(iso, plus = 0) {
  const e = monatErster(iso, plus + 1);
  const d = new Date(Number(e.slice(0, 4)), Number(e.slice(5, 7)) - 1, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Das Datum selbst, wenn es ein Monatserster ist, sonst der nächste. */
const ersterAb = (iso) => (iso.slice(8, 10) === '01' ? iso : monatErster(iso, 1));

const zeilen = (text) => String(text || '').split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
const rund2 = (v) => Math.round(v * 100) / 100;
const abgerundet2 = (v) => Math.floor(v * 100 + 1e-9) / 100;

/** Absender aus den Einstellungen – ohne ihn gibt es keinen Brief. */
function absenderVon(e) {
  const name = (e.vermieterName || '').trim();
  const anschrift = zeilen(e.vermieterAnschrift);
  return { name, anschrift, vollstaendig: !!name && anschrift.length > 0 };
}

/** Empfänger: der Mieter an der Anschrift des Objekts, mit der Einheit. */
function empfaengerVon(mv) {
  const einheit = einheitMit(mv.einheitId);
  const o = objektVonEinheit(mv.einheitId);
  const zeilenListe = [(mv.mieter || '').trim() || 'Mieterin / Mieter'];
  if (einheit && !einheit.implizit && einheit.bezeichnung) {
    zeilenListe.push(einheit.bezeichnung + (einheit.lage ? ' (' + einheit.lage + ')' : ''));
  }
  if (o?.strasse) zeilenListe.push(o.strasse);
  const ortZeile = [o?.plz, o?.ort].filter(Boolean).join(' ');
  if (ortZeile) zeilenListe.push(ortZeile);
  return {
    zeilen: zeilenListe,
    wohnung: [einheit && !einheit.implizit ? einheit.bezeichnung : '', o?.strasse, ortZeile]
      .filter(Boolean).join(', ') || einheitName(einheit),
    vollstaendig: !!(o?.strasse && (o?.ort || o?.plz)),
  };
}

const anredeFuer = (mv) => ((mv.mieter || '').trim() ? `Guten Tag ${mv.mieter.trim()},` : 'Guten Tag,');

const HINWEIS_ZUGANG = 'Entscheidend ist der Zugang beim Mieter, nicht das Briefdatum. Die Fristen sind hier '
  + 'vom Briefdatum gerechnet; kommt das Schreiben erst im nächsten Kalendermonat an, verschieben sie sich um '
  + 'einen Monat. Wer den Zugang beweisen muss, übergibt persönlich gegen Quittung oder lässt einen Einwurf '
  + 'dokumentieren.';

const HINWEIS_TEXTFORM = 'Textform genügt: ein Brief, eine E-Mail oder ein PDF. Die Person des Erklärenden muss '
  + 'erkennbar sein; eine Unterschrift ist nicht vorgeschrieben, aber üblich.';

const HINWEIS_RECHT = 'Ein Textbaustein, keine Rechtsberatung. Ob die Voraussetzungen im Einzelfall vorliegen, '
  + 'prüft die App nicht – im Zweifel fragt man den Mieterverein, Haus & Grund oder eine Anwältin.';

/**
 * @param mv    der Mietvertrag
 * @param art   'verlangen' | 'index' | 'staffel'
 * @param opt   datum        Briefdatum (YYYY-MM-DD), Vorgabe heute
 *              fundstelle   § 558: woraus die Vergleichsmiete stammt
 *              neueMiete    § 558: gewünschte Miete, Vorgabe die Obergrenze
 *              neuerStand   § 557b: aktueller Indexstand
 *              indexMonat   § 557b: Monat, auf den sich der Stand bezieht
 */
export function schreibenErstellen(mv, art, opt = {}) {
  const e = state.daten.einstellungen;
  const briefDatum = opt.datum || heuteISO();
  const absender = absenderVon(e);
  const empfaenger = empfaengerVon(mv);

  const erg = {
    art, bereit: false, fehlt: [], offen: [], hinweise: [HINWEIS_RECHT], brief: null,
    datum: briefDatum,
  };

  if (!absender.vollstaendig) {
    erg.fehlt.push('Dein Name und deine Anschrift als Absender – unter Einstellungen → Vermieter eintragen.');
  }
  if (!empfaenger.vollstaendig) {
    erg.offen.push('Die Anschrift des Objekts (Straße, PLZ, Ort) fehlt – der Brief hätte keine Empfängeradresse.');
  }

  const rumpf = {
    absender: [absender.name, ...absender.anschrift],
    empfaenger: empfaenger.zeilen,
    datum: briefDatum,
    anrede: anredeFuer(mv),
    gruss: 'Mit freundlichen Grüßen',
    unterschrift: absender.name,
  };

  if (art === 'verlangen') verlangen(mv, opt, briefDatum, empfaenger, rumpf, erg);
  else if (art === 'index') index(mv, opt, briefDatum, empfaenger, rumpf, erg);
  else if (art === 'staffel') staffel(mv, briefDatum, empfaenger, rumpf, erg);
  else erg.fehlt.push('Unbekannte Art des Schreibens: ' + art);

  /* Fehlt eine Pflichtangabe, gibt es keinen Brief – nur den Hinweis, was fehlt.
     Ein Brief ohne Absender oder ohne Vergleichsmiete sähe fertig aus und wäre
     es nicht. „Offen“ ist milder: Der Brief steht, ist aber nicht versandfertig. */
  if (erg.fehlt.length) erg.brief = null;
  erg.bereit = erg.fehlt.length === 0 && erg.offen.length === 0;
  return erg;
}

/* ---------- § 558 BGB: Zustimmungsverlangen ---------- */

function verlangen(mv, opt, briefDatum, empfaenger, rumpf, erg) {
  const p = mieterhoehungsPotenzial(mv, briefDatum);

  if (!p.moeglich && p.grund) { erg.fehlt.push(p.grund); return; }
  if (p.grenzeVergleich == null) {
    erg.fehlt.push('Die ortsübliche Vergleichsmiete der Einheit oder ihre Wohnfläche fehlt (€/m² aus dem '
      + 'Mietspiegel). Ohne sie ist die Obergrenze offen – ein Verlangen braucht aber genau diese Begründung '
      + '(§ 558a BGB).');
    return;
  }

  const alt = p.aktuell;

  /* Nach der Regel gilt die erhöhte Miete ab dem Ersten des dritten
     Kalendermonats nach Zugang. Liegt das vor Ablauf der 15-Monats-Frist,
     schiebt sich der Termin auf den nächsten Ersten danach. */
  const regel = monatErster(briefDatum, 3);
  const fruehestens = ersterAb(datumIso(p.wirksamAb));
  const wirksam = regel < fruehestens ? fruehestens : regel;
  const zustimmungBis = monatLetzter(briefDatum, 2);

  /* Bezugsmiete der Kappungsgrenze: die Miete drei Jahre vor dem **tatsächlichen**
     Wirksamwerden dieses Schreibens. mieterhoehungsPotenzial() rechnet mit dem
     frühestmöglichen Termin – hat sich die Miete dazwischen geändert, nennte der
     Brief sonst eine Bezugsmiete, die nicht zu seinem Datum gehört. */
  const dreiJahreVor = `${Number(wirksam.slice(0, 4)) - 3}${wirksam.slice(4)}`;
  const basisDreiJahre = kondAm(mv, dreiJahreVor)?.kaltmiete || alt;
  const grenzeKappung = basisDreiJahre * (1 + p.kappungsgrenze / 100);
  const grenze = Math.min(grenzeKappung, p.grenzeVergleich);
  const begrenztDurch = p.grenzeVergleich < grenzeKappung ? 'vergleichsmiete' : 'kappung';

  const neu = opt.neueMiete != null ? opt.neueMiete : abgerundet2(grenze);
  if (neu <= alt + 0.004) {
    erg.fehlt.push('Die gewünschte Miete liegt nicht über der heutigen – es gäbe nichts zu verlangen.');
    return;
  }
  if (neu > grenze + 0.004) {
    erg.offen.push(`Die gewünschte Miete (${eur(neu)}) liegt über der zulässigen Obergrenze von ${eur(grenze)} `
      + `(${begrenztDurch === 'vergleichsmiete' ? 'ortsübliche Vergleichsmiete' : 'Kappungsgrenze'}).`);
  }

  // Frühestens ein Jahr nach der letzten Erhöhung – ein früheres Verlangen ist unwirksam.
  const frueh = datumIso(p.verlangenAb);
  if (briefDatum < frueh) {
    erg.offen.push(`Zu früh: Ein Mieterhöhungsverlangen ist frühestens ein Jahr nach der letzten Mietänderung `
      + `zulässig, also ab dem ${datum(frueh)} (§ 558 Abs. 1 Satz 2 BGB).`);
  }

  if (!opt.fundstelle || !String(opt.fundstelle).trim()) {
    erg.offen.push('Die Fundstelle des Mietspiegels fehlt – ohne Begründung ist das Verlangen unwirksam (§ 558a Abs. 1 BGB).');
  }
  const fundstelle = (opt.fundstelle || '').trim() || '[Fundstelle des Mietspiegels]';

  const diff = rund2(neu - alt);
  const prozent = alt ? (neu / alt - 1) * 100 : 0;
  const nk = aktuelleNk(mv, briefDatum);

  const absaetze = [
    { text: `für Ihre Wohnung (${empfaenger.wohnung}) beträgt die Kaltmiete derzeit ${eur(alt)} monatlich. `
      + `Hiermit bitte ich Sie nach § 558 BGB, einer Erhöhung der Kaltmiete auf ${eur(neu)} monatlich zuzustimmen.` },
    { zeilen: [
      ['Bisherige Kaltmiete', eur(alt)],
      ['Neue Kaltmiete', eur(neu), true],
      ['Erhöhung', `${eur(diff)} (${num(prozent, 1)} %)`],
      ...(nk ? [['Betriebskostenvorauszahlung', `${eur(nk)} (unverändert)`]] : []),
    ] },
    { titel: 'Begründung' },
    { text: `Die Kaltmiete gilt unverändert seit dem ${datum(p.letzteAenderung)}. Die Wartefrist von 15 Monaten `
      + 'nach § 558 Abs. 1 Satz 1 BGB ist zum Zeitpunkt des Wirksamwerdens abgelaufen, und seit der letzten '
      + 'Erhöhung ist mehr als ein Jahr vergangen (Satz 2).' },
    { text: `Die ortsübliche Vergleichsmiete beträgt nach ${fundstelle} ${num(p.vergleichsmieteQm, 2)} € je `
      + `Quadratmeter monatlich. Bei ${num(p.flaeche, 2)} m² Wohnfläche ergibt das ${eur(p.grenzeVergleich)}. `
      + 'Die verlangte Kaltmiete liegt nicht darüber.' },
    { text: `Die Kappungsgrenze von ${num(p.kappungsgrenze, 0)} % nach § 558 Abs. 3 BGB ist eingehalten: `
      + `Am ${datum(dreiJahreVor)}, drei Jahre vor dem Wirksamwerden der Erhöhung, betrug die Kaltmiete `
      + `${eur(basisDreiJahre)}; zulässig wären danach bis zu ${eur(grenzeKappung)}.` },
    { titel: 'Zustimmung und Frist' },
    { text: 'Bitte stimmen Sie der Erhöhung bis zum Ablauf des zweiten Kalendermonats nach Zugang dieses '
      + `Schreibens zu (bei Zugang in diesem Monat: bis zum ${datum(zustimmungBis)}). Dann schulden Sie die `
      + (wirksam === regel
        ? `erhöhte Miete mit Beginn des dritten Kalendermonats nach Zugang (§ 558b Abs. 1 BGB), bei Zugang `
          + `in diesem Monat also ab dem ${datum(wirksam)}.`
        : `erhöhte Miete ab dem ${datum(wirksam)} (§ 558b Abs. 1 BGB).`) },
    { text: 'Die Zustimmung ist formfrei möglich; eine kurze Antwort oder die beigefügte Seite genügt.' },
  ];

  erg.brief = {
    ...rumpf,
    betreff: `Mieterhöhungsverlangen nach § 558 BGB – ${empfaenger.wohnung}`,
    absaetze,
    zustimmung: {
      text: `Ich stimme der Erhöhung der Kaltmiete für die Wohnung (${empfaenger.wohnung}) auf ${eur(neu)} `
        + `monatlich ab dem ${datum(wirksam)} zu.`,
      unterschriftMieter: (mv.mieter || '').trim() || 'Mieterin / Mieter',
    },
  };

  // Für die Ansicht: der Rahmen, in dem die gewünschte Miete wählbar ist.
  erg.rahmen = { alt, grenze: abgerundet2(grenze), begrenztDurch };

  erg.hinweise.push(
    HINWEIS_TEXTFORM,
    HINWEIS_ZUGANG,
    'Das Verlangen braucht eine Begründung (§ 558a Abs. 2 BGB). Hier ist es der Mietspiegel: Nenne die Fundstelle '
      + 'genau – Gemeinde, Stand und das Feld, in das die Wohnung fällt. Die App prüft nicht, ob der Mietspiegel '
      + 'zur Wohnung passt (Baujahr, Ausstattung, Lage).',
    `Stimmt der Mieter bis zum ${datum(zustimmungBis)} nicht zu, kann auf Zustimmung geklagt werden – innerhalb von `
      + 'drei weiteren Monaten (§ 558b Abs. 2 BGB).',
    'Die Kappungsgrenze rechnet nur die Mieten dieses Vertrags. Erhöhungen nach §§ 559, 560 BGB (Modernisierung, '
      + 'Betriebskosten) bleiben bei ihr außer Betracht – das berücksichtigt die App nicht.'
  );
}

/* ---------- § 557b BGB: Indexerklärung ---------- */

function index(mv, opt, briefDatum, empfaenger, rumpf, erg) {
  const r = indexAnpassung(mv, opt.neuerStand ?? null, briefDatum);

  if (r.neueMiete == null || !r.moeglich) {
    erg.fehlt.push(r.grund || 'Für diese Indexanpassung fehlen Angaben.');
    return;
  }

  const wirksam = monatErster(briefDatum, 2);
  const prozent = r.veraenderungProzent;
  const stand = (opt.indexMonat || '').trim();
  const diff = rund2(r.neueMiete - r.alteMiete);
  const nk = aktuelleNk(mv, briefDatum);

  erg.brief = {
    ...rumpf,
    betreff: `Anpassung der Indexmiete nach § 557b BGB – ${empfaenger.wohnung}`,
    absaetze: [
      { text: `für Ihre Wohnung (${empfaenger.wohnung}) ist im Mietvertrag eine Indexmiete nach § 557b BGB `
        + 'vereinbart. Sie richtet sich nach dem vom Statistischen Bundesamt ermittelten Verbraucherpreisindex '
        + 'für Deutschland.' },
      { text: `Der Index stand bei der letzten Festlegung der Miete${r.basisDatum ? ' (' + datum(r.basisDatum) + ')' : ''} `
        + `bei ${num(r.basisStand, 1)} Punkten. Aktuell${stand ? ' (' + stand + ')' : ''} steht er bei `
        + `${num(r.neuerStand, 1)} Punkten. Er hat sich damit um ${num(prozent, 2)} % verändert.` },
      { zeilen: [
        ['Bisherige Kaltmiete', eur(r.alteMiete)],
        ['Neue Kaltmiete', eur(r.neueMiete), true],
        ['Erhöhung', eur(diff)],
        ...(nk ? [['Betriebskostenvorauszahlung', `${eur(nk)} (unverändert)`]] : []),
      ] },
      { text: 'Nach § 557b Abs. 3 BGB schulden Sie die neue Miete mit Beginn des übernächsten Monats nach '
        + `Zugang dieser Erklärung, bei Zugang in diesem Monat also ab dem ${datum(wirksam)}. Eine Zustimmung `
        + 'ist nicht erforderlich.' },
      { text: 'Bitte passen Sie Ihren Dauerauftrag rechtzeitig an.' },
    ],
    zustimmung: null,
  };

  erg.hinweise.push(
    HINWEIS_TEXTFORM + ' Ohne die Erklärung bleibt die alte Miete geschuldet.',
    HINWEIS_ZUGANG,
    'Erst das Schreiben, dann eintragen: „Als Mietanpassung eintragen“ setzt den Basis-Indexstand auf den neuen '
      + 'Wert – danach lässt sich dieses Schreiben nicht mehr mit dem alten Stand erzeugen.',
    'Die Erklärung muss die Indexänderung und die Miete als Geldbetrag nennen (§ 557b Abs. 3 Satz 2 BGB) – beides '
      + 'steht im Brief. Den Monat des Indexstands trägst du oben ein; er macht die Angabe nachprüfbar.'
  );
  if (!stand) {
    erg.hinweise.push('Der Monat des aktuellen Indexstands fehlt noch. Er ist keine Voraussetzung, aber ohne ihn '
      + 'kann der Mieter die Zahl nicht nachschlagen.');
  }
}

/* ---------- § 557a BGB: Ankündigung der Staffel ---------- */

function staffel(mv, briefDatum, empfaenger, rumpf, erg) {
  const kommend = (mv.konditionen || [])
    .filter((k) => k.gueltigAb > briefDatum)
    .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb))[0];
  if (!kommend) {
    erg.fehlt.push('Es ist keine weitere Staffel hinterlegt, die sich ankündigen ließe.');
    return;
  }
  const alt = kondAm(mv, briefDatum)?.kaltmiete || 0;
  const neu = kommend.kaltmiete || 0;

  erg.brief = {
    ...rumpf,
    betreff: `Ankündigung der Staffelmiete zum ${datum(kommend.gueltigAb)} – ${empfaenger.wohnung}`,
    absaetze: [
      { text: `für Ihre Wohnung (${empfaenger.wohnung}) ist im Mietvertrag eine Staffelmiete nach § 557a BGB `
        + `vereinbart. Zum ${datum(kommend.gueltigAb)} erhöht sich die Kaltmiete entsprechend dieser Vereinbarung.` },
      { zeilen: [
        ['Bisherige Kaltmiete', eur(alt)],
        ['Kaltmiete ab ' + datum(kommend.gueltigAb), eur(neu), true],
        ['Erhöhung', eur(rund2(neu - alt))],
      ] },
      { text: 'Die Erhöhung ergibt sich unmittelbar aus dem Mietvertrag; eine Zustimmung oder weitere Erklärung '
        + 'von Ihnen ist nicht erforderlich. Ich möchte Sie nur rechtzeitig informieren, damit Sie Ihren '
        + 'Dauerauftrag anpassen können.' },
    ],
    zustimmung: null,
  };

  erg.hinweise.push(
    'Rechtlich nicht nötig: Die Staffel wirkt von selbst, eine Erklärung ist keine Voraussetzung. Der Brief ist '
      + 'eine Freundlichkeit – er verhindert, dass der Dauerauftrag auf den alten Betrag weiterläuft und ein '
      + 'Rückstand entsteht, den keiner gewollt hat.',
    HINWEIS_TEXTFORM
  );
}

/* ---------- Hilfen ---------- */

/** Die an einem Tag geltende Kondition: die jüngste, die schon gilt. */
function kondAm(mv, stichtag) {
  return (mv.konditionen || [])
    .filter((x) => x.gueltigAb <= stichtag)
    .sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))[0];
}

/** Betriebskostenvorauszahlung zum Stichtag, falls hinterlegt. */
const aktuelleNk = (mv, stichtag) => kondAm(mv, stichtag)?.nkVorauszahlung || 0;

/** Date oder ISO-String als YYYY-MM-DD, ohne Zeitzonenversatz. */
function datumIso(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
