/* Objekt-Detailansicht: alle Parameter bearbeiten, Bilder verwalten, löschen. */

import { el, leeren, eur, num, datum, uid, toast, bestaetigen, heuteISO } from '../util.js';
import {
  state, aendern, objekt as objektMit, nebenkostenBerechnen, nkPosition,
  einheitenVon, mietvertraegeZuObjekt, finanzierungenVon, GRUNDERWERBSTEUER,
  neueEinheit, einheitName, einheitSicherstellen, mieteEinheit, mieteVon,
  mieteObjekt, vertragStatus, vertragsEnde, verkehrswert, hauptbild,
  neueBuchung, neueFahrt, buchungenVon, fahrtenVon,
} from '../store.js';
import { bildURL, bildSpeichern, bildLoeschen } from '../storage.js';
import {
  textFeld, zahlFeld, zahlEingabe, datumFeld, auswahlFeld, schalterFeld, textBereich,
  anzeigeFeld, felderGitter, abschnitt, parseZahl,
  tabellenDatum, tabellenZahl, tabellenText, tabellenAuswahl,
} from '../felder.js';
import { OBJEKTTYPEN, typText } from './objekte.js';
import { anlegen as mietvertragAnlegen, STATUS_TEXT, STATUS_KLASSE } from './mietvertraege.js';
import {
  anlegen as darlehenAnlegen, artText, finanzierungKennzahlen, balken,
} from './finanzierungen.js';
import {
  afaWerte, objektKennzahlen, steuerModus, effektiverSteuersatz, kapitalbindung,
} from '../kennzahlen.js';
import { KATEGORIEN, nkAbrechnungObjekt, erhaltungsAmpel, fahrtBetrag } from '../buchhaltung.js';
import { dokumenteKarte, protokollKarte, dokumenteEntfernenFuer } from './dokumente.js';

export const objektDetail = {
  render(container) {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
    const o = id ? objektMit(id) : null;

    if (!o) {
      container.append(el('div.view-inner', {}, [
        el('div.card', {}, [
          el('div.empty', {}, [
            el('div.empty-icon', { text: '🤷' }),
            el('h3', { text: 'Objekt nicht gefunden' }),
            el('p', { text: 'Das Objekt wurde vermutlich gelöscht.' }),
            el('a.btn.btn-primary', { href: '#/objekte' }, ['Zur Objektliste']),
          ]),
        ]),
      ]));
      return;
    }

    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });
    container.append(inner);

    const allesNeu = () => { leeren(container); this.render(container); };

    // Kennzahlen, Cashflow und Kapital hängen an allem und werden nachgezogen,
    // ohne die Eingabekarten neu zu bauen – sonst bricht das Tippen ab.
    const kpiBox = el('div', {}, [kennzahlen(o)]);
    const cfBox = el('div', {}, [cashflowKarte(o)]);
    const kapBox = el('div', {}, [kapitalKarte(o)]);
    const nkBox = el('div', {}, [nkAbrechnungKarte(o)].filter(Boolean));
    const obenNeu = () => {
      leeren(kpiBox).append(kennzahlen(o));
      leeren(cfBox).append(cashflowKarte(o));
      leeren(kapBox).append(kapitalKarte(o));
      leeren(nkBox).append(...[nkAbrechnungKarte(o)].filter(Boolean));
    };

    inner.append(kopf(o));
    inner.append(kpiBox, cfBox, kapBox);
    inner.append(stammdaten(o, inner, allesNeu));
    inner.append(neuZeichnend((z) => einheitenKarte(o, z)));
    inner.append(neuZeichnend((z) => mietvertraegeKarte(o, z)));
    inner.append(neuZeichnend((z) => finanzierungenKarte(o, z)));
    inner.append(neuZeichnend((z) => kaufKarte(o, () => { z(); obenNeu(); }, obenNeu)));
    inner.append(steuerKarte(o, obenNeu));
    inner.append(neuZeichnend((z) => verkehrswertKarte(o, () => { z(); obenNeu(); }, obenNeu)));
    inner.append(neuZeichnend((z) => modernisierungKarte(o, () => { z(); obenNeu(); }, obenNeu)));
    inner.append(kostenKarte(o, obenNeu));
    inner.append(neuZeichnend((z) => buchungenKarte(o, z, obenNeu)));
    inner.append(nkBox);
    inner.append(neuZeichnend((z) => bilderKarte(o, z)));
    inner.append(neuZeichnend((z) => dokumenteKarte('objekt', o.id, z)));
    inner.append(abschnitt('Notizen', null, textBereich(null, o, 'notizen', {
      zeilen: 5, platzhalter: 'Freitext zum Objekt – Besonderheiten, Ansprechpartner, offene Punkte …',
      protokollLabel: 'Notizen', bezug: o.id,
    })));
    inner.append(protokollKarte(o.id));
  },
};

/** Container, dessen Inhalt sich selbst neu aufbauen kann. */
function neuZeichnend(bauen) {
  const wrap = el('div');
  const zeichne = () => { leeren(wrap); wrap.append(bauen(zeichne)); };
  zeichne();
  return wrap;
}

/* ---------- Kopfbereich ---------- */

