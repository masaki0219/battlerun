// 同期して更新すること: functions/src/bannedWords.ts と同一内容を保つ
// 商標だけでなく、App Store Review Guideline 1.2 の投稿前フィルタとして
// 明白な嫌がらせ・差別・性的勧誘・暴力予告も拒否する。曖昧な短語は誤検知を
// 避けるため含めず、運用で確認できた表記だけを追加する。
export const BANNED_WORDS: string[] = [
  // 明白な嫌がらせ・暴力予告
  '死ね',
  'しねよ',
  '消えろ',
  '殺すぞ',
  'ころすぞ',
  'ぶっ殺す',
  // 差別的・性的な表現、性的サービスへの勧誘
  'レイプ',
  '輪姦',
  '児童ポルノ',
  '援助交際',
  'パパ活募集',
  'ママ活募集',
  // 菓子・食品ブランド
  'ポッキー',
  'キットカット',
  'うまい棒',
  'コアラのマーチ',
  'じゃがりこ',
  'カントリーマアム',
  'チロルチョコ',
  'ガリガリ君',
  'プリッツ',
  'たけのこの里',
  // 国内サッカークラブ
  '浦和レッズ',
  '鹿島アントラーズ',
  'FC東京',
  '横浜FM',
  'ガンバ大阪',
  'セレッソ大阪',
  '川崎フロンターレ',
  'ヴィッセル神戸',
  '名古屋グランパス',
  '柏レイソル',
  // 海外サッカークラブ
  'レアルマドリード',
  'バルセロナ',
  'マンチェスターユナイテッド',
  'リバプール',
  'バイエルンミュンヘン',
  'ユベントス',
  'パリサンジェルマン',
  'チェルシー',
  'アーセナル',
  'マンチェスターシティ',
  // スポーツリーグ・大会
  'プレミアリーグ',
  'ブンデスリーガ',
  'チャンピオンズリーグ',
  'ワールドカップ',
  'オリンピック',
  // スマートフォンブランド
  'iPhone',
  'Galaxy',
  'Pixel',
  'Xperia',
  'AQUOS',
];

/** 全半角・大文字小文字・区切り記号による単純な回避を同一視する。 */
export function normalizeModeratedText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF・･_.\-ー~〜!！?？,，、。/\\|()[\]{}「」『』【】<>＜＞]+/g, '');
}

export function containsBannedWord(text: string): boolean {
  const normalized = normalizeModeratedText(text);
  return BANNED_WORDS.some((word) => normalized.includes(normalizeModeratedText(word)));
}

export function validateUserContent(
  text: string,
  options: { label: string; maxLength: number; required?: boolean },
): { ok: boolean; reason?: string } {
  const trimmed = text.trim();
  if (options.required && trimmed.length === 0) {
    return { ok: false, reason: `${options.label}を入力してください` };
  }
  if (trimmed.length > options.maxLength) {
    return { ok: false, reason: `${options.label}は${options.maxLength}文字以内で入力してください` };
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, reason: `${options.label}に使用できない文字が含まれています` };
  }
  if (containsBannedWord(trimmed)) {
    return { ok: false, reason: `この${options.label}は利用できません` };
  }
  return { ok: true };
}
