/** チャレンジ結果・プロフィール・称号一覧で共通の称号名。 */
import type { AppLanguage } from './language';
import { translateIn } from './translate';

export function teamTitleLabel(rank: number, language: AppLanguage): string {
  if (rank === 1) return translateIn(language, 'titles.first');
  if (rank === 2) return translateIn(language, 'titles.second');
  return translateIn(language, 'titles.other', { rank });
}
