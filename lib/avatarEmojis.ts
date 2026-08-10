export interface AvatarEmojiCategory {
  id: 'animals' | 'sports' | 'faces' | 'nature' | 'food';
  label: string;
  emojis: readonly string[];
}

/** Firestoreルールと同期する、アプリ内で選択可能なアイコン。 */
export const AVATAR_EMOJI_CATEGORIES: readonly AvatarEmojiCategory[] = [
  {
    id: 'animals',
    label: '動物',
    emojis: [
      '🐱', '🐶', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸',
      '🐰', '🐹', '🦊', '🐺', '🐮', '🐷', '🐧', '🐬',
      '🦄', '🦔', '🦋', '🦦', '🐙', '🦈', '🐘', '🦒',
    ],
  },
  {
    id: 'sports',
    label: 'スポーツ',
    emojis: [
      '🏃', '🚶', '⚽', '🏀', '🏈', '⚾', '🎾', '🏐',
      '🏉', '🥏', '🏓', '🏸', '🥊', '🥋', '🎿', '🚴',
    ],
  },
  {
    id: 'faces',
    label: '表情',
    emojis: [
      '😀', '😄', '😊', '😎', '🤩', '🥳', '🙂', '😉',
      '😌', '🤗', '🤔', '😤',
    ],
  },
  {
    id: 'nature',
    label: '自然',
    emojis: [
      '🌱', '🌿', '🍀', '🌸', '🌻', '🌈', '⭐', '🌙',
      '☀️', '🔥', '🌊', '⛰️',
    ],
  },
  {
    id: 'food',
    label: 'フード',
    emojis: [
      '🍎', '🍊', '🍋', '🍉', '🍓', '🍒', '🥑', '🥕',
      '🍙', '🍜', '☕', '🍫',
    ],
  },
];

export const AVATAR_EMOJIS = AVATAR_EMOJI_CATEGORIES.flatMap((category) => category.emojis);

export function isAvatarEmoji(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_EMOJIS.includes(value);
}
