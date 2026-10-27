/* Zahlenformate, Schriften, Farben.

   Wichtig: Formatcodes sind sprachneutral. Der Punkt ist immer das
   Dezimal-, das Komma immer das Tausendertrennzeichen; die Anzeige
   uebersetzt das. Also #,##0.00 schreiben, nicht #.##0,00.

   Farben stammen aus css/app.css (helle Variante) und dem Logo.
*/

export const FARBE = {
  akzent: 'FF2563EB',
  akzentDunkel: 'FF14213D',
  gold: 'FFC9A227',
  positiv: 'FF15803D',
  negativ: 'FFDC2626',
  warnung: 'FFB45309',
  fremdkapital: 'FFD97706',
  rahmen: 'FFE3E8F0',
  flaeche: 'FFF7F9FC',
  eingabe: 'FFFFFFFF',
  eingabeRahmen: 'FFB9C6DC',
  warnFlaeche: 'FFFDF3E3',
  weiss: 'FFFFFFFF',
  text: 'FF131924',
  textLeise: 'FF5B6779',
};

const NUMMERNFORMATE = [
  { id: 164, code: '#,##0.00\\ "€"' },
  { id: 165, code: '#,##0\\ "€"' },
  { id: 166, code: '0.00" %"' },
  { id: 167, code: '0.0" %"' },
  { id: 168, code: '#,##0.00' },
  { id: 169, code: '#,##0.00\\ "€";[Red]\\-#,##0.00\\ "€"' },
  { id: 170, code: '#,##0' },
  { id: 171, code: '0.000" %"' },
  { id: 172, code: '#,##0\\ "€";[Red]\\-#,##0\\ "€"' },
];

/* Schriften */
const SCHRIFTEN = [
  { },                                                             // 0 Standard
  { fett: true, farbe: FARBE.weiss },                              // 1 Kopfzeile
  { fett: true, groesse: 18, farbe: FARBE.akzentDunkel },          // 2 Blatttitel
  { farbe: FARBE.textLeise },                                      // 3 leise
  { fett: true, farbe: FARBE.akzentDunkel },                       // 4 hervorgehoben
  { kursiv: true, groesse: 10, farbe: FARBE.textLeise },           // 5 Fussnote
  { fett: true, groesse: 14, farbe: FARBE.akzentDunkel },          // 6 Abschnitt
  { fett: true, farbe: FARBE.warnung },                            // 7 Warnung
  { fett: true, groesse: 16, farbe: FARBE.akzent },                // 8 Kachelwert
  { farbe: FARBE.akzent, unterstrichen: true },                    // 9 Verweis
];

/* Fuellungen – 0 und 1 sind laut Format vorgeschrieben */
const FUELLUNGEN = [
  null, null,
  FARBE.akzent,        // 2 Kopfzeile
  FARBE.flaeche,       // 3 Formelspalte
  FARBE.eingabe,       // 4 Eingabespalte
  FARBE.warnFlaeche,   // 5 Warnung
  FARBE.akzentDunkel,  // 6 Blattkopf
];

/* Rahmen */
const RAHMEN = [
  null,                                        // 0 keiner
  { alle: FARBE.rahmen },                      // 1 duenn ringsum
  { alle: FARBE.eingabeRahmen },               // 2 Eingabe
  { unten: FARBE.akzentDunkel },               // 3 Unterstrich
];

/**
 * Zellformate. Reihenfolge bestimmt den Index, der in den Zellen steht.
 * Namen sind die Schnittstelle fuer mappe.js.
 */
const FORMATE = [
  ['standard',      { }],
  ['titel',         { schrift: 2 }],
  ['untertitel',    { schrift: 3 }],
  ['abschnitt',     { schrift: 6 }],
  ['fussnote',      { schrift: 5 }],
  ['warnung',       { schrift: 7, fuellung: 5, rahmen: 1 }],
  ['hinweis',       { schrift: 3, umbruch: true }],
  ['kopf',          { schrift: 1, fuellung: 2, rahmen: 1, zentriert: true, umbruch: true }],
  ['kopfRechts',    { schrift: 1, fuellung: 2, rahmen: 1, rechts: true, umbruch: true }],

  ['eText',         { fuellung: 4, rahmen: 2 }],
  ['eZahl',         { fuellung: 4, rahmen: 2, format: 168 }],
  ['eGanz',         { fuellung: 4, rahmen: 2, format: 170 }],
  ['eEuro',         { fuellung: 4, rahmen: 2, format: 164 }],
  ['eProzent',      { fuellung: 4, rahmen: 2, format: 166 }],
  ['eProzent3',     { fuellung: 4, rahmen: 2, format: 171 }],
  ['eDatum',        { fuellung: 4, rahmen: 2, format: 14 }],

  ['fText',         { fuellung: 3, rahmen: 1 }],
  ['fZahl',         { fuellung: 3, rahmen: 1, format: 168 }],
  ['fGanz',         { fuellung: 3, rahmen: 1, format: 170 }],
  ['fEuro',         { fuellung: 3, rahmen: 1, format: 164 }],
  ['fEuro0',        { fuellung: 3, rahmen: 1, format: 165 }],
  ['fEuroVz',       { fuellung: 3, rahmen: 1, format: 169 }],
  ['fEuroVz0',      { fuellung: 3, rahmen: 1, format: 172 }],
  ['fProzent',      { fuellung: 3, rahmen: 1, format: 166 }],
  ['fProzent1',     { fuellung: 3, rahmen: 1, format: 167 }],
  ['fDatum',        { fuellung: 3, rahmen: 1, format: 14 }],
  ['fBalken',       { fuellung: 3, rahmen: 1, format: 170 }],

  ['kachelLabel',   { schrift: 3, fuellung: 3, rahmen: 1 }],
  ['kachelWert',    { schrift: 8, fuellung: 3, rahmen: 1, format: 165 }],
  ['kachelWertPz',  { schrift: 8, fuellung: 3, rahmen: 1, format: 167 }],
  ['kachelWertText',{ schrift: 8, fuellung: 3, rahmen: 1 }],

  ['summeEuro',     { schrift: 4, fuellung: 3, rahmen: 3, format: 164 }],
  ['summeEuro0',    { schrift: 4, fuellung: 3, rahmen: 3, format: 165 }],
  ['summeText',     { schrift: 4, fuellung: 3, rahmen: 3 }],
];

