/* Buchhaltung: das Hauptbuch der App – abgeleitete Zahlungen, korrigierbar
   wie bisher, dazu frei erfasste Buchungen und Fahrten. Eine Tabelle, zwei
   Herkünfte: 'abgeleitet' bleibt wie in der bisherigen Zahlungen-Ansicht,
   'manuell' ist direkt editierbar und löschbar.
*/

import { el, leeren, eur, num, toast, bestaetigen, csvZeile } from '../util.js';
import { state, aendern, protokollieren, einheitenVon, einheitName, neueBuchung, neueFahrt } from '../store.js';
import {
  GRUPPEN, KATEGORIEN, artInfo, buchungsliste, fahrtBetrag,
} from '../buchhaltung.js';
import { korrekturFinden, neueKorrektur, laufenderMonat } from '../zahlungen.js';
import { parseZahl, hinweis, tabellenDatum, tabellenText, tabellenZahl, tabellenAuswahl } from '../felder.js';

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monatText = (z) => `${MONATE[z.monat - 1]} ${z.jahr}`;
const monatName = (p) => `${MONATE[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const SCHRITT = 300;

const filter = {
  jahr: new Date().getFullYear(),
  objektId: '',
  einheitId: '',
  art: '',
  herkunft: '',
  nurKorrigiert: false,
  mitGeplanten: false,
};
let sichtbar = SCHRITT;

export const buchhaltung = {
  render(container) {
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    if (!state.daten.objekte.length) {
      inner.append(el('div.card', {}, [
        el('div.empty', {}, [
          el('div.empty-icon', { text: '🧾' }),
          el('h3', { text: 'Noch keine Buchhaltung' }),
          el('p', { text: 'Buchungen entstehen aus Mietverträgen, Kosten und Tilgungsplänen – oder werden frei erfasst. Lege zuerst ein Objekt an.' }),
          el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
        ]),
      ]));
      return;
    }

    const neu = () => { leeren(container); this.render(container); };
    const liste = buchungsliste(abfrage());

    inner.append(filterKarte(neu, liste.length));
    inner.append(summen(liste));
    inner.append(hinweis(
      'Abgeleitete Zeilen (Miete, Nebenkosten, Zins, Tilgung …) stammen aus den Stammdaten und lassen sich hier korrigieren – '
      + 'der Tilgungsplan selbst bleibt dabei unberührt. Frei erfasste Buchungen und Fahrten sind direkt editierbar und löschbar.'
      + '<br><br>Angezeigt werden Monate bis einschließlich ' + monatName(laufenderMonat())
      + ' sowie alle frei erfassten Buchungen des gewählten Jahres. Über „Geplante Monate einblenden" siehst du auch die restlichen '
      + 'Monate des Kalenderjahres.'
    ));
    inner.append(tabelle(liste, neu));
  },
};

/* ---------- Filter ---------- */

function abfrage() {
  const jahre = jahreAuswahl();
  return {
    vonJahr: filter.jahr ?? jahre.at(-1),
    bisJahr: filter.jahr ?? jahre[0],
    objektId: filter.objektId || null,
    einheitId: filter.einheitId || null,
    art: filter.art || null,
    herkunft: filter.herkunft || null,
    nurKorrigiert: filter.nurKorrigiert,
    mitGeplanten: filter.mitGeplanten,
  };
}

function jahreAuswahl() {
  const jetzt = new Date().getFullYear();
  let ab = jetzt;
  for (const o of state.daten.objekte) {
    if (o.kaufdatum) ab = Math.min(ab, Number(o.kaufdatum.slice(0, 4)));
  }
  for (const mv of state.daten.mietvertraege) {
    if (mv.beginn) ab = Math.min(ab, Number(mv.beginn.slice(0, 4)));
  }
  const raus = [];
  for (let j = jetzt; j >= ab; j--) raus.push(j);
  return raus;
}

function filterKarte(neu, treffer) {
  const jahre = jahreAuswahl();
  const einheiten = filter.objektId ? einheitenVon(filter.objektId) : [];

  const feld = (label, control) => el('div', { style: 'display:flex;flex-direction:column;gap:5px' }, [
    el('label.faint', { text: label, style: 'font-size:12px' }), control,
  ]);

  const jahrSel = el('select', {
    style: 'width:auto',
    onchange: (e) => { filter.jahr = e.target.value === 'alle' ? null : Number(e.target.value); sichtbar = SCHRITT; neu(); },
  }, [
    ...jahre.map((j) => el('option', { value: String(j), selected: filter.jahr === j }, [String(j)])),
    el('option', { value: 'alle', selected: filter.jahr === null }, ['Alle Jahre']),
  ]);

  const objektSel = el('select', {
    style: 'width:auto;max-width:230px',
    onchange: (e) => { filter.objektId = e.target.value; filter.einheitId = ''; sichtbar = SCHRITT; neu(); },
  }, [
    el('option', { value: '', selected: !filter.objektId }, ['Alle Objekte']),
    ...state.daten.objekte.map((o) => el('option', { value: o.id, selected: filter.objektId === o.id }, [o.bezeichnung || 'Ohne Bezeichnung'])),
  ]);

  const einheitSel = el('select', {
    style: 'width:auto;max-width:200px',
    disabled: !einheiten.length,
    onchange: (e) => { filter.einheitId = e.target.value; sichtbar = SCHRITT; neu(); },
  }, [
    el('option', { value: '', selected: !filter.einheitId }, [einheiten.length ? 'Alle Wohnungen' : 'Erst Objekt wählen']),
    ...einheiten.map((x) => el('option', { value: x.id, selected: filter.einheitId === x.id }, [einheitName(x)])),
  ]);

  const artSel = el('select', {
    style: 'width:auto;max-width:230px',
    onchange: (e) => { filter.art = e.target.value; sichtbar = SCHRITT; neu(); },
  }, [
    el('option', { value: '', selected: !filter.art }, ['Alle Kategorien']),
    ...GRUPPEN.map((g) => el('optgroup', { label: g },
      KATEGORIEN.filter((a) => a.gruppe === g).map((a) => el('option', { value: a.key, selected: filter.art === a.key }, [a.text])))),
  ]);

  const herkunftSel = el('select', {
    style: 'width:auto',
    onchange: (e) => { filter.herkunft = e.target.value; sichtbar = SCHRITT; neu(); },
  }, [
    el('option', { value: '', selected: !filter.herkunft }, ['Abgeleitet + manuell']),
    el('option', { value: 'abgeleitet', selected: filter.herkunft === 'abgeleitet' }, ['Nur abgeleitet']),
    el('option', { value: 'manuell', selected: filter.herkunft === 'manuell' }, ['Nur manuell']),
  ]);

  const nurKorr = el('button.btn.btn-sm' + (filter.nurKorrigiert ? '.btn-primary' : ''), {
    type: 'button',
    onclick: () => { filter.nurKorrigiert = !filter.nurKorrigiert; sichtbar = SCHRITT; neu(); },
  }, [filter.nurKorrigiert ? '✓ Nur Korrekturen' : 'Nur Korrekturen']);

  const geplante = el('button.btn.btn-sm' + (filter.mitGeplanten ? '.btn-primary' : ''), {
    type: 'button',
    title: 'Monate, die im Kalenderjahr noch kommen – rechnerisch enthalten, aber noch nicht geflossen',
    onclick: () => { filter.mitGeplanten = !filter.mitGeplanten; sichtbar = SCHRITT; neu(); },
  }, [filter.mitGeplanten ? '✓ Mit geplanten Monaten' : 'Geplante Monate einblenden']);

  const anzahlKorr = (state.daten.zahlungen || []).length;
  const anzahlManuell = (state.daten.buchungen || []).length + (state.daten.fahrten || []).length;

  const objektFuerNeu = () => filter.objektId || state.daten.objekte[0]?.id;

  return el('div.card', {}, [
    el('div.card-body', { style: 'display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap' }, [
      feld('Jahr', jahrSel),
      feld('Objekt', objektSel),
      feld('Wohnung', einheitSel),
      feld('Kategorie', artSel),
      feld('Herkunft', herkunftSel),
      feld(' ', nurKorr),
      feld(' ', geplante),
      el('span', { style: 'flex:1' }),
      el('div', { style: 'text-align:right' }, [
        el('div.faint', {
          text: `${num(treffer, 0)} Zeilen` + (filter.mitGeplanten ? '' : ' bis ' + monatName(laufenderMonat())),
          style: 'font-size:12.5px',
        }),
        el('div.faint', {
          text: `${anzahlKorr} Korrektur${anzahlKorr === 1 ? '' : 'en'} · ${anzahlManuell} freie Buchung${anzahlManuell === 1 ? '' : 'en'}`,
          style: 'font-size:11.5px',
        }),
      ]),
      el('button.btn.btn-sm.btn-primary', {
        type: 'button',
        onclick: () => {
          const oid = objektFuerNeu();
          if (!oid) return;
          aendern((d) => { d.buchungen.push(neueBuchung(oid)); });
          sichtbar += 1;
          neu();
        },
      }, ['+ Buchung']),
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: () => {
          const oid = objektFuerNeu();
          if (!oid) return;
          aendern((d) => { d.fahrten.push(neueFahrt(oid)); });
          sichtbar += 1;
          neu();
        },
      }, ['+ Fahrt']),
      anzahlKorr
        ? el('button.btn.btn-sm.btn-danger', { type: 'button', onclick: () => alleVerwerfen(neu) }, ['Korrekturen verwerfen'])
        : null,
      el('button.btn.btn-sm', { type: 'button', onclick: () => exportieren(buchungsliste(abfrage())) }, ['CSV']),
    ]),
  ]);
}

/* ---------- Summen ---------- */

function summen(liste) {
  const proGruppe = {};
  for (const g of GRUPPEN) proGruppe[g] = 0;
  let einnahmen = 0, ausgaben = 0, durchlaufend = 0, neutral = 0;

  for (const z of liste) {
    const a = artInfo(z.art);
    proGruppe[a.gruppe] = (proGruppe[a.gruppe] || 0) + z.betrag * a.vorzeichen;
    if (a.durchlaufend) durchlaufend += z.betrag * a.vorzeichen;
    else if (a.gruppe === 'Neutral') neutral += z.betrag * a.vorzeichen;
    else if (a.vorzeichen > 0) einnahmen += z.betrag;
    else ausgaben += z.betrag;
  }

  const kachel = (label, wert, sub, klasse) => el('div.summe', {}, [
    el('div.summe-label', { text: label }),
    el('div.summe-wert' + (klasse ? '.' + klasse : ''), { text: wert }),
    sub ? el('div.summe-sub', { text: sub }) : null,
  ]);

  const saldo = einnahmen - ausgaben;

  return el('div.summen', {}, [
    kachel('Einnahmen', eur(einnahmen, 0), 'Miete + freie Einnahmen'),
    kachel('Betriebskosten', eur(-proGruppe.Betriebskosten, 0), 'nicht umlagefähig'),
    kachel('Erhaltung', eur(-proGruppe.Erhaltung, 0), 'Reparaturen, Rücklage'),
    kachel('Sonst. Werbungskosten', eur(-proGruppe['Sonstige Werbungskosten'], 0), 'Fahrten, Beratung …'),
    kachel('Finanzierung', eur(-proGruppe.Finanzierung, 0), 'Zins, Tilgung, Sondertilgung'),
    kachel('Saldo', eur(saldo, 0), 'Einnahmen abzüglich Ausgaben', saldo >= 0 ? 'pos' : 'neg'),
    kachel('Durchlaufend', eur(durchlaufend, 0), 'Umlagen ↔ umlagefähige Kosten'),
    neutral ? kachel('Neutral', eur(neutral, 0), 'Kaution, Privatentnahme/-einlage') : null,
  ].filter(Boolean));
}

/* ---------- Tabelle ---------- */

function tabelle(liste, neu) {
  if (!liste.length) {
    return el('div.card', {}, [
      el('div.empty', {}, [
        el('div.empty-icon', { text: '🔍' }),
        el('h3', { text: 'Keine Buchungen in dieser Auswahl' }),
        el('p', { text: 'Passe Jahr, Objekt oder Kategorie an, oder erfasse eine neue Buchung.' }),
      ]),
    ]);
  }

  const zeilen = liste.slice(0, sichtbar).map((z) => (z.herkunft === 'manuell' ? manuelleZeile(z, neu) : abgeleiteteZeile(z, neu)));

  const box = el('div.card', {}, [
    el('div', { style: 'overflow-x:auto' }, [
      el('table.data.kompakt.liste', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Datum' }),
          el('th', { text: 'Objekt' }),
          el('th', { text: 'Kategorie' }),
          el('th', { text: 'Zuordnung / Bezeichnung' }),
          el('th', { style: 'text-align:right', text: 'Betrag' }),
          el('th', { style: 'text-align:right', text: 'Vorgabe / km' }),
          el('th', { text: 'Notiz' }),
          el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
      ]),
    ]),
  ]);

  if (liste.length > sichtbar) {
    box.append(el('div', { style: 'padding:12px 16px;border-top:1px solid var(--border)' }, [
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: () => { sichtbar += SCHRITT; neu(); },
      }, [`Weitere ${Math.min(SCHRITT, liste.length - sichtbar)} von ${num(liste.length, 0)} anzeigen`]),
    ]));
  }

  return box;
}

function abgeleiteteZeile(z, neu) {
  const a = artInfo(z.art);
  const betragInput = el('input', {
    type: 'text', inputmode: 'decimal',
    style: 'text-align:right;width:110px' + (z.entfaellt ? ';text-decoration:line-through;opacity:.55' : ''),
    value: z.entfaellt ? '0,00' : num(z.betrag, 2),
    onchange: (ev) => {
      const wert = parseZahl(ev.target.value);
      korrekturSetzen(z, { betrag: wert, entfaellt: false });
      neu();
    },
  });

  return el('tr' + (z.korrigiert ? '.zeile-korrigiert' : '') + (z.geplant ? '.zeile-geplant' : ''), {}, [
    el('td', { style: 'white-space:nowrap' }, [
      monatText(z),
      z.geplant ? el('span.badge', { text: 'geplant', style: 'margin-left:6px' }) : null,
    ]),
    el('td', { text: z.objektName }),
    el('td', {}, [
      el('span', { text: a.text }),
      a.durchlaufend ? el('span.badge', { text: 'durchlaufend', style: 'margin-left:6px' }) : null,
    ]),
    el('td.faint', { text: z.bezugText || '–', style: 'font-size:12.5px' }),
    el('td', { style: 'width:130px' }, [betragInput]),
    el('td.num.faint', {
      style: 'width:100px;font-size:12px',
      text: z.korrigiert ? (a.vorzeichen > 0 ? '' : '−') + num(z.standard, 2) : '',
    }),
    el('td', {}, [el('input', {
      type: 'text', value: z.notiz, placeholder: z.korrigiert ? 'Grund der Korrektur' : '',
      onchange: (ev) => korrekturSetzen(z, { notiz: ev.target.value }),
    })]),
    el('td', { style: 'width:96px;white-space:nowrap' }, [
      el('button.icon-mini', {
        type: 'button', title: z.entfaellt ? 'Zahlung wieder ansetzen' : 'Zahlung ist ausgefallen',
        text: z.entfaellt ? '↺' : '∅',
        onclick: () => { korrekturSetzen(z, { entfaellt: !z.entfaellt }); neu(); },
      }),
      z.korrigiert
        ? el('button.icon-mini', {
            type: 'button', title: 'Auf Vorgabewert zurücksetzen', html: '&times;',
            onclick: () => { korrekturEntfernen(z); neu(); },
          })
        : null,
    ]),
  ]);
}

const IST_FAHRT = (z) => z.art === 'fahrtkosten';

function manuelleZeile(z, neu) {
  const a = artInfo(z.art);
  const buchung = z.quelle;
  const opt = { nach: () => {}, umbauen: neu };

  const kategorieZelle = IST_FAHRT(z)
    ? el('span', { text: 'Fahrtkosten' })
    : tabellenAuswahl(buchung, 'kategorie',
        KATEGORIEN.filter((k) => !k.abgeleitet).map((k) => ({ wert: k.key, text: k.text })),
        opt);

  const zuordnungZelle = IST_FAHRT(z)
    ? tabellenText(buchung, 'anlass', { ...opt, platzhalter: 'Anlass der Fahrt' })
    : tabellenText(buchung, 'bezeichnung', { ...opt, platzhalter: 'Bezeichnung' });

  const betragZelle = IST_FAHRT(z)
    ? el('td.num', { text: eur(z.betrag), style: 'width:130px' })
    : el('td', { style: 'width:130px' }, [tabellenZahl(buchung, 'betrag', opt)]);

  const vorgabeZelle = IST_FAHRT(z)
    ? el('td', { style: 'width:100px' }, [tabellenZahl(buchung, 'km', { ...opt, nachkomma: 0, style: 'text-align:right' })])
    : el('td.num.faint', { style: 'width:100px;font-size:12px' });

  const markierungen = [];
  if (!IST_FAHRT(z) && buchung.kategorie === 'erhaltung') {
    if (buchung.aktiviert) markierungen.push(el('span.badge.blau', { text: 'aktiviert', style: 'margin-left:6px' }));
    else if (buchung.verteilenJahre) markierungen.push(el('span.badge', { text: `verteilt ${buchung.verteilenJahre}J`, style: 'margin-left:6px' }));
  }

  return el('tr.zeile-korrigiert', {}, [
    el('td', { style: 'width:150px' }, [tabellenDatum(buchung, 'datum', opt)]),
    el('td', { text: z.objektName }),
    el('td', {}, [kategorieZelle, ...markierungen]),
    el('td', {}, [zuordnungZelle]),
    betragZelle,
    vorgabeZelle,
    el('td', {}, [tabellenText(buchung, 'notiz', { ...opt, platzhalter: 'Notiz' })]),
    el('td', { style: 'width:56px;white-space:nowrap' }, [
      el('button.icon-mini', {
        type: 'button', title: 'Buchung löschen', html: '&times;',
        onclick: async () => {
          const ok = await bestaetigen('Buchung löschen?', `„${zuordnungZelle.value || a.text}" wird endgültig entfernt.`, { okText: 'Löschen', gefahr: true });
          if (!ok) return;
          aendern((d) => {
            if (IST_FAHRT(z)) d.fahrten = d.fahrten.filter((x) => x.id !== buchung.id);
            else d.buchungen = d.buchungen.filter((x) => x.id !== buchung.id);
          });
          neu();
        },
      }),
    ]),
  ]);
}

