/* Mietvertrag im Detail: Zuordnung, Laufzeit, Mietkonditionen als Zeitreihe. */

import { el, leeren, eur, num, datum, datumISO, uid, heuteISO, toast, bestaetigen, modal } from '../util.js';
import {
  state, aendern, mietvertragMit, einheitMit, einheitName, einheitenVon,
  objektVonEinheit, vertragStatus, vertragsEnde, aktuelleKondition,
  naechsteAnpassung, einheitSicherstellen,
} from '../store.js';
import {
  textFeld, zahlFeld, datumFeld, auswahlFeld, schalterFeld, textBereich,
  felderGitter, abschnitt, parseZahl, tabellenDatum, tabellenZahl, tabellenText,
} from '../felder.js';
import { STATUS_TEXT, STATUS_KLASSE, tageBisEnde } from './mietvertraege.js';
import {
  mieterhoehungsPotenzial, staffelVorschau, indexAnpassung, anpassungHinweis,
  STAFFEL_MINDEST_MONATE,
} from '../mieterhoehung.js';
import { hinweis } from '../felder.js';
import { dokumenteKarte, protokollKarte, dokumenteEntfernenFuer } from './dokumente.js';

export const mietvertragDetail = {
  render(container) {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
    const mv = id ? mietvertragMit(id) : null;

    if (!mv) {
      container.append(el('div.view-inner', {}, [
        el('div.card', {}, [
          el('div.empty', {}, [
            el('div.empty-icon', { text: '🤷' }),
            el('h3', { text: 'Mietvertrag nicht gefunden' }),
            el('a.btn.btn-primary', { href: '#/mietvertraege' }, ['Zur Übersicht']),
          ]),
        ]),
      ]));
      return;
    }

    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const alles = () => { leeren(container); this.render(container); };

    // Kopf und Kennzahlen haengen von allem ab und werden mitgezogen
    const kopfBox = el('div', {}, [kopf(mv)]);
    const kpiBox = el('div', {}, [kennzahlen(mv)]);
    const obenNeu = () => {
      leeren(kopfBox).append(kopf(mv));
      leeren(kpiBox).append(kennzahlen(mv));
    };

    inner.append(kopfBox, kpiBox);
    inner.append(zuordnung(mv, alles));
    // Werte ziehen nur Kopf und Kennzahlen nach; nur Schalter, die Felder
    // ein- und ausblenden, bauen die Karte neu auf.
    inner.append(neuZeichnend((z) => laufzeit(mv, obenNeu, () => { z(); obenNeu(); })));
    inner.append(neuZeichnend((z) => konditionen(mv, () => { z(); obenNeu(); }, obenNeu)));
    inner.append(neuZeichnend((z) => mietanpassungKarte(mv, () => { z(); obenNeu(); })));
    inner.append(neuZeichnend((z) => dokumenteKarte('mietvertrag', mv.id, z)));
    inner.append(abschnitt('Notizen', null, textBereich(null, mv, 'notizen', {
      zeilen: 4, platzhalter: 'Kaution hinterlegt bei …, Übergabeprotokoll, Besonderheiten',
      protokollLabel: 'Notizen', bezug: mv.id,
    })));
    inner.append(protokollKarte(mv.id));
  },
};

function neuZeichnend(bauen) {
  const wrap = el('div');
  const zeichne = () => { leeren(wrap); wrap.append(bauen(zeichne)); };
  zeichne();
  return wrap;
}

/* ---------- Kopf ---------- */

function kopf(mv) {
  const e = einheitMit(mv.einheitId);
  const o = objektVonEinheit(mv.einheitId);
  const status = vertragStatus(mv);
  const mehrere = o ? einheitenVon(o.id).length > 1 : false;

  return el('div.detail-kopf', {}, [
    el('div', { style: 'min-width:0;flex:1' }, [
      el('a.zurueck', { href: '#/mietvertraege' }, ['← Mietverträge']),
      el('h2', { text: mv.mieter || 'Ohne Mieter', style: 'font-size:20px;margin-top:4px' }),
      o
        ? el('a.faint', {
            href: '#/objekt?id=' + o.id, style: 'display:inline-block;margin-top:3px;text-decoration:none',
            text: o.bezeichnung + (mehrere ? ' · ' + einheitName(e) : ''),
          })
        : el('div.faint', { text: 'Keinem Objekt zugeordnet' }),
      el('div.obj-badges', { style: 'margin-top:9px' }, [
        el('span.badge.' + STATUS_KLASSE[status], { text: STATUS_TEXT[status] }),
        el('span.badge', { text: 'ab ' + datum(mv.beginn) }),
        vertragsEnde(mv) ? el('span.badge', { text: 'bis ' + datum(vertragsEnde(mv)) }) : el('span.badge', { text: 'unbefristet' }),
      ]),
    ]),
    el('button.btn.btn-danger.btn-sm', { type: 'button', onclick: () => loeschen(mv) }, ['Vertrag löschen']),
  ]);
}

