/* Kleine Helfer fuer den XML-Teil und die Zellbausteine. */

export function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 1 -> A, 26 -> Z, 27 -> AA */
export function spaltenName(n) {
  let name = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export const zellBezug = (spalte, zeile) => spaltenName(spalte) + zeile;

/** Excel-Serienzahl aus einem ISO-Datum. 1900-Basis wie in Excel und Sheets. */
export function datumsZahl(iso) {
  if (!iso) return null;
  const [j, m, t] = String(iso).slice(0, 10).split('-').map(Number);
  if (!j || !m || !t) return null;
  const tage = Math.floor(Date.UTC(j, m - 1, t) / 86400000);
  return tage + 25569; // Tage seit 1970 -> Tage seit 1899-12-30
}

/* ---------- Zellbausteine ----------
   t: 'text' | 'zahl' | 'formel' | 'leer'
*/

export const text = (v, s = 0) => (v == null || v === '' ? { t: 'leer', s } : { t: 'text', v: String(v), s });
export const zahl = (v, s = 0) => (v == null || v === '' || Number.isNaN(v) ? { t: 'leer', s } : { t: 'zahl', v: Number(v), s });
export const formel = (f, s = 0) => ({ t: 'formel', f, s });
export const leer = (s = 0) => ({ t: 'leer', s });

/** Datum als Serienzahl mit Datumsformat. */
export const datum = (iso, s) => {
  const z = datumsZahl(iso);
  return z == null ? { t: 'leer', s } : { t: 'zahl', v: z, s };
};

/**
 * Formeltext fuer die Datei. Innerhalb der .xlsx gilt immer:
 * englische Funktionsnamen, Komma als Argumenttrenner, Punkt als
 * Dezimalzeichen. Die Anzeige uebersetzt das in die Sprache des Nutzers.
 * Diese Funktion nimmt lesbaren Text mit ; und , und dreht ihn um.
 */
export function f(vorlage) {
  return vorlage
    .replace(/\s*\n\s*/g, '')   // Zeilenumbrueche in der Quelle entfernen
    .trim();
}