function kopf(o) {
  const bild = hauptbild(o);
  const thumb = el('div.detail-bild', {}, [el('span', { text: '🏠' })]);
  if (bild) {
    bildURL(bild.datei, true).then((url) => {
      if (url) { leeren(thumb); thumb.append(el('img', { src: url, alt: '' })); }
    });
  }

  return el('div.detail-kopf', {}, [
    thumb,
    el('div', { style: 'min-width:0;flex:1' }, [
      el('a.zurueck', { href: '#/objekte' }, ['← Objektliste']),
      el('h2', { text: o.bezeichnung || 'Ohne Bezeichnung', style: 'font-size:20px;margin-top:4px' }),
      el('div.faint', { text: [o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Keine Adresse hinterlegt', style: 'margin-top:3px' }),
      el('div.obj-badges', { style: 'margin-top:9px' }, [
        el('span.badge', { text: typText(o.typ) }),
        o.bundesland ? el('span.badge', { text: o.bundesland }) : null,
        o.kaufdatum ? el('span.badge', { text: 'Kauf ' + datum(o.kaufdatum) }) : null,
        el('span.badge.blau', { text: 'Stand ' + datum(heuteISO()) }),
      ]),
    ]),
    el('div', { style: 'display:flex;gap:8px;align-items:flex-start' }, [
      el('a.btn.btn-sm', { href: '#/einzelobjekt?id=' + o.id, title: 'Entwicklung dieses Objekts über die Jahre' }, ['Einzelbetrachtung']),
      el('button.btn.btn-danger.btn-sm', { type: 'button', onclick: () => loeschen(o) }, ['Objekt löschen']),
    ]),
  ]);
}

function kennzahlen(o) {
  const z = objektKennzahlen(o);
  const nach = steuerModus() === 'nach';
  const cf = nach ? z.cashflowNachSteuer : z.cashflowVorSteuer;
  const delta = z.verkehrswert - z.kaufpreis;

  const k = (label, wert, sub, klasse) => el('div.kpi' + (klasse ? '.' + klasse : ''), {}, [
    el('div.kpi-label', { text: label }),
    el('div.kpi-value', { text: wert }),
    sub ? el('div.kpi-sub', { text: sub }) : null,
  ]);

  return el('div.grid.grid-kpi', {}, [
    k('Gesamtinvestition', eur(z.investition, 0),
      `Kaufpreis + ${num(z.kaufpreis ? (z.nebenkosten / z.kaufpreis * 100) : 0, 1)} % Nebenkosten`
        + (z.eigenprovision ? ` · abzgl. ${eur(z.eigenprovision, 0)} Eigenprovision` : '')),
    k('Verkehrswert', eur(z.verkehrswert, 0),
      (delta >= 0 ? '+' : '') + eur(delta, 0) + ' ggü. Kaufpreis', delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''),
    k('Kaltmiete / Monat', z.kaltmieteMonat ? eur(z.kaltmieteMonat) : '–',
      z.einheiten ? `${z.vermietet} von ${z.einheiten} Einheiten vermietet` : 'kein Mietvertrag'),
    k(`Cashflow ${z.jahr}`, eur(cf, 0),
      z.angeschnitten ? `angeschnittenes Jahr, ${z.monateVermietet} Monate vermietet` : eur(cf / 12, 0) + ' pro Monat',
      cf >= 0 ? 'pos' : 'neg'),
    k('Bruttomietrendite', z.bruttorenditeKaufpreis ? num(z.bruttorenditeKaufpreis, 2) + ' %' : '–',
      z.bruttorendite ? `auf Kaufpreis · ${num(z.bruttorendite, 2)} % inkl. Nebenkosten` : 'Jahreskaltmiete / Kaufpreis'),
    k('Eingesetztes Eigenkapital', eur(z.eigenkapitalEingesetzt, 0),
      z.darlehenssumme ? `${eur(z.darlehenssumme, 0)} fremdfinanziert` : 'vollständig aus Eigenmitteln'),
    k('Getilgt', eur(z.getilgt, 0),
      z.darlehenssumme ? `${num(z.getilgtProzent, 1)} % · Restschuld ${eur(z.restschuld, 0)}` : 'kein Darlehen'),
    ...(z.mitErsatz ? [
      k('Tilgungsersatz-Guthaben', eur(z.ersatzGuthaben, 0),
        `${eur(z.ersatzEingezahlt, 0)} eingezahlt · ${eur(z.ersatzErtrag, 0)} Zinsertrag`, 'pos'),
    ] : []),
  ]);
}

/* ---------- Cashflow ---------- */

function cashflowKarte(o) {
  const z = objektKennzahlen(o);
  const nach = steuerModus() === 'nach';
  const cf = nach ? z.cashflowNachSteuer : z.cashflowVorSteuer;
  const fl = z.flaeche;

  const zeile = (label, wert, art, hinweisText) => el('tr', {}, [
    el('td', {}, [
      el('span', { text: label, style: art === 'summe' ? 'font-weight:600' : 'color:var(--text-faint)' }),
      hinweisText ? el('div.faint', { text: hinweisText, style: 'font-size:11.5px' }) : null,
    ]),
    el('td.num', {
      text: (art === 'abzug' && wert > 0 ? '− ' : '') + eur(wert, 0),
      style: art === 'summe' ? 'font-weight:600' : '',
    }),
    el('td.num.faint', { text: fl ? num(wert / fl, 2) : '', style: 'width:80px;font-size:12px' }),
  ]);

  const zeilen = [
    zeile('Kaltmiete', z.kaltmieteJahr, null,
      z.angeschnitten
        ? `${z.monateVermietet} Monate à ${eur(z.kaltmieteMonat, 0)}`
        : `${eur(z.kaltmieteMonat, 0)} pro Monat`),
    z.hausgeldNichtUmlagefaehig ? zeile('Hausgeld nicht umlagefähig', z.hausgeldNichtUmlagefaehig, 'abzug') : null,
    z.verwaltung ? zeile('Verwaltung', z.verwaltung, 'abzug') : null,
    z.instandhaltung ? zeile('Instandhaltung', z.instandhaltung, 'abzug') : null,
    z.sonstige ? zeile('Sonstige Kosten', z.sonstige, 'abzug') : null,
    z.grundsteuer ? zeile('Grundsteuer', z.grundsteuer, 'abzug') : null,
    z.versicherung ? zeile('Versicherung', z.versicherung, 'abzug') : null,
    z.erhaltung ? zeile('Erhaltungsaufwand', z.erhaltung, 'abzug') : null,
    z.fahrtkosten ? zeile('Fahrtkosten', z.fahrtkosten, 'abzug') : null,
    z.sonstigeWk ? zeile('Sonstige Werbungskosten', z.sonstigeWk, 'abzug') : null,
    zeile('Zinsen', z.zins, 'abzug'),
    z.tilgung ? zeile('Tilgung', z.tilgung, 'abzug') : null,
    z.sondertilgung ? zeile('Sondertilgung', z.sondertilgung, 'abzug') : null,
    z.tilgungsersatz ? zeile('Tilgungsersatzleistung', z.tilgungsersatz, 'abzug', 'aufs Ansparkonto, nicht abzugsfähig') : null,
    zeile('Cashflow vor Steuern', z.cashflowVorSteuer, 'summe'),
  ].filter(Boolean);

  if (nach) {
    zeilen.push(
      el('tr', {}, [el('td', { colspan: 3, style: 'height:10px;border:none' })]),
      zeile('Einkünfte aus Vermietung', z.einkuenfte, null,
        z.umlagen ? 'Kaltmiete + Umlagen − Werbungskosten' : 'Kaltmiete − Werbungskosten'),
      zeile('davon Abschreibung', z.afaJahr, 'abzug', `${num(o.afaSatz ?? 0, 1)} % auf ${eur(z.afaBemessung, 0)}`),
      zeile(z.steuer >= 0 ? 'Steuer' : 'Steuererstattung', Math.abs(z.steuer),
        z.steuer >= 0 ? 'abzug' : null, `${num(z.steuersatz, 1)} % effektiv`),
      zeile('Cashflow nach Steuern', z.cashflowNachSteuer, 'summe'),
    );
  }

  const kennzahl = (label, wert, unter) => el('div', {}, [
    el('div.faint', { text: label, style: 'font-size:11.5px' }),
    el('div.num', { text: wert, style: 'font-weight:600;font-size:14px;margin-top:2px' }),
    unter ? el('div.faint', { text: unter, style: 'font-size:11px;margin-top:1px' }) : null,
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: `Cashflow ${z.jahr}` }),
        el('div.sub', {
          text: nach
            ? `nach Steuern mit ${num(effektiverSteuersatz(o), 1)} % effektivem Steuersatz`
            : 'vor Steuern · umlagefähige Kosten bleiben als durchlaufender Posten außen vor',
        }),
      ]),
      el('span.badge.' + (cf >= 0 ? 'gruen' : 'rot'), { text: eur(cf, 0) }),
    ]),
    el('div.card-body', {}, [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Position' }),
          el('th', { style: 'text-align:right', text: 'pro Jahr' }),
          el('th', { style: 'text-align:right', text: fl ? '€/m²' : '' }),
        ])]),
        el('tbody', {}, zeilen),
      ]),
      el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:18px;padding-top:16px;border-top:1px solid var(--border)' }, [
        kennzahl('Kaufpreisfaktor', z.kaufpreisfaktor ? num(z.kaufpreisfaktor, 1) : '–',
          z.kaufpreisfaktorGesamt ? num(z.kaufpreisfaktorGesamt, 1) + ' inkl. Nebenkosten' : null),
        kennzahl('Nettomietrendite', num(z.nettorendite, 2) + ' %', 'nach Bewirtschaftung'),
        kennzahl('Kapitaldienstdeckung', z.dscr != null ? num(z.dscr, 2) : '–', 'ab 1,0 trägt sich das Objekt'),
        kennzahl('EK-Rendite (Cashflow)', z.ekRenditeCashflow != null ? num(z.ekRenditeCashflow, 2) + ' %' : '–',
          'Cash-on-Cash nach Steuern'),
        kennzahl('EK-Rendite inkl. Tilgung', z.ekRenditeGesamt != null ? num(z.ekRenditeGesamt, 2) + ' %' : '–',
          'zzgl. Vermögensaufbau'),
        z.betriebskostenUmlagefaehig
          ? kennzahl('Nebenkosten-Saldo', eur(z.nkSaldo, 0), 'Umlagen − umlagefähige Kosten')
          : null,
      ].filter(Boolean)),
      el('div.hint', { style: 'margin-top:10px' }, [
        'Alle Verhältniszahlen rechnen mit den kommenden zwölf Monaten '
        + `(Kaltmiete ${eur(z.kaltmieteRunrate, 0)}, Kapitaldienst ${eur(z.kapitaldienst12, 0)}), `
        + 'damit ein angeschnittenes Jahr sie nicht verzerrt. '
        + 'Der Kaufpreisfaktor bezieht sich auf den reinen Kaufpreis; Wertsteigerung bleibt in allen Renditen außen vor.',
      ]),
      nach
        ? el('div.hint', { style: 'margin-top:6px' },
            [`Der Steuersatz wirkt auf die Einkünfte (${eur(z.einkuenfte, 0)}), nicht auf den Cashflow. `
              + `Die Tilgung mindert den Cashflow, ist aber nicht abzugsfähig; die Abschreibung mindert die Steuer, kostet aber kein Geld.`])
        : null,
    ]),
  ]);
}

/* ---------- Kapitalbindung ---------- */

/** „2026-09" → „09/2026" */
const monatKurz = (p) => (p ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : '–');

