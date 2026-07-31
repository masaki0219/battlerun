import assert from 'node:assert/strict';
import { containsBannedWord, normalizeModeratedText } from '../lib/validation/bannedWords';
import { validateBattleCategory, validateBattleDescription, validateBattleTitle } from '../lib/validation/battleTitle';
import { validateDeclarationNote } from '../lib/validation/declaration';
import { validateDisplayName } from '../lib/validation/displayName';

assert.equal(normalizeModeratedText('Ｓ・Ｈ Ｉ-ＮＥ'), 'shine');
assert.equal(containsBannedWord('し　ねよ'), true);
assert.equal(containsBannedWord('ぶっ・殺す'), true);
assert.equal(containsBannedWord('朝ランを楽しもう'), false);
assert.equal(validateDisplayName('消 え ろ').ok, false);
assert.equal(validateDeclarationNote('パパ活・募集').ok, false);
assert.equal(validateBattleTitle('安全な朝ラン').ok, true);
assert.equal(validateBattleDescription('一緒に楽しく走ります').ok, true);
assert.equal(validateBattleDescription('児童 ポルノ').ok, false);
assert.equal(validateBattleCategory('援助・交際').ok, false);

console.log('moderation filtering tests passed');
