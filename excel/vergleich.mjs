/* Rechnet dasselbe Musterportfolio durch die Mappe UND durch die
   Rechenmodule der App und vergleicht Zahl fuer Zahl.

   Das ist der eigentliche Nachweis. Struktur- und Funktionspruefung sagen
   nur, dass die Datei gueltig ist – ob sie richtig rechnet, zeigt erst der
   Abgleich mit der App. Weicht eine Zahl ab, ist die Mappe falsch.

   Die Mappe wird dabei nicht von einer eigenen Formelmaschine ausgewertet,
   sondern von LibreOffice durchgerechnet. Sonst wuerde der Vergleich nur
   beweisen, dass zwei eigene Programme dasselbe denken.

   Aufruf:
     node excel/vergleich.mjs [--behalten]
*/

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mappeSchreiben }
  from '../../../skills/zahlenkompass-tabelle/werkzeug/xlsx.mjs';
import { durchrechnen, csvLesen }
  from '../../../skills/zahlenkompass-tabelle/werkzeug/pruefe-mappe.mjs';

import { mappe, RASTER } from './immoportfolio.mjs';
import * as MUSTER from './muster.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const ARBEIT = process.env.SCRATCH
  ? join(process.env.SCRATCH, 'vergleich')
  : join(HIER, '..', '.vergleich');

const TOLERANZ = 0.01;   // ein Cent

/* ---------- Zahlen aus dem CSV ----------
   LibreOffice schreibt „wie angezeigt" in der Systemsprache: Dezimalkomma,
   Prozentzeichen, Gedankenstrich fuer die Null. Das wird hier wieder zu
   einer Zahl. Gruppentrennzeichen kommen in den ungeformten Rechenblaettern
   nicht vor – deshalb wird dort verglichen und nicht auf den Anzeigeblaettern. */
