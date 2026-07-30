import assert from 'node:assert/strict';
import { remainingLabel } from '../utils/displayStats';
import { validateDisplayName, DISPLAY_NAME_MAX_LENGTH } from '../lib/validation/displayName';
import { pickOtherTeamColor } from '../utils/teamColors';

// ── remainingLabel: チャレンジ詳細のカウントダウン（切り捨て）と同じ丸めになること ──
{
  const now = new Date('2026-07-29T11:00:00+09:00');

  // 残り4日23時間39分 → ホームも「4日」（従来の切り上げは「5日」で詳細と食い違った）
  assert.equal(remainingLabel('2026-08-03T10:39:00+09:00', now), '4日');
  assert.equal(remainingLabel('2026-07-30T11:00:00+09:00', now), '1日');
  // 1日未満は時間表示へ
  assert.equal(remainingLabel('2026-07-30T10:59:00+09:00', now), '23時間');
  assert.equal(remainingLabel('2026-07-29T12:30:00+09:00', now), '1時間');
  // 1時間未満は分表示
  assert.equal(remainingLabel('2026-07-29T11:20:00+09:00', now), '20分');
  // 終了済み・不正値
  assert.equal(remainingLabel('2026-07-29T10:00:00+09:00', now), '終了');
  assert.equal(remainingLabel('not-a-date', now), null);
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

console.log('review fix tests passed');