export const STIL = Object.fromEntries(FORMATE.map(([name], i) => [name, i]));

function schriftXml(s) {
  const teile = [];
  if (s.fett) teile.push('<b/>');
  if (s.kursiv) teile.push('<i/>');
  if (s.unterstrichen) teile.push('<u/>');
  teile.push(`<sz val="${s.groesse || 11}"/>`);
  if (s.farbe) teile.push(`<color rgb="${s.farbe}"/>`);
  teile.push('<name val="Calibri"/><family val="2"/>');
  return `<font>${teile.join('')}</font>`;
}

function fuellungXml(farbe, index) {
  if (index === 0) return '<fill><patternFill patternType="none"/></fill>';
  if (index === 1) return '<fill><patternFill patternType="gray125"/></fill>';
  return `<fill><patternFill patternType="solid"><fgColor rgb="${farbe}"/><bgColor indexed="64"/></patternFill></fill>`;
}

function rahmenXml(r) {
  if (!r) return '<border><left/><right/><top/><bottom/><diagonal/></border>';
  const kante = (farbe) => (farbe ? `<${'%s'}><color rgb="${farbe}"/></${'%s'}>` : '');
  const seite = (name, farbe) => (farbe
    ? `<${name} style="thin"><color rgb="${farbe}"/></${name}>`
    : `<${name}/>`);
  const alle = r.alle;
  return '<border>'
    + seite('left', alle)
    + seite('right', alle)
    + seite('top', alle)
    + seite('bottom', alle || r.unten)
    + '<diagonal/></border>';
}

export function stileXml() {
  const numFmts = NUMMERNFORMATE
    .map((n) => `<numFmt numFmtId="${n.id}" formatCode="${n.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"/>`)
    .join('');

  const fonts = SCHRIFTEN.map(schriftXml).join('');
  const fills = FUELLUNGEN.map((f, i) => fuellungXml(f, i)).join('');
  const borders = RAHMEN.map(rahmenXml).join('');

  const xfs = FORMATE.map(([, s]) => {
    const teile = [
      `numFmtId="${s.format || 0}"`,
      `fontId="${s.schrift || 0}"`,
      `fillId="${s.fuellung || 0}"`,
      `borderId="${s.rahmen || 0}"`,
      'xfId="0"',
    ];
    if (s.format) teile.push('applyNumberFormat="1"');
    if (s.schrift) teile.push('applyFont="1"');
    if (s.fuellung) teile.push('applyFill="1"');
    if (s.rahmen) teile.push('applyBorder="1"');
    const ausrichtung = (s.zentriert || s.rechts || s.umbruch)
      ? `<alignment${s.zentriert ? ' horizontal="center"' : s.rechts ? ' horizontal="right"' : ''}`
        + `${s.umbruch ? ' wrapText="1"' : ''} vertical="center"/>`
      : '';
    if (ausrichtung) teile.push('applyAlignment="1"');
    return `<xf ${teile.join(' ')}>${ausrichtung}</xf>`;
  }).join('');

  // Formate fuer die bedingte Formatierung: 0 rot, 1 gruen, 2 Warnflaeche
  const dxfs = [
    `<dxf><font><color rgb="${FARBE.negativ}"/></font></dxf>`,
    `<dxf><font><color rgb="${FARBE.positiv}"/></font></dxf>`,
    `<dxf><font><b/><color rgb="${FARBE.negativ}"/></font>`
      + `<fill><patternFill><bgColor rgb="FFFDE8E8"/></patternFill></fill></dxf>`,
  ].join('');

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<numFmts count="${NUMMERNFORMATE.length}">${numFmts}</numFmts>`
    + `<fonts count="${SCHRIFTEN.length}">${fonts}</fonts>`
    + `<fills count="${FUELLUNGEN.length}">${fills}</fills>`
    + `<borders count="${RAHMEN.length}">${borders}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${FORMATE.length}">${xfs}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>'
    + `<dxfs count="3">${dxfs}</dxfs>`
    + '</styleSheet>';
}

export const DXF = { negativ: 0, positiv: 1, fehler: 2 };