function kennzahlen(mv) {
  const heute = heuteISO();
  const k = aktuelleKondition(mv, heute) || (mv.konditionen || [])[0];
  const e = einheitMit(mv.einheitId);
  const o = objektVonEinheit(mv.einheitId);
  const flaeche = e?.flaeche || o?.flaeche || 0;
  const kalt = k?.kaltmiete || 0;
  const nk = k?.nkVorauszahlung || 0;
  const naechste = naechsteAnpassung(mv, heute);
  const tage = tageBisEnde(mv, heute);

  const kachel = (label, wert, sub) => el('div.kpi', {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
  ]);

  return el('div.grid.grid-kpi', {}, [
    kachel('Kaltmiete', kalt ? eur(kalt) : '–', flaeche && kalt ? num(kalt / flaeche, 2) + ' €/m²' : 'monatlich'),
    kachel('Warmmiete', kalt || nk ? eur(kalt + nk) : '–', nk ? eur(nk) + ' Nebenkosten' : 'ohne Nebenkosten'),
    kachel('Jahreskaltmiete', kalt ? eur(kalt * 12, 0) : '–'),
    naechste
      ? kachel('Nächste Anpassung', eur(naechste.kaltmiete || 0), 'ab ' + datum(naechste.gueltigAb))
      : kachel('Restlaufzeit', tage == null ? 'unbefristet' : tage < 0 ? 'abgelaufen' : `${tage} Tage`,
          tage == null ? 'kein Enddatum' : 'bis ' + datum(vertragsEnde(mv))),
  ]);
}

/* ---------- Zuordnung ---------- */

function zuordnung(mv, allesNeu) {
  const optionen = state.daten.objekte.flatMap((o) => {
    const einheiten = einheitenVon(o.id);
    if (o.mehrereEinheiten && einheiten.length) {
      return einheiten.map((e) => ({ wert: 'e:' + e.id, text: `${o.bezeichnung || 'Objekt'} · ${einheitName(e)}` }));
    }
    return [{ wert: 'o:' + o.id, text: o.bezeichnung || 'Ohne Bezeichnung' }];
  });

  const aktuell = (() => {
    const e = einheitMit(mv.einheitId);
    if (!e) return '';
    return optionen.some((x) => x.wert === 'e:' + e.id) ? 'e:' + e.id : 'o:' + e.objektId;
  })();

  const sel = el('select', {
    onchange: (ev) => {
      const [art, id] = ev.target.value.split(':');
      const neueId = art === 'e' ? id : einheitSicherstellen(id).id;
      aendern(() => { mv.einheitId = neueId; });
      toast('Vertrag umgehängt', 'ok');
      allesNeu();
    },
  }, optionen.map((x) => el('option', { value: x.wert, selected: x.wert === aktuell }, [x.text])));

  return abschnitt('Zuordnung', 'Objekt bzw. Einheit, zu der dieser Vertrag gehört', [
    el('div.field', {}, [el('label', { text: 'Objekt / Einheit' }), sel]),
  ]);
}

/* ---------- Laufzeit ---------- */

