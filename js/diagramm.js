/* SVG-Diagramme ohne Fremdbibliothek.

   Alle Diagramme: dünne Marken, zurückhaltendes Raster, Legende ab zwei
   Serien, Direktbeschriftung am Linienende, Fadenkreuz mit Tooltip.
   Farben kommen aus CSS-Variablen und folgen damit dem Hell/Dunkel-Modus.
*/

import { el } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const B = 860;          // logische Breite
const H = 300;          // logische Höhe
const RAND = { oben: 18, rechts: 92, unten: 30, links: 74 };

function s(tag, attr = {}, kinder = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attr)) {
    if (v == null || v === false) continue;
    node.setAttribute(k, v);
  }
  for (const c of [].concat(kinder)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Gefällige Achsenschritte für einen Wertebereich. */
function skala(min, max, schritte = 5) {
  if (min === max) { min -= 1; max += 1; }
  const spanne = max - min;
  const roh = spanne / schritte;
  const groesse = Math.pow(10, Math.floor(Math.log10(Math.abs(roh) || 1)));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * groesse).find((f) => f >= roh) || groesse * 10;
  const start = Math.floor(min / schritt) * schritt;
  const ende = Math.ceil(max / schritt) * schritt;
  const ticks = [];
  for (let v = start; v <= ende + schritt / 1000; v += schritt) ticks.push(v);
  return { min: start, max: ende, ticks };
}

const kurz = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' Mio';
  if (a >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(Math.round(v));
};

/* ---------- Gerüst ---------- */

function geruest({ xWerte, yMin, yMax, yFormat = kurz, xLabel }) {
  const y = skala(yMin, yMax);
  const innenB = B - RAND.links - RAND.rechts;
  const innenH = H - RAND.oben - RAND.unten;

  const px = (i) => RAND.links + (xWerte.length === 1 ? innenB / 2 : i / (xWerte.length - 1) * innenB);
  const py = (v) => RAND.oben + innenH - (v - y.min) / (y.max - y.min) * innenH;

  const teile = [];

  // waagerechtes Raster + Y-Beschriftung
  for (const t of y.ticks) {
    const yy = py(t);
    teile.push(s('line', { x1: RAND.links, x2: B - RAND.rechts, y1: yy, y2: yy, class: 'dg-raster' }));
    teile.push(s('text', { x: RAND.links - 10, y: yy + 4, class: 'dg-achse', 'text-anchor': 'end' }, [yFormat(t)]));
  }

  // Nulllinie hervorheben
  if (y.min < 0 && y.max > 0) {
    teile.push(s('line', { x1: RAND.links, x2: B - RAND.rechts, y1: py(0), y2: py(0), class: 'dg-null' }));
  }

  // X-Beschriftung: höchstens zehn Marken
  const schritt = Math.max(1, Math.ceil(xWerte.length / 10));
  xWerte.forEach((x, i) => {
    if (i % schritt !== 0 && i !== xWerte.length - 1) return;
    teile.push(s('text', { x: px(i), y: H - 10, class: 'dg-achse', 'text-anchor': 'middle' }, [String(x)]));
  });

  if (xLabel) teile.push(s('text', { x: B - RAND.rechts, y: H - 10, class: 'dg-achse dg-schwach', 'text-anchor': 'end' }, [xLabel]));

  return { teile, px, py, y, innenB, innenH };
}

