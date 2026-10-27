/* Serialisierer: Mappenmodell -> Dateiteile einer .xlsx.

   Bewusste Entscheidungen:
   - Formeln werden OHNE zwischengespeicherten Wert geschrieben. Damit muss
     hier keine Rechenmaschine nachgebaut werden. Excel rechnet beim Oeffnen,
     weil <calcPr fullCalcOnLoad="1"/> gesetzt ist; Sheets rechnet ohnehin neu.
   - Keine geteilten Formeln (t="shared"). Sie sparen Platz, sind aber die
     haeufigste Ursache fuer "Excel hat unlesbare Inhalte gefunden".
   - Alle Farben als rgb, nie als theme – dann braucht es keine theme1.xml.
   - Texte in sharedStrings.xml, weil Sheets die zuverlaessig importiert.

   Die Reihenfolge der Kindelemente in worksheet und workbook ist im Format
   vorgeschrieben. Wer sie vertauscht, bekommt eine Reparaturmeldung.
*/

import { esc, spaltenName } from './xml.js';
import { stileXml, DXF } from './stile.js';

const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function blattXml(blatt, texte) {
  const zeilen = blatt.zeilen || [];
  let maxSpalte = 1;
  const zeilenXml = [];

  zeilen.forEach((zellen, i) => {
    if (!zellen || !zellen.length) return;
    const nr = i + 1;
    const stuecke = [];
    zellen.forEach((z, j) => {
      if (!z) return;
      const bezug = spaltenName(j + 1) + nr;
      if (j + 1 > maxSpalte) maxSpalte = j + 1;
      const stil = z.s ? ` s="${z.s}"` : '';
      if (z.t === 'formel') {
        stuecke.push(`<c r="${bezug}"${stil}><f>${esc(z.f)}</f></c>`);
      } else if (z.t === 'zahl') {
        stuecke.push(`<c r="${bezug}"${stil}><v>${z.v}</v></c>`);
      } else if (z.t === 'text') {
        let index = texte.index.get(z.v);
        if (index === undefined) {
          index = texte.liste.length;
          texte.liste.push(z.v);
          texte.index.set(z.v, index);
        }
        stuecke.push(`<c r="${bezug}"${stil} t="s"><v>${index}</v></c>`);
      } else if (z.s) {
        stuecke.push(`<c r="${bezug}"${stil}/>`);
      }
    });
    if (!stuecke.length) return;
    const hoehe = blatt.hoehen?.[nr] ? ` ht="${blatt.hoehen[nr]}" customHeight="1"` : '';
    zeilenXml.push(`<row r="${nr}"${hoehe}>${stuecke.join('')}</row>`);
  });

  const letzteZeile = Math.max(1, zeilen.length);
  const dimension = `<dimension ref="A1:${spaltenName(maxSpalte)}${letzteZeile}"/>`;

  /* Ansicht mit fixierten Kopfzeilen */
  const fix = blatt.fixieren;
  let ansicht = '<sheetView workbookViewId="0"';
  if (blatt.ausgewaehlt) ansicht += ' tabSelected="1"';
  ansicht += '>';
  if (fix) {
    const links = spaltenName((fix.spalte || 0) + 1) + ((fix.zeile || 0) + 1);
    const teile = [];
    if (fix.spalte) teile.push(`xSplit="${fix.spalte}"`);
    if (fix.zeile) teile.push(`ySplit="${fix.zeile}"`);
    ansicht += `<pane ${teile.join(' ')} topLeftCell="${links}" activePane="bottomRight" state="frozen"/>`;
    ansicht += `<selection pane="bottomRight" activeCell="${links}" sqref="${links}"/>`;
  }
  ansicht += '</sheetView>';

  const cols = (blatt.breiten || [])
    .map((b) => `<col min="${b.von}" max="${b.bis}" width="${b.breite}" customWidth="1"/>`)
    .join('');

  const zusammen = (blatt.verbunden || []).length
    ? `<mergeCells count="${blatt.verbunden.length}">`
      + blatt.verbunden.map((r) => `<mergeCell ref="${r}"/>`).join('')
      + '</mergeCells>'
    : '';

  const bedingt = (blatt.formate || []).map((fm, i) => {
    const prio = i + 1;
    if (fm.art === 'balken') {
      return `<conditionalFormatting sqref="${fm.bereich}"><cfRule type="dataBar" priority="${prio}">`
        + `<dataBar><cfvo type="num"><f>0</f></cfvo><cfvo type="max"/>`
        + `<color rgb="${fm.farbe}"/></dataBar></cfRule></conditionalFormatting>`;
    }
    if (fm.art === 'vorzeichen') {
      return `<conditionalFormatting sqref="${fm.bereich}">`
        + `<cfRule type="cellIs" operator="lessThan" dxfId="${DXF.negativ}" priority="${prio}"><formula>0</formula></cfRule>`
        + `<cfRule type="cellIs" operator="greaterThan" dxfId="${DXF.positiv}" priority="${prio + 100}"><formula>0</formula></cfRule>`
        + '</conditionalFormatting>';
    }
    if (fm.art === 'fehler') {
      return `<conditionalFormatting sqref="${fm.bereich}">`
        + `<cfRule type="expression" dxfId="${DXF.fehler}" priority="${prio}"><formula>${esc(fm.formel)}</formula></cfRule>`
        + '</conditionalFormatting>';
    }
    return '';
  }).join('');

  const pruefungen = (blatt.pruefungen || []).length
    ? `<dataValidations count="${blatt.pruefungen.length}">`
      + blatt.pruefungen.map((p) => '<dataValidation type="list" allowBlank="1" showInputMessage="1"'
        + ` showErrorMessage="1" sqref="${p.bereich}"><formula1>${esc(p.liste)}</formula1></dataValidation>`).join('')
      + '</dataValidations>'
    : '';

  return KOPF
    + `<worksheet xmlns="${NS}" xmlns:r="${NS_R}">`
    + '<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>'
    + dimension
    + `<sheetViews>${ansicht}</sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + (cols ? `<cols>${cols}</cols>` : '')
    + `<sheetData>${zeilenXml.join('')}</sheetData>`
    + (blatt.autofilter ? `<autoFilter ref="${blatt.autofilter}"/>` : '')
    + zusammen
    + bedingt
    + pruefungen
    + '</worksheet>';
}

export function mappeSerialisieren(mappe) {
  const texte = { liste: [], index: new Map() };
  const blaetter = mappe.blaetter.map((b) => ({ blatt: b, xml: blattXml(b, texte) }));

  const dateien = [];

  /* Arbeitsmappe */
  const sheets = blaetter.map((b, i) =>
    `<sheet name="${esc(b.blatt.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"`
    + `${b.blatt.ausgeblendet ? ' state="hidden"' : ''}/>`).join('');

  const namen = (mappe.namen || []).length
    ? '<definedNames>'
      + mappe.namen.map((n) => `<definedName name="${esc(n.name)}">${esc(n.bezug)}</definedName>`).join('')
      + '</definedNames>'
    : '';

  dateien.push({
    pfad: 'xl/workbook.xml',
    text: KOPF + `<workbook xmlns="${NS}" xmlns:r="${NS_R}">`
      + '<workbookPr/>'
      + '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="25600" windowHeight="16000"/></bookViews>'
      + `<sheets>${sheets}</sheets>`
      + namen
      + '<calcPr calcId="0" fullCalcOnLoad="1"/>'
      + '</workbook>',
  });

  /* Beziehungen der Arbeitsmappe */
  const rels = blaetter.map((b, i) =>
    `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const nStyles = blaetter.length + 1;
  const nStrings = blaetter.length + 2;
  dateien.push({
    pfad: 'xl/_rels/workbook.xml.rels',
    text: KOPF + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + rels
      + `<Relationship Id="rId${nStyles}" Type="${NS_R}/styles" Target="styles.xml"/>`
      + `<Relationship Id="rId${nStrings}" Type="${NS_R}/sharedStrings" Target="sharedStrings.xml"/>`
      + '</Relationships>',
  });

  blaetter.forEach((b, i) => dateien.push({ pfad: `xl/worksheets/sheet${i + 1}.xml`, text: b.xml }));

  dateien.push({ pfad: 'xl/styles.xml', text: stileXml() });

  dateien.push({
    pfad: 'xl/sharedStrings.xml',
    text: KOPF + `<sst xmlns="${NS}" count="${texte.liste.length}" uniqueCount="${texte.liste.length}">`
      + texte.liste.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')
      + '</sst>',
  });

  /* Verpackung */
  const overrides = blaetter.map((b, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml"`
    + ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');

  dateien.push({
    pfad: '[Content_Types].xml',
    text: KOPF + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + overrides
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>',
  });

  dateien.push({
    pfad: '_rels/.rels',
    text: KOPF + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/>`
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + `<Relationship Id="rId3" Type="${NS_R}/extended-properties" Target="docProps/app.xml"/>`
      + '</Relationships>',
  });

  dateien.push({
    pfad: 'docProps/core.xml',
    text: KOPF + '<cp:coreProperties'
      + ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
      + ' xmlns:dc="http://purl.org/dc/elements/1.1/"'
      + ' xmlns:dcterms="http://purl.org/dc/terms/"'
      + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${esc(mappe.titel || 'ImmoPortfolio')}</dc:title>`
      + `<dc:creator>${esc(mappe.ersteller || 'ImmoPortfolio')}</dc:creator>`
      + `<cp:lastModifiedBy>${esc(mappe.ersteller || 'ImmoPortfolio')}</cp:lastModifiedBy>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${mappe.erstellt || '2020-01-01T12:00:00Z'}</dcterms:created>`
      + '</cp:coreProperties>',
  });

  dateien.push({
    pfad: 'docProps/app.xml',
    text: KOPF + '<Properties'
      + ' xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"'
      + ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
      + '<Application>ImmoPortfolio Zahlenkompass</Application>'
      + '</Properties>',
  });

  return dateien;
}
