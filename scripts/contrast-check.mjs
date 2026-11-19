// WCAG contrast check for every text/background pair used in the app.
// Token values are read from src/design-tokens.css (single source of
// truth); literal hex values are the hardcoded rail colors in styles.css.
// Exits non-zero if any pair fails WCAG AA for normal text (4.5:1).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokensCss = readFileSync(join(ROOT, "src", "design-tokens.css"), "utf8");

const tokens = new Map();
for (const match of tokensCss.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)) {
  tokens.set(match[1], match[2].toLowerCase());
}

function resolve(value) {
  if (value.startsWith("#")) return value.toLowerCase();
  const hex = tokens.get(value);
  if (hex === undefined) throw new Error(`Unknown token: ${value}`);
  return hex;
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, where it is used]
const PAIRS = [
  ["ink", "paper", "body text and headings on sheets"],
  ["ink", "paper-dim", "text in result boxes and chips"],
  ["ink", "desk", "text on the page background (boot, loading)"],
  ["slate", "paper", "secondary text on sheets"],
  ["slate", "paper-dim", "result headers, static tags"],
  ["slate", "desk", "character counts and hints on the page background"],
  ["paper", "ink", "rail text, active tag chips"],
  ["paper", "ink-soft", "active rail links"],
  ["#c8d2dc", "ink", "rail secondary text"],
  ["paper", "seal", "primary buttons, rail new-paper button, switch on"],
  ["paper", "seal-dark", "primary button hover"],
  ["paper", "danger", "danger buttons"],
  ["seal", "paper", "seal badges, focus outlines on sheets"],
  ["seal", "desk", "boot mark on the page background"],
  ["device", "device-bg", "on-device pills"],
  ["device", "paper", "success notes on panels"],
  ["cloud", "cloud-bg", "cloud pills, info notices"],
  ["cloud", "paper", "quiet buttons and links on sheets"],
  ["cloud", "desk", "quiet buttons on the page background"],
  ["warn", "warn-bg", "warning notices, missing-keys box"],
  ["danger", "danger-bg", "error panel headings"],
  ["ink", "danger-bg", "error panel next-step text"],
  ["danger", "paper", "field errors on sheets"],
  ["danger", "desk", "over-limit character counts"],
];

const MIN_RATIO = 4.5;
let failures = 0;

for (const [fgName, bgName, usage] of PAIRS) {
  const fg = resolve(fgName);
  const bg = resolve(bgName);
  const value = ratio(fg, bg);
  const ok = value >= MIN_RATIO;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${value.toFixed(2)}:1  ${fgName} (${fg}) on ${bgName} (${bg}) - ${usage}`,
  );
}

console.log(`\n${PAIRS.length - failures}/${PAIRS.length} pairs meet WCAG AA (≥ ${MIN_RATIO}:1).`);
if (failures > 0) {
  console.error("Contrast check FAILED.");
  process.exit(1);
}
console.log("Contrast check passed.");