function laufzeit(mv, neuRechnen, neuAufbauen) {
  const felder = [
    textFeld('Mieter', mv, 'mieter', { nach: neuRechnen }),
    datumFeld('Mietbeginn', mv, 'beginn', { nach: neuRechnen }),
  ];

  if (!mv.unbefristet) {
    felder.push(datumFeld('Befristet bis', mv, 'ende', { nach: neuRechnen }));
  }
  felder.push(datumFeld('Gekündigt zum', mv, 'gekuendigtZum', {
    hint: 'leer lassen, solange der Vertrag läuft', nach: neuRechnen,
  }));
  felder.push(zahlFeld('Kaution', mv, 'kaution', { suffix: '€' }));

  const anpassung = [
    auswahlFeld('Mietanpassung', mv, 'anpassungTyp', [
      { wert: 'keine', text: 'keine Vereinbarung' },
      { wert: 'staffel', text: 'Staffelmiete' },
      { wert: 'index', text: 'Indexmiete' },
    ], { nach: neuAufbauen }),
  ];

  if (mv.anpassungTyp === 'staffel') {
    anpassung.push(zahlFeld('Abstand der Staffeln', mv, 'staffelRhythmusMonate', {
      suffix: 'Monate', nachkomma: 0, nach: neuRechnen,
      hint: 'mindestens 12 – jede Staffel muss ein Jahr gelten (§ 557a Abs. 2 BGB)',
    }));
  }

  if (mv.anpassungTyp === 'index') {
    /* Die Indexmiete braucht einen Bezugspunkt: den Indexstand, auf dem die
       heute geltende Miete beruht. Ohne ihn lässt sich keine Anpassung
       rechnen, nur eine Frist nennen. */
    anpassung.push(zahlFeld('Index bei der heutigen Miete', mv, 'indexBasisStand', {
      nachkomma: 1, nach: neuRechnen,
      hint: 'Verbraucherpreisindex des Statistischen Bundesamtes, Punktestand',
    }));
    anpassung.push(datumFeld('Stand vom', mv, 'indexBasisDatum', {
      nach: neuRechnen, hint: 'Monat, auf den sich dieser Indexstand bezieht',
    }));
    anpassung.push(zahlFeld('Angenommene Anpassung', mv, 'indexProzent', {
      suffix: '%', nachkomma: 1, nach: neuRechnen,
      hint: `p. a. im Forecast statt der Portfolio-Vorgabe (${num(state.daten.einstellungen.mietsteigerung ?? 0, 1)} %)`,
    }));
  }

  return abschnitt('Vertragsdaten', 'Laufzeit, Kaution und Anpassungsvereinbarung', [
    felderGitter(felder),
    el('div', { style: 'margin-top:4px;padding-top:12px;border-top:1px solid var(--border)' }, [
      schalterFeld('Unbefristeter Vertrag', mv, 'unbefristet', { nach: neuAufbauen }),
    ]),
    felderGitter(anpassung),
  ]);
}

/* ---------- Konditionen ---------- */

function konditionen(mv, neuZeichnen, obenNeu) {
  const tabellenOpt = { nach: obenNeu, umbauen: neuZeichnen };
  const heute = heuteISO();
  const gueltig = aktuelleKondition(mv, heute);
  const liste = [...(mv.konditionen || [])].sort((a, b) => String(a.gueltigAb).localeCompare(String(b.gueltigAb)));

  const zeilen = liste.map((k, i) => {
    const istGueltig = gueltig && k === gueltig;
    const zukunft = k.gueltigAb > heute;
    const vorher = liste[i - 1];
    const delta = vorher && vorher.kaltmiete && k.kaltmiete
      ? (k.kaltmiete - vorher.kaltmiete) / vorher.kaltmiete * 100
      : null;

    return el('tr' + (istGueltig ? '.zeile-aktiv' : ''), {}, [
      el('td', { style: 'width:150px' }, [tabellenDatum(k, 'gueltigAb', tabellenOpt)]),
      el('td', { style: 'width:130px' }, [tabellenZahl(k, 'kaltmiete', tabellenOpt)]),
      el('td', { style: 'width:130px' }, [tabellenZahl(k, 'nkVorauszahlung', tabellenOpt)]),
      el('td.num.faint', { style: 'width:80px', text: delta == null ? '' : (delta >= 0 ? '+' : '') + num(delta, 1) + ' %' }),
      el('td', {}, [tabellenText(k, 'notiz', { platzhalter: 'z. B. Staffel 2, Indexanpassung' })]),
      el('td', { style: 'width:96px' }, [
        istGueltig ? el('span.badge.gruen', { text: 'gültig' })
          : zukunft ? el('span.badge.blau', { text: 'geplant' })
          : el('span.badge.grau', { text: 'abgelöst' }),
      ]),
      el('td', { style: 'width:40px' }, [
        liste.length > 1
          ? el('button.icon-mini', {
              type: 'button', title: 'Zeile entfernen', html: '&times;',
              onclick: () => { aendern(() => { mv.konditionen = mv.konditionen.filter((x) => x !== k); }); neuZeichnen(); },
            })
          : null,
      ]),
    ]);
  });

  const tabelle = el('table.data.kompakt', {}, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Gültig ab' }),
      el('th', { style: 'text-align:right', text: 'Kaltmiete (€)' }),
      el('th', { style: 'text-align:right', text: 'NK (€)' }),
      el('th', { style: 'text-align:right', text: 'Δ' }),
      el('th', { text: 'Notiz' }),
      el('th', { text: 'Status' }),
      el('th', {}),
    ])]),
    el('tbody', {}, zeilen),
  ]);

  return abschnitt(
    'Mietkonditionen',
    'jede Mietänderung ist eine Zeile – auch jede Staffel',
    [
      tabelle,
      el('button.btn.btn-sm', {
        type: 'button', style: 'margin-top:12px',
        onclick: () => {
          const letzte = liste.at(-1);
          const [j, m, t] = (letzte?.gueltigAb || heute).split('-').map(Number);
          aendern(() => {
            mv.konditionen = [...(mv.konditionen || []), {
              id: uid('kond'),
              // ein Jahr nach der letzten Kondition, rein rechnerisch auf den
              // Datumsteilen – ohne Umweg über UTC
              gueltigAb: datumISO(new Date(j + 1, m - 1, t)),
              kaltmiete: letzte?.kaltmiete ?? null,
              nkVorauszahlung: letzte?.nkVorauszahlung ?? null,
              notiz: '',
            }];
          });
          neuZeichnen();
        },
      }, ['+ Mietanpassung']),
      mv.anpassungTyp === 'staffel'
        ? el('button.btn.btn-sm', {
            type: 'button', style: 'margin-top:12px;margin-left:8px',
            onclick: () => staffelnErzeugen(mv, () => { neuZeichnen(); obenNeu(); }),
          }, ['Staffeln erzeugen …'])
        : null,
    ].filter(Boolean)
  );
}

