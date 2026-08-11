import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const tokenSource = fs.readFileSync(path.resolve(__dirname, '../design_tokens.ts'), 'utf8');

function sourceHex(name: string): string {
  const match = tokenSource.match(new RegExp(`(?:const\\s+${name}\\s*=|${name}:)\\s*'(?<hex>#[0-9A-Fa-f]{6})'`));
  assert.ok(match?.groups?.hex, `${name} のhex値をdesign_tokens.tsから取得できません`);
  return match.groups.hex;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

const accentText = sourceHex('ACCESSIBLE_ACCENT_TEXT');
const goldText = sourceHex('ACCESSIBLE_GOLD_TEXT');
const surface = sourceHex('surface');
const accentLight = sourceHex('accentLight');
const rank1Bg = sourceHex('rank1Bg');

assert.ok(contrast(accentText, surface) >= 4.5, 'accentTextは白い面でWCAG AAを満たす必要があります');
assert.ok(contrast(accentText, accentLight) >= 4.5, 'accentTextはaccentLight面でWCAG AAを満たす必要があります');
assert.ok(contrast(goldText, surface) >= 4.5, 'goldTextは白い面でWCAG AAを満たす必要があります');
assert.ok(contrast(goldText, rank1Bg) >= 4.5, 'goldTextはrank1Bg面でWCAG AAを満たす必要があります');

for (const root of ['app', 'components']) {
  const stack = [path.resolve(__dirname, '..', root)];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(fullPath, 'utf8');
        assert.equal(
          /(?<!Dark)Colors\.surfaceAlt/.test(source),
          false,
          `${path.relative(path.resolve(__dirname, '..'), fullPath)} がdeprecatedのColors.surfaceAltを使用しています`,
        );
      }
    }
  }
}

console.log('design token contrast tests passed');