/* ---------- Korrekturen schreiben (abgeleitete Zeilen) ---------- */

function korrekturSetzen(z, aenderung) {
  aendern((d) => {
    const vorhanden = korrekturFinden(z.periode, z.art, z.bezugId);
    const eintrag = vorhanden
      ? { ...vorhanden }
      : neueKorrektur(z.periode, z.art, z.objektId, z.bezugId);

    if (aenderung.betrag !== undefined) eintrag.betrag = aenderung.betrag;
    if (aenderung.entfaellt !== undefined) eintrag.entfaellt = aenderung.entfaellt;
    if (aenderung.notiz !== undefined) eintrag.notiz = aenderung.notiz;

    const wieVorgabe = !eintrag.entfaellt
      && (eintrag.betrag == null || Math.abs(eintrag.betrag - z.standard) < 0.005)
      && !eintrag.notiz;

    d.zahlungen = (d.zahlungen || []).filter((x) => x.id !== (vorhanden?.id));
    if (!wieVorgabe) d.zahlungen.push(eintrag);

    protokollieren(
      z.objektId,
      `${artInfo(z.art).text} ${z.periode}`,
      z.standard,
      wieVorgabe ? z.standard : (eintrag.entfaellt ? 'entfällt' : eintrag.betrag),
    );
  });
}

