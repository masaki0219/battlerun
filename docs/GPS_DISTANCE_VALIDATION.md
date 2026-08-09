# GPS距離フィルタ v3 の検証手順

## 目的と前提

ZELIOのGPS距離を他社アプリへ強制的に合わせるのではなく、水平精度不良、単発ジャンプ、GPS空白、微小ジッターによる系統的な水増しを減らす。Nike Run Clubなどの参考アプリは絶対的な正解ではない。公称距離または測量済み距離が分かるコースを主な基準にし、他社アプリとの差だけを合否条件にしない。

以下のしきい値と合格基準は暫定値であり、OSやGPSハードウェアが保証する値ではない。v3も物理端末で最低5回ずつ検証してから再調整する。

## v3の処理経路

1. 記録画面を開いた時点から `BestForNavigation` / `distanceInterval: 0` でウォームアップする。Androidだけ `timeInterval: 1000` を指定する。
2. Androidは正確な位置情報 (`fine`) を必須とする。インストール済み `expo-location 19.0.8` はiOS権限型にfull/reduced accuracyを公開しないため、iOSは型キャストを使わず受信点の実 `accuracy` を確認する。
3. 15m以内が3点連続するとready、25m以内ならacceptable、25m超ではreadyカウンタをリセットする。
4. foreground/backgroundのいずれか一方が `recordStore.appendRoutePoint` へ受信点を渡す。
5. `functions/src/gpsProcessing.ts` の純粋関数が、正式点A・保留点B・新規点Cを使ってBを判定する。15m以内は高信頼点、15m超25m以内は条件付き点、25m超は除外点である。
6. 3点判定は時間窓、cross-track、detour、accuracy差、3区間の算出速度、直前の進入方向を同時に見る。単一条件だけでは削除せず、進入方向に沿った90度曲がり角やUターンは保持する。
7. 15秒以上の空白、停止・再開、ウォッチドッグ復帰、foreground/background切替、timestamp逆転では保留点と方向履歴をリセットし、前後を直線接続しない。
8. 活動終了時は `finalizeGpsProcessing` が最後の保留点を処理する。3m未満、速度上限超過、accuracy悪化、低速横飛びは捨て、正常な最後の移動だけを確定する。

記録中の地図は `displayRoute`、正式距離と送信はcommit済み `route` を使う。表示点は正式距離へ逆流しない。強い移動平均、カルマンフィルタ、道路スナップ、距離補正係数は使用しない。

## クライアントとFunctionsの境界

クライアントが `submitActivity` へ送るroute点は、v3判定後のcommit点だけである。各点は `lat`, `lng`, `timestamp`, `accuracy` と、取得できた場合だけ `alt`, `altitudeAccuracy`, セグメント先頭だけ `seg: true` を持つ。speed、course、除外点、保留中の生点は送らない。

Functionsはcommit点の座標・accuracy・timestamp・速度上限・segを共通純粋関数で再検証し、その折れ線距離を正式値にする。除外点を送らないため、サーバー単独ではA-B-Cのスパイク判定を再現できない。この制約を解消する生点送信は、位置情報量、プライバシー、コスト、旧クライアント互換を別途設計してから行う。

`GPS_PROCESSING_VERSION = 3`。v3 commit点は25m基準で検証する。配布済みv2 commit点は固定した旧35m基準で受理し、未設定/旧キューはversion 1互換処理を使う。アプリ更新時に記録中だった旧セッションも元の送信versionを維持し、v2では再開後のcommit点を含めて同じroute距離を保持する。過去活動は再計算しない。

## 開発用JSONとv2/v3リプレイ

正確な座標を含む全生点ログは既定OFFで、サーバーへ追加送信しない。検証用ビルドでだけ次を設定する。

```dotenv
EXPO_PUBLIC_GPS_DEBUG_EXPORT=1
```

1活動の終了時に端末内AsyncStorageの `@zelio_latest_gps_debug_export_v1` へ最新1件を保存し、Metroログの `[GPS_DEBUG_EXPORT]` に同じJSONを出す。座標を含むため、チケットや公開リポジトリへ添付しない。

```bash
npm run gps:replay -- gps-log.json
npm run gps:replay -- gps-log.json gps-config.json
npm run gps:replay -- gps-log.json --compare-v2
```

設定JSONの全項目は次のとおり。旧configの `distanceMaxAccuracyM` / `gapSegmentMs` も読み込み互換のため受け付け、不足した新項目は既定値で補う。

```json
{
  "highConfidenceAccuracyM": 15,
  "conditionalAccuracyM": 25,
  "maxAccuracyM": 25,
  "maxRunningSpeedMps": 7,
  "minCommitDistanceM": 3,
  "gpsGapSegmentMs": 15000,
  "spikeMaxWindowMs": 4000,
  "spikeMinCrossTrackM": 8,
  "spikeMinDetourM": 10,
  "spikeAccuracyDifferenceM": 5
}
```

出力は処理version、設定値、総受信/採用/除外数、理由別件数、高信頼/条件付き点数、条件付き採否、3点スパイク、終了時破棄、accuracy中央値/P95、最大GPS空白、raw/正式距離、v2距離とv3-v2差、処理後route、各点の判定を含む。accuracy中央値/P95は長時間記録で最大2,048点の決定的サンプルから求める。

## 物理端末での実走・静止試験

同じ端末、同じ持ち方、できるだけ同じ日時・天候条件で、各ケースを1回ではなく最低5回実施する。画面ON/OFFの両方を試し、foreground/background切替と切替点のsegも確認する。

### A. 見通しの良い既知距離

- 400mトラック5周など、合計2km以上のコースを使う。
- 公称距離を基準とし、ZELIO v3、同じログのv2リプレイ、参考アプリを比較する。
- 90度カーブやUターンの前後が不自然に短くなっていないかrouteも確認する。

### B. 建物沿い

- 同じ2km以上のコースを最低5回記録する。
- cross-track、detour、条件付き採否、3点スパイク数と結果のばらつきを見る。

### C. 10分静止

- 見通しの良い屋外で10分静止する。
- raw距離、正式距離、MICRO_JITTER、THREE_POINT_SPIKE、END_OF_ACTIVITY_JITTERを確認する。

### D. 画面ON/OFFと切替

- 画面ON、画面OFF、途中でforeground/backgroundが切り替わるケースを比較する。
- 15秒以上の空白、ウォッチドッグ復帰、切替前の保留点が境界を跨いで加算されないことを確認する。

### E. 停止・再開・終了

- 手動停止、オートポーズON/OFF、低速歩行、移動直後の終了、停止直後の終了を試す。
- 正常な最後の移動は残り、終了ボタン直前の横飛びだけが加算されないことを確認する。

## 暫定合格基準

- 既知距離に対する5回以上の中央値誤差が ±2% 以内。
- 単発の誤差が ±5% 以内。
- 10分静止での正式距離増加が20m未満。
- 正常な90度カーブ、Uターン、折り返しを削りすぎない。
- Nike Run Clubとの差だけを合格条件にしない。

各ログには端末/OS、持ち方、日時、天候、コース、基準距離、画面ON/OFF、foreground/background点数、accuracy中央値/P95、各除外理由、v2/v3距離を対で残す。
