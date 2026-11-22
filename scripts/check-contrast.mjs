/**
 * Contrast guard for the panel's decorative palette.
 *
 * The panel mostly inherits Host theme tokens, but its accents (selection,
 * success, danger, priorities, papers) are literal colours. `client.js` now
 * defines them as `--sb-*` variables with a `[data-sb-scheme="light"]` override
 * driven by the Host `theme/change` event. This script reads those variables
 * back out of `client.js` and checks WCAG contrast against each scheme's
 * background, so a later tweak cannot silently make a light theme illegible.
 *
 *   node scripts/check-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'client.js'), 'utf8');

/** WCAG 2.x relative luminance for a #rrggbb colour. */
function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio, 1..21. */
function contrast(hexA, hexB) {
  const a = luminance(hexA);
  const b = luminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pull `--sb-*` declarations out of one selector block. */
function readPalette(selectorStart) {
  const start = source.indexOf(selectorStart);
  if (start === -1) throw new Error(`palette block not found: ${selectorStart}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const body = source.slice(open + 1, close);
  const palette = {};
  for (const match of body.matchAll(/--sb-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    palette[match[1]] = match[2].toLowerCase();
  }
  return palette;
}

const schemes = [
  {
    id: 'dark',
    palette: readPalette('.sb-root{'),
    background: '#0f1218',
    layer: '#151a22',
  },
  {
    id: 'light',
    palette: readPalette('.sb-root[data-sb-scheme="light"]{'),
    background: '#ffffff',
    layer: '#f5f6f8',
  },
];

// `accent-strong` is an outline colour (non-text): WCAG 1.4.11 wants 3:1.
const minimum = { 'accent-strong': 3.0, soft: 3.0 };
const DEFAULT_MIN = 4.5;

let failures = 0;
for (const scheme of schemes) {
  console.log(`\n[${scheme.id}] background ${scheme.background} / layer ${scheme.layer}`);
  console.log('  token            value      on bg    on layer  min   verdict');
  for (const [name, value] of Object.entries(scheme.palette)) {
    const onBg = contrast(value, scheme.background);
    const onLayer = contrast(value, scheme.layer);
    const min = minimum[name] ?? DEFAULT_MIN;
    const ok = onBg >= min && onLayer >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${name.padEnd(16)} ${value}  ${onBg.toFixed(2).padStart(6)}  ${onLayer.toFixed(2).padStart(8)}  ${min.toFixed(1)}   ${ok ? 'ok' : 'FAIL'}`,
    );
  }
}

if (failures > 0) {
  console.error(`\ncheck-contrast: ${failures} token(s) below the WCAG minimum`);
  process.exitCode = 1;
} else {
  console.log('\ncheck-contrast: all palette tokens pass');
}