function kapitalKarte(o) {
  const z = objektKennzahlen(o);
  const kb = kapitalbindung(o);
  const nach = steuerModus() === 'nach';
  const kumuliert = nach ? kb.kumuliertNachSteuer : kb.kumuliertVorSteuer;
  const gebunden = nach ? kb.gebundenNachSteuer : kb.gebundenVorSteuer;

  const zeile = (label, wert, art, unter) => el('tr', {}, [
    el('td', {}, [
      el('span', { text: label, style: art === 'summe' ? 'font-weight:600' : 'color:var(--text-faint)' }),
      unter ? el('div.faint', { text: unter, style: 'font-size:11.5px' }) : null,
    ]),
    el('td.num', {
      text: (art === 'abzug' && wert > 0 ? '− ' : '') + eur(wert, 0),
      style: art === 'summe' ? 'font-weight:600' : '',
    }),
  ]);

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [
        el('h2', { text: 'Eingesetztes Kapital' }),
        el('div.sub', { text: 'ohne Tilgung und ohne Wertsteigerung – die stehen separat' }),
      ]),
    ]),
    el('div.card-body', {}, [
      el('div.grid.grid-2', {}, [
        el('table.data.kompakt', {}, [el('tbody', {}, [
          zeile('Gesamtinvestition', z.investition, null,
            'Kaufpreis inkl. Nebenkosten' + (z.eigenprovision ? ', abzgl. Eigenprovision' : '')),
          zeile('Darlehen', z.darlehenssumme, 'abzug'),
          zeile('Eingesetztes Eigenkapital', z.eigenkapitalEingesetzt, 'summe'),
          el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
          zeile(
            kb.monate ? `Geflossene Cashflows (${kb.monate} ${kb.monate === 1 ? 'Monat' : 'Monate'})` : 'Geflossene Cashflows',
            kb.monate ? kumuliert : 0, null,
            kb.monate
              ? `${monatKurz(kb.abMonat)} – ${monatKurz(kb.bis)} · ${nach ? 'nach Steuern' : 'vor Steuern'}`
              : 'noch nichts geflossen, der Kauf steht bevor'),
          zeile('Heute gebundenes Kapital', gebunden, 'summe',
            kumuliert < 0 ? 'Zuschüsse erhöhen das gebundene Kapital' : 'Überschüsse haben Kapital zurückgeführt'),
        ])]),
        el('table.data.kompakt', {}, [el('tbody', {}, [
          zeile('Darlehenssumme', z.darlehenssumme),
          zeile('Restschuld heute', z.restschuld, 'abzug'),
          zeile('Getilgt', z.getilgt, 'summe', `${num(z.getilgtProzent, 1)} % des Darlehens`),
          el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
          zeile('Verkehrswert', z.verkehrswert),
          zeile('Restschuld', z.restschuld, 'abzug'),
          zeile('Vermögenswert im Objekt', z.eigenkapital, 'summe', 'Verkehrswert abzüglich Restschuld'),
          ...(z.mitErsatz ? [
            el('tr', {}, [el('td', { colspan: 2, style: 'height:8px;border:none' })]),
            zeile('Tilgungsersatz eingezahlt', z.ersatzEingezahlt, null, 'ohne Verzinsung'),
            zeile('Zinsertrag des Guthabens', z.ersatzErtrag),
            zeile('Ansparguthaben', z.ersatzGuthaben, 'summe', 'inklusive Verzinsung'),
          ] : []),
        ])]),
      ]),
      el('div.hint', { style: 'margin-top:12px', text:
        'Gezählt wird nur bis zum laufenden Monat – künftige Monate des Kalenderjahres bleiben außen vor, '
        + 'anders als in der Cashflow-Tabelle oben. Die Werte sind überschlägig: Mieten und Zinsen stammen '
        + 'aus den erfassten Konditionen und dem Tilgungsplan, laufende Kosten und Steuersatz werden mit den '
        + 'heutigen Werten gerechnet.' }),
    ]),
  ]);
}

/* ---------- Stammdaten ---------- */

function stammdaten(o, inner, allesNeu) {
  const kopfNeu = () => {
    const alt = inner.querySelector('.detail-kopf');
    if (alt) alt.replaceWith(kopf(o));
  };

  const laender = [{ wert: '', text: '– keines –' },
    ...Object.keys(GRUNDERWERBSTEUER).map((b) => ({ wert: b, text: b }))];

  return abschnitt('Stammdaten', 'Bezeichnung, Lage und Gebäudedaten', [
    felderGitter([
      textFeld('Bezeichnung', o, 'bezeichnung', { nach: kopfNeu }),
      auswahlFeld('Objekttyp', o, 'typ', OBJEKTTYPEN, { nach: kopfNeu }),
      textFeld('Straße & Hausnummer', o, 'strasse', { nach: kopfNeu }),
      textFeld('PLZ', o, 'plz', { nach: kopfNeu }),
      textFeld('Ort', o, 'ort', { nach: kopfNeu }),
      auswahlFeld('Bundesland', o, 'bundesland', laender, { hint: 'bestimmt die Grunderwerbsteuer', nach: kopfNeu }),
      zahlFeld('Baujahr', o, 'baujahr', { nachkomma: 0, nach: kopfNeu }),
      zahlFeld('Wohn-/Nutzfläche', o, 'flaeche', { suffix: 'm²', nachkomma: 2, hint: o.mehrereEinheiten ? 'wird bei erfassten Einheiten überschrieben' : '' }),
      zahlFeld('Zimmer', o, 'zimmer', { nachkomma: 1 }),
    ]),
    el('div', { style: 'margin-top:6px;padding-top:14px;border-top:1px solid var(--border)' }, [
      schalterFeld('Objekt hat mehrere Einheiten', o, 'mehrereEinheiten', {
        hint: 'Für Mehrfamilienhäuser: Einheiten werden einzeln erfasst, Mietverträge hängen an der jeweiligen Einheit.',
        nach: () => {
          // Die automatisch angelegte Einheit eines Einzelobjekts wird sichtbar
          if (o.mehrereEinheiten) {
            const vorhanden = einheitenVon(o.id);
            const implizite = vorhanden.find((e) => e.implizit);
            if (implizite) {
              aendern(() => {
                implizite.implizit = false;
                implizite.bezeichnung = implizite.bezeichnung || 'Einheit 1';
              });
            }
          }
          allesNeu();
        },
      }),
    ]),
  ]);
}

/* ---------- Einheiten ---------- */

function einheitenKarte(o, neuZeichnen) {
  if (!o.mehrereEinheiten) return el('div', { hidden: true });

  const einheiten = einheitenVon(o.id);
  const flaecheSumme = einheiten.reduce((s, e) => s + (e.flaeche || 0), 0);

  const zeilen = einheiten.map((e) => {
    const miete = mieteEinheit(e.id);
    return el('tr', {}, [
      el('td', {}, [el('input', {
        type: 'text', value: e.bezeichnung || '', placeholder: 'z. B. Wohnung 1 OG links',
        onchange: (ev) => aendern(() => { e.bezeichnung = ev.target.value; }),
      })]),
      el('td', { style: 'width:150px' }, [el('input', {
        type: 'text', value: e.lage || '', placeholder: 'Lage',
        onchange: (ev) => aendern(() => { e.lage = ev.target.value; }),
      })]),
      el('td', { style: 'width:110px' }, [el('input', {
        type: 'text', inputmode: 'decimal', style: 'text-align:right',
        value: e.flaeche == null ? '' : num(e.flaeche, 2),
        onchange: (ev) => { aendern(() => { e.flaeche = parseZahl(ev.target.value); }); neuZeichnen(); },
      })]),
      el('td', { style: 'width:90px' }, [el('input', {
        type: 'text', inputmode: 'decimal', style: 'text-align:right',
        value: e.zimmer == null ? '' : num(e.zimmer, 1),
        onchange: (ev) => aendern(() => { e.zimmer = parseZahl(ev.target.value); }),
      })]),
      el('td', { style: 'width:230px' }, [
        miete.anzahl
          ? el('div', {}, [
              ...miete.vertraege.map((v) => el('a', {
                href: '#/mietvertrag?id=' + v.id,
                style: 'display:flex;justify-content:space-between;gap:10px;text-decoration:none;font-size:13px',
              }, [
                el('span', { text: v.mieter || 'Ohne Mieter' }),
                el('span.num.faint', { text: eur(mieteVon(v).kalt, 0) }),
              ])),
              miete.anzahl > 1
                ? el('div', { style: 'display:flex;justify-content:space-between;gap:10px;margin-top:3px;padding-top:3px;border-top:1px solid var(--border);font-size:12px' }, [
                    el('span.faint', { text: `${miete.anzahl} Verträge` }),
                    el('span.num', { text: eur(miete.kalt, 0), style: 'font-weight:600' }),
                  ])
                : null,
            ])
          : el('button.btn.btn-sm', {
              type: 'button',
              onclick: () => mietvertragAnlegen(e.id, neuZeichnen),
            }, ['+ Vertrag']),
      ]),
      el('td', { style: 'width:40px' }, [el('button.icon-mini', {
        type: 'button', title: 'Einheit entfernen', html: '&times;',
        onclick: () => einheitLoeschen(o, e, neuZeichnen),
      })]),
    ]);
  });

  const inhalt = einheiten.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Bezeichnung' }), el('th', { text: 'Lage' }),
          el('th', { style: 'text-align:right', text: 'm²' }),
          el('th', { style: 'text-align:right', text: 'Zimmer' }),
          el('th', { text: 'Vermietet an' }), el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: `${einheiten.length} Einheiten`, style: 'font-weight:600' }), el('td', {}),
          el('td.num', { text: num(flaecheSumme, 2), style: 'font-weight:600' }),
          el('td', {}), el('td', {}), el('td', {}),
        ])]),
      ])
    : el('div.faint', { text: 'Noch keine Einheit erfasst.', style: 'font-size:13px' });

  return abschnitt('Einheiten', 'die Summe der Einheitsflächen ersetzt die Objektfläche', [
    inhalt,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => {
        aendern((d) => { d.einheiten.push(neueEinheit(o.id, `Einheit ${einheiten.length + 1}`)); });
        neuZeichnen();
      },
    }, ['+ Einheit']),
  ]);
}

