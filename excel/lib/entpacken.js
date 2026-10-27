/* Gegenstueck zu zip.js: liest ein ZIP-Archiv wieder ein.

   Wird nur von pruefe.mjs gebraucht. Damit prueft das Skript die erzeugte
   Datei so, wie ein Fremdprogramm sie sieht - und nicht die Zwischenstufe im
   Arbeitsspeicher. Fehler im Schreiber fallen dadurch mit auf.
*/

const u16 = (d, i) => d[i] | (d[i + 1] << 8);
const u32 = (d, i) => (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0;

const entschluessler = new TextDecoder('utf-8');

/**
 * @param bytes    Uint8Array des Archivs
 * @param inflate  (Uint8Array, erwarteteLaenge) => Uint8Array fuer Raw-Deflate
 * @returns Map von Pfad auf { bytes, text, verfahren }
 */
export function zipLesen(bytes, inflate) {
  // Abschlussblock von hinten suchen (kein Kommentar erwartet, aber sicher ist sicher)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 65558; i--) {
    if (u32(bytes, i) === 0x06054B50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Kein ZIP-Abschlussblock gefunden');

  const anzahl = u16(bytes, eocd + 10);
  let zeiger = u32(bytes, eocd + 16);

  const eintraege = new Map();
  for (let n = 0; n < anzahl; n++) {
    if (u32(bytes, zeiger) !== 0x02014B50) throw new Error(`Verzeichniseintrag ${n} beschaedigt`);
    const verfahren = u16(bytes, zeiger + 10);
    const gepackt = u32(bytes, zeiger + 20);
    const roh = u32(bytes, zeiger + 24);
    const nameLaenge = u16(bytes, zeiger + 28);
    const extraLaenge = u16(bytes, zeiger + 30);
    const kommentarLaenge = u16(bytes, zeiger + 32);
    const versatz = u32(bytes, zeiger + 42);
    const pfad = entschluessler.decode(bytes.subarray(zeiger + 46, zeiger + 46 + nameLaenge));

    // Der lokale Kopf kann andere Feldlaengen tragen als das Verzeichnis
    if (u32(bytes, versatz) !== 0x04034B50) throw new Error(`Lokaler Kopf von ${pfad} beschaedigt`);
    const lokalName = u16(bytes, versatz + 26);
    const lokalExtra = u16(bytes, versatz + 28);
    const start = versatz + 30 + lokalName + lokalExtra;
    const daten = bytes.subarray(start, start + gepackt);

    let inhalt;
    if (verfahren === 0) inhalt = daten;
    else if (verfahren === 8) inhalt = inflate(daten, roh);
    else throw new Error(`${pfad}: unbekanntes Verfahren ${verfahren}`);

    if (inhalt.length !== roh) throw new Error(`${pfad}: ${inhalt.length} statt ${roh} Bytes`);
    eintraege.set(pfad, { bytes: inhalt, text: entschluessler.decode(inhalt), verfahren });

    zeiger += 46 + nameLaenge + extraLaenge + kommentarLaenge;
  }
  return eintraege;
}
