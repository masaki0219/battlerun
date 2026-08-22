import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { notificationEntityId } from '../lib/notificationRouting';
import { setTranslationLanguage } from '../lib/translate';
import { userFacingError, userErrorReason } from '../lib/userError';

assert.equal(notificationEntityId('battle_ABC-123'), 'battle_ABC-123');
assert.equal(notificationEntityId('../profile'), null);
assert.equal(notificationEntityId('a/b'), null);
assert.equal(notificationEntityId(''), null);
assert.equal(notificationEntityId('a'.repeat(129)), null);

const callableError = {
  code: 'functions/failed-precondition',
  message: 'server implementation detail',
  details: { reason: 'active-limit' },
};
assert.equal(userErrorReason(callableError), 'active-limit');
setTranslationLanguage('ja');
assert.equal(userFacingError(callableError, 'fallback'), '同時に参加できるチャレンジは2件までです。');
setTranslationLanguage('en');
assert.equal(userFacingError(callableError, 'fallback'), 'You can join up to two challenges at the same time.');
assert.equal(
  userFacingError({ code: 'functions/internal', message: 'secret detail' }, 'safe fallback'),
  'safe fallback',
);

const projectRoot = path.resolve(__dirname, '..');
const authSource = fs.readFileSync(path.join(projectRoot, 'stores/authStore.ts'), 'utf8');
const notificationsSource = fs.readFileSync(path.join(projectRoot, 'lib/notifications.ts'), 'utf8');
const functionsIndexSource = fs.readFileSync(path.join(projectRoot, 'functions/src/index.ts'), 'utf8');
const locationSource = fs.readFileSync(path.join(projectRoot, 'hooks/useLocation.ts'), 'utf8');
const publicCardSource = fs.readFileSync(path.join(projectRoot, 'components/battle/PublicBattleCard.tsx'), 'utf8');
const rankRowsSource = fs.readFileSync(path.join(projectRoot, 'components/battle/BattleRankRows.tsx'), 'utf8');
const profileSource = fs.readFileSync(path.join(projectRoot, 'app/(tabs)/profile.tsx'), 'utf8');
const reactionNotificationsSource = fs.readFileSync(path.join(projectRoot, 'functions/src/notifications.ts'), 'utf8');
const teamRankingSource = fs.readFileSync(path.join(projectRoot, 'hooks/useTeamRanking.ts'), 'utf8');
const revenuecatSource = fs.readFileSync(path.join(projectRoot, 'functions/src/revenuecatWebhook.ts'), 'utf8');
const weeklyGoalModalSource = fs.readFileSync(path.join(projectRoot, 'components/run/WeeklyGoalSettingsModal.tsx'), 'utf8');

assert.match(authSource, /removeCurrentPushTokenForSignOut\(currentUser\.uid\)/, 'ログアウト前にこの端末のPush Tokenを削除する');
assert.match(authSource, /clearDeviceNotificationsForSignOut\(\)/, 'ログアウト時に端末通知を解除する');
assert.match(notificationsSource, /expoPushToken.*=== token/s, '別端末のPush Tokenをログアウト時に削除しない');
assert.match(notificationsSource, /AsyncStorage\.getItem\(EXPO_PUSH_TOKEN_KEY\)/, 'ログアウト時は端末保存済みPush Tokenを使う');
assert.doesNotMatch(
  notificationsSource.match(/removeCurrentPushTokenForSignOut[\s\S]*?\n}/)?.[0] ?? '',
  /currentExpoPushToken\(/,
  'ログアウト時にExpoへPush Tokenを再問い合わせない',
);
assert.match(notificationsSource, /cancelAllScheduledNotificationsAsync\(\)/, '予約通知を全件解除する');
assert.match(notificationsSource, /unregisterForNotificationsAsync\(\)/, '端末のリモート通知登録も解除する');
assert.match(functionsIndexSource, /setGlobalOptions\(\{ maxInstances: 20 \}\)/, 'Functionsのスケール上限をソース管理する');
assert.doesNotMatch(locationSource, /notificationTitle: '記録中'/, 'Android常駐通知へ日本語を直書きしない');
assert.match(publicCardSource, /accessibilityLabel=\{t\('battle\.join'\)\}/, '参加ボタンを独立したアクセシビリティ要素にする');
assert.match(publicCardSource, /battle\.cardA11y/, 'カード詳細ラベルの区切りも翻訳する');
assert.match(rankRowsSource, /onPress=\{onPressDetails\}/, '順位領域からもカード詳細を開ける');
assert.match(profileSource, /disabled=\{signingOut\}/, 'ログアウトの多重押下を防ぐ');
assert.match(profileSource, /ActivityIndicator/, 'ログアウト処理中を表示する');
assert.match(reactionNotificationsSource, /reactionNotificationGuards/, 'リアクション本体と別のサーバー専用guardを使う');
assert.match(teamRankingSource, /where\('categoryId', '==', categoryId\)/, 'チーム内ランキングで他チームの参加者まで購読しない');
assert.match(revenuecatSource, /timingSafeEqual/, 'Webhook認証値は定数時間比較する');
assert.match(revenuecatSource, /maxInstances: 5/, '未認証HTTPエンドポイントのスケールを個別に抑える');
assert.match(weeklyGoalModalSource, /useSafeAreaInsets\(\)/, '週間目標Modalは親で確定済みのsafe areaを初回描画から使う');
assert.match(weeklyGoalModalSource, /paddingBottom: Math\.max\(insets\.bottom, Spacing\.md\)/, '週間目標シートの下端余白を明示する');
assert.doesNotMatch(weeklyGoalModalSource, /<SafeAreaView/, 'Modal内の初回safe area再計測によるシート位置ずれを避ける');

console.log('release hardening tests passed');
