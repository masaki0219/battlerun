import type { Firestore } from 'firebase-admin/firestore';

export type UiLanguage = 'ja' | 'en';

export function resolveUiLanguage(value: unknown): UiLanguage {
  // Legacy users may not have uiLanguage. Default to Japanese to preserve
  // the notification behavior they had before full UI localization.
  return value === 'en' ? 'en' : 'ja';
}

export async function userUiLanguage(db: Firestore, userId: string): Promise<UiLanguage> {
  const snapshot = await db.doc(`users/${userId}`).get();
  return resolveUiLanguage(snapshot.data()?.['uiLanguage']);
}

export const notificationCopy = {
  member(language: UiLanguage): string {
    return language === 'ja' ? 'メンバー' : 'A teammate';
  },
  reaction(language: UiLanguage, name: string, reaction: string): { title: string; body: string } {
    return language === 'ja'
      ? { title: `${name}さんがリアクションしました`, body: `あなたの記録に ${reaction} がつきました` }
      : { title: `${name} reacted to your run`, body: `${reaction} was added to your activity.` };
  },
  declarationCheer(language: UiLanguage, name: string): { title: string; body: string } {
    return language === 'ja'
      ? { title: '応援が届きました 🔥', body: `${name}さんが応援しています` }
      : { title: 'You Got Support 🔥', body: `${name} is cheering you on.` };
  },
  presenceCheer(language: UiLanguage, name: string): { title: string; body: string } {
    return language === 'ja'
      ? { title: 'ラン中に応援が届きました 🔥', body: `${name}さんが応援しています` }
      : { title: 'Support While You Run 🔥', body: `${name} is cheering you on.` };
  },
  earnedTitle(language: UiLanguage, title: { rank: number; teamName: string; battleTitle: string }): { title: string; body: string } {
    if (language === 'ja') {
      const label = title.rank === 1 ? '優勝チームの一員' : '準優勝チームの一員';
      const team = title.teamName ? `「${title.teamName}」として` : '';
      return { title: `称号「${label}」を獲得しました！`, body: `「${title.battleTitle}」で${team}走った成果が認められました` };
    }
    const label = title.rank === 1 ? 'Champion Team Member' : 'Runner-Up Team Member';
    const team = title.teamName ? ` with “${title.teamName}”` : '';
    return { title: `You earned “${label}”!`, body: `Your effort${team} in “${title.battleTitle}” earned a new title.` };
  },
  battleEnded(language: UiLanguage, battleTitle: string): { title: string; body: string } {
    return language === 'ja'
      ? { title: `「${battleTitle}」が終了しました`, body: '結果を確認しよう' }
      : { title: `“${battleTitle}” has ended`, body: 'See the final results.' };
  },
  rankChanged(language: UiLanguage, rank: number): { title: string; body: string } {
    return language === 'ja'
      ? { title: 'チャレンジの順位が更新されました', body: `現在のチーム順位は${rank}位です。最新の状況を確認できます。` }
      : { title: 'Challenge Ranking Updated', body: `Your team is currently ranked ${rank}. See the latest standings.` };
  },
  battleRejected(language: UiLanguage, battleTitle: string): { title: string; body: string } {
    return language === 'ja'
      ? {
        title: 'チャレンジが無効化されました',
        body: `「${battleTitle}」の名前・説明・チーム名に利用できない内容が含まれているため終了しました`,
      }
      : {
        title: 'Challenge Disabled',
        body: `“${battleTitle}” was ended because its name, description, or team names contain unsupported content.`,
      };
  },
};