/** Rahmen mit Legende, Tooltip-Ebene und Zeigerbehandlung. */
function rahmen(svg, { legende, punkteFuerIndex, xWerte, px }) {
  const box = el('div.dg', {}, [svg]);
  const tip = el('div.dg-tip', { hidden: true });
  box.append(tip);

  if (legende?.length > 1) {
    box.prepend(el('div.legende', {}, legende.map((l) => el('div.legende-eintrag', {}, [
      el('span.legende-punkt', { style: `background:${l.farbe}` }),
      el('span', { text: l.name }),
    ]))));
  }

  if (!punkteFuerIndex) return box;

  const kreuz = s('line', { class: 'dg-kreuz', y1: RAND.oben, y2: H - RAND.unten, hidden: true });
  svg.append(kreuz);
  const marken = s('g');
  svg.append(marken);

  const flaeche = s('rect', {
    x: RAND.links, y: RAND.oben,
    width: B - RAND.links - RAND.rechts, height: H - RAND.oben - RAND.unten,
    fill: 'transparent',
    /* pan-y: Senkrecht scrollt die Seite weiter, waagerechtes Wischen
       gehoert dem Diagramm. Ohne das liesse sich mit dem Finger kein Wert
       ablesen, weil jede Bewegung die Seite verschoebe. */
    style: 'touch-action:pan-y',
  });
  svg.append(flaeche);

  const verstecken = () => {
    tip.hidden = true;
    kreuz.setAttribute('hidden', '');
    marken.replaceChildren();
  };

  const zeigeBei = (ev) => {
    const rect = svg.getBoundingClientRect();
    const lokalX = (ev.clientX - rect.left) / rect.width * B;
    const anteil = (lokalX - RAND.links) / (B - RAND.links - RAND.rechts);
    const i = Math.max(0, Math.min(xWerte.length - 1, Math.round(anteil * (xWerte.length - 1))));

    const daten = punkteFuerIndex(i);
    if (!daten) return;

    kreuz.setAttribute('x1', px(i));
    kreuz.setAttribute('x2', px(i));
    kreuz.removeAttribute('hidden');

    marken.replaceChildren(...daten.marken.map((m) =>
      s('circle', { cx: px(i), cy: m.y, r: 4.5, fill: m.farbe, class: 'dg-marke' })));

    tip.hidden = false;
    tip.replaceChildren(
      el('div.dg-tip-titel', { text: daten.titel }),
      ...daten.zeilen.map((z) => el('div.dg-tip-zeile', {}, [
        z.farbe ? el('span.dg-tip-punkt', { style: `background:${z.farbe}` }) : el('span.dg-tip-punkt', { style: 'background:transparent' }),
        el('span', { text: z.name }),
        el('span.dg-tip-wert', { text: z.wert }),
      ])),
    );
    const relativ = px(i) / B;
    tip.style.left = `${relativ * 100}%`;
    tip.style.transform = `translate(${relativ > 0.65 ? '-100%' : '0'}, 0)`;
  };

  flaeche.addEventListener('pointermove', zeigeBei);
  /* Mit dem Finger gibt es kein „Darueberfahren": Erst das Antippen zeigt
     einen Wert. */
  flaeche.addEventListener('pointerdown', zeigeBei);

  flaeche.addEventListener('pointerleave', (ev) => {
    /* Nur die Maus verlaesst das Diagramm wirklich. Bei Beruehrung meldet
       der Browser pointerleave schon beim Abheben des Fingers – der Wert
       verschwaende, bevor man ihn gelesen hat. */
    if (ev.pointerType === 'mouse') verstecken();
  });

  /* Bei Beruehrung bleibt der Wert stehen, bis anderswo getippt wird. */
  document.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' && !box.contains(ev.target)) verstecken();
  });

  return box;
}

function svgWurzel(kinder) {
  return s('svg', {
    viewBox: `0 0 ${B} ${H}`, class: 'dg-svg',
    preserveAspectRatio: 'xMidYMid meet', role: 'img',
  }, kinder);
}

/* ---------- Gestapelte Fläche ---------- */

/**
 * @param serien [{ name, farbe, werte:[] }] – werden aufeinander gestapelt
 */
