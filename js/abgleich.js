/* Steuerung des Dropbox-Abgleichs: wann abgeglichen wird, was bei einem
   Konflikt passiert, und wie der Zustand in der Kopfzeile aussieht.

   Eigenes Modul, weil zwei Seiten es brauchen – main.js beim Start und die
   Einstellungen fuer den Knopf „Jetzt abgleichen". Ein Import aus main.js
   waere ein Zirkelbezug.

   Was die Ansicht neu zeichnet, weiss dieses Modul nicht; main.js meldet es
   ueber neuZeichnen() an. Dasselbe Muster wie datenquelle() in storage.js. */

import { $, el, toast, modal, datum } from './util.js';
import { hinweis } from './felder.js';
import { laden, abonnieren } from './store.js';
import {
  abgleichMoeglich, abgleichen, konfliktHierBehalten, konfliktDortBehalten,
} from './storage.js';

let neuZeichnen = () => {};

/** main.js meldet hier an, wie die Ansicht neu aufgebaut wird. */
export function anzeigeAnmelden(fn) {
  neuZeichnen = fn;
}

let laeuft = false;

/**
 * Wann abgeglichen wird: beim Start, bei der Rueckkehr zur App, wenn das
 * Netz wiederkommt, und traege nach Aenderungen. Letzteres bewusst traege –
 * waehrend des Tippens staendig hochzuladen braucht niemand und erzeugt nur
 * Konflikte mit dem zweiten Geraet.
 */
export function anbinden() {
  if (!abgleichMoeglich()) return;
  let timer = null;

  jetztAbgleichen(true);
  abonnieren(() => {
    clearTimeout(timer);
    timer = setTimeout(() => jetztAbgleichen(true), 8000);
  });
  window.addEventListener('online', () => jetztAbgleichen(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') jetztAbgleichen(true);
  });
  $('#syncStatus')?.addEventListener('click', () => jetztAbgleichen(false));
}

/** `leise` unterdrueckt Erfolgsmeldungen – fuer die automatischen Laeufe. */
export async function jetztAbgleichen(leise = false) {
  if (laeuft || !abgleichMoeglich()) return;

  if (!navigator.onLine) {
    zustandZeigen('offline');
    if (!leise) toast('Kein Netz – der Abgleich holt das nach, sobald du wieder online bist.', 'info');
    return;
  }

  laeuft = true;
  zustandZeigen('laeuft');
  try {
    const e = await abgleichen();

    if (e.art === 'konflikt') {
      zustandZeigen('konflikt');
      await konfliktKlaeren(e);
      return;
    }

    if (e.art === 'geholt') {
      laden(e.daten);
      neuZeichnen();
      toast('Neuerer Stand aus Dropbox übernommen', 'ok');
    } else if (!leise) {
      toast(e.art === 'nichts' ? 'Alles aktuell' : 'Zu Dropbox übertragen', 'ok');
    }
    zustandZeigen('fertig');
  } catch (err) {
    console.error('Abgleich fehlgeschlagen:', err);
    zustandZeigen('fehler');
    toast('Abgleich fehlgeschlagen: ' + err.message, 'err', 7000);
  } finally {
    laeuft = false;
  }
}

/**
 * Der Konfliktfall: beide Seiten haben sich seit dem letzten Abgleich
 * bewegt. Es wird nicht geraten – der Nutzer sieht beide Fassungen und
 * entscheidet. Die unterlegene bleibt in jedem Fall als Sicherung.
 */
async function konfliktKlaeren(e) {
  const spalte = (titel, s, hier) => el('div', {
    style: 'border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px',
  }, [
    el('div', { text: titel, style: 'font-weight:600;margin-bottom:8px' }),
    el('div.faint', { style: 'font-size:12.5px;display:grid;gap:3px' }, [
      el('div', { text: `zuletzt geändert: ${s.geaendertAm ? datum(s.geaendertAm) : 'unbekannt'}` }),
      el('div', { text: `auf Gerät: ${s.geraet || 'unbekannt'}` }),
      el('div', { text: `${s.objekte} Objekte, ${s.buchungen} Buchungen` }),
      el('div', { text: `${s.stand} Änderungen insgesamt` }),
    ]),
    hier ? el('div.badge.blau', { text: 'dieses Gerät', style: 'margin-top:8px' }) : null,
  ]);

  const inhalt = el('div', { style: 'display:grid;gap:12px' }, [
    hinweis('<strong>Beide Seiten wurden geändert.</strong> Die Stände lassen sich nicht '
      + 'zuverlässig zusammenführen – entscheide, welcher gelten soll. Der andere wird als Sicherung '
      + 'behalten und ist unter <em>Einstellungen → Speicherung</em> wiederherstellbar.'),
    el('div.konflikt-paar', {}, [
      spalte('Hier', e.hier, true),
      spalte('In Dropbox', e.dort, false),
    ]),
  ]);

  const wahl = await modal({
    titel: 'Unterschiedliche Stände', inhalt, breite: 600,
    buttons: [
      { text: 'Später entscheiden', wert: null },
      { text: 'Dropbox übernehmen', wert: 'dort' },
      { text: 'Diesen Stand behalten', klasse: 'btn-primary', wert: 'hier' },
    ],
  });

  if (!wahl) {
    toast('Abgleich zurückgestellt – bis dahin bleiben beide Stände getrennt.', 'info', 6000);
    return;
  }

  try {
    if (wahl === 'hier') {
      await konfliktHierBehalten(e.fremdRev);
      toast('Dein Stand gilt jetzt auch in Dropbox', 'ok');
    } else {
      const r = await konfliktDortBehalten(e.fremdDaten, e.fremdRev);
      laden(r.daten);
      neuZeichnen();
      toast('Stand aus Dropbox übernommen', 'ok');
    }
    zustandZeigen('fertig');
  } catch (err) {
    zustandZeigen('fehler');
    toast('Konflikt konnte nicht aufgelöst werden: ' + err.message, 'err', 7000);
  }
}

function zustandZeigen(zustand) {
  const box = $('#syncStatus');
  if (!box) return;
  box.hidden = false;
  box.dataset.state = zustand;
  const texte = {
    laeuft: 'Gleicht ab …',
    fertig: 'Abgeglichen',
    offline: 'Offline',
    konflikt: 'Stände weichen ab',
    fehler: 'Abgleich gestört',
  };
  box.querySelector('.label').textContent = texte[zustand] || '';
}
