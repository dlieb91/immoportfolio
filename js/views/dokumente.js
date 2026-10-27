/* Dokumente und Änderungsprotokoll – als Karten in allen Detailansichten. */

import { el, leeren, num, datum, toast, bestaetigen } from '../util.js';
import {
  aendern, neuesDokument, dokumenteVon, protokollEintraege,
  protokollieren, DOKUMENT_KATEGORIEN,
} from '../store.js';
import {
  dokumentSpeichern, dokumentOeffnen, dokumentLoeschen, dateinameSaeubern,
} from '../storage.js';
import { abschnitt } from '../felder.js';

const groesse = (bytes) => (bytes >= 1048576
  ? num(bytes / 1048576, 1) + ' MB'
  : num(Math.max(1, bytes / 1024), 0) + ' KB');

const SYMBOL = { pdf: '📕', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📗', txt: '📄', zip: '🗜️' };
const symbolFuer = (name) => SYMBOL[String(name).split('.').pop()?.toLowerCase()] || '📎';

/* ---------- Dokumente ---------- */

export function dokumenteKarte(bezugTyp, bezugId, neuZeichnen) {
  const liste = dokumenteVon(bezugTyp, bezugId);

  const zeilen = liste.map((dok) => el('tr', {}, [
    el('td', { style: 'width:34px;font-size:17px;text-align:center', text: symbolFuer(dok.datei) }),
    el('td', {}, [
      el('a', {
        href: '#', style: 'font-weight:500;text-decoration:none;color:var(--accent)',
        onclick: (ev) => {
          ev.preventDefault();
          dokumentOeffnen(dok.datei).catch(() => toast('Datei nicht gefunden – wurde sie im Ordner gelöscht?', 'err', 6000));
        },
      }, [dok.titel || dok.datei]),
      el('div.faint', { text: dok.datei, style: 'font-size:11.5px' }),
    ]),
    el('td', { style: 'width:190px' }, [el('select', {
      onchange: (ev) => aendern(() => {
        protokollieren(bezugId, 'Dokumentkategorie', dok.kategorie, ev.target.value);
        dok.kategorie = ev.target.value;
      }),
    }, DOKUMENT_KATEGORIEN.map((k) => el('option', { value: k, selected: dok.kategorie === k }, [k])))]),
    el('td', { style: 'width:150px' }, [el('input', {
      type: 'date', value: dok.datum || '',
      onchange: (ev) => aendern(() => { dok.datum = ev.target.value; }),
    })]),
    el('td.num.faint', { style: 'width:80px;font-size:12px', text: groesse(dok.groesse) }),
    el('td', { style: 'width:40px' }, [el('button.icon-mini', {
      type: 'button', title: 'Dokument löschen', html: '&times;',
      onclick: () => entfernen(dok, neuZeichnen),
    })]),
  ]));

  const inhalt = liste.length
    ? el('table.data.kompakt.liste', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}), el('th', { text: 'Dokument' }), el('th', { text: 'Kategorie' }),
          el('th', { text: 'Datum' }), el('th', { style: 'text-align:right', text: 'Größe' }), el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
      ])
    : null;

  const eingabe = el('input', { type: 'file', multiple: true, style: 'display:none' });
  eingabe.addEventListener('change', () => {
    hochladen([...eingabe.files], bezugTyp, bezugId, neuZeichnen);
    eingabe.value = '';
  });

  const ablage = el('div.dropzone', {
    onclick: () => eingabe.click(),
    ondragover: (ev) => { ev.preventDefault(); ablage.classList.add('aktiv'); },
    ondragleave: () => ablage.classList.remove('aktiv'),
    ondrop: (ev) => {
      ev.preventDefault();
      ablage.classList.remove('aktiv');
      hochladen([...ev.dataTransfer.files], bezugTyp, bezugId, neuZeichnen);
    },
  }, [
    el('div', { text: '📎', style: 'font-size:20px' }),
    el('div', { text: 'Dateien hierher ziehen oder klicken', style: 'font-size:13px' }),
    el('div.faint', { text: 'werden unverändert im Unterordner „dokumente" abgelegt', style: 'font-size:11.5px' }),
  ]);

  return abschnitt(
    'Dokumente',
    liste.length ? `${liste.length} Datei${liste.length === 1 ? '' : 'en'}` : null,
    [inhalt, el('div', { style: inhalt ? 'margin-top:14px' : '' }, [eingabe, ablage])]
  );
}

