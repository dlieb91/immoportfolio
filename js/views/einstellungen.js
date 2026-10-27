/* Einstellungen: Portfolio-Stammdaten, Steuern, Vorgaben, Speicherung. */

import { el, leeren, toast, bestaetigen, datum, heuteISO } from '../util.js';
import { state, aendern, laden, STANDARD_EINSTELLUNGEN } from '../store.js';
import {
  speicher, sofortSpeichern, backupsAuflisten, backupLesen, ordnerVergessen, DATEI,
  geraetedatenLoeschen, abgleichStatus,
} from '../storage.js';
import { speicherWarnung } from '../speicher/lokal.js';
import { abmeldenUndLeeren } from '../speicher/dropbox.js';
import { jetztAbgleichen } from '../abgleich.js';
import { textFeld, zahlFeld, auswahlFeld, schalterFeld, felderGitter, hinweis } from '../felder.js';
import { protokollKarte } from './dokumente.js';

function abschnitt(titel, sub, felder, hinweisHtml) {
  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [el('h2', { text: titel }), sub ? el('div.sub', { text: sub }) : null]),
    ]),
    el('div.card-body', {}, [
      hinweisHtml ? hinweis(hinweisHtml) : null,
      felderGitter(felder),
    ]),
  ]);
}

/* ---------- Ansicht ---------- */