export function flaechenDiagramm({ xWerte, serien, format, tooltipFormat }) {
  const summen = xWerte.map((_, i) => serien.reduce((sum, r) => sum + (r.werte[i] || 0), 0));
  const { teile, px, py } = geruest({ xWerte, yMin: Math.min(0, ...summen), yMax: Math.max(...summen), yFormat: format });

  const basis = xWerte.map(() => 0);
  const flaechen = [];
  const linien = [];
  const label = [];

  for (const r of serien) {
    const oben = xWerte.map((_, i) => basis[i] + (r.werte[i] || 0));
    const pfad = [
      ...xWerte.map((_, i) => `${i ? 'L' : 'M'}${px(i)},${py(oben[i])}`),
      ...xWerte.map((_, i) => `L${px(xWerte.length - 1 - i)},${py(basis[xWerte.length - 1 - i])}`),
      'Z',
    ].join(' ');
    flaechen.push(s('path', { d: pfad, fill: r.farbe, 'fill-opacity': .82, stroke: 'none' }));
    linien.push(s('path', {
      d: xWerte.map((_, i) => `${i ? 'L' : 'M'}${px(i)},${py(oben[i])}`).join(' '),
      fill: 'none', stroke: 'var(--surface)', 'stroke-width': 2,
    }));
    const letzterY = (py(oben.at(-1)) + py(basis.at(-1))) / 2;
    label.push(s('text', { x: B - RAND.rechts + 8, y: letzterY + 4, class: 'dg-label', fill: r.farbe }, [r.name]));
    for (let i = 0; i < xWerte.length; i++) basis[i] = oben[i];
  }

  const svg = svgWurzel([...teile, ...flaechen, ...linien, ...label]);

  return rahmen(svg, {
    legende: serien.map((r) => ({ name: r.name, farbe: r.farbe })),
    xWerte, px,
    punkteFuerIndex: (i) => {
      let stapel = 0;
      const marken = serien.map((r) => { stapel += r.werte[i] || 0; return { y: py(stapel), farbe: r.farbe }; });
      return {
        titel: String(xWerte[i]),
        marken,
        zeilen: [
          ...serien.map((r) => ({ name: r.name, farbe: r.farbe, wert: (tooltipFormat || format)(r.werte[i] || 0) })),
          { name: 'Summe', wert: (tooltipFormat || format)(summen[i]) },
        ],
      };
    },
  });
}

/* ---------- Linien ---------- */

export function linienDiagramm({ xWerte, serien, format, tooltipFormat }) {
  const alle = serien.flatMap((r) => r.werte);
  const { teile, px, py } = geruest({
    xWerte, yMin: Math.min(0, ...alle), yMax: Math.max(...alle), yFormat: format,
  });

  const pfade = serien.map((r) => s('path', {
    d: r.werte.map((v, i) => `${i ? 'L' : 'M'}${px(i)},${py(v)}`).join(' '),
    fill: 'none', stroke: r.farbe, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  const label = serien.map((r) => s('text', {
    x: B - RAND.rechts + 8, y: py(r.werte.at(-1)) + 4, class: 'dg-label', fill: r.farbe,
  }, [r.name]));

  const svg = svgWurzel([...teile, ...pfade, ...label]);

  return rahmen(svg, {
    legende: serien.map((r) => ({ name: r.name, farbe: r.farbe })),
    xWerte, px,
    punkteFuerIndex: (i) => ({
      titel: String(xWerte[i]),
      marken: serien.map((r) => ({ y: py(r.werte[i]), farbe: r.farbe })),
      zeilen: serien.map((r) => ({ name: r.name, farbe: r.farbe, wert: (tooltipFormat || format)(r.werte[i]) })),
    }),
  });
}

/* ---------- Balken mit Vorzeichen ---------- */

export function balkenDiagramm({ xWerte, werte, format, tooltipFormat, name = 'Wert' }) {
  const { teile, px, py } = geruest({
    xWerte, yMin: Math.min(0, ...werte), yMax: Math.max(0, ...werte), yFormat: format,
  });

  const innenB = B - RAND.links - RAND.rechts;
  const breite = Math.max(3, Math.min(26, innenB / xWerte.length - 4));
  const nullY = py(0);

  const balken = werte.map((v, i) => {
    const y = py(v);
    const hoehe = Math.max(1, Math.abs(y - nullY));
    return s('rect', {
      x: px(i) - breite / 2, y: Math.min(y, nullY), width: breite, height: hoehe,
      rx: Math.min(4, breite / 2),
      fill: v >= 0 ? 'var(--pos)' : 'var(--neg)',
      class: 'dg-balken',
    });
  });

  const svg = svgWurzel([...teile, ...balken]);

  return rahmen(svg, {
    legende: null, xWerte, px,
    punkteFuerIndex: (i) => ({
      titel: String(xWerte[i]),
      marken: [{ y: py(werte[i]), farbe: werte[i] >= 0 ? 'var(--pos)' : 'var(--neg)' }],
      zeilen: [{ name, wert: (tooltipFormat || format)(werte[i]) }],
    }),
  });
}

/** Farbwert einer CSS-Variablen – für Serienfarben im SVG. */
export function farbe(variable) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#888';
}
