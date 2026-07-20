import assert from 'node:assert/strict';
import { inviteAppUrl, inviteWebUrl, normalizeInviteCode } from '../lib/invite';

assert.equal(normalizeInviteCode(' a3f9kz '), 'A3F9KZ');
assert.equal(normalizeInviteCode('ABC'), null);
assert.equal(normalizeInviteCode('ABC-12'), null);
assert.equal(inviteWebUrl('A3F9KZ'), 'https://zelio-run.web.app/invite?code=A3F9KZ');
assert.equal(inviteAppUrl('A3F9KZ'), 'zelio://invite?code=A3F9KZ');

console.log('invite tests passed');