async function hochladen(dateien, bezugTyp, bezugId, neuZeichnen) {
  if (!dateien.length) return;
  let fehler = 0;

  for (const file of dateien) {
    try {
      const zielName = `${bezugId}-${Date.now()}-${dateinameSaeubern(file.name)}`;
      await dokumentSpeichern(file, zielName);
      const dok = neuesDokument(bezugTyp, bezugId);
      dok.datei = zielName;
      dok.titel = file.name;
      dok.groesse = file.size;
      dok.kategorie = kategorieRaten(file.name, bezugTyp);
      aendern((d) => {
        d.dokumente.push(dok);
        protokollieren(bezugId, 'Dokument hinzugefügt', null, file.name);
      });
    } catch (e) {
      console.error(e);
      fehler++;
    }
  }

  neuZeichnen();
  if (fehler) toast(`${fehler} Datei(en) konnten nicht gespeichert werden`, 'err');
  else toast(dateien.length === 1 ? 'Dokument gespeichert' : `${dateien.length} Dokumente gespeichert`, 'ok');
}

/** Grobe Vorbelegung der Kategorie anhand des Dateinamens. */
function kategorieRaten(name, bezugTyp) {
  const n = name.toLowerCase();
  const treffer = [
    ['kaufvertrag', 'Kaufvertrag'], ['grundbuch', 'Grundbuch'],
    ['teilungserkl', 'Teilungserklärung'], ['expos', 'Exposé'],
    ['grundriss', 'Grundriss'], ['mietvertrag', 'Mietvertrag'],
    ['uebergabe', 'Übergabeprotokoll'], ['übergabe', 'Übergabeprotokoll'],
    ['nebenkosten', 'Nebenkostenabrechnung'], ['betriebskosten', 'Nebenkostenabrechnung'],
    ['darlehen', 'Darlehensvertrag'], ['kredit', 'Darlehensvertrag'],
    ['rechnung', 'Rechnung'], ['steuer', 'Steuerunterlagen'],
  ].find(([muster]) => n.includes(muster));
  if (treffer) return treffer[1];
  return { mietvertrag: 'Mietvertrag', finanzierung: 'Darlehensvertrag', objekt: 'Sonstiges' }[bezugTyp] || 'Sonstiges';
}

async function entfernen(dok, neuZeichnen) {
  const ok = await bestaetigen(
    `„${dok.titel || dok.datei}" löschen?`,
    'Die Datei wird aus dem Ordner „dokumente" entfernt.',
    { okText: 'Löschen', gefahr: true }
  );
  if (!ok) return;
  await dokumentLoeschen(dok.datei);
  aendern((d) => {
    d.dokumente = d.dokumente.filter((x) => x.id !== dok.id);
    protokollieren(dok.bezugId, 'Dokument gelöscht', dok.titel || dok.datei, null);
  });
  neuZeichnen();
}

/** Löscht alle Dokumente eines Bezugs mitsamt Dateien (für Kaskaden). */
export async function dokumenteEntfernenFuer(bezugTyp, bezugId) {
  const liste = dokumenteVon(bezugTyp, bezugId);
  for (const dok of liste) await dokumentLoeschen(dok.datei);
  return liste.map((d) => d.id);
}

/* ---------- Änderungsprotokoll ---------- */

const WERT = (v) => {
  if (v === null || v === undefined || v === '') return 'leer';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return num(v, Number.isInteger(v) ? 0 : 2);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return datum(v);
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + ' …' : s;
};

export function protokollKarte(bezugId, { titel = 'Änderungsprotokoll', grenze = 12 } = {}) {
  const alle = protokollEintraege(bezugId);
  if (!alle.length) {
    return abschnitt(titel, null, [
      el('div.faint', { text: 'Noch keine Änderungen erfasst.', style: 'font-size:13px' }),
    ]);
  }

  const box = el('div');
  let sichtbar = grenze;

  const zeichnen = () => {
    leeren(box);
    box.append(el('table.data.kompakt.liste', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Zeitpunkt' }), el('th', { text: 'Feld' }),
        el('th', { text: 'vorher' }), el('th', { text: 'nachher' }),
      ])]),
      el('tbody', {}, alle.slice(0, sichtbar).map((p) => el('tr', {}, [
        el('td.faint', { style: 'width:150px;font-size:12px', text: zeitpunkt(p.zeit) }),
        el('td', { text: p.was }),
        el('td.faint', { text: WERT(p.alt) }),
        el('td', { text: WERT(p.neu) }),
      ]))),
    ]));
    if (alle.length > sichtbar) {
      box.append(el('button.btn.btn-sm.btn-ghost', {
        type: 'button', style: 'margin-top:10px',
        onclick: () => { sichtbar += 40; zeichnen(); },
      }, [`Weitere ${Math.min(40, alle.length - sichtbar)} von ${alle.length} anzeigen`]));
    }
  };
  zeichnen();

  return abschnitt(titel, `${alle.length} Einträge, neueste zuerst`, [box]);
}

function zeitpunkt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
