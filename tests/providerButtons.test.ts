import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const providerSource = fs.readFileSync(
  path.join(projectRoot, 'components/auth/ProviderButtons.tsx'),
  'utf8',
);
const logoSource = fs.readFileSync(
  path.join(projectRoot, 'components/auth/GoogleGLogo.tsx'),
  'utf8',
);

assert.match(providerSource, /<Pressable/, 'Googleボタンはアプリ共通寸法のPressableで描画する必要があります');
assert.match(providerSource, /height: ComponentSize\.buttonHeight\.md/, 'Googleボタンは通常ボタンと同じ48pt高にする必要があります');
assert.match(providerSource, /width: '100%'/, 'Googleボタンは通常ボタンと同じ全幅にする必要があります');
assert.match(providerSource, /borderRadius: BorderRadius\.full/, 'Googleボタンは通常ボタンと同じピル型にする必要があります');
assert.match(providerSource, /unavailable && styles\.disabled/, 'Googleボタンはdisabled時の見た目を変える必要があります');
assert.match(providerSource, /mode = 'continue'/, 'Googleボタンは用途別ラベルを受け取る必要があります');

assert.match(logoSource, /react-native-svg/, 'Googleロゴは同期描画できる同梱ベクターである必要があります');
assert.match(logoSource, /Colors\.googleLogoBlue/, 'Googleロゴはブランドカラーのトークンを使う必要があります');

console.log('provider button layout tests passed');
