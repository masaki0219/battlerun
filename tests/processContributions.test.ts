import assert from 'node:assert/strict';
import { aggregateProcessContributions } from '../utils/processContributions';

const contributions = aggregateProcessContributions(
  [
    { uid: 'alice', status: 'done' },
    { uid: 'alice', status: 'done' },
    { uid: 'alice', status: 'planned' },
    { uid: 'bob', status: 'expired' },
  ],
  [
    { userId: 'alice', startedAt: new Date(2026, 6, 20, 7) },
    { userId: 'alice', startedAt: new Date(2026, 6, 20, 18) },
    { userId: 'alice', startedAt: new Date(2026, 6, 21, 7) },
    { userId: 'bob', startedAt: new Date(2026, 6, 20, 8) },
    { userId: 'invalid', startedAt: new Date('invalid') },
  ],
);

assert.deepEqual(contributions['alice'], { declarationsDone: 2, activeDaysThisWeek: 2 });
assert.deepEqual(contributions['bob'], { declarationsDone: 0, activeDaysThisWeek: 1 });
assert.equal(contributions['invalid'], undefined);

console.log('process contribution tests passed');
