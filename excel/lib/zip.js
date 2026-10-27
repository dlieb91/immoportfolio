/* Minimaler ZIP-Schreiber.

   Eine .xlsx ist ein ZIP-Archiv aus XML-Dateien. Mehr als das hier braucht
   es dafuer nicht: lokale Dateikoepfe, ein zentrales Verzeichnis und der
   Abschlussblock. Kein Zip64 (die Mappe bleibt weit unter 4 GB), keine
   Data Descriptors, keine Ordnereintraege.

   Komprimiert wird mit Raw-Deflate, sofern eine Funktion uebergeben wird;
   sonst werden die Daten unkomprimiert abgelegt. Beides ist gueltig.
*/

const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABELLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const kodierer = new TextEncoder();
export const alsBytes = (text) => kodierer.encode(text);

/** Waechst bei Bedarf, damit die Groesse nicht vorab bekannt sein muss. */
class Puffer {
  constructor(groesse = 1 << 16) {
    this.daten = new Uint8Array(groesse);
    this.laenge = 0;
  }
  platz(zusaetzlich) {
    if (this.laenge + zusaetzlich <= this.daten.length) return;
    let neu = this.daten.length * 2;
    while (neu < this.laenge + zusaetzlich) neu *= 2;
    const kopie = new Uint8Array(neu);
    kopie.set(this.daten.subarray(0, this.laenge));
    this.daten = kopie;
  }
  u16(wert) {
    this.platz(2);
    this.daten[this.laenge++] = wert & 0xFF;
    this.daten[this.laenge++] = (wert >>> 8) & 0xFF;
  }
  u32(wert) {
    this.platz(4);
    this.daten[this.laenge++] = wert & 0xFF;
    this.daten[this.laenge++] = (wert >>> 8) & 0xFF;
    this.daten[this.laenge++] = (wert >>> 16) & 0xFF;
    this.daten[this.laenge++] = (wert >>> 24) & 0xFF;
  }
  bytes(quelle) {
    this.platz(quelle.length);
    this.daten.set(quelle, this.laenge);
    this.laenge += quelle.length;
  }
  fertig() {
    return this.daten.subarray(0, this.laenge);
  }
}

/** Feste Zeitmarke, damit zwei Laeufe bitgleiche Dateien erzeugen. */
const DOS_ZEIT = ((12 << 11) | (0 << 5) | 0);          // 12:00:00
const DOS_DATUM = (((2020 - 1980) << 9) | (1 << 5) | 1); // 01.01.2020

/**
 * @param dateien  [{ pfad, text|bytes }]
 * @param deflate  optional (Uint8Array) => Uint8Array, Raw-Deflate
 */
export function zipErzeugen(dateien, deflate = null) {
  const aus = new Puffer();
  const verzeichnis = [];

  for (const datei of dateien) {
    const roh = datei.bytes ?? alsBytes(datei.text);
    const name = alsBytes(datei.pfad);
    const pruefsumme = crc32(roh);

    let inhalt = roh;
    let verfahren = 0;
    if (deflate) {
      const gepackt = deflate(roh);
      // Nur uebernehmen, wenn es tatsaechlich kleiner wird
      if (gepackt.length < roh.length) {
        inhalt = gepackt;
        verfahren = 8;
      }
    }

    const versatz = aus.laenge;

    aus.u32(0x04034B50);      // Signatur lokaler Dateikopf
    aus.u16(20);              // benoetigte Version
    aus.u16(0x0800);          // Bit 11: Dateiname ist UTF-8
    aus.u16(verfahren);
    aus.u16(DOS_ZEIT);
    aus.u16(DOS_DATUM);
    aus.u32(pruefsumme);
    aus.u32(inhalt.length);
    aus.u32(roh.length);
    aus.u16(name.length);
    aus.u16(0);               // kein Extrafeld
    aus.bytes(name);
    aus.bytes(inhalt);

    verzeichnis.push({ name, pruefsumme, verfahren, gepackt: inhalt.length, roh: roh.length, versatz });
  }

  const verzeichnisStart = aus.laenge;
  for (const e of verzeichnis) {
    aus.u32(0x02014B50);      // Signatur Verzeichniseintrag
    aus.u16(20);              // erzeugt von Version
    aus.u16(20);              // benoetigte Version
    aus.u16(0x0800);
    aus.u16(e.verfahren);
    aus.u16(DOS_ZEIT);
    aus.u16(DOS_DATUM);
    aus.u32(e.pruefsumme);
    aus.u32(e.gepackt);
    aus.u32(e.roh);
    aus.u16(e.name.length);
    aus.u16(0);               // Extrafeld
    aus.u16(0);               // Kommentar
    aus.u16(0);               // Datentraeger
    aus.u16(0);               // interne Attribute
    aus.u32(0);               // externe Attribute
    aus.u32(e.versatz);
    aus.bytes(e.name);
  }
  const verzeichnisLaenge = aus.laenge - verzeichnisStart;

  aus.u32(0x06054B50);        // Signatur Abschlussblock
  aus.u16(0);                 // Datentraegernummer
  aus.u16(0);                 // Datentraeger mit Verzeichnisbeginn
  aus.u16(verzeichnis.length);
  aus.u16(verzeichnis.length);
  aus.u32(verzeichnisLaenge);
  aus.u32(verzeichnisStart);
  aus.u16(0);                 // Kommentarlaenge

  return aus.fertig();
}