async function einheitLoeschen(o, e, neuZeichnen) {
  const vertraege = state.daten.mietvertraege.filter((m) => m.einheitId === e.id);
  const dokAnzahl = state.daten.dokumente.filter((dk) =>
    dk.bezugTyp === 'mietvertrag' && vertraege.some((m) => m.id === dk.bezugId)).length;

  const anhang = [
    vertraege.length ? `${vertraege.length} Mietvertrag/-verträge` : null,
    dokAnzahl ? `${dokAnzahl} Dokument(e)` : null,
  ].filter(Boolean);

  const ok = await bestaetigen(
    `Einheit „${einheitName(e)}" löschen?`,
    anhang.length ? `Mitgelöscht werden: ${anhang.join(', ')}.` : 'Die Einheit wird entfernt.',
    { okText: 'Löschen', gefahr: true }
  );
  if (!ok) return;

  // Dokumente der mitgelöschten Verträge samt Dateien – wie beim Objekt.
  const dokIds = new Set();
  for (const m of vertraege) (await dokumenteEntfernenFuer('mietvertrag', m.id)).forEach((x) => dokIds.add(x));

  const wegIds = new Set([e.id, ...vertraege.map((m) => m.id)]);
  aendern((d) => {
    d.einheiten = d.einheiten.filter((x) => x.id !== e.id);
    d.mietvertraege = d.mietvertraege.filter((m) => m.einheitId !== e.id);
    d.dokumente = d.dokumente.filter((x) => !dokIds.has(x.id));
    d.protokoll = d.protokoll.filter((p) => !wegIds.has(p.bezugId));
  });
  neuZeichnen();
}

/* ---------- Mietverträge ---------- */

function mietvertraegeKarte(o, neuZeichnen) {
  const vertraege = mietvertraegeZuObjekt(o.id)
    .sort((a, b) => String(b.beginn).localeCompare(String(a.beginn)));
  const miete = mieteObjekt(o.id);
  const mehrere = einheitenVon(o.id).length > 1;

  const zeilen = vertraege.map((mv) => {
    const status = vertragStatus(mv);
    const m = mieteVon(mv);
    const k = m.kalt || (mv.konditionen || [])[0]?.kaltmiete || 0;
    const ende = vertragsEnde(mv);
    return el('tr', {
      style: 'cursor:pointer',
      onclick: () => { location.hash = '#/mietvertrag?id=' + mv.id; },
    }, [
      el('td', {}, [
        el('div', { text: mv.mieter || 'Ohne Mieter', style: 'font-weight:500' }),
        mehrere ? el('div.faint', { text: einheitName(einheitenVon(o.id).find((e) => e.id === mv.einheitId)), style: 'font-size:12px' }) : null,
      ]),
      el('td', {}, [el('span.badge.' + STATUS_KLASSE[status], { text: STATUS_TEXT[status] })]),
      el('td.num', { text: datum(mv.beginn) }),
      el('td.num', { text: ende ? datum(ende) : 'unbefristet' }),
      el('td.num', { text: k ? eur(k) : '–' }),
    ]);
  });

  const inhalt = vertraege.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Mieter' }), el('th', { text: 'Status' }),
          el('th', { style: 'text-align:right', text: 'Beginn' }),
          el('th', { style: 'text-align:right', text: 'Ende' }),
          el('th', { style: 'text-align:right', text: 'Kaltmiete' }),
        ])]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: 'Ist-Kaltmiete heute', style: 'font-weight:600' }),
          el('td', {}), el('td', {}), el('td', {}),
          el('td.num', { text: eur(miete.kalt), style: 'font-weight:600' }),
        ])]),
      ])
    : el('div.faint', { text: 'Noch kein Mietvertrag erfasst.', style: 'font-size:13px' });

  const sub = miete.einheiten
    ? `${miete.vermietet} von ${miete.einheiten} Einheiten vermietet`
      + (miete.vertraege > miete.vermietet ? ` · ${miete.vertraege} laufende Verträge` : '')
      + (miete.leerstand ? ` · ${miete.leerstand} leer` : '')
    : null;

  return abschnitt('Mietverträge', sub, [
    inhalt,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => {
        const einheiten = einheitenVon(o.id);
        const ziel = o.mehrereEinheiten && einheiten.length > 1 ? null : einheitSicherstellen(o.id).id;
        mietvertragAnlegen(ziel, neuZeichnen, o.id);
      },
    }, ['+ Mietvertrag']),
  ]);
}

/* ---------- Finanzierungen ---------- */

function finanzierungenKarte(o, neuZeichnen) {
  const darlehen = finanzierungenVon(o.id);
  const werte = darlehen.map((fin) => ({ fin, k: finanzierungKennzahlen(fin) }));
  const betrag = werte.reduce((s, x) => s + (x.fin.betrag || 0), 0);
  const rest = werte.reduce((s, x) => s + x.k.restschuld, 0);
  const rate = werte.reduce((s, x) => s + x.k.rateAktuell, 0);
  const vw = verkehrswert(o);

  const zeilen = werte.map(({ fin, k }) => el('tr', {
    style: 'cursor:pointer',
    onclick: () => { location.hash = '#/finanzierung?id=' + fin.id; },
  }, [
    el('td', {}, [
      el('div', { text: fin.bank || 'Ohne Bank', style: 'font-weight:500' }),
      el('div.faint', { text: artText(fin.art), style: 'font-size:12px' }),
    ]),
    el('td.num', { text: fin.betrag ? eur(fin.betrag, 0) : '–' }),
    el('td.num', { text: fin.sollzins != null ? num(fin.sollzins, 2) + ' %' : '–' }),
    el('td.num', { text: k.rateAktuell ? eur(k.rateAktuell) : '–' }),
    el('td.num', { text: eur(k.restschuld, 0) }),
    el('td.num', { text: fin.zinsbindungBis ? datum(fin.zinsbindungBis) : 'keine' }),
  ]));

  const inhalt = darlehen.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Bank' }),
          el('th', { style: 'text-align:right', text: 'Betrag' }),
          el('th', { style: 'text-align:right', text: 'Zins' }),
          el('th', { style: 'text-align:right', text: 'Rate' }),
          el('th', { style: 'text-align:right', text: 'Restschuld' }),
          el('th', { style: 'text-align:right', text: 'Bindung bis' }),
        ])]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: 'Summe', style: 'font-weight:600' }),
          el('td.num', { text: eur(betrag, 0), style: 'font-weight:600' }),
          el('td', {}),
          el('td.num', { text: eur(rate, 0), style: 'font-weight:600' }),
          el('td.num', { text: eur(rest, 0), style: 'font-weight:600' }),
          el('td', {}),
        ])]),
      ])
    : el('div.faint', { text: 'Objekt ist unfinanziert erfasst.', style: 'font-size:13px' });

  const sub = darlehen.length
    ? `Beleihungsauslauf ${vw ? num(rest / vw * 100, 1) + ' %' : '–'} · Eigenkapital ${eur(Math.max(0, vw - rest), 0)}`
    : null;

  return abschnitt('Finanzierung', sub, [
    inhalt,
    darlehen.length && betrag ? el('div', { style: 'margin-top:12px' }, [balken((betrag - rest) / betrag * 100)]) : null,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => darlehenAnlegen(o.id, neuZeichnen),
    }, ['+ Darlehen']),
  ]);
}

