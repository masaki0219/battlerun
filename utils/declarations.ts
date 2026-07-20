export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function declarationDocumentId(userId: string, date: Date = new Date()): string {
  return `${userId}_${localDateKey(date)}`;
}

export function declarationTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}ごろ`;
}
