import assert from 'node:assert/strict';
import { comebackTarget, fastestFullKmSplitIndex, formatRunDistanceKm, formatTotalDistanceKm, remainingLabel } from '../utils/displayStats';
import { validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from '../lib/validation/displayName';
import { inferredLegacyTeamColorId, pickOtherTeamColor, pickTeamColor, pickTeamColors } from '../utils/teamColors';
import { factionBarRatio, prioritizeTeams } from '../utils/teamDisplay';
import { teamTitleLabel } from '../lib/teamTitle';

// ── remainingLabel: チャレンジ詳細のカウントダウン（切り捨て）と同じ丸めになること ──
{
  const now = new Date('2026-07-29T11:00:00+09:00');

  // 残り4日23時間39分 → ホームも「4日」（従来の切り上げは「5日」で詳細と食い違った）
  assert.equal(remainingLabel('2026-08-03T10:39:00+09:00', now, 'ja'), '4日');
  assert.equal(remainingLabel('2026-07-30T11:00:00+09:00', now, 'ja'), '1日');
  // 1日未満は時間表示へ
  assert.equal(remainingLabel('2026-07-30T10:59:00+09:00', now, 'ja'), '23時間');
  assert.equal(remainingLabel('2026-07-29T12:30:00+09:00', now, 'ja'), '1時間');
  // 1時間未満は分表示
  assert.equal(remainingLabel('2026-07-29T11:20:00+09:00', now, 'ja'), '20分');
  // 終了済み・不正値
  assert.equal(remainingLabel('2026-07-29T10:00:00+09:00', now, 'ja'), '終了');
  assert.equal(remainingLabel('not-a-date', now, 'ja'), null);
}

// 合計距離は100m単位、1回のランは10m単位で表示する。
assert.equal(formatTotalDistanceKm(5.24), '5.2');
assert.equal(formatTotalDistanceKm(-1), '0.0');
assert.equal(formatTotalDistanceKm(Number.NaN), '0.0');
assert.equal(formatRunDistanceKm(5.246), '5.25');
assert.equal(formatRunDistanceKm(-1), '0.00');
assert.equal(formatRunDistanceKm(Number.NaN), '0.00');
assert.equal(teamTitleLabel(1, 'ja'), '優勝チームの一員');
assert.equal(teamTitleLabel(2, 'ja'), '準優勝チームの一員');
assert.equal(teamTitleLabel(4, 'ja'), '4位チームの一員');
assert.equal(fastestFullKmSplitIndex([
  { km: 1, seconds: 360, distanceKm: 1 },
  { km: 2, seconds: 330, distanceKm: 1 },
  { km: 2.7, seconds: 180, distanceKm: 0.7 },
]), 1, '端数区間の換算ペースが最速でも1kmラップだけを比較する');
assert.equal(fastestFullKmSplitIndex([
  { km: 1, seconds: 360, distanceKm: 1 },
  { km: 1.4, seconds: 120, distanceKm: 0.4 },
]), null, '比較できる1kmラップが1本だけなら最速を表示しない');

// 逆転ペースは切り上げ日数ではなく実残り時間で割る。
{
  const now = new Date('2026-07-29T11:00:00+09:00');
  const target = comebackTarget(100, '2026-08-03T10:39:00+09:00', now);
  assert.ok(target);
  assert.equal(target.totalKm, 100.01);
  assert.ok(target.kmPerDay > 20 && target.kmPerDay < 21);
  assert.equal(comebackTarget(100, '2026-07-29T10:00:00+09:00', now), null);
}

// ── validateDisplayName: 公開ランキングに出る唯一のUGCなので長さ・制御文字を弾く ──
{
  assert.equal(validateDisplayName('まさき').ok, true);
  assert.equal(validateDisplayName('  まさき  ').ok, true);
  assert.equal(validateDisplayName('').ok, false);
  assert.equal(validateDisplayName('   ').ok, false);
  assert.equal(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH)).ok, true);
  assert.equal(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)).ok, false);
  assert.equal(validateDisplayName('ab\ncd').ok, false);
}

// ハッシュが衝突しても同一チャレンジ内では別色になり、入力順にも依存しない。
{
  const palette = ['teal', 'sky', 'purple', 'rose'];
  const ids = ['morning', 'night', 'sales', 'blue'];
  const forward = pickTeamColors(palette, ids);
  const reversed = pickTeamColors(palette, [...ids].reverse());
  assert.equal(new Set(Object.values(forward)).size, ids.length);
  assert.deepEqual(forward, reversed);
}