/* ---------- Kauf & Nebenkosten ---------- */

const NK_MODI = [{ wert: 'prozent', text: '%' }, { wert: 'betrag', text: '€' }];

function nkZeile(o, label, pos, { umbauen, werteNeu, betraege, entfernen, bezeichnungBearbeitbar } = {}) {
  const neuZeichnen = umbauen;

  const nameZelle = bezeichnungBearbeitbar
    ? el('input', {
        type: 'text', value: pos.bezeichnung || '', placeholder: 'Bezeichnung',
        onchange: (e) => aendern(() => { pos.bezeichnung = e.target.value; }),
      })
    : el('span', { text: label });

  const betragZelle = el('td.num', { style: 'width:130px;color:var(--text-dim)' });
  const betragNeu = () => {
    betragZelle.textContent = eur(pos.wert == null ? 0
      : (pos.modus === 'betrag' ? pos.wert : (o.kaufpreis || 0) * pos.wert / 100));
  };
  betragNeu();
  if (betraege) betraege.push(betragNeu);

  const wertInput = el('input', {
    type: 'text', inputmode: 'decimal', style: 'text-align:right',
    value: pos.wert == null ? '' : num(pos.wert, pos.modus === 'betrag' ? 2 : 3),
    onchange: (e) => {
      aendern(() => { pos.wert = parseZahl(e.target.value); });
      werteNeu();          // nur Beträge nachziehen, Karte bleibt stehen
    },
  });

  const modus = el('div.seg.seg-sm', {}, NK_MODI.map((m) => el('button' + (pos.modus === m.wert ? '.aktiv' : ''), {
    type: 'button', text: m.text,
    onclick: () => {
      if (pos.modus === m.wert) return;
      /* Erst hier lesen, nicht beim Bauen der Zeile: eine Aenderung des
         Kaufpreises zieht nur die Betragsspalte nach, die Zeilen selbst
         bleiben stehen. Ein eingefrorener Wert wuerde mit dem alten
         Kaufpreis umrechnen. */
      const kp = o.kaufpreis || 0;
      aendern(() => {
        // Wert sinnvoll umrechnen, damit der Euro-Betrag gleich bleibt
        if (pos.wert != null && kp) {
          pos.wert = m.wert === 'betrag'
            ? Math.round(kp * pos.wert / 100 * 100) / 100
            : Math.round(pos.wert / kp * 100 * 1000) / 1000;
        }
        pos.modus = m.wert;
      });
      neuZeichnen();
    },
  })));

  return el('tr', {}, [
    el('td', {}, [nameZelle]),
    el('td', { style: 'width:96px' }, [modus]),
    el('td', { style: 'width:130px' }, [wertInput]),
    betragZelle,
    el('td', { style: 'width:40px' }, [
      entfernen
        ? el('button.icon-mini', { type: 'button', title: 'Position entfernen', onclick: entfernen, html: '&times;' })
        : null,
    ]),
  ]);
}

function kaufKarte(o, umbauen, obenNeu) {
  const nk = o.nebenkosten;

  /* Beträge und Fußzeile werden nachgezogen, ohne die Karte neu zu bauen */
  const betraege = [];
  const quoteZelle = el('td.num.faint');
  const summeZelle = el('td.num', { style: 'font-weight:600' });
  const eigenprovZeile = el('tr', {}, [
    el('td', { text: '− Eigenprovision' }),
    el('td', {}), el('td', {}),
    el('td.num', { text: '' }),
    el('td', {}),
  ]);
  const eigenprovZelle = eigenprovZeile.children[3];
  const gesamtZelle = el('td.num', { style: 'font-weight:600;color:var(--accent)' });
  const anzeigeNeu = () => {
    betraege.forEach((f) => f());
    const r = nebenkostenBerechnen(o);
    quoteZelle.textContent = num(r.quote, 2) + ' %';
    summeZelle.textContent = eur(r.summe);
    eigenprovZeile.style.display = r.eigenprovision ? '' : 'none';
    eigenprovZelle.textContent = '− ' + eur(r.eigenprovision);
    gesamtZelle.textContent = eur(r.gesamt);
  };
  const werteNeu = () => { anzeigeNeu(); obenNeu(); };

  const aktionen = { umbauen, werteNeu, betraege };
  const zeilen = [
    nkZeile(o, 'Grunderwerbsteuer', nk.grunderwerbsteuer, aktionen),
    nkZeile(o, 'Notar & Grundbuch', nk.notar, aktionen),
    nkZeile(o, 'Maklerprovision', nk.makler, aktionen),
    ...(nk.weitere || []).map((p) => nkZeile(o, p.bezeichnung, p, {
      ...aktionen,
      bezeichnungBearbeitbar: true,
      entfernen: () => {
        aendern(() => { nk.weitere = nk.weitere.filter((x) => x !== p); });
        umbauen();
      },
    })),
  ];

  const tabelle = el('table.data.kompakt', {}, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Position' }), el('th', { text: 'Art' }),
      el('th', { style: 'text-align:right', text: 'Wert' }),
      el('th', { style: 'text-align:right', text: 'Betrag' }),
      el('th', {}),
    ])]),
    el('tbody', {}, zeilen),
    el('tfoot', {}, [
      el('tr', {}, [
        el('td', { text: 'Kaufnebenkosten gesamt', style: 'font-weight:600' }),
        el('td', {}), quoteZelle, summeZelle, el('td', {}),
      ]),
      eigenprovZeile,
      el('tr', {}, [
        el('td', { text: 'Gesamtinvestition', style: 'font-weight:600' }),
        el('td', {}), el('td', {}), gesamtZelle, el('td', {}),
      ]),
    ]),
  ]);

  const grestHinweis = o.bundesland && nk.grunderwerbsteuer.modus === 'prozent'
    && nk.grunderwerbsteuer.wert !== GRUNDERWERBSTEUER[o.bundesland]
    ? el('div.hint', {
        style: 'margin-top:8px;color:var(--warn)',
        text: `Hinweis: In ${o.bundesland} beträgt die Grunderwerbsteuer ${num(GRUNDERWERBSTEUER[o.bundesland], 1)} %.`,
      })
    : null;

  anzeigeNeu();   // Startwerte in Fußzeile und Betragsspalte
  return abschnitt('Kauf & Kaufnebenkosten', 'jede Position wahlweise in % vom Kaufpreis oder als fester Betrag', [
    felderGitter([
      datumFeld('Kaufdatum', o, 'kaufdatum', { nach: obenNeu }),
      zahlFeld('Kaufpreis', o, 'kaufpreis', { suffix: '€', nach: werteNeu }),
      zahlFeld('Eigenprovision', o, 'eigenprovision', {
        suffix: '€', nach: werteNeu,
        hint: 'mindert die Anschaffungskosten, nicht die Kaufnebenkosten',
      }),
    ]),
    el('div', { style: 'margin-top:8px' }, [tabelle]),
    grestHinweis,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => {
        aendern(() => { nk.weitere = [...(nk.weitere || []), nkPosition('betrag', null, 'Weitere Position')]; });
        umbauen();
      },
    }, ['+ Weitere Position']),
  ]);
}

/* ---------- Steuer ---------- */