export const einstellungen = {
  render(container) {
    const d = state.daten;
    const e = d.einstellungen;
    const inner = el('div.view-inner', { style: 'display:grid;gap:16px' });

    inner.append(abschnitt('Portfolio', 'Bezeichnung dieses Portfolios', [
      textFeld('Name', d.meta, 'name', { platzhalter: 'Mein Portfolio' }),
    ]));

    inner.append(abschnitt('Steuern', 'Grundlage für die Nachsteuer-Betrachtung – pro Objekt überschreibbar', [
      zahlFeld('Grenzsteuersatz', e, 'steuersatz', { suffix: '%', nachkomma: 1 }),
      auswahlFeld('Kirchensteuer', e, 'kirchensteuer', [
        { wert: 0, text: 'keine' }, { wert: 8, text: '8 % (BY, BW)' }, { wert: 9, text: '9 % (übrige Länder)' },
      ]),
      schalterFeld('Solidaritätszuschlag berücksichtigen', e, 'soli', { hint: '5,5 % auf die Einkommensteuer' }),
    ]));

    inner.append(abschnitt(
      'Kaufnebenkosten – Vorbelegung',
      'nur Startwerte beim Anlegen eines neuen Objekts',
      [
        zahlFeld('Grunderwerbsteuer', e, 'grunderwerbsteuer', { suffix: '%', nachkomma: 2 }),
        zahlFeld('Notar & Grundbuch', e, 'notarkosten', { suffix: '%', nachkomma: 2 }),
        zahlFeld('Maklerprovision', e, 'maklerProvision', { suffix: '%', nachkomma: 2 }),
      ],
      '<strong>Die Kaufnebenkosten werden je Objekt erfasst.</strong> Diese Werte füllen beim Anlegen '
      + 'nur das Formular vor und lassen sich dort für jedes Objekt einzeln ändern – wahlweise als Prozentsatz '
      + 'vom Kaufpreis oder als fester Betrag, ergänzt um beliebige eigene Positionen.'
    ));

    inner.append(abschnitt('Forecast-Vorgaben', 'Startwerte der Prognose – im Forecast jederzeit veränderbar', [
      zahlFeld('Betrachtungszeitraum', e, 'forecastJahre', { suffix: 'J.', nachkomma: 0 }),
      zahlFeld('Mietsteigerung p. a.', e, 'mietsteigerung', { suffix: '%', nachkomma: 1 }),
      zahlFeld('Wertsteigerung p. a.', e, 'wertsteigerung', { suffix: '%', nachkomma: 1 }),
      zahlFeld('Instandhaltung p. a.', e, 'instandhaltungProzent', { suffix: '%', nachkomma: 2, hint: 'vom Kaufpreis' }),
      zahlFeld('Leerstandsquote', e, 'leerstandProzent', { suffix: '%', nachkomma: 1 }),
      zahlFeld('Inflation p. a.', e, 'inflation', { suffix: '%', nachkomma: 1 }),
      zahlFeld('Anschlusszins', e, 'anschlusszins', { suffix: '%', nachkomma: 2, hint: 'nach Ablauf der Zinsbindung' }),
    ]));

    /* --- Speicherung --- */
    const backupBox = el('div', { style: 'margin-top:6px' }, [el('div.faint', { text: 'Sicherungen werden geladen …', style: 'font-size:12.5px' })]);

    const aufGeraet = speicher.kennung === 'lokal';

    const speicherKarte = el('div.card', {}, [
      el('div.card-head', {}, [
        el('div', {}, [
          el('h2', { text: 'Speicherung & Sicherung' }),
          el('div.sub', { text: aufGeraet ? 'Gerätespeicher, Backups, Export' : 'Ordner, Backups, Export' }),
        ]),
        el('button.btn.btn-sm', {
          type: 'button',
          onclick: async () => { await sofortSpeichern(); toast('Portfolio gespeichert', 'ok'); },
        }, ['Jetzt speichern']),
      ]),
      el('div.card-body', {}, [
        /* Der Text haengt vom Geraet ab – auf iOS die Sieben-Tage-Regel,
           sonst der allgemeine Hinweis. Siehe speicherWarnung(). */
        aufGeraet && speicherWarnung() ? hinweis(speicherWarnung()) : null,
        el('table.data', {}, [
          el('tbody', {}, [
            infoZeile(aufGeraet ? 'Gespeichert auf' : 'Ordner', speicher.ordnerName || '–'),
            infoZeile('Datei', DATEI),
            infoZeile('Zuletzt geändert', datum(d.meta.geaendertAm)),
            infoZeile('Letztes Backup', d.meta.letztesBackup ? datum(d.meta.letztesBackup) : 'noch keins'),
          ]),
        ]),
        el('div', { style: 'margin-top:18px' }, [
          el('div', { text: 'Automatische Sicherungen', style: 'font-size:12.5px;color:var(--text-dim);font-weight:500;margin-bottom:6px' }),
          backupBox,
        ]),
        el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;margin-top:20px;padding-top:18px;border-top:1px solid var(--border)' }, [
          el('button.btn', { type: 'button', onclick: exportieren }, ['Als Datei exportieren']),
          el('button.btn', { type: 'button', onclick: () => importieren(container) }, ['Aus Datei importieren']),
          el('button.btn.btn-danger', { type: 'button', onclick: schliessen }, ['Portfolio schließen']),
          aufGeraet
            ? el('button.btn.btn-danger', { type: 'button', onclick: geraetLeeren }, ['Vom Gerät löschen'])
            : null,
        ]),
        el('div.hint', { style: 'margin-top:10px', text: aufGeraet
          ? '„Portfolio schließen" trennt nur die Verknüpfung – die Daten bleiben auf dem Gerät. '
            + '„Vom Gerät löschen" entfernt sie endgültig, samt Bildern, Dokumenten und Sicherungen.'
          : '„Portfolio schließen" trennt nur die Verknüpfung zum Ordner – deine Dateien bleiben unangetastet.' }),
        el('div.hint', { style: 'margin-top:6px', text: 'Export und Import übertragen nur die Daten aus '
          + 'portfolio.json – Bilder und Dokumente bleiben zurück. Für den Wechsel auf ein anderes Gerät '
          + 'ist das zu beachten.' }),
      ]),
    ]);
    inner.append(speicherKarte);
    if (speicher.kennung === 'dropbox') inner.append(dropboxKarte(() => this.rerender()));

    inner.append(el('div', { style: 'display:flex;justify-content:flex-end' }, [
      el('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        onclick: async () => {
          if (!(await bestaetigen('Vorgaben zurücksetzen?', 'Steuer- und Forecast-Vorgaben werden auf die Standardwerte gesetzt. Objekte und Verträge bleiben unverändert.', { okText: 'Zurücksetzen' }))) return;
          aendern((dd) => { dd.einstellungen = { ...STANDARD_EINSTELLUNGEN }; });
          this.rerender();
          toast('Vorgaben zurückgesetzt', 'ok');
        },
      }, ['Vorgaben auf Standard zurücksetzen']),
    ]));

    container.append(inner);
    this.rerender = () => { leeren(container); this.render(container); };

    backupsAuflisten().then((liste) => {
      leeren(backupBox);
      if (!liste.length) {
        backupBox.append(el('div.faint', { text: 'Noch keine Sicherung vorhanden – die erste entsteht bei der nächsten Änderung.', style: 'font-size:12.5px' }));
        return;
      }
      backupBox.append(el('table.data.kompakt', {}, [
        el('tbody', {}, liste.slice(0, 8).map((b) => el('tr', {}, [
          el('td', { text: lesbarerStempel(b.name), style: 'font-size:12.5px' }),
          el('td.num.faint', { text: (b.groesse / 1024).toFixed(1) + ' KB', style: 'width:80px;font-size:12px' }),
          el('td', { style: 'width:130px;text-align:right' }, [
            el('button.btn.btn-sm', {
              type: 'button', onclick: () => wiederherstellen(b, container),
            }, ['Wiederherstellen']),
          ]),
        ]))),
      ]));
      if (liste.length > 8) backupBox.append(el('div.faint', { text: `… und ${liste.length - 8} ältere im Ordner „backups"`, style: 'font-size:12px;margin-top:6px' }));
    }).catch(() => {
      leeren(backupBox);
      backupBox.append(el('div.faint', { text: 'Sicherungen konnten nicht gelesen werden.', style: 'font-size:12.5px' }));
    });

    inner.append(protokollKarte(null, { titel: 'Änderungsprotokoll (gesamt)', grenze: 15 }));
    inner.append(el('div', { style: 'display:flex;justify-content:flex-end' }, [
      el('button.btn.btn-sm.btn-ghost', {
        type: 'button',
        onclick: async () => {
          if (!d.protokoll.length) { toast('Das Protokoll ist bereits leer', 'info'); return; }
          if (!(await bestaetigen('Protokoll leeren?', `${d.protokoll.length} Einträge werden verworfen. Deine Daten bleiben unverändert.`, { okText: 'Leeren', gefahr: true }))) return;
          aendern((dd) => { dd.protokoll = []; });
          this.rerender();
          toast('Protokoll geleert', 'ok');
        },
      }, ['Protokoll leeren']),
    ]));
  },
};

