import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAppLanguage } from '../lib/language';
import { translateIn } from '../lib/translate';
import { en } from '../lib/translations/en';
import { ja } from '../lib/translations/ja';
import {
  isBattleVisibleInMarket,
  marketFromRegion,
  resolveBattleMarket,
  resolveUserMarket,
} from '../lib/market';

function translationKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => translationKeys(child, prefix ? `${prefix}.${key}` : key));
}

assert.deepEqual(
  translationKeys(en).sort(),
  translationKeys(ja).sort(),
  'Japanese and English resources must expose the same translation keys',
);

assert.equal(resolveAppLanguage('ja'), 'ja');
assert.equal(resolveAppLanguage('JA'), 'ja');
assert.equal(resolveAppLanguage('en'), 'en');
assert.equal(resolveAppLanguage('fr'), 'en');
assert.equal(resolveAppLanguage(null), 'en');
assert.equal(translateIn('ja', 'common.cancel'), 'キャンセル');
assert.equal(translateIn('en', 'common.cancel'), 'Cancel');
assert.equal(translateIn('en', 'common.perPersonKm'), 'km/person');
assert.equal(translateIn('ja', 'common.perPersonKm'), 'km/人');
assert.equal(translateIn('ja', 'common.member'), 'メンバー');
assert.equal(translateIn('en', 'common.member'), 'Member');

assert.equal(marketFromRegion('JP'), 'JP');
assert.equal(marketFromRegion('us'), 'US');
assert.equal(marketFromRegion('GB'), 'GLOBAL');
assert.equal(marketFromRegion(null), 'GLOBAL');

assert.equal(resolveUserMarket('US', 'JP'), 'US', 'saved market wins over inferred region');
assert.equal(resolveUserMarket(undefined, 'JP'), 'JP', 'legacy user uses inferred market');
assert.equal(resolveBattleMarket(undefined), 'JP', 'legacy Battle is Japanese-market content');

assert.equal(isBattleVisibleInMarket('JP', 'JP'), true);
assert.equal(isBattleVisibleInMarket('GLOBAL', 'JP'), true);
assert.equal(isBattleVisibleInMarket(undefined, 'JP'), true);
assert.equal(isBattleVisibleInMarket('US', 'JP'), false);
assert.equal(isBattleVisibleInMarket('US', 'US'), true);
assert.equal(isBattleVisibleInMarket('GLOBAL', 'US'), true);
assert.equal(isBattleVisibleInMarket(undefined, 'US'), false);
assert.equal(isBattleVisibleInMarket('GLOBAL', 'GLOBAL'), true);
assert.equal(isBattleVisibleInMarket('JP', 'GLOBAL'), false);
assert.equal(isBattleVisibleInMarket('US', 'GLOBAL'), false);

const projectRoot = path.resolve(__dirname, '..');
const profileSource = fs.readFileSync(path.join(projectRoot, 'app/(tabs)/profile.tsx'), 'utf8');
assert.match(profileSource, /visible=\{showMarketPicker\}/, '地域選択はAndroidでも4操作を表示できるModalを使う');
assert.match(profileSource, /accessibilityRole="radio"/, '地域選択肢をradioとして公開する');
const marketHandlerSource = profileSource.slice(
  profileSource.indexOf('function showMarketOptions()'),
  profileSource.indexOf('async function handleEmojiSelect'),
);
assert.doesNotMatch(marketHandlerSource, /Alert\.alert/, '地域選択にAndroid最大3ボタンのAlertを使わない');

for (const hookPath of ['hooks/useTeamRanking.ts', 'hooks/useBattleParticipants.ts']) {
  const source = fs.readFileSync(path.join(projectRoot, hookPath), 'utf8');
  assert.match(source, /t\('common\.member'\)/, `${hookPath}の匿名表示を現在のUI言語へ追従させる`);
  assert.doesNotMatch(source, /\?\? 'メンバー'/, `${hookPath}へ日本語fallbackを直書きしない`);
}

console.log('localization and market tests passed');