// 旧データの色名補完は定型名だけに限定し、一般名詞の部分一致を避ける。
assert.equal(inferredLegacyTeamColorId('赤チーム'), 'red');
assert.equal(inferredLegacyTeamColorId('BLUE TEAM'), 'blue');
assert.equal(inferredLegacyTeamColorId('白組'), 'gray');
assert.equal(inferredLegacyTeamColorId('赤ちゃんチーム'), undefined);
assert.equal(inferredLegacyTeamColorId('青森チーム'), undefined);
assert.equal(inferredLegacyTeamColorId('赤より青派'), undefined);

// 明示色はハッシュ割当より優先し、競合時も入力順に依存せず別色へずらす。
{
  const palette = ['teal', 'blue', 'red', 'gray'];
  const ids = ['team-red', 'team-blue', 'other'];
  const preferred = { 'team-red': 'red', 'team-blue': 'blue' };
  const forward = pickTeamColors(palette, ids, preferred);
  const reversed = pickTeamColors(palette, [...ids].reverse(), preferred);
  assert.equal(forward['team-red'], 'red');
  assert.equal(forward['team-blue'], 'blue');
  assert.equal(new Set(Object.values(forward)).size, ids.length);
  assert.deepEqual(forward, reversed);
}

// 保存済みの明示色は、旧データの名前から推測した色より必ず優先する。
{
  const palette = ['teal', 'blue', 'red', 'gray'];
  const ids = ['legacy-red', 'saved-red', 'other'];
  const explicit = { 'saved-red': 'red' };
  const inferred = { 'legacy-red': 'red' };
  const assigned = pickTeamColors(palette, ids, explicit, palette, inferred);
  assert.equal(assigned['saved-red'], 'red');
  assert.notEqual(assigned['legacy-red'], 'red');
  assert.equal(new Set(Object.values(assigned)).size, ids.length);
}

// 選択色を追加しても、colorIdを持たない旧チームのハッシュ色は変えない。
{
  const legacyPalette = ['teal', 'blue', 'purple', 'pink', 'green', 'gray'];
  const expandedPalette = [...legacyPalette, 'red'];
  const ids = ['morning', 'night', 'sales'];
  assert.deepEqual(
    pickTeamColors(expandedPalette, ids, {}, legacyPalette),
    pickTeamColors(legacyPalette, ids),
  );
}

// ── pickOtherTeamColor: 先頭（自チーム色）を他チームへ割り当てないこと ──
{
  const palette = ['#000001', '#000002', '#000003', '#000004'] as const;
  for (let order = 0; order < 20; order++) {
    assert.notEqual(pickOtherTeamColor(palette, order), palette[0]);
  }
  assert.equal(pickOtherTeamColor(palette, 0), palette[1]);
  assert.equal(pickOtherTeamColor(palette, 1), palette[2]);
  assert.equal(pickOtherTeamColor(palette, 2), palette[3]);
  assert.equal(pickOtherTeamColor(palette, 3), palette[1], 'index 1 以降で循環する');
  // 異常値・退化ケース
  assert.equal(pickOtherTeamColor(palette, -1), palette[1]);
  assert.equal(pickOtherTeamColor(palette, Number.NaN), palette[1]);
  assert.equal(pickOtherTeamColor(['#000001'], 3), '#000001');
assert.equal(pickOtherTeamColor([], 0), '');
}

// チーム色はcategoryIdだけで決まり、表示順や参加状態に依存しない。
{
  const palette = ['teal', 'orange', 'blue', 'purple'];
  assert.equal(pickTeamColor(palette, 'team-a'), pickTeamColor(palette, 'team-a'));
  assert.notEqual(pickTeamColor(palette, 'team-a'), '');
  assert.equal(pickTeamColor([], 'team-a'), '');
}

// バーは首位を100%にした実比率とし、小値だけ下限を与える。
assert.equal(factionBarRatio(46.1, 46.1), 1);
assert.ok(Math.abs(factionBarRatio(41.1, 46.1) - (41.1 / 46.1)) < 0.000001);
assert.equal(factionBarRatio(0, 46.1), 0);
assert.equal(factionBarRatio(0.1, 100), 0.15);
assert.equal(factionBarRatio(5, 0), 0);

// 3チーム以上のコンパクト表示は自チームと近い順位を先にする。
assert.deepEqual(
  prioritizeTeams([
    { categoryId: 'first' },
    { categoryId: 'second' },
    { categoryId: 'mine' },
    { categoryId: 'fourth' },
    { categoryId: 'fifth' },
  ], 'mine').map((team) => team.categoryId),
  ['mine', 'second', 'fourth', 'first', 'fifth'],
);

console.log('review fix tests passed');