/* ---------- Löschen ---------- */

async function loeschen(mv) {
  const ok = await bestaetigen(
    `Mietvertrag „${mv.mieter || 'ohne Mieter'}" löschen?`,
    'Der Vertrag inklusive aller Mietkonditionen wird entfernt. Im Ordner „backups" liegt der Stand von heute.',
    { okText: 'Endgültig löschen', gefahr: true }
  );
  if (!ok) return;
  const dokIds = new Set(await dokumenteEntfernenFuer('mietvertrag', mv.id));
  aendern((d) => {
    d.mietvertraege = d.mietvertraege.filter((x) => x.id !== mv.id);
    d.dokumente = d.dokumente.filter((x) => !dokIds.has(x.id));
    d.protokoll = d.protokoll.filter((p) => p.bezugId !== mv.id);
  });
  toast('Mietvertrag gelöscht', 'ok');
  location.hash = '#/mietvertraege';
}

/* ---------- Mietanpassung ----------

   Eine Karte, drei Gesichter. Welche Rechnung gilt, entscheidet die
   Vereinbarung im Vertrag – und die drei Faelle haben rechtlich kaum etwas
   gemeinsam:

   - **keine**: Erhoehung bis zur ortsueblichen Vergleichsmiete, § 558 BGB.
   - **Staffel**: Die Stufen stehen fest und greifen von selbst, § 557a BGB.
   - **Index**: Nichts greift von selbst – es braucht eine Erklaerung in
     Textform, § 557b Abs. 3 BGB.

   Deshalb unterscheiden sich auch die Hinweise: Bei der Staffel ist die
   Mitteilung an den Mieter guter Stil, bei der Indexmiete
   Wirksamkeitsvoraussetzung. */

function mietanpassungKarte(mv, neu) {
  if (mv.anpassungTyp === 'staffel') return staffelKarte(mv);
  if (mv.anpassungTyp === 'index') return indexKarte(mv, neu);
  return mieterhoehungKarte(mv, neu);
}

/** Gemeinsame Beschriftungszeile der drei Karten. */
function anpassungsZeile(label, wert, sub, stark) {
  return el('div', {
    style: 'display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:7px 0',
  }, [
    el('div', {}, [
      el('div', { text: label }),
      sub ? el('div.faint', { text: sub, style: 'font-size:12px;margin-top:1px' }) : null,
    ]),
    el('span.num', { text: wert, style: stark ? 'font-weight:600' : '' }),
  ]);
}

/** Warnkasten im Stil von hinweis(), aber in der Warnfarbe. */
function erinnerung(kinder) {
  return el('div.note.note-warn', { style: 'margin-bottom:14px' }, [
    el('div.note-icon', { html:
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">'
      + '<path d="M12 9v4M12 17h.01"/>'
      + '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' }),
    el('div', {}, kinder),
  ]);
}

/* ---------- Staffelmiete ---------- */

