/* Schreiben an den Mieter: Angaben, Vorschau und Druck.

   Der Text entsteht in schreiben.js; diese Ansicht zeigt ihn nur. Sie öffnet
   sich als eigene Seite über der App (kein Eintrag in der Navigation), weil
   ein Brief ein Vorgang ist und keine Ansicht: man erzeugt ihn, druckt ihn
   und kehrt zum Vertrag zurück.

   Was hier eingegeben wird, bleibt in der Ansicht – das Briefdatum, die
   Fundstelle des Mietspiegels, ein Wunschbetrag. Es gehört nicht ins
   Portfolio, siehe ansichtsFeld(). Nur die Fundstelle wird im Gerät
   gemerkt, denn sie bleibt von Brief zu Brief dieselbe.
*/

import { el, leeren, eur, num, datum, heuteISO } from '../util.js';
import { mietvertragMit } from '../store.js';
import { schreibenErstellen } from '../schreiben.js';
import { ansichtsFeld, felderGitter, hinweis } from '../felder.js';

const TITEL = {
  verlangen: 'Mieterhöhungsverlangen · § 558 BGB',
  index: 'Indexerklärung · § 557b BGB',
  staffel: 'Ankündigung der Staffel · § 557a BGB',
};
const FUNDSTELLE_KEY = 'immo-fundstelle';

/**
 * Öffnet das Schreiben zu einem Mietvertrag.
 * @param mvId  Mietvertrag
 * @param art   'verlangen' | 'index' | 'staffel'
 * @param start Vorbelegung, etwa der Indexstand aus der Karte: { neuerStand }
 */
export function briefOeffnen(mvId, art, start = {}) {
  const mv = mietvertragMit(mvId);
  if (!mv) return;
  document.getElementById('briefRoot')?.remove();

  const eingabe = {
    datum: heuteISO(),
    fundstelle: localStorage.getItem(FUNDSTELLE_KEY) || '',
    neueMiete: null,                 // leer = die zulässige Obergrenze
    neuerStand: start.neuerStand ?? null,
    indexMonat: '',
  };

  // Die Kennung als Attribut: el() versteht nur „tag.klasse“, bei „div#id“ wird der Tag-Name
  // zu „DIV#ID“ und die Kennung geht verloren.
  const root = el('div.brief-ansicht', { id: 'briefRoot', role: 'dialog', 'aria-label': TITEL[art] });
  const inhalt = el('div.brief-spalte');

  /* Beim Schließen muss auch die Druckmarke weg, falls der Druckdialog
     abgebrochen wurde und afterprint nicht kam. */
  const schliessen = () => {
    document.body.classList.remove('druck-brief');
    document.removeEventListener('keydown', beiTaste);
    root.remove();
  };
  const beiTaste = (e) => { if (e.key === 'Escape') schliessen(); };
  document.addEventListener('keydown', beiTaste);

  const druckKnopf = el('button.btn.btn-primary', { type: 'button', onclick: () => drucken() }, ['Drucken']);

  root.append(
    el('div.brief-leiste.brief-bildschirm', {}, [
      el('button.btn', { type: 'button', onclick: schliessen }, ['← Zurück']),
      el('div.brief-titel', { text: TITEL[art] }),
      druckKnopf,
    ]),
    inhalt,
  );
  document.body.append(root);

  let letzt = null;

  function drucken() {
    if (!letzt?.bereit) return;
    document.body.classList.add('druck-brief');
    /* Der Dokumenttitel wird zum Dateinamen, wenn man als PDF sichert –
       sonst hieße der Brief wie das Portfolio. */
    const titelAlt = document.title;
    document.title = `${TITEL[art].split(' · ')[0]} ${(mv.mieter || '').trim()}`.trim();
    const weg = () => {
      document.body.classList.remove('druck-brief');
      document.title = titelAlt;
      window.removeEventListener('afterprint', weg);
    };
    window.addEventListener('afterprint', weg);
    window.print();
  }

  function zeichne() {
    letzt = schreibenErstellen(mv, art, {
      datum: eingabe.datum,
      fundstelle: eingabe.fundstelle,
      neueMiete: eingabe.neueMiete,
      neuerStand: eingabe.neuerStand,
      indexMonat: eingabe.indexMonat,
    });

    druckKnopf.disabled = !letzt.bereit;
    druckKnopf.title = letzt.bereit
      ? 'Brief drucken oder als PDF sichern'
      : 'Erst die offenen Punkte oben klären';

    leeren(inhalt);
    inhalt.append(
      angabenKarte(),
      ...meldungen(letzt),
      letzt.brief ? papier(letzt.brief) : null,
      letzt.hinweise.length ? hinweiseKarte(letzt) : null,
    );
  }

  const neu = (schluessel) => (v) => {
    eingabe[schluessel] = v;
    if (schluessel === 'fundstelle') localStorage.setItem(FUNDSTELLE_KEY, v || '');
    zeichne();
  };

  function angabenKarte() {
    const felder = [
      ansichtsFeld({
        label: 'Briefdatum', typ: 'datum', wert: eingabe.datum, nach: (v) => neu('datum')(v || heuteISO()),
        hint: 'die Fristen werden von diesem Tag an gerechnet',
      }),
    ];
    if (art === 'verlangen') {
      felder.push(
        ansichtsFeld({
          label: 'Fundstelle des Mietspiegels', typ: 'text', wert: eingabe.fundstelle, nach: neu('fundstelle'),
          platzhalter: 'z. B. Mietspiegel der Stadt …, Stand 2025, Feld C3',
          hint: 'die Begründung des Verlangens – ohne sie ist es unwirksam',
        }),
        ansichtsFeld({
          label: 'Neue Kaltmiete', wert: eingabe.neueMiete, suffix: '€', nach: neu('neueMiete'),
          platzhalter: letzt?.rahmen ? num(letzt.rahmen.grenze, 2) : '',
          hint: letzt?.rahmen
            ? `leer = Obergrenze · höchstens ${eur(letzt.rahmen.grenze)}`
            : 'leer = die zulässige Obergrenze',
        }),
      );
    } else if (art === 'index') {
      felder.push(
        ansichtsFeld({
          label: 'Aktueller Indexstand', wert: eingabe.neuerStand, nachkomma: 1, nach: neu('neuerStand'),
          hint: 'Verbraucherpreisindex, Statistisches Bundesamt',
        }),
        ansichtsFeld({
          label: 'Monat des Indexstands', typ: 'text', wert: eingabe.indexMonat, nach: neu('indexMonat'),
          platzhalter: 'z. B. Oktober 2026', hint: 'macht die Zahl für den Mieter nachprüfbar',
        }),
      );
    }
    return el('div.card.brief-bildschirm', {}, [
      el('div.card-head', {}, [el('div', {}, [
        el('h2', { text: 'Angaben zum Schreiben' }),
        el('div.sub', { text: 'bleiben in dieser Ansicht und werden nicht im Portfolio gespeichert' }),
      ])]),
      el('div.card-body', {}, [felderGitter(felder)]),
    ]);
  }

  zeichne();
}

