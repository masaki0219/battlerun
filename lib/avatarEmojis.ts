export interface AvatarEmojiCategory {
  id: 'animals' | 'sports' | 'faces' | 'nature' | 'food';
  emojis: readonly string[];
}

/** Firestoreルールと同期する、アプリ内で選択可能なアイコン。 */
export const AVATAR_EMOJI_CATEGORIES: readonly AvatarEmojiCategory[] = [
  {
    id: 'animals',
    emojis: [
      '🐱', '🐶', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸',
      '🐰', '🐹', '🦊', '🐺', '🐮', '🐷', '🐧', '🐬',
      '🦄', '🦔', '🦋', '🦦', '🐙', '🦈', '🐘', '🦒',
    ],
  },
  {
    id: 'sports',
    emojis: [
      '🏃', '🚶', '⚽', '🏀', '🏈', '⚾', '🎾', '🏐',
      '🏉', '🥏', '🏓', '🏸', '🥊', '🥋', '🎿', '🚴',
    ],
  },
  {
    id: 'faces',
    emojis: [
      '😀', '😄', '😊', '😎', '🤩', '🥳', '🙂', '😉',
      '😌', '🤗', '🤔', '😤',
    ],
  },
  {
    id: 'nature',
    emojis: [
      '🌱', '🌿', '🍀', '🌸', '🌻', '🌈', '⭐', '🌙',
      '☀️', '🔥', '🌊', '⛰️',
    ],
  },
  {
    id: 'food',
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