function staffelKarte(mv) {
  const heute = heuteISO();
  const jetzt = aktuelleKondition(mv, heute);
  const kommend = (mv.konditionen || [])
    .filter((k) => k.gueltigAb > heute)
    .sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb));
  const h = anpassungHinweis(mv, heute);

  const inhalt = [];

  /* Der Hinweis zuerst, wenn eine Staffel bevorsteht – das ist der Grund,
     warum jemand diese Karte aufschlaegt. */
  if (h) {
    inhalt.push(erinnerung([
      el('div', { html: '<strong>In ' + h.tage + ' Tagen greift die nächste Staffel</strong> ('
        + datum(h.datum) + '): ' + eur(h.alteMiete) + ' → <strong>' + eur(h.neueMiete) + '</strong>.' }),
      el('div', { style: 'margin-top:6px', text:
        'Die Erhöhung wirkt kraft Vereinbarung, eine Erklärung ist nicht nötig. '
        + 'Sag dem Mieter trotzdem rechtzeitig Bescheid – sonst läuft sein Dauerauftrag weiter '
        + 'auf den alten Betrag und es entsteht ein Rückstand, den keiner gewollt hat.' }),
    ]));
  }

  inhalt.push(anpassungsZeile('Aktuelle Kaltmiete', eur(jetzt?.kaltmiete || 0),
    jetzt?.gueltigAb ? 'seit ' + datum(jetzt.gueltigAb) : null));

  if (!kommend.length) {
    inhalt.push(el('div.hint', { style: 'padding:8px 0', text:
      'Es sind keine weiteren Staffeln hinterlegt. Über „Staffeln erzeugen" in den '
      + 'Mietkonditionen legst du sie in einem Zug an.' }));
  } else {
    inhalt.push(el('div', { style: 'border-top:1px solid var(--border);margin-top:4px;padding-top:4px' },
      kommend.map((k, i) => {
        const vorher = i === 0 ? (jetzt?.kaltmiete || 0) : (kommend[i - 1].kaltmiete || 0);
        return anpassungsZeile(k.notiz || ('Staffel ' + (i + 1)), eur(k.kaltmiete || 0),
          'ab ' + datum(k.gueltigAb) + ' · +' + eur((k.kaltmiete || 0) - vorher));
      })));
    const letzte = kommend.at(-1);
    inhalt.push(el('div', { style: 'border-top:1px solid var(--border);margin-top:4px;padding-top:10px' }, [
      anpassungsZeile('Endmiete', eur(letzte.kaltmiete || 0),
        'ab ' + datum(letzte.gueltigAb) + ' · ' + eur((letzte.kaltmiete || 0) - (jetzt?.kaltmiete || 0)) + ' über heute',
        true),
    ]));
  }

  return abschnitt('Mietanpassung', 'Staffelmiete nach § 557a BGB', inhalt,
    'Während einer Staffelmiete sind Erhöhungen nach § 558 (Vergleichsmiete) und § 559 '
    + '(Modernisierung) <strong>ausgeschlossen</strong>. Die Vereinbarung muss schriftlich im '
    + 'Mietvertrag stehen und jede Staffel als Geldbetrag ausweisen; jede muss mindestens ein '
    + 'Jahr gelten. Die Mietpreisbremse gilt für jede Staffel gesondert (§ 557a Abs. 4 BGB).');
}

/* ---------- Indexmiete ---------- */

/* Nur Eingabehilfe fuer die Rechnung, gehoert nicht in die Daten: Der
   Indexstand wird erst beim Eintragen der Anpassung dauerhaft. */
let indexStandEingabe = null;

function indexKarte(mv, neuZeichnen) {
  const heute = heuteISO();
  const r = indexAnpassung(mv, indexStandEingabe, heute);
  const h = anpassungHinweis(mv, heute);
  const inhalt = [];

  if (h) {
    inhalt.push(erinnerung([
      el('div', { html: '<strong>Eine Indexanpassung ist seit ' + datum(h.datum) + ' möglich.</strong>' }),
      el('div', { style: 'margin-top:6px', html:
        'Sie tritt <strong>nicht von selbst ein</strong>: Nach § 557b Abs. 3 BGB wird sie erst '
        + 'durch eine <strong>Erklärung in Textform</strong> an den Mieter wirksam, in der die '
        + 'eingetretene Indexänderung und die neue Miete als Geldbetrag stehen. Geschuldet ist '
        + 'sie ab Beginn des übernächsten Monats nach Zugang.' }),
    ]));
  }

  const standFeld = el('input', {
    type: 'text', inputmode: 'decimal', value: indexStandEingabe ?? '',
    placeholder: 'z. B. 118,4',
    onchange: (ev) => { indexStandEingabe = parseZahl(ev.target.value); neuZeichnen(); },
  });
  inhalt.push(felderGitter([
    el('div.field', {}, [
      el('label', { text: 'Aktueller Indexstand' }), standFeld,
      el('div.hint', { text: 'Verbraucherpreisindex des Statistischen Bundesamtes · '
        + 'den Basisstand trägst du oben unter Vertragsdaten ein' }),
    ]),
  ]));

  inhalt.push(anpassungsZeile('Aktuelle Kaltmiete', eur(r.alteMiete),
    r.basisStand != null && r.basisDatum
      ? 'Index ' + num(r.basisStand, 1) + ' vom ' + datum(r.basisDatum) : null));
  if (r.fruehestensAb) {
    inhalt.push(anpassungsZeile('Frühestens anpassbar ab', datum(r.fruehestensAb),
      'die Miete muss zwölf Monate unverändert gelten (§ 557b Abs. 2 BGB)'));
  }

  if (r.neueMiete != null) {
    inhalt.push(el('div', { style: 'border-top:1px solid var(--border);margin-top:4px;padding-top:4px' }, [
      anpassungsZeile('Indexveränderung',
        (r.veraenderungProzent >= 0 ? '+' : '') + num(r.veraenderungProzent, 2) + ' %',
        num(r.basisStand, 1) + ' → ' + num(r.neuerStand, 1) + ' Punkte'),
      anpassungsZeile('Mögliche neue Kaltmiete', eur(r.neueMiete), null, true),
      anpassungsZeile('Erhöhung', (r.erhoehung >= 0 ? '+' : '') + eur(r.erhoehung),
        r.erhoehung > 0 ? num(r.erhoehung * 12, 0) + ' € im Jahr' : null),
      anpassungsZeile('Wirksam frühestens ab', datum(r.wirksamAb),
        'Beginn des übernächsten Monats nach Zugang der Erklärung'),
    ]));
  }
  if (r.grund) inhalt.push(el('div.hint', { style: 'padding:8px 0', text: r.grund }));

  if (r.moeglich) {
    inhalt.push(el('button.btn.btn-primary', {
      type: 'button', style: 'margin-top:10px',
      onclick: () => indexUebernehmen(mv, r, neuZeichnen),
    }, ['Als Mietanpassung eintragen']));
  }

  return abschnitt('Mietanpassung', 'Indexmiete nach § 557b BGB', inhalt,
    'Die Erhöhung wird <strong>nur durch Erklärung in Textform</strong> wirksam – ohne sie bleibt '
    + 'die alte Miete geschuldet. In der Erklärung müssen die eingetretene Indexänderung und die '
    + 'neue Miete oder die Erhöhung als Geldbetrag stehen. Erhöhungen nach § 558 BGB sind daneben '
    + 'ausgeschlossen. Diese Karte rechnet den Betrag – das Schreiben verfasst sie nicht.');
}