function korrekturEntfernen(z) {
  const vorhanden = korrekturFinden(z.periode, z.art, z.bezugId);
  if (!vorhanden) return;
  aendern((d) => {
    d.zahlungen = d.zahlungen.filter((x) => x.id !== vorhanden.id);
    protokollieren(z.objektId, `${artInfo(z.art).text} ${z.periode}`, 'Korrektur', 'zurückgesetzt');
  });
  toast('Auf Vorgabewert zurückgesetzt', 'ok');
}

async function alleVerwerfen(neu) {
  const anzahl = (state.daten.zahlungen || []).length;
  const ok = await bestaetigen(
    'Alle Korrekturen verwerfen?',
    `${anzahl} Korrektur${anzahl === 1 ? '' : 'en'} werden gelöscht. Alle abgeleiteten Zahlungen entsprechen danach wieder den Stammdaten. Frei erfasste Buchungen und Fahrten bleiben erhalten.`,
    { okText: 'Verwerfen', gefahr: true }
  );
  if (!ok) return;
  aendern((d) => { d.zahlungen = []; });
  toast('Korrekturen verworfen', 'ok');
  neu();
}

/* ---------- Export ---------- */

function exportieren(liste) {
  const kopf = ['Datum', 'Objekt', 'Kategorie', 'Herkunft', 'Zuordnung', 'Betrag', 'Vorzeichen', 'Wirkung', 'Notiz'];
  const zeilen = liste.map((z) => {
    const a = artInfo(z.art);
    return csvZeile([
      z.datum, z.objektName, a.text, z.herkunft, z.bezugText || '',
      z.betrag.toFixed(2).replace('.', ','),
      a.vorzeichen > 0 ? '+' : '-',
      (z.betrag * a.vorzeichen).toFixed(2).replace('.', ','),
      z.notiz || '',
    ]);
  });
  const csv = '﻿' + [csvZeile(kopf), ...zeilen].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: `buchhaltung-${filter.jahr || 'alle'}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('CSV exportiert', 'ok');
}