function steuerKarte(o, obenNeu) {
  const e = state.daten.einstellungen;

  /* Die vier Ergebnisfelder werden an Ort und Stelle nachgezogen */
  const zelle = (label, hintText) => {
    const wert = el('div.readonly');
    const hint = el('div.hint', { text: hintText || '' });
    return { wert, hint, feld: el('div.field', {}, [el('label', { text: label }), wert, hint]) };
  };
  const anschaffung = zelle('Anschaffungskosten');
  const grundstueck = zelle('davon Grundstück');
  const bemessung = zelle('AfA-Bemessungsgrundlage');
  const proJahr = zelle('Abschreibung pro Jahr');
  proJahr.wert.className = 'readonly betont';

  const anzeigeNeu = () => {
    const a = afaWerte(o);
    const manuell = o.gebaeudeanteilManuell != null;
    anschaffung.wert.textContent = eur(a.anschaffung);
    anschaffung.hint.textContent = 'Kaufpreis inkl. Nebenkosten'
      + (o.eigenprovision ? ', abzgl. Eigenprovision' : '');
    grundstueck.wert.textContent = eur(a.grundstueck);
    grundstueck.hint.textContent = manuell
      ? 'Anschaffungskosten − manueller Gebäudeanteil'
      : `${num(o.grundstuecksanteil ?? 0, 1)} % der Anschaffungskosten`;
    bemessung.wert.textContent = eur(a.gebaeude);
    bemessung.hint.textContent = [manuell ? 'manueller Gebäudeanteil' : 'Gebäude + Nebenkosten',
      a.modernisierung ? 'inkl. aktivierter Modernisierung' : null].filter(Boolean).join(' ');
    proJahr.wert.textContent = eur(a.afaJahr);
    proJahr.hint.textContent = a.afaDauer
      ? `über ${num(a.afaDauer, 1)} Jahre ab ${datum(o.kaufdatum)}`
      : 'keine Abschreibung';
  };
  anzeigeNeu();
  const nach = () => { anzeigeNeu(); obenNeu(); };

  return abschnitt('Steuerliche Angaben', 'Grundlage für Abschreibung und Nachsteuer-Rechnung', [
    felderGitter([
      zahlFeld('Grundstücksanteil', o, 'grundstuecksanteil', {
        suffix: '%', nachkomma: 1, nach,
        hint: o.gebaeudeanteilManuell != null
          ? 'wird durch den manuellen Gebäudeanteil ersetzt'
          : 'von den Anschaffungskosten inkl. Nebenkosten',
      }),
      zahlFeld('Gebäudeanteil, manuell', o, 'gebaeudeanteilManuell', {
        suffix: '€', nach,
        hint: 'leer = aus dem Grundstücksanteil abgeleitet · z. B. aus einem Kaufpreisaufteilungsgutachten',
      }),
      zahlFeld('AfA-Satz', o, 'afaSatz', {
        suffix: '%', nachkomma: 3, nach,
        hint: '2,0 ab Bj. 1925 · 2,5 davor · 3,0 Neubau · frei bei Restnutzungsdauer-Gutachten',
      }),
      zahlFeld('Abweichender Steuersatz', o, 'steuersatzAbweichend', {
        suffix: '%', nachkomma: 1, nach: obenNeu,
        hint: `leer = Portfolio-Vorgabe (${num(e.steuersatz, 1)} %)`,
      }),
    ]),
    el('div', { style: 'margin-top:10px;padding-top:14px;border-top:1px solid var(--border)' }, [
      felderGitter([anschaffung.feld, grundstueck.feld, bemessung.feld, proJahr.feld]),
    ]),
  ]);
}

/* ---------- Verkehrswert ---------- */

function verkehrswertKarte(o, neuZeichnen, obenNeu) {
  const werte = [...(o.werte || [])].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));

  const opt = { nach: obenNeu, umbauen: neuZeichnen };
  const zeilen = werte.map((w) => el('tr', {}, [
    el('td', { style: 'width:150px' }, [tabellenDatum(w, 'datum', opt)]),
    el('td', { style: 'width:150px' }, [tabellenZahl(w, 'wert', opt)]),
    el('td', {}, [tabellenText(w, 'quelle', { platzhalter: 'Quelle, z. B. Gutachten / Schätzung' })]),
    el('td', { style: 'width:40px' }, [el('button.icon-mini', {
      type: 'button', title: 'Eintrag entfernen', html: '&times;',
      onclick: () => { aendern(() => { o.werte = o.werte.filter((x) => x !== w); }); neuZeichnen(); },
    })]),
  ]));

  const inhalt = werte.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Stichtag' }),
          el('th', { style: 'text-align:right', text: 'Wert (€)' }),
          el('th', { text: 'Quelle' }), el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
      ])
    : el('div.faint', { text: 'Noch kein Verkehrswert erfasst – es wird der Kaufpreis verwendet.', style: 'font-size:13px' });

  return abschnitt('Verkehrswert', 'Historie der Wertermittlungen – der jüngste Eintrag zählt', [
    inhalt,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => {
        aendern(() => { o.werte = [...(o.werte || []), { id: uid('vw'), datum: heuteISO(), wert: o.kaufpreis || null, quelle: '' }]; });
        neuZeichnen();
      },
    }, ['+ Wert erfassen']),
  ]);
}

/* ---------- Modernisierung ---------- */

function modernisierungKarte(o, neuZeichnen, obenNeu) {
  const liste = [...(o.modernisierung || [])].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const summeZelle = el('td.num', { style: 'font-weight:600' });
  const summeNeu = () => {
    summeZelle.textContent = eur((o.modernisierung || []).reduce((s, m) => s + (m.betrag || 0), 0));
  };
  const opt = { nach: () => { summeNeu(); obenNeu(); }, umbauen: neuZeichnen };

  const zeilen = liste.map((m) => el('tr', {}, [
    el('td', { style: 'width:150px' }, [tabellenDatum(m, 'datum', opt)]),
    el('td', {}, [tabellenText(m, 'bezeichnung', { platzhalter: 'z. B. Bad saniert, neue Fenster' })]),
    el('td', { style: 'width:140px' }, [tabellenZahl(m, 'betrag', opt)]),
    el('td', { style: 'width:110px;text-align:center' }, [el('input', {
      type: 'checkbox', checked: m.aktiviert !== false, style: 'width:auto',
      title: 'aktivieren (erhöht die AfA-Bemessung) statt sofort als Aufwand',
      onchange: (e) => { aendern(() => { m.aktiviert = e.target.checked; }); obenNeu(); },
    })]),
    el('td', { style: 'width:40px' }, [el('button.icon-mini', {
      type: 'button', title: 'Eintrag entfernen', html: '&times;',
      onclick: () => { aendern(() => { o.modernisierung = o.modernisierung.filter((x) => x !== m); }); neuZeichnen(); },
    })]),
  ]));

  const inhalt = liste.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Datum' }), el('th', { text: 'Maßnahme' }),
          el('th', { style: 'text-align:right', text: 'Betrag (€)' }),
          el('th', { style: 'text-align:center', text: 'aktiviert' }), el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
        el('tfoot', {}, [el('tr', {}, [
          el('td', { text: 'Summe', style: 'font-weight:600' }), el('td', {}),
          summeZelle, el('td', {}), el('td', {}),
        ])]),
      ])
    : el('div.faint', { text: 'Keine Modernisierungen erfasst.', style: 'font-size:13px' });

  return abschnitt('Modernisierung & Sanierung', 'aktivierte Kosten erhöhen die Abschreibungsgrundlage', [
    inhalt,
    el('button.btn.btn-sm', {
      type: 'button', style: 'margin-top:12px',
      onclick: () => {
        aendern(() => { o.modernisierung = [...(o.modernisierung || []), { id: uid('mod'), datum: heuteISO(), bezeichnung: '', betrag: null, aktiviert: true }]; });
        neuZeichnen();
      },
    }, ['+ Maßnahme erfassen']),
  ]);
}

/* ---------- Laufende Kosten ---------- */