/** Traegt die errechnete Miete als neue Kondition ein, zum zulaessigen Termin. */
async function indexUebernehmen(mv, r, neuZeichnen) {
  const ok = await bestaetigen(
    'Als Mietanpassung eintragen?',
    'Neue Kaltmiete ' + eur(r.neueMiete) + ' ab ' + datum(r.wirksamAb) + '. '
    + 'Denk daran: Wirksam wird sie erst mit deiner Erklärung in Textform an den Mieter – '
    + 'der Eintrag hier ersetzt sie nicht.',
    { okText: 'Eintragen' }
  );
  if (!ok) return;
  const jetzt = aktuelleKondition(mv, heuteISO());
  aendern(() => {
    mv.konditionen = [...(mv.konditionen || []), {
      id: uid('kond'), gueltigAb: r.wirksamAb, kaltmiete: r.neueMiete,
      nkVorauszahlung: jetzt?.nkVorauszahlung ?? null,
      notiz: 'Indexanpassung ' + num(r.basisStand, 1) + ' → ' + num(r.neuerStand, 1),
    }];
    // Der neue Indexstand ist ab jetzt die Basis der geltenden Miete.
    mv.indexBasisStand = r.neuerStand;
    mv.indexBasisDatum = r.wirksamAb;
  });
  indexStandEingabe = null;
  toast('Mietanpassung eingetragen – Erklärung an den Mieter nicht vergessen', 'ok', 7000);
  neuZeichnen();
}

/* ---------- Mieterhöhung (§ 558 BGB) ---------- */

/**
 * Zeigt den Spielraum bis zur ortsüblichen Vergleichsmiete.
 *
 * Bewusst eine Abschätzung und kein Erhöhungsschreiben: Form und Begründung
 * des Verlangens regelt § 558a, Modernisierungsumlagen § 559 – beides steht
 * hier nicht zur Debatte. Der Hinweis am Fuß sagt das.
 */