function zahl(text) {
  if (text === undefined || text === null) return 0;
  let s = String(text).trim().replace(/\s|€|%/g, '');
  if (!s || s === '–' || s === '-') return 0;
  /* Deutsche Schreibweise: Punkt gruppiert, Komma trennt die Nachkommastellen. */
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Zahl nicht lesbar: "${text}"`);
  return n;
}

/* ---------- Vergleich ---------- */

const abweichungen = [];
let geprueft = 0;

function gleich(was, ausMappe, ausApp, toleranz = TOLERANZ) {
  geprueft++;
  const diff = Math.abs(ausMappe - ausApp);
  if (!(diff <= toleranz)) abweichungen.push({ was, mappe: ausMappe, app: ausApp, diff });
}

function bericht(titel) {
  const offen = abweichungen.length;
  console.log(`\n${titel}`);
  console.log(`    ${geprueft} Werte verglichen`);
  if (!offen) { console.log('    ok      keine Abweichung über einem Cent'); return; }
  console.log(`    ${offen} Abweichung(en):`);
  for (const a of abweichungen.slice(0, 40)) {
    console.log(`    FEHLER ${a.was}: Mappe ${a.mappe.toFixed(4)} · App ${a.app.toFixed(4)} · Δ ${a.diff.toFixed(4)}`);
  }
  if (offen > 40) console.log(`    … und ${offen - 40} weitere`);
}

/* ========================================================================
   1. Die Mappe erzeugen und von LibreOffice durchrechnen lassen
   ======================================================================== */

mkdirSync(ARBEIT, { recursive: true });
const ziel = join(ARBEIT, 'Muster.xlsx');
const csvOrdner = join(ARBEIT, 'csv');
if (existsSync(csvOrdner)) rmSync(csvOrdner, { recursive: true, force: true });

console.log('1 · Mappe mit dem Musterportfolio erzeugen');
const { blaetter, namen } = mappe(MUSTER.JAHR, MUSTER.fuerMappe());
writeFileSync(ziel, mappeSchreiben({ blaetter, namen }));
console.log(`    ${ziel}`);

console.log('\n2 · Durchrechnung mit LibreOffice');
const dateien = durchrechnen(ziel, csvOrdner);
console.log(`    ${dateien.length} Blätter`);

const blatt = {};
for (const d of dateien) {
  const name = d.replace(/^Muster-/, '').replace(/\.csv$/, '');
  blatt[name] = csvLesen(join(csvOrdner, d));
}
/** Zelle eines Blattes: lies('Tilgung', zeile, spalte) – beides 1-basiert. */
const lies = (name, zeile, spalte) => zahl(blatt[name]?.[zeile - 1]?.[spalte - 1]);

/* ========================================================================
   2. Dieselben Daten durch die Rechenmodule der App
   ======================================================================== */

globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const store = await import('../js/store.js');
const kennzahlen = await import('../js/kennzahlen.js');
const finanz = await import('../js/finanzmathematik.js');
const zahlungen = await import('../js/zahlungen.js');
const forecast = await import('../js/forecast.js');

store.laden(MUSTER.fuerApp());
const daten = store.state.daten;
const STICHTAG = MUSTER.STICHTAG;
const JAHR = MUSTER.JAHR;

console.log('\n3 · Vergleich');

/* ---------- 3.1 Tilgungsplaene, Monat fuer Monat ---------- */

const { T, T_ERSTE, tZeile, MONATE, DARLEHEN } = RASTER;

daten.finanzierungen.forEach((fin, d) => {
  const plan = finanz.tilgungsplan(fin, daten.einstellungen.anschlusszins);
  for (let i = 0; i < MONATE; i++) {
    const r = tZeile(d, i);
    const m = plan.monate[i];
    const wo = `Tilgung ${fin.bank} Monat ${i + 1}`;
    if (!m) {
      /* Nach dem Ende des Plans muss die Mappe Nullen liefern */
      gleich(`${wo} (nach Planende) aktiv`, lies('Tilgung', r, T.aktiv), 0);
      gleich(`${wo} (nach Planende) Restschuld`, lies('Tilgung', r, T.restEnde), 0);
      continue;
    }
    gleich(`${wo} Zins`, lies('Tilgung', r, T.zins), m.zins);
    gleich(`${wo} Tilgung`, lies('Tilgung', r, T.tilgung), m.tilgung);
    gleich(`${wo} Sondertilgung`, lies('Tilgung', r, T.sonder), m.sondertilgung);
    gleich(`${wo} Tilgungsersatz`, lies('Tilgung', r, T.ersatzRate), m.tilgungsersatz);
    gleich(`${wo} Guthaben`, lies('Tilgung', r, T.guthaben), m.ersatzGuthaben);
    gleich(`${wo} Restschuld Ende`, lies('Tilgung', r, T.restEnde), m.restschuldEnde);
  }
});
/* Nicht belegte Darlehenszeilen bleiben leer */
for (let d = daten.finanzierungen.length; d < DARLEHEN; d++) {
  gleich(`Tilgung leere Zeile ${d + 1}`, lies('Tilgung', tZeile(d, 0), T.restEnde), 0);
}
bericht('3.1 Tilgungspläne, Monat für Monat');
const nachTilgung = abweichungen.length;

/* ---------- 3.2 Abgeleitete Monatszahlungen ---------- */

const { Z, zZeile, ARTEN } = RASTER;
const ARTEN_KEYS = ['miete', 'nebenkosten', 'hausgeld', 'verwaltung', 'instandhaltung',
  'sonstige', 'zins', 'tilgung', 'sondertilgung', 'tilgungsersatz'];

daten.objekte.forEach((o, oi) => {
  for (let monat = 1; monat <= 12; monat++) {
    const liste = zahlungen.monatszahlungen(o, JAHR, monat);
    ARTEN_KEYS.forEach((art, ai) => {
      const erwartetStandard = liste.filter((x) => x.art === art)
        .reduce((s, x) => s + x.standard, 0);
      const erwartetIst = liste.filter((x) => x.art === art)
        .reduce((s, x) => s + x.betrag, 0);
      const r = zZeile(oi, ai);
      gleich(`Zahlung Soll ${o.bezeichnung} ${art} ${monat}`,
        lies('Zahlungen', r, Z.soll + monat - 1), erwartetStandard);
      /* Die Ist-Spalten tragen ein Waehrungsformat; ihr Wert wird ueber die
         Jahressummen der Ist-Kennzahlen geprueft (3.4). */
      void erwartetIst;
    });
  }
});
bericht('3.2 Abgeleitete Monatszahlungen (vor Korrekturen)');
const nachZahlungen = abweichungen.length;

/* ---------- 3.3 Mietlauf: projizierte Miete je Vertrag und Jahr ---------- */

const { ML, mlErste, JAHRZEILEN } = RASTER;
const params = forecast.szenarioParameter(forecast.basisParameter(), 'basis');

daten.mietvertraege.forEach((mv, v) => {
  for (let t = 0; t < JAHRZEILEN; t++) {
    const jahr = JAHR + t;
    const r = mlErste(v) + t;
    /* Dieselbe Rechnung wie projizierteMiete(), aber je Vertrag statt je Objekt */
    let erwartet = 0;
    for (let m = 1; m <= 12; m++) {
      const tag = `${jahr}-${String(m).padStart(2, '0')}-15`;
      if (store.vertragStatus(mv, tag) !== 'aktiv') continue;
      const kond = store.aktuelleKondition(mv, tag);
      if (!kond?.kaltmiete) continue;
      const satz = (mv.anpassungTyp === 'index' && mv.indexProzent != null)
        ? mv.indexProzent : params.mietsteigerung;
      const konditionsJahr = Number(String(kond.gueltigAb).slice(0, 4));
      const ab = Math.max(konditionsJahr, JAHR);
      erwartet += kond.kaltmiete * Math.pow(1 + satz / 100, Math.max(0, jahr - ab));
    }
    gleich(`Mietlauf ${mv.mieter} ${jahr}`, lies('Kern', r, ML.summe), erwartet);
  }
});
bericht('3.3 Mietlauf (projizierte Miete je Vertrag)');
const nachMietlauf = abweichungen.length;

/* ---------- 3.4 Ist-Kennzahlen je Objekt zum Stichtag ---------- */

const { I, IST_ERSTE } = RASTER;
const KENNZAHLEN = [
  ['invest', 'investition'], ['nkSumme', 'nebenkosten'], ['wert', 'verkehrswert'],
  ['flaeche', 'flaeche'], ['mieteMonat', 'kaltmieteMonat'], ['runrate', 'kaltmieteRunrate'],
  ['nkMonat', 'nkMonat'], ['einheiten', 'einheiten'], ['vermietet', 'vermietet'],
  ['leerstand', 'leerstand'], ['bewirtVoll', 'bewirtschaftungVoll'],
  ['darlehen', 'darlehenssumme'], ['rest', 'restschuld'],
  ['zins12', 'zins12'], ['tilgung12', 'tilgung12'], ['sonder12', 'sondertilgung12'],
  ['ersatz12', 'tilgungsersatz12'], ['kapital12', 'kapitaldienst12'], ['rateMonat', 'rateMonat'],
  ['istMiete', null], ['istBewirt', 'bewirtschaftung'], ['istZins', 'zins'],
  ['istTilgung', 'tilgung'], ['istSonder', 'sondertilgung'], ['istErsatz', 'tilgungsersatz'],
  ['istKapital', 'kapitaldienst'],
  ['afaJahr', 'afaJahr'], ['afaVoll', 'afaVoll'], ['werbung', 'werbungskosten'],
  ['einkuenfte', 'einkuenfte'], ['steuersatz', 'steuersatz'], ['steuer', 'steuer'],
  ['cfVor', 'cashflowVorSteuer'], ['cfNach', 'cashflowNachSteuer'],
  ['cfRunrate', 'cashflowRunrate'], ['einkRunrate', 'einkuenfteRunrate'],
  ['steuerRunrate', 'steuerRunrate'], ['cfRunrateNach', 'cashflowRunrateNachSteuer'],
  ['ekEingesetzt', 'eigenkapitalEingesetzt'], ['ek', 'eigenkapital'], ['getilgt', 'getilgt'],
  ['ersatzEin', 'ersatzEingezahlt'], ['ersatzGut', 'ersatzGuthaben'],
];

daten.objekte.forEach((o, oi) => {
  const k = kennzahlen.objektKennzahlen(o, STICHTAG);
  const jahres = zahlungen.jahresSummen(o.id, JAHR);
  const r = IST_ERSTE + oi;
  for (const [spalte, feld] of KENNZAHLEN) {
    const erwartet = feld === null ? jahres.miete : k[feld];
    gleich(`Ist ${o.bezeichnung} ${spalte}`, lies('Kern', r, I[spalte]), erwartet ?? 0);
  }
  gleich(`Ist ${o.bezeichnung} istNk`, lies('Kern', r, I.istNk), jahres.nebenkosten);
  gleich(`Ist ${o.bezeichnung} istHausgeld`, lies('Kern', r, I.istHausgeld), jahres.hausgeld);
  gleich(`Ist ${o.bezeichnung} istVerwaltung`, lies('Kern', r, I.istVerwaltung), jahres.verwaltung);
  gleich(`Ist ${o.bezeichnung} istInstand`, lies('Kern', r, I.istInstand), jahres.instandhaltung);
  gleich(`Ist ${o.bezeichnung} istSonstige`, lies('Kern', r, I.istSonstige), jahres.sonstige);
});
bericht('3.4 Ist-Kennzahlen je Objekt (mit Korrekturen)');
const nachIst = abweichungen.length;

/* ---------- 3.5 Prognose, Jahr fuer Jahr ---------- */

const { OJ, ojZeile } = RASTER;
const prognose = forecast.prognose(params, STICHTAG);
const PROGNOSE_FELDER = [
  ['miete', 'miete'], ['bewirt', 'bewirtschaftung'], ['instand', 'instandhaltung'],
  ['zins', 'zins'], ['tilgung', 'tilgung'], ['sonder', 'sondertilgung'],
  ['ersatz', 'tilgungsersatz'], ['rest', 'restschuld'], ['guthaben', 'ersatzGuthaben'],
  ['wert', 'verkehrswert'], ['afa', 'afa'], ['einkuenfte', 'einkuenfte'], ['steuer', 'steuer'],
  ['kapitaldienst', 'kapitaldienst'], ['cfVor', 'cashflowVorSteuer'], ['cfNach', 'cashflowNachSteuer'],
];

for (let t = 0; t < JAHRZEILEN; t++) {
  const zeile = prognose.jahre[t];
  if (!zeile) break;
  for (const [spalte, feld] of PROGNOSE_FELDER) {
    /* Die Mappe rechnet je Objekt; hier wird ueber die Objekte summiert. */
    let ausMappe = 0;
    for (let oi = 0; oi < daten.objekte.length; oi++) {
      ausMappe += lies('Kern', ojZeile(oi, t), OJ[spalte]);
    }
    gleich(`Prognose ${JAHR + t} ${spalte}`, ausMappe, zeile[feld] ?? 0);
  }
}
bericht('3.5 Prognose über das Portfolio, Jahr für Jahr');
const nachPrognose = abweichungen.length;

/* ---------- 3.6 Verkaufsrechnung ---------- */

const { VK, VK_ERSTE } = RASTER;
if (prognose.verkauf) {
  const v = prognose.verkauf;
  let brutto = 0; let steuer = 0; let rest = 0; let netto = 0;
  v.details.forEach((d, oi) => {
    const r = VK_ERSTE + oi;
    const wo = `Verkauf ${d.objekt.bezeichnung}`;
    gleich(`${wo} Erlös brutto`, lies('Kern', r, VK.brutto), d.brutto);
    gleich(`${wo} Verkaufskosten`, lies('Kern', r, VK.kosten), d.kosten);
    gleich(`${wo} Erlös netto`, lies('Kern', r, VK.netto), d.netto);
    gleich(`${wo} Buchwert`, lies('Kern', r, VK.buchwert), d.buchwert);
    gleich(`${wo} Gewinn`, lies('Kern', r, VK.gewinn), d.gewinn);
    gleich(`${wo} Steuer`, lies('Kern', r, VK.steuer), d.steuer);
    gleich(`${wo} Restschuld`, lies('Kern', r, VK.rest), d.restschuld);
    brutto += lies('Kern', r, VK.brutto);
    steuer += lies('Kern', r, VK.steuer);
    rest += lies('Kern', r, VK.rest);
    netto += lies('Kern', r, VK.netto);
  });
  gleich('Verkauf Erlös netto gesamt', netto, v.erloes);
  gleich('Verkauf Steuer gesamt', steuer, v.steuer);
  gleich('Verkauf Restschuld gesamt', rest, v.restschuld);
  gleich('Verkauf bleibt', netto - steuer - rest, v.netto);
  void brutto;
}
bericht('3.6 Verkaufsrechnung');

/* ========================================================================
   Ergebnis
   ======================================================================== */

console.log('\n' + '─'.repeat(70));
console.log(`Tilgungspläne   ${nachTilgung === 0 ? 'ok' : nachTilgung + ' Abweichungen'}`);
console.log(`Zahlungen       ${nachZahlungen - nachTilgung === 0 ? 'ok' : (nachZahlungen - nachTilgung) + ' Abweichungen'}`);
console.log(`Mietlauf        ${nachMietlauf - nachZahlungen === 0 ? 'ok' : (nachMietlauf - nachZahlungen) + ' Abweichungen'}`);
console.log(`Ist-Kennzahlen  ${nachIst - nachMietlauf === 0 ? 'ok' : (nachIst - nachMietlauf) + ' Abweichungen'}`);
console.log(`Prognose        ${nachPrognose - nachIst === 0 ? 'ok' : (nachPrognose - nachIst) + ' Abweichungen'}`);
console.log(`Verkauf         ${abweichungen.length - nachPrognose === 0 ? 'ok' : (abweichungen.length - nachPrognose) + ' Abweichungen'}`);
console.log('─'.repeat(70));

if (!process.argv.includes('--behalten')) {
  console.log(`\nArbeitsdateien: ${resolve(ARBEIT)}`);
}
if (abweichungen.length) {
  console.log(`\n${abweichungen.length} Abweichung(en) – die Mappe ist an diesen Stellen falsch, nicht die App.`);
  process.exit(1);
}
console.log(`\n${geprueft} Werte, keine Abweichung über einem Cent.`);