/* ---------- Dropbox ---------- */

function dropboxKarte(neu) {
  const box = el('div.card-body', {}, [el('div.faint', { text: 'Wird geladen …', style: 'font-size:12.5px' })]);

  abgleichStatus().then((s) => {
    leeren(box);
    box.append(el('table.data', {}, [
      el('tbody', {}, [
        infoZeile('Konto', s.konto || '–'),
        infoZeile('Verbindung', s.online ? 'online' : 'offline – es wird lokal weitergearbeitet'),
        infoZeile('Noch nicht übertragen', s.offeneAenderungen ? 'ja, beim nächsten Abgleich' : 'nichts offen'),
      ]),
    ]));
    box.append(el('div', { style: 'display:flex;gap:9px;flex-wrap:wrap;margin-top:18px' }, [
      el('button.btn', { type: 'button', onclick: () => jetztAbgleichen(false) }, ['Jetzt abgleichen']),
      el('button.btn.btn-danger', { type: 'button', onclick: () => dropboxTrennen(neu) }, ['Dropbox trennen']),
    ]));
    box.append(el('div.hint', { style: 'margin-top:10px', text:
      'Abgeglichen wird beim Start, bei der Rückkehr zur App und kurz nach Änderungen. '
      + 'Ohne Netz arbeitest du normal weiter; alles geht mit, sobald die Verbindung zurück ist.' }));
    box.append(el('div.hint', { style: 'margin-top:6px', text:
      'Bilder und Dokumente werden nur ergänzt, nie gelöscht. Entfernst du ein Foto, bleibt die '
      + 'Datei in Dropbox liegen – sie kostet Platz, aber nichts geht verloren.' }));
  }).catch((e) => {
    leeren(box);
    box.append(el('div.faint', { text: 'Status nicht abrufbar: ' + e.message, style: 'font-size:12.5px' }));
  });

  return el('div.card', {}, [
    el('div.card-head', {}, [
      el('div', {}, [el('h2', { text: 'Dropbox-Abgleich' }), el('div.sub', { text: 'ein Stand auf allen Geräten' })]),
    ]),
    box,
  ]);
}