function mieterhoehungKarte(mv, neu) {
  const p = mieterhoehungsPotenzial(mv);
  const e = einheitMit(mv.einheitId);
  const heute = heuteISO();

  const zeile = (label, wert, sub, stark) => el('div', {
    style: 'display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:7px 0',
  }, [
    el('div', {}, [
      el('div', { text: label }),
      sub ? el('div.faint', { text: sub, style: 'font-size:12px;margin-top:1px' }) : null,
    ]),
    el('span.num', { text: wert, style: stark ? 'font-weight:600' : '' }),
  ]);

  const inhalt = [];

  /* Das Mietspiegelfeld steht immer da – ohne den Wert bleibt die Obergrenze
     offen, und das ist die wichtigste Information der ganzen Karte. */
  if (e) {
    inhalt.push(felderGitter([
      zahlFeld('Ortsübliche Vergleichsmiete', e, 'vergleichsmieteQm', {
        suffix: '€/m²', nachkomma: 2, nach: neu,
        hint: 'aus dem Mietspiegel deiner Gemeinde · ohne diesen Wert kennt die Rechnung nur die Kappungsgrenze',
      }),
    ]));
  }

  if (!p.moeglich && p.grund) {
    inhalt.push(el('div.hint', { style: 'padding:8px 0', text: p.grund }));
  }

  if (p.letzteAenderung) {
    const gesperrt = heute < p.wirksamAb;
    inhalt.push(el('div', { style: 'border-top:1px solid var(--border);margin-top:4px;padding-top:4px' }, [
      zeile('Aktuelle Kaltmiete', eur(p.aktuell),
        p.flaeche ? `${num(p.aktuell / p.flaeche, 2)} €/m² · ${num(p.flaeche, 0)} m²` : null),
      zeile('Letzte Mietänderung', datum(p.letzteAenderung)),
      zeile('Erhöhung verlangen ab', datum(p.verlangenAb), 'frühestens ein Jahr danach (§ 558 Abs. 1 S. 2)'),
      zeile('Wirksam frühestens ab', datum(p.wirksamAb),
        gesperrt ? 'die Miete muss 15 Monate unverändert sein' : 'Sperrfrist abgelaufen', true),
    ]));
  }

  if (p.grenzeKappung != null) {
    inhalt.push(el('div', { style: 'border-top:1px solid var(--border);margin-top:4px;padding-top:4px' }, [
      zeile(`Kappungsgrenze ${num(p.kappungsgrenze, 0)} %`, eur(p.grenzeKappung),
        `auf ${eur(p.basisDreiJahre)} drei Jahre vor Wirksamwerden`),
      p.grenzeVergleich != null
        ? zeile('Ortsübliche Vergleichsmiete', eur(p.grenzeVergleich),
            `${num(p.flaeche, 0)} m² × ${num(p.vergleichsmieteQm, 2)} €/m²`)
        : el('div.hint', { style: 'padding:7px 0', text:
            'Ohne Mietspiegelwert ist die Obergrenze offen – der Betrag unten ist nur die '
            + 'Kappungsgrenze und taugt nicht als Forderung.' }),
    ]));
  }

  if (p.moeglich) {
    inhalt.push(el('div', { style: 'border-top:1px solid var(--border);margin-top:4px;padding-top:10px' }, [
      zeile('Mögliche neue Kaltmiete', eur(p.neueMiete),
        p.begrenztDurch === 'vergleichsmiete' ? 'begrenzt durch die Vergleichsmiete' : 'begrenzt durch die Kappungsgrenze',
        true),
      el('div', { style: 'display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:7px 0' }, [
        el('div', {}, [
          el('div', { text: 'Spielraum' }),
          el('div.faint', { text: `${num(p.potenzial * 12, 0)} € im Jahr`, style: 'font-size:12px;margin-top:1px' }),
        ]),
        el('span.num.pos', { text: '+' + eur(p.potenzial), style: 'font-weight:600;font-size:17px' }),
      ]),
    ]));
  }

  return abschnitt('Mieterhöhung', 'Spielraum nach § 558 BGB', inhalt,
    'Eine Abschätzung, <strong>kein Erhöhungsschreiben</strong>. Form und Begründung des '
    + 'Verlangens regelt § 558a BGB, Modernisierungen § 559 BGB. Die Kappungsgrenze liegt bei '
    + '20 %, in Gebieten mit angespanntem Wohnungsmarkt bei 15 % – welche gilt, sagt die '
    + 'Verordnung deines Landes; abweichend eintragen kannst du sie am Objekt.');
}


/* ---------- Staffeln erzeugen ---------- */

/**
 * Legt die Staffeln als Konditionen an.
 *
 * Die Vorschau rechnet live mit, bevor irgendetwas gespeichert wird – wer
 * fünf Staffeln über zehn Jahre anlegt, will vorher sehen, wo er landet.
 *
 * § 557a verlangt den Ausweis als Geldbetrag; ein eingegebener Prozentsatz
 * wird deshalb sofort in Beträge umgerechnet und so abgelegt.
 */