/* ---------- Meldungen ---------- */

function meldungen(erg) {
  const kasten = (titel, liste) => hinweis(
    `<strong>${titel}</strong><ul style="margin:6px 0 0 18px;padding:0">`
    + liste.map((t) => `<li>${esc(t)}</li>`).join('') + '</ul>', 'warn');
  const raus = [];
  if (erg.fehlt.length) raus.push(el('div.brief-bildschirm', {}, [kasten('Dafür fehlen noch Angaben', erg.fehlt)]));
  if (erg.offen.length) raus.push(el('div.brief-bildschirm', {}, [kasten('Noch nicht versandfertig', erg.offen)]));
  return raus;
}

function hinweiseKarte(erg) {
  return el('div.card.brief-bildschirm', {}, [
    el('div.card-head', {}, [el('div', {}, [
      el('h2', { text: 'Was du wissen solltest' }),
      el('div.sub', { text: 'steht nicht im Brief, gehört aber dazu' }),
    ])]),
    el('div.card-body', { style: 'display:grid;gap:10px' },
      erg.hinweise.map((t) => el('div', { text: t, style: 'font-size:13px;line-height:1.5' }))),
  ]);
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------- Das Papier ---------- */

/**
 * Der Brief selbst. Anschriftfeld, Datum und Betreff sind an DIN 5008
 * angelehnt – die Maße sind für ein Fensterkuvert gedacht, aber nicht
 * garantiert: Drucker und Umschlag unterscheiden sich.
 */
function papier(b) {
  const absenderZeile = b.absender.filter(Boolean).join(' · ');

  const absatz = (a) => {
    if (a.titel) return el('h3', { text: a.titel });
    if (a.zeilen) {
      // Eine dritte Angabe je Zeile hebt sie hervor: die neue Miete, um die es geht.
      return el('table.brief-tabelle', {}, [el('tbody', {}, a.zeilen.map(([l, w, fett]) => el('tr' + (fett ? '.brief-fett' : ''), {}, [
        el('td', { text: l }), el('td.num', { text: w }),
      ])))]);
    }
    return el('p', { text: a.text });
  };

  return el('div.brief', {}, [
    el('div.brief-kopf', {}, [
      el('div.brief-anschrift', {}, [
        el('div.brief-absenderzeile', { text: absenderZeile }),
        ...b.empfaenger.map((z) => el('div', { text: z })),
      ]),
      el('div.brief-datum', { text: datum(b.datum) }),
    ]),
    el('div.brief-betreff', { text: b.betreff }),
    el('p', { text: b.anrede }),
    /* Der letzte Absatz bleibt beim Schluss: Grußformel und Name allein auf
       einer neuen Seite wirken abgeschnitten, und wer den Brief ausdruckt,
       merkt es erst am Papier. */
    ...b.absaetze.map((a, i) => {
      const knoten = absatz(a);
      if (i === b.absaetze.length - 1 && a.text) knoten.classList.add('brief-vor-schluss');
      return knoten;
    }),
    // Grußformel und Name zusammen: Eine Unterschrift allein auf der nächsten Seite wirkt abgeschnitten.
    el('div.brief-schluss', {}, [
      el('p.brief-gruss', { text: b.gruss }),
      el('div.brief-unterschrift', {}, [el('div', { text: b.unterschrift })]),
    ]),
    b.zustimmung
      ? el('div.brief-zustimmung', {}, [
          el('div.brief-zustimmung-titel', { text: 'Zustimmung zur Mieterhöhung' }),
          el('div.brief-zustimmung-an', { text: 'Rücksendung an: ' + b.absender.filter(Boolean).join(', ') }),
          el('p', { text: b.zustimmung.text }),
          el('div.brief-zeilen', {}, [
            el('div', {}, [el('span', { text: 'Ort, Datum' })]),
            el('div', {}, [el('span', { text: b.zustimmung.unterschriftMieter })]),
          ]),
        ])
      : null,
  ]);
}
