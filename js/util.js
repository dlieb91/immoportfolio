/* Hilfsfunktionen: Formatierung, DOM, Toasts, Dialoge */

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EUR0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function eur(v, decimals = 2) {
  if (v == null || Number.isNaN(v)) return '–';
  return (decimals === 0 ? EUR0 : EUR).format(v);
}

export function num(v, decimals = 2) {
  if (v == null || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v);
}

export function pct(v, decimals = 2) {
  if (v == null || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(v) + ' %';
}

export function datum(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : DATE.format(d);
}

/**
 * Datum als YYYY-MM-DD in der **lokalen** Zeitzone.
 *
 * Bewusst nicht ueber toISOString(): das rechnet nach UTC um und liefert in
 * Mitteleuropa zwischen Mitternacht und 1 bzw. 2 Uhr noch den Vortag. Am
 * Monatsersten fiele damit der ganze laufende Monat aus der Zahlungsliste.
 */
export function datumISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function heuteISO() {
  return datumISO();
}

/** Lokales Datum, um Tage bzw. Jahre verschoben – fuer Fristen und Stichtage. */
export function datumPlus({ tage = 0, jahre = 0 } = {}, ab = new Date()) {
  const d = new Date(ab.getFullYear(), ab.getMonth(), ab.getDate());
  if (jahre) d.setFullYear(d.getFullYear() + jahre);
  if (tage) d.setDate(d.getDate() + tage);
  return datumISO(d);
}

export function zeitstempel() {
  return new Date().toISOString();
}

/** Kurze, sortierbare ID */
export function uid(prefix = 'id') {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

/* ---------- DOM ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * el('div.card', { onclick }, [kinder])
 */
export function el(spec, props = {}, children = []) {
  const [tagPart, ...classes] = spec.split('.');
  const node = document.createElement(tagPart || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function leeren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ---------- CSV ---------- */

/**
 * Ein Feld fuer den CSV-Export mit Semikolon als Trenner.
 * Enthaelt der Wert Semikolon, Anfuehrungszeichen oder Zeilenumbruch, wird
 * er nach RFC 4180 in Anfuehrungszeichen gesetzt – sonst verschoebe ein
 * Objektname mit Semikolon alle Folgespalten.
 */
export function csvFeld(wert) {
  const s = String(wert ?? '');
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export const csvZeile = (felder) => felder.map(csvFeld).join(';');

/* ---------- Toasts ---------- */

export function toast(text, art = 'info', dauer = 3800) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const t = el('div.toast.' + art, { text });
  root.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 220);
  }, dauer);
}

/* ---------- Dialoge ---------- */

/**
 * Modal mit eigenem Inhalt. resolve(wert) wird über den zurückgegebenen
 * Kontext aus den Buttons heraus aufgerufen.
 */
export function modal({ titel, beschreibung, inhalt, buttons = [], breite }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modalRoot');
    const box = el('div.modal', breite ? { style: `max-width:${breite}px` } : {});
    const backdrop = el('div.modal-backdrop', {}, [box]);

    const schliessen = (wert) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(wert);
    };
    const onKey = (e) => { if (e.key === 'Escape') schliessen(null); };

    const head = el('div.modal-head', {}, [el('h2', { text: titel })]);
    if (beschreibung) head.append(el('p', { text: beschreibung }));
    box.append(head);

    if (inhalt) box.append(el('div.modal-body', {}, [inhalt]));

    const foot = el('div.modal-foot');
    for (const b of buttons) {
      foot.append(el('button.btn' + (b.klasse ? '.' + b.klasse : ''), {
        type: 'button',
        onclick: () => {
          if (b.vorAbschluss && b.vorAbschluss() === false) return;
          schliessen(b.wert);
        },
      }, [b.text]));
    }
    box.append(foot);

    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) schliessen(null); });
    document.addEventListener('keydown', onKey);
    root.append(backdrop);

    const fokus = box.querySelector('input, select, textarea, .btn-primary');
    if (fokus) fokus.focus();
  });
}

export function bestaetigen(titel, beschreibung, { okText = 'Ja, fortfahren', gefahr = false } = {}) {
  return modal({
    titel, beschreibung,
    buttons: [
      { text: 'Abbrechen', wert: false },
      { text: okText, wert: true, klasse: gefahr ? 'btn-danger' : 'btn-primary' },
    ],
  }).then((v) => v === true);
}

export function abfragen(titel, beschreibung, { label = 'Name', wert = '', platzhalter = '' } = {}) {
  const input = el('input', { type: 'text', value: wert, placeholder: platzhalter });
  const feld = el('div.field', {}, [el('label', { text: label }), input]);
  return modal({
    titel, beschreibung, inhalt: feld,
    buttons: [
      { text: 'Abbrechen', wert: null },
      { text: 'Übernehmen', klasse: 'btn-primary', wert: '\0' },
    ],
  }).then((v) => (v === '\0' ? input.value.trim() : null));
}