function kostenKarte(o, kennzahlenNeu) {
  const k = o.kosten;

  /* Abgeleitete Anzeigen werden an Ort und Stelle nachgezogen – die Karte
     selbst bleibt stehen, sonst verliert das nächste Feld beim Klick den Fokus. */
  const umlageWert = el('div.readonly');
  const umlageHinweis = el('div.hint');
  const warnung = el('div.hint', { style: 'margin-top:6px;color:var(--warn)' });
  const summeWert = el('span.num', { style: 'font-weight:600' });
  const instandHinweis = el('div.hint');

  const anzeigenNeu = () => {
    const nichtUmlage = Math.max(0, (k.hausgeldMonat || 0) - (k.hausgeldUmlagefaehigMonat || 0));
    const zuViel = (k.hausgeldUmlagefaehigMonat || 0) > (k.hausgeldMonat || 0);
    const summe = (nichtUmlage + (k.verwaltungMonat || 0) + (k.instandhaltungMonat || 0)) * 12 + (k.sonstigeJahr || 0);
    umlageWert.textContent = eur(nichtUmlage) + ' / Monat';
    umlageWert.className = 'readonly' + (zuViel ? '' : ' betont');
    umlageHinweis.textContent = eur(nichtUmlage * 12, 0) + ' pro Jahr';
    warnung.textContent = zuViel
      ? 'Der umlagefähige Anteil ist größer als das gesamte Hausgeld – bitte prüfen. Gerechnet wird mit 0 €.'
      : '';
    /* Der Forecast setzt bei leerem Feld die Instandhaltungspauschale aus den
       Annahmen an (siehe forecast.js) – die Ist-Rechnung hier tut das nicht.
       Eine ausdrückliche 0 unterscheidet sich von „leer" und wird respektiert. */
    if (k.instandhaltungMonat != null) {
      instandHinweis.textContent = k.instandhaltungMonat
        ? `pro Monat · ${eur(k.instandhaltungMonat * 12, 0)} pro Jahr`
        : 'pro Monat · 0 € pro Jahr, der Forecast setzt keine Rücklage an';
    } else {
      const prozent = state.daten.einstellungen.instandhaltungProzent ?? 0;
      const pauschale = (o.kaufpreis || 0) * prozent / 100;
      instandHinweis.textContent = `pro Monat, leer · der Forecast rechnet mit ${eur(pauschale, 0)} `
        + `pro Jahr (${num(prozent, 2)} % vom Kaufpreis aus den Annahmen)`;
    }
    summeWert.textContent = eur(summe, 0) + ' / Jahr';
  };

  const b = { bezug: o.id, nach: () => { anzeigenNeu(); kennzahlenNeu(); } };
  anzeigenNeu();

  return abschnitt('Laufende Kosten', 'nur der nicht umlagefähige Teil mindert den Cashflow', [
    felderGitter([
      zahlFeld('Hausgeld gesamt', k, 'hausgeldMonat', { ...b, suffix: '€', hint: 'pro Monat' }),
      zahlFeld('davon umlagefähig', k, 'hausgeldUmlagefaehigMonat', { ...b, suffix: '€', hint: 'pro Monat, über die Nebenkosten abgerechnet' }),
      el('div.field', {}, [
        el('label', { text: '= nicht umlagefähig' }), umlageWert, umlageHinweis,
      ]),
      zahlFeld('Verwaltung', k, 'verwaltungMonat', { ...b, suffix: '€', hint: 'pro Monat' }),
      el('div.field', {}, [
        el('label', { text: 'Instandhaltung' }),
        el('div.input-suffix', {}, [
          zahlEingabe(k, 'instandhaltungMonat', { ...b, label: 'Instandhaltung' }),
          el('span', { text: '€' }),
        ]),
        instandHinweis,
      ]),
      zahlFeld('Sonstige Kosten', k, 'sonstigeJahr', { ...b, suffix: '€', hint: 'pro Jahr' }),
    ]),
    warnung,
    el('div', { style: 'margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px' }, [
      el('span', { text: 'Cashflow-wirksame Bewirtschaftungskosten', style: 'color:var(--text-faint)' }),
      summeWert,
    ]),
  ]);
}

/* ---------- Buchungen ---------- */

const AKTUELLES_JAHR = () => new Date().getFullYear();
const MANUELLE_KATEGORIEN = KATEGORIEN.filter((k) => !k.abgeleitet)
  .map((k) => ({ wert: k.key, text: k.text }));

function buchungenKarte(o, neuZeichnen, kennzahlenNeu) {
  const jahr = AKTUELLES_JAHR();
  const buchungen = buchungenVon(o.id).filter((b) => (b.datum || '').startsWith(String(jahr)));
  const fahrten = fahrtenVon(o.id).filter((f) => (f.datum || '').startsWith(String(jahr)));
  const opt = { nach: kennzahlenNeu, umbauen: neuZeichnen };

  const buchungsZeile = (b) => {
    const istErhaltung = b.kategorie === 'erhaltung';
    return el('tr', {}, [
      el('td', { style: 'width:130px' }, [tabellenDatum(b, 'datum', opt)]),
      el('td', { style: 'width:190px' }, [tabellenAuswahl(b, 'kategorie', MANUELLE_KATEGORIEN, opt)]),
      el('td', {}, [tabellenText(b, 'bezeichnung', { ...opt, platzhalter: 'Bezeichnung' })]),
      el('td', { style: 'width:120px' }, [tabellenZahl(b, 'betrag', opt)]),
      el('td', { style: 'width:190px' }, istErhaltung ? [
        el('label', { style: 'display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap' }, [
          el('input', {
            type: 'checkbox', checked: !!b.aktiviert, style: 'width:auto',
            title: 'aktivieren (erhöht die AfA-Bemessung) statt sofort als Aufwand',
            onchange: (e) => {
              aendern(() => { b.aktiviert = e.target.checked; if (b.aktiviert) b.verteilenJahre = null; });
              kennzahlenNeu(); neuZeichnen();
            },
          }),
          'aktivieren',
          el('select', {
            style: 'width:auto;font-size:12px', disabled: !!b.aktiviert,
            title: 'auf mehrere Jahre verteilen, § 82b EStDV',
            onchange: (e) => {
              const wert = e.target.value ? Number(e.target.value) : null;
              aendern(() => { b.verteilenJahre = wert; if (wert) b.aktiviert = false; });
              kennzahlenNeu(); neuZeichnen();
            },
          }, [
            el('option', { value: '', selected: !b.verteilenJahre }, ['sofort']),
            ...[2, 3, 4, 5].map((n) => el('option', { value: String(n), selected: b.verteilenJahre === n }, [`${n} Jahre`])),
          ]),
        ]),
      ] : []),
      el('td', { style: 'width:40px' }, [el('button.icon-mini', {
        type: 'button', title: 'Buchung löschen', html: '&times;',
        onclick: () => {
          aendern((d) => { d.buchungen = d.buchungen.filter((x) => x !== b); });
          kennzahlenNeu(); neuZeichnen();
        },
      })]),
    ]);
  };

  const fahrtZeile = (f) => el('tr', {}, [
    el('td', { style: 'width:130px' }, [tabellenDatum(f, 'datum', opt)]),
    el('td', { text: 'Fahrtkosten', style: 'width:190px;color:var(--text-faint)' }),
    el('td', {}, [tabellenText(f, 'anlass', { ...opt, platzhalter: 'Anlass der Fahrt' })]),
    el('td', { style: 'width:120px' }, [tabellenZahl(f, 'km', { ...opt, nachkomma: 0, style: 'text-align:right' })]),
    el('td.faint', { text: eur(fahrtBetrag(f, state.daten.einstellungen)) + ' · ' + (f.hinRueck === false ? 'einfach' : 'hin u. zurück'), style: 'font-size:12px' }),
    el('td', { style: 'width:40px' }, [el('button.icon-mini', {
      type: 'button', title: 'Fahrt löschen', html: '&times;',
      onclick: () => {
        aendern((d) => { d.fahrten = d.fahrten.filter((x) => x !== f); });
        kennzahlenNeu(); neuZeichnen();
      },
    })]),
  ]);

  const zeilen = [...buchungen.map(buchungsZeile), ...fahrten.map(fahrtZeile)];
  const inhalt = zeilen.length
    ? el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Datum' }), el('th', { text: 'Kategorie' }), el('th', { text: 'Bezeichnung' }),
          el('th', { style: 'text-align:right', text: 'Betrag / km' }), el('th', {}), el('th', {}),
        ])]),
        el('tbody', {}, zeilen),
      ])
    : el('div.faint', { text: `Keine freien Buchungen für ${jahr}.`, style: 'font-size:13px' });

  const ampel = erhaltungsAmpel(o);
  const ampelHinweis = ampel && ampel.stufe !== 'gruen'
    ? el('div.hint', {
        style: `margin-bottom:14px;color:var(--${ampel.stufe === 'rot' ? 'neg' : 'warn'})`,
        text: `Erhaltungsaufwand seit dem Kauf: ${eur(ampel.summe, 0)} von ${eur(ampel.grenze, 0)} `
          + `(15 % der Gebäude-Anschaffungskosten, Frist bis ${datum(ampel.fensterEnde)}). `
          + (ampel.stufe === 'rot'
            ? 'Über der Grenze – der gesamte Betrag kippt in anschaffungsnahe Herstellungskosten (§ 6 Abs. 1 Nr. 1a EStG) und ist nur noch über die AfA absetzbar.'
            : 'Nähert sich der Grenze – ein Steuerberater sollte das prüfen, bevor weitere Rechnungen gebucht werden.'),
      })
    : null;

  return abschnitt(`Buchungen ${jahr}`, 'frei erfasste Einnahmen und Ausgaben dieses Objekts', [
    ampelHinweis,
    inhalt,
    el('div', { style: 'display:flex;gap:8px;margin-top:12px' }, [
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: () => { aendern((d) => { d.buchungen.push(neueBuchung(o.id)); }); kennzahlenNeu(); neuZeichnen(); },
      }, ['+ Buchung']),
      el('button.btn.btn-sm', {
        type: 'button',
        onclick: () => { aendern((d) => { d.fahrten.push(neueFahrt(o.id)); }); kennzahlenNeu(); neuZeichnen(); },
      }, ['+ Fahrt']),
    ]),
  ].filter(Boolean));
}

/* ---------- Nebenkostenabrechnung ---------- */

