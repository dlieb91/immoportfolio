/* Dateiablage auf IndexedDB – die gemeinsame Grundlage zweier Ablagen.

   „Auf diesem Geraet" (lokal.js) benutzt sie als endgueltigen Ort,
   „Dropbox" (dropbox.js) als Zwischenspeicher, aus dem heraus abgeglichen
   wird. Damit sich beide nicht ins Gehege kommen, bekommt jede ihr eigenes
   Praefix im selben Objektspeicher. */

import { dateiGet, dateiSet, dateiDel, dateiListe } from '../db.js';

export function dateiablage(praefix = '') {
  const voll = (pfad) => praefix + pfad;

  return {
    async lesen(pfad) {
      const eintrag = await dateiGet(voll(pfad));
      return eintrag ? eintrag.inhalt : null;
    },

    async schreiben(pfad, inhalt) {
      /* Immer als Blob ablegen, damit lesen() unabhaengig vom Ablageort
         dasselbe liefert wie ein Ordner: eine Datei. */
      const blob = inhalt instanceof Blob ? inhalt : new Blob([inhalt], { type: 'application/json' });
      await dateiSet(voll(pfad), blob);
    },

    async loeschen(pfad) {
      await dateiDel(voll(pfad));
    },

    /** Dateien unmittelbar in diesem Ordner – Unterordner bleiben aussen vor. */
    async auflisten(ordnerPfad) {
      const p = voll(ordnerPfad ? ordnerPfad.replace(/\/$/, '') + '/' : '');
      const eintraege = await dateiListe(p);
      return eintraege
        .filter((e) => !e.pfad.slice(p.length).includes('/'))
        .map((e) => ({ name: e.pfad.slice(p.length), groesse: e.groesse, geaendert: e.geaendert }));
    },

    /** Alle Pfade dieser Ablage, auch in Unterordnern – fuer den Abgleich. */
    async alles() {
      const eintraege = await dateiListe(praefix);
      return eintraege.map((e) => ({
        pfad: e.pfad.slice(praefix.length),
        groesse: e.groesse,
        geaendert: e.geaendert,
      }));
    },

    async leeren() {
      for (const e of await dateiListe(praefix)) await dateiDel(e.pfad);
    },
  };
}