async function staffelnErzeugen(mv, fertig) {
  const heute = heuteISO();
  const jetzt = aktuelleKondition(mv, heute);
  const basis = jetzt?.kaltmiete || 0;
  const geplant = (mv.konditionen || []).filter((k) => k.gueltigAb > heute);

  const eingabe = {
    ersteAb: datumPlus12(jetzt?.gueltigAb || mv.beginn || heute),
    rhythmusMonate: mv.staffelRhythmusMonate || 12,
    modus: 'betrag',
    wert: null,
    anzahl: 3,
  };

  const vorschauBox = el('div');
  const feld = (label, kind, hint) => el('div.field', {}, [
    el('label', { text: label }), kind,
    hint ? el('div.hint', { text: hint }) : null,
  ]);
  const zahl = (schluessel, attr = {}) => el('input', {
    type: 'text', inputmode: 'decimal', value: eingabe[schluessel] ?? '', ...attr,
    oninput: (e) => { eingabe[schluessel] = parseZahl(e.target.value); zeichnen(); },
  });

  const modusWahl = el('select', {
    onchange: (e) => { eingabe.modus = e.target.value; zeichnen(); },
  }, [
    el('option', { value: 'betrag', selected: true }, ['Fester Betrag (€)']),
    el('option', { value: 'prozent' }, ['Prozent der Vorstaffel']),
  ]);

  const zeichnen = () => {
    const v = staffelVorschau(eingabe, basis);
    leeren(vorschauBox);
    if (v.fehler.length) {
      vorschauBox.append(el('div.hint', { style: 'color:var(--warn)', text: v.fehler[0] }));
      return;
    }
    vorschauBox.append(el('table.data.kompakt', {}, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Staffel' }),
        el('th', { text: 'ab' }),
        el('th', { style: 'text-align:right', text: 'Kaltmiete' }),
        el('th', { style: 'text-align:right', text: 'gegenüber heute' }),
      ])]),
      el('tbody', {}, v.stufen.map((st) => el('tr', {}, [
        el('td', { text: String(st.stufe) }),
        el('td', { text: datum(st.gueltigAb) }),
        el('td.num', { text: eur(st.kaltmiete) }),
        el('td.num.pos', { text: '+' + eur(st.kaltmiete - basis) }),
      ]))),
    ]));
  };
  zeichnen();

  const inhalt = el('div', { style: 'display:grid;gap:12px' }, [
    hinweis('<strong>Staffelmiete nach § 557a BGB.</strong> Jede Staffel muss mindestens ein Jahr '
      + 'gelten, und die Miete ist als <em>Geldbetrag</em> auszuweisen – ein Prozentsatz hier wird '
      + 'deshalb in Beträge umgerechnet. Während der Staffel sind Erhöhungen nach § 558 und § 559 '
      + 'ausgeschlossen, und die Vereinbarung gehört schriftlich in den Mietvertrag.'),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' }, [
      feld('Erste Staffel ab', el('input', {
        type: 'date', value: eingabe.ersteAb,
        onchange: (e) => { eingabe.ersteAb = e.target.value || null; zeichnen(); },
      })),
      feld('Abstand', zahl('rhythmusMonate'), `Monate, mindestens ${STAFFEL_MINDEST_MONATE}`),
      feld('Erhöhung je Staffel', modusWahl),
      feld('Wert', zahl('wert'), `heutige Kaltmiete ${eur(basis)}`),
      feld('Anzahl Staffeln', zahl('anzahl')),
    ]),
    vorschauBox,
    geplant.length
      ? el('div.hint', { style: 'color:var(--warn)', text:
          `${geplant.length} bereits geplante Kondition${geplant.length === 1 ? '' : 'en'} `
          + 'in der Zukunft werden dabei ersetzt.' })
      : null,
  ].filter(Boolean));

  const wahl = await modal({
    titel: 'Staffeln erzeugen', inhalt, breite: 620,
    buttons: [
      { text: 'Abbrechen', wert: null },
      { text: geplant.length ? 'Ersetzen' : 'Übernehmen', klasse: 'btn-primary', wert: '\0' },
    ],
  });
  if (wahl !== '\0') return;

  const v = staffelVorschau(eingabe, basis);
  if (v.fehler.length) { toast(v.fehler[0], 'err', 6000); return; }

  aendern(() => {
    mv.staffelRhythmusMonate = eingabe.rhythmusMonate;
    // Geplante Konditionen weichen den neuen Staffeln; Vergangenes bleibt.
    mv.konditionen = (mv.konditionen || []).filter((k) => k.gueltigAb <= heute);
    for (const st of v.stufen) {
      mv.konditionen.push({
        id: uid('kond'), gueltigAb: st.gueltigAb, kaltmiete: st.kaltmiete,
        nkVorauszahlung: jetzt?.nkVorauszahlung ?? null,
        notiz: `Staffel ${st.stufe}`,
      });
    }
  });
  toast(`${v.stufen.length} Staffeln angelegt`, 'ok');
  fertig();
}

/** Ein Jahr nach diesem Datum – die früheste zulässige erste Staffel. */
function datumPlus12(iso) {
  const [j, m, t] = String(iso).split('-').map(Number);
  return datumPlusMonate(new Date(j, (m || 1) - 1, t || 1), 12);
}
function datumPlusMonate(d, monate) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const tag = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + monate);
  x.setDate(Math.min(tag, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return datumISO(x);
}
