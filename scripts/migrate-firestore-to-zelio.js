/**
 * battlerun-75eb6 → zelio-run の Firestore 全データコピー（サブコレクション含む）。
 *
 * 事前準備:
 *   Firebase コンソール（zelio-run）→ プロジェクトの設定 → サービスアカウント
 *   → 「新しい秘密鍵の生成」→ ダウンロードした JSON をリポジトリ直下に
 *   service-account-zelio.json という名前で保存する。
 *
 * 実行: node scripts/migrate-firestore-to-zelio.js
 * 移行完了後、このスクリプトと service-account-zelio.json は削除してよい。
 */
const path = require('path');
const admin = require('firebase-admin');

const SOURCE_PROJECT_ID = 'battlerun-75eb6';
const TARGET_PROJECT_ID = 'zelio-run';

const root = path.resolve(__dirname, '..');
const sourceKey = require(path.join(root, 'service-account.json'));
const targetKey = require(path.join(root, 'service-account-zelio.json'));

// 鍵ファイルの取り違え（コンソールのプロジェクト切替ミス等）で逆方向にコピーしないよう、
// ファイル名ではなく鍵の中身の project_id で方向を確定させる。
if (sourceKey.project_id !== SOURCE_PROJECT_ID || targetKey.project_id !== TARGET_PROJECT_ID) {
  console.error(
    `ERROR: 鍵ファイルの project_id が想定と一致しません。\n` +
      `  service-account.json       : ${sourceKey.project_id}（想定: ${SOURCE_PROJECT_ID}）\n` +
      `  service-account-zelio.json : ${targetKey.project_id}（想定: ${TARGET_PROJECT_ID}）`
  );
  process.exit(1);
}
console.log(`copy direction: ${SOURCE_PROJECT_ID} -> ${TARGET_PROJECT_ID}`);

const sourceApp = admin.initializeApp(
  { credential: admin.credential.cert(sourceKey) },
  'source'
);
const targetApp = admin.initializeApp(
  { credential: admin.credential.cert(targetKey) },
  'target'
);
const sourceDb = sourceApp.firestore();
const targetDb = targetApp.firestore();

/** DocumentReference はプロジェクトに紐づくため、同じパスの参照を移行先で作り直す */
function convertValue(v) {
  if (v instanceof admin.firestore.DocumentReference) return targetDb.doc(v.path);
  if (Array.isArray(v)) return v.map(convertValue);
  if (
    v !== null &&
    typeof v === 'object' &&
    !(v instanceof admin.firestore.Timestamp) &&
    !(v instanceof admin.firestore.GeoPoint) &&
    !(v instanceof Buffer)
  ) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convertValue(x)]));
  }
  return v;
}

let copied = 0;

async function copyCollection(sourceCol) {
  const snap = await sourceCol.get();
  for (const doc of snap.docs) {
    await targetDb.doc(doc.ref.path).set(convertValue(doc.data()));
    copied += 1;
    for (const sub of await doc.ref.listCollections()) {
      await copyCollection(sub);
    }
  }
  // 親ドキュメントが存在しない孤児サブコレクションも拾う
  const listed = await sourceCol.listDocuments();
  for (const ref of listed) {
    if (snap.docs.some((d) => d.id === ref.id)) continue;
    for (const sub of await ref.listCollections()) {
      await copyCollection(sub);
    }
  }
}

(async () => {
  const cols = await sourceDb.listCollections();
  for (const col of cols) {
    process.stdout.write(`copying ${col.id} ...\n`);
    await copyCollection(col);
  }
  console.log(`done. ${copied} documents copied.`);
  process.exit(0);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
