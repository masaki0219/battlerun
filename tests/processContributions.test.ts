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
    { userId: 'alice', dayKey: '20260720' },
    { userId: 'alice', dayKey: '20260720' },
    { userId: 'alice', dayKey: '20260721' },
    { userId: 'bob', dayKey: '20260720' },
    { userId: 'invalid', dayKey: 'invalid' },
  ],
);

assert.deepEqual(contributions['alice'], { declarationsDone: 2, activeDaysThisWeek: 2 });
assert.deepEqual(contributions['bob'], { declarationsDone: 0, activeDaysThisWeek: 1 });
assert.equal(contributions['invalid'], undefined);

console.log('process contribution tests passed');
