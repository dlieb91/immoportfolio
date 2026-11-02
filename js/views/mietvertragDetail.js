/* Mietvertrag im Detail: Zuordnung, Laufzeit, Mietkonditionen als Zeitreihe. */

import { el, leeren, eur, num, datum, datumISO, uid, heuteISO, toast, bestaetigen } from '../util.js';
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
import { mieterhoehungsPotenzial } from '../mieterhoehung.js';
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
    inner.append(neuZeichnend((z) => mieterhoehungKarte(mv, () => { z(); obenNeu(); })));
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
    ], { nach: neuAufbauen, hint: 'Staffeln trägst du unten als Konditionen ein' }),
  ];
  if (mv.anpassungTyp === 'index') {
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
    'jede Mietänderung ist eine Zeile – Staffelmieten trägst du mit künftigem Datum ein',
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
    ]
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
