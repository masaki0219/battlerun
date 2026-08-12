import assert from 'node:assert/strict';
import {
  BANNED_WORDS_EN,
  BANNED_WORDS_JA,
  containsBannedWord,
  normalizeEnglishModeratedText,
  normalizeModeratedText,
} from '../lib/validation/bannedWords';
import {
  BANNED_WORDS_EN as SERVER_BANNED_WORDS_EN,
  BANNED_WORDS_JA as SERVER_BANNED_WORDS_JA,
  containsBannedWord as serverContainsBannedWord,
} from '../functions/src/bannedWords';
import { validateBattleCategory, validateBattleDescription, validateBattleTitle } from '../lib/validation/battleTitle';
import { validateDeclarationNote } from '../lib/validation/declaration';
import { validateDisplayName } from '../lib/validation/displayName';

assert.equal(normalizeModeratedText('Ｓ・Ｈ Ｉ-ＮＥ'), 'shine');
assert.equal(containsBannedWord('し　ねよ'), true);
assert.equal(containsBannedWord('ぶっ・殺す'), true);
assert.equal(normalizeEnglishModeratedText(' K.I.L.L---YOURSELF '), 'kill yourself');
assert.equal(containsBannedWord('K.I.L.L---YOURSELF'), true);
assert.equal(containsBannedWord('I will kill you'), true);
assert.equal(containsBannedWord('child pornography'), true);
assert.equal(containsBannedWord('N.I.G.G.E.R'), true);
assert.equal(containsBannedWord('grape runners'), false, 'rapeを英単語の部分一致で誤検知しない');
assert.equal(containsBannedWord('therapist runners'), false, 'rapistを英単語の部分一致で誤検知しない');
assert.equal(containsBannedWord('朝ランを楽しもう'), false);
assert.equal(validateDisplayName('消 え ろ').ok, false);
assert.equal(validateDisplayName('kill yourself').ok, false);
assert.equal(validateDeclarationNote('パパ活・募集').ok, false);
assert.equal(validateBattleTitle('安全な朝ラン').ok, true);
assert.equal(validateBattleDescription('一緒に楽しく走ります').ok, true);
assert.equal(validateBattleDescription('児童 ポルノ').ok, false);
assert.equal(validateBattleCategory('援助・交際').ok, false);
assert.deepEqual(BANNED_WORDS_JA, SERVER_BANNED_WORDS_JA, '日本語禁止語をclient/Functionsで同期する');
assert.deepEqual(BANNED_WORDS_EN, SERVER_BANNED_WORDS_EN, '英語禁止語をclient/Functionsで同期する');
assert.equal(serverContainsBannedWord('K.I.L.L---YOURSELF'), true);
assert.equal(serverContainsBannedWord('grape runners'), false);

console.log('moderation filtering tests passed');
