import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

function validTimeZone(timezone: string): boolean {
  if (!timezone || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function normalizedTimeZone(timezone: unknown): string {
  return typeof timezone === 'string' && validTimeZone(timezone) ? timezone : 'UTC';
}

export function declarationDateKey(date: Date, timezone: string): string {
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizedTimeZone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values['year'] && values['month'] && values['day']
    ? `${values['year']}${values['month']}${values['day']}`
    : '';
}

function candidateDateKeys(date: Date): string[] {
  const dayMs = 24 * 60 * 60 * 1_000;
  return [...new Set([-dayMs, 0, dayMs].map((offset) => declarationDateKey(
    new Date(date.getTime() + offset),
    'UTC',
  )))];
}

/**
 * 活動開始日に対応するplanned宣言だけをトランザクションでdoneにする。
 * 旧宣言にtimezoneがない場合は、活動を記録した端末のtimezoneを使う。
 */
export async function completeDeclarationsForActivity(params: {
  db: Firestore;
  battleIds: string[];
  userId: string;
  startedAtMs: number;
  activityTimezone: string;
  activityRef?: DocumentReference;
}): Promise<boolean> {
  const activityStartedAt = new Date(params.startedAtMs);
  if (Number.isNaN(activityStartedAt.getTime()) || params.battleIds.length === 0) return false;
  const fallbackTimezone = normalizedTimeZone(params.activityTimezone);
  const dateKeys = candidateDateKeys(activityStartedAt);
  const refsByBattle = params.battleIds.map((battleId) => dateKeys.map((dateKey) => (
    params.db.doc(`battles/${battleId}/declarations/${params.userId}_${dateKey}`)
  )));

  return params.db.runTransaction(async (transaction) => {
    if (params.activityRef) {
      const activitySnapshot = await transaction.get(params.activityRef);
      if (activitySnapshot.data()?.['declarationAchieved'] === true) return true;
    }
    const snapshotsByBattle = [];
    for (const refs of refsByBattle) {
      const snapshots = [];
      for (const ref of refs) snapshots.push(await transaction.get(ref));
      snapshotsByBattle.push(snapshots);
    }

    let completed = false;
    for (const snapshots of snapshotsByBattle) {
      const matching = snapshots.find((snapshot) => {
        if (!snapshot.exists) return false;
        const data = snapshot.data()!;
        const declaredTimezone = data['timezone'];
        const timezone = typeof declaredTimezone === 'string' && validTimeZone(declaredTimezone)
          ? declaredTimezone
          : fallbackTimezone;
        return data['status'] === 'planned'
          && data['dateKey'] === declarationDateKey(activityStartedAt, timezone);
      });
      if (!matching) continue;
      transaction.update(matching.ref, { status: 'done' });
      completed = true;
    }
    if (completed && params.activityRef) {
      transaction.update(params.activityRef, { declarationAchieved: true });
    }
    return completed;
  });
}
