import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AVATAR_EMOJI_CATEGORIES, AVATAR_EMOJIS, isAvatarEmoji } from '../lib/avatarEmojis';

assert.equal(AVATAR_EMOJI_CATEGORIES.length, 5);
assert.equal(AVATAR_EMOJIS.length, 76);
assert.equal(new Set(AVATAR_EMOJIS).size, AVATAR_EMOJIS.length);
assert.equal(isAvatarEmoji('🏃'), true);
assert.equal(isAvatarEmoji('📷'), false);

const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
for (const emoji of AVATAR_EMOJIS) {
  assert.ok(rules.includes(`'${emoji}'`), `firestore.rules に ${emoji} がありません`);
}

console.log('avatar emoji catalog tests passed');