async function dropboxTrennen(neu) {
  const ok = await bestaetigen(
    'Dropbox trennen?',
    'Die Anmeldung wird entfernt und der lokale Zwischenspeicher geleert. '
    + 'Die Daten in deiner Dropbox bleiben unangetastet – du kannst dich jederzeit wieder verbinden. '
    + 'Nicht übertragene Änderungen gehen dabei verloren, gleiche also vorher ab.',
    { okText: 'Trennen', gefahr: true }
  );
  if (!ok) return;
  await abmeldenUndLeeren();
  location.reload();
}

/** „portfolio-2026-07-27-18-32.json" → „27.07.2026, 18:32 Uhr" */
function lesbarerStempel(name) {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return name;
  return `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]} Uhr`;
}

async function wiederherstellen(backup, container) {
  const ok = await bestaetigen(
    `Stand vom ${lesbarerStempel(backup.name)} wiederherstellen?`,
    'Der aktuelle Datenbestand wird ersetzt. Vorher wird automatisch eine neue Sicherung des jetzigen Standes angelegt, '
    + 'du kannst also zurück. Bilder und Dokumente im Ordner bleiben unangetastet.',
    { okText: 'Wiederherstellen', gefahr: true }
  );
  if (!ok) return;

  try {
    /* Offene Änderungen zuerst schreiben – die Datei ist gleich die
       Sicherung, sie muss also den aktuellen Stand enthalten. */
    await sofortSpeichern();

    const daten = await backupLesen(backup.name);
    laden(daten);
    /* Sicherungsmarke löschen: erzwingt, dass der eben geschriebene Stand
       gesichert wird, bevor ihn die Wiederherstellung ersetzt. */
    state.daten.meta.letztesBackup = null;
    await sofortSpeichern();

    leeren(container);
    einstellungen.render(container);
    toast('Stand wiederhergestellt', 'ok');
  } catch (e) {
    console.error(e);
    toast('Wiederherstellung fehlgeschlagen: ' + e.message, 'err', 7000);
  }
}

function infoZeile(label, wert) {
  return el('tr', {}, [
    el('td', { text: label, style: 'color:var(--text-faint);width:40%' }),
    el('td', { text: wert }),
  ]);
}

function exportieren() {
  const blob = new Blob([JSON.stringify(state.daten, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const name = `${(state.daten.meta.name || 'portfolio').replace(/[^\wäöüÄÖÜß -]/g, '')}-${heuteISO()}.json`;
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Export erstellt', 'ok');
}

function importieren(container) {
  const input = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const daten = JSON.parse(await file.text());
      const ok = await bestaetigen(
        'Portfolio ersetzen?',
        `Die Datei „${file.name}" wird geladen und ersetzt den aktuellen Datenbestand im Ordner. Deine automatischen Sicherungen bleiben erhalten.`,
        { okText: 'Ersetzen', gefahr: true }
      );
      if (!ok) return;
      laden(daten);
      await sofortSpeichern();
      leeren(container);
      einstellungen.render(container);
      toast('Portfolio importiert', 'ok');
    } catch (err) {
      toast('Import fehlgeschlagen: ' + err.message, 'err', 6000);
    }
  });
  document.body.append(input);
  input.click();
}

async function schliessen() {
  const aufGeraet = speicher.kennung === 'lokal';
  const ok = await bestaetigen(
    'Portfolio schließen?',
    (aufGeraet
      ? 'Die Verknüpfung wird entfernt, die Daten bleiben auf dem Gerät gespeichert.'
      : 'Die Verknüpfung zum Ordner wird entfernt. Es werden keine Dateien gelöscht.')
    + ' Beim nächsten Start wählst du dein Portfolio wieder aus.',
    { okText: 'Schließen', gefahr: true }
  );
  if (!ok) return;
  await sofortSpeichern();
  await ordnerVergessen();
  location.reload();
}

async function geraetLeeren() {
  const ok = await bestaetigen(
    'Portfolio endgültig vom Gerät löschen?',
    'Alle Daten dieses Portfolios werden von diesem Gerät entfernt – Objekte, Bilder, Dokumente und '
    + 'sämtliche automatischen Sicherungen. Das lässt sich nicht rückgängig machen. '
    + 'Exportiere vorher eine Datei, wenn du die Daten behalten willst.',
    { okText: 'Endgültig löschen', gefahr: true }
  );
  if (!ok) return;
  await geraetedatenLoeschen();
  location.reload();
}
