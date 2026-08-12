// 同期して更新すること: functions/src/bannedWords.ts と同一内容を保つ
import { translate } from '../translate';
// 商標だけでなく、App Store Review Guideline 1.2 の投稿前フィルタとして
// 明白な嫌がらせ・差別・性的勧誘・暴力予告も拒否する。曖昧な短語は誤検知を
// 避けるため含めず、運用で確認できた表記だけを追加する。
export const BANNED_WORDS_JA: readonly string[] = [
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

// 英語は部分一致にすると grape→rape、therapist→rapist のような誤検知が起きる。
// そのため下の語句は英単語／語句の境界を保った正規化結果に対して照合する。
export const BANNED_WORDS_EN: readonly string[] = [
  // 明白な嫌がらせ・暴力予告
  'kill yourself',
  'go die',
  'i will kill you',
  'ill kill you',
  'im going to kill you',
  'murder you',
  'shoot you',
  'bomb threat',
  // 明白な差別語
  'nigger',
  'nigga',
  'faggot',
  'wetback',
  'kike',
  'tranny',
  // 性的暴力・児童搾取・性的サービスへの勧誘
  'rape',
  'rapist',
  'child porn',
  'child pornography',
  'looking for sex',
  'sex for money',
  'buy sex',
  'sell sex',
];

/** 既存の参照互換用。照合方式は言語別に分ける。 */
export const BANNED_WORDS: readonly string[] = [...BANNED_WORDS_JA, ...BANNED_WORDS_EN];

/** 全半角・大文字小文字・区切り記号による単純な回避を同一視する。 */
export function normalizeModeratedText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF・･_.\-ー~〜!！?？,，、。/\\|()[\]{}「」『』【】<>＜＞]+/g, '');
}

/** 英語の単語境界を保ちつつ、大小・全半角・句読点と綴り分割を正規化する。 */
export function normalizeEnglishModeratedText(text: string): string {
  const tokens = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const collapsed: string[] = [];
  for (let index = 0; index < tokens.length;) {
    let end = index;
    while (end < tokens.length && /^[a-z]$/.test(tokens[end])) end += 1;
    if (end - index >= 3) {
      collapsed.push(tokens.slice(index, end).join(''));
      index = end;
    } else {
      collapsed.push(tokens[index]);
      index += 1;
    }
  }
  return collapsed.join(' ');
}

export function containsBannedWord(text: string): boolean {
  const normalized = normalizeModeratedText(text);
  if (BANNED_WORDS_JA.some((word) => normalized.includes(normalizeModeratedText(word)))) {
    return true;
  }
  const normalizedEnglish = ` ${normalizeEnglishModeratedText(text)} `;
  return BANNED_WORDS_EN.some((phrase) => (
    normalizedEnglish.includes(` ${normalizeEnglishModeratedText(phrase)} `)
  ));
}

export function validateUserContent(
  text: string,
  options: { label: string; maxLength: number; required?: boolean },
): { ok: boolean; reason?: string } {
  const trimmed = text.trim();
  if (options.required && trimmed.length === 0) {
    return { ok: false, reason: translate('validation.required', { label: options.label }) };
  }
  if (trimmed.length > options.maxLength) {
    return { ok: false, reason: translate('validation.tooLong', { label: options.label, max: options.maxLength }) };
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, reason: translate('validation.invalidCharacters', { label: options.label }) };
  }
  if (containsBannedWord(trimmed)) {
    return { ok: false, reason: translate('validation.unavailable', { label: options.label }) };
  }
  return { ok: true };
}