function nkAbrechnungKarte(o) {
  const jahr = AKTUELLES_JAHR();
  const zeilen = nkAbrechnungObjekt(o.id, jahr);
  if (!zeilen.length) return null;

  const zeile = (n) => {
    const e = state.daten.einheiten.find((x) => x.id === n.einheitId);
    return el('tr', {}, [
      el('td', { text: einheitName(e) }),
      el('td.num', { text: eur(n.vorauszahlung, 0) }),
      el('td.num', { text: eur(n.kosten, 0) }),
      el('td.num', {
        text: (n.ergebnis >= 0 ? '' : '− ') + eur(Math.abs(n.ergebnis), 0),
        style: 'font-weight:600',
      }),
      el('td.faint', { text: n.ergebnis >= 0 ? 'Nachzahlung' : 'Erstattung', style: 'font-size:12px' }),
    ]);
  };

  return abschnitt(`Nebenkostenabrechnung ${jahr}`,
    'umlagefähige Kosten nach Wohnfläche verteilt – eine Näherung, kein Ersatz für die formelle Abrechnung', [
      el('table.data.kompakt', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Einheit' }),
          el('th', { style: 'text-align:right', text: 'Vorauszahlung' }),
          el('th', { style: 'text-align:right', text: 'umlagefähige Kosten' }),
          el('th', { style: 'text-align:right', text: 'Ergebnis' }),
          el('th', {}),
        ])]),
        el('tbody', {}, zeilen.map(zeile)),
      ]),
    ]);
}

/* ---------- Bilder ---------- */

function bilderKarte(o, neuZeichnen) {
  const bilder = o.bilder || [];

  const galerie = el('div.galerie');
  for (const b of bilder) {
    const kachel = el('div.gal-item' + (b.haupt ? '.haupt' : ''), {}, [
      el('div.gal-bild', {}, [el('span', { text: '…' })]),
      el('div.gal-aktionen', {}, [
        el('button', {
          type: 'button', title: b.haupt ? 'Ist Titelbild' : 'Als Titelbild setzen', text: b.haupt ? '★' : '☆',
          onclick: (ev) => {
            ev.preventDefault();
            aendern(() => { for (const x of o.bilder) x.haupt = (x === b); });
            neuZeichnen();
          },
        }),
        el('button', {
          type: 'button', title: 'Bild löschen', html: '&times;',
          onclick: async (ev) => {
            ev.preventDefault();
            if (!(await bestaetigen('Bild löschen?', 'Die Bilddatei wird aus dem Portfolio-Ordner entfernt.', { okText: 'Löschen', gefahr: true }))) return;
            await bildLoeschen(b.datei);
            aendern(() => {
              o.bilder = o.bilder.filter((x) => x !== b);
              if (b.haupt && o.bilder.length) o.bilder[0].haupt = true;
            });
            neuZeichnen();
          },
        }),
      ]),
    ]);
    galerie.append(kachel);
    bildURL(b.datei, true).then((url) => {
      const ziel = kachel.querySelector('.gal-bild');
      leeren(ziel);
      ziel.append(url
        ? el('img', { src: url, alt: '', onclick: () => grossAnzeigen(b) })
        : el('span.faint', { text: 'fehlt' }));
    });
  }

  const eingabe = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  eingabe.addEventListener('change', () => { hochladen(o, [...eingabe.files], neuZeichnen); eingabe.value = ''; });

  const ablage = el('div.dropzone', {
    onclick: () => eingabe.click(),
    ondragover: (e) => { e.preventDefault(); ablage.classList.add('aktiv'); },
    ondragleave: () => ablage.classList.remove('aktiv'),
    ondrop: (e) => {
      e.preventDefault();
      ablage.classList.remove('aktiv');
      hochladen(o, [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')), neuZeichnen);
    },
  }, [
    el('div', { text: '🖼️', style: 'font-size:22px' }),
    el('div', { text: 'Bilder hierher ziehen oder klicken', style: 'font-size:13px' }),
    el('div.faint', { text: 'JPG, PNG, WebP – werden auf 1600 px verkleinert im Ordner „bilder" abgelegt', style: 'font-size:11.5px' }),
  ]);

  return abschnitt('Bilder', bilder.length ? `${bilder.length} Bild${bilder.length === 1 ? '' : 'er'} – Stern setzt das Titelbild` : null, [
    bilder.length ? galerie : null,
    eingabe, ablage,
  ]);
}

async function hochladen(o, dateien, neuZeichnen) {
  if (!dateien.length) return;
  toast(`${dateien.length} Bild${dateien.length === 1 ? '' : 'er'} werden verarbeitet …`, 'info', 2000);
  let fehler = 0;
  for (const [i, file] of dateien.entries()) {
    try {
      const name = await bildSpeichern(file, `${o.id}-${Date.now()}-${i}`);
      aendern(() => {
        o.bilder = [...(o.bilder || []), { datei: name, titel: file.name, haupt: !(o.bilder || []).length }];
      });
    } catch (e) {
      console.error(e);
      fehler++;
    }
  }
  neuZeichnen();
  if (fehler) toast(`${fehler} Bild(er) konnten nicht gespeichert werden`, 'err');
  else toast('Bilder gespeichert', 'ok');
}

async function grossAnzeigen(b) {
  const url = await bildURL(b.datei, false);
  if (!url) return;
  const box = el('div.lightbox', {}, [el('img', { src: url, alt: b.titel || '' })]);
  box.addEventListener('click', () => box.remove());
  document.body.append(box);
}

/* ---------- Löschen ---------- */

async function loeschen(o) {
  const einheiten = einheitenVon(o.id);
  const vertraege = mietvertraegeZuObjekt(o.id);
  const darlehen = finanzierungenVon(o.id);
  const dokAnzahl = state.daten.dokumente.filter((dk) =>
    (dk.bezugTyp === 'objekt' && dk.bezugId === o.id)
    || (dk.bezugTyp === 'mietvertrag' && vertraege.some((m) => m.id === dk.bezugId))
    || (dk.bezugTyp === 'finanzierung' && darlehen.some((f) => f.id === dk.bezugId))).length;
  const anhang = [
    einheiten.length ? `${einheiten.length} Einheit(en)` : null,
    vertraege.length ? `${vertraege.length} Mietvertrag/-verträge` : null,
    darlehen.length ? `${darlehen.length} Darlehen` : null,
    (o.bilder || []).length ? `${o.bilder.length} Bild(er)` : null,
    dokAnzahl ? `${dokAnzahl} Dokument(e)` : null,
  ].filter(Boolean);

  const ok = await bestaetigen(
    `„${o.bezeichnung || 'Objekt'}" löschen?`,
    anhang.length
      ? `Mitgelöscht werden: ${anhang.join(', ')}. Das lässt sich nicht rückgängig machen – im Ordner „backups" liegt aber der Stand von heute.`
      : 'Das lässt sich nicht rückgängig machen – im Ordner „backups" liegt aber der Stand von heute.',
    { okText: 'Endgültig löschen', gefahr: true }
  );
  if (!ok) return;

  for (const b of o.bilder || []) await bildLoeschen(b.datei);

  // Dokumente des Objekts und aller mitgelöschten Verträge und Darlehen
  const dokIds = new Set(await dokumenteEntfernenFuer('objekt', o.id));
  for (const m of vertraege) (await dokumenteEntfernenFuer('mietvertrag', m.id)).forEach((x) => dokIds.add(x));
  for (const f of darlehen) (await dokumenteEntfernenFuer('finanzierung', f.id)).forEach((x) => dokIds.add(x));

  // Protokolleinträge aller mitgelöschten Entitäten, nicht nur des Objekts –
  // sonst blieben Einträge zu Verträgen und Darlehen ohne Bezug zurück.
  const wegIds = new Set([
    o.id,
    ...einheiten.map((e) => e.id),
    ...vertraege.map((m) => m.id),
    ...darlehen.map((f) => f.id),
  ]);

  aendern((d) => {
    const einheitIds = new Set(einheiten.map((e) => e.id));
    d.objekte = d.objekte.filter((x) => x.id !== o.id);
    d.einheiten = d.einheiten.filter((e) => e.objektId !== o.id);
    d.mietvertraege = d.mietvertraege.filter((m) => !einheitIds.has(m.einheitId));
    d.finanzierungen = d.finanzierungen.filter((f) => f.objektId !== o.id);
    d.dokumente = d.dokumente.filter((x) => !dokIds.has(x.id));
    d.protokoll = d.protokoll.filter((p) => !wegIds.has(p.bezugId));
  });

  toast('Objekt gelöscht', 'ok');
  location.hash = '#/objekte';
}
