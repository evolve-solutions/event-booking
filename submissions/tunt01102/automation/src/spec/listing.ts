// Executable form of "Search and sorting" and "Time zone" in round-1-brief.md.

export interface EventSummary {
  id: number;
  title: string;
  venue: string;
  startsAt: string;
  status?: string;
}

export const PAGE_SIZE = 10;
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** REQ-SRCH-01: any part of the name, ignoring case; the query is literal text, not a pattern. */
export function matchesSearch(title: string, query: string): boolean {
  return title.toLowerCase().includes(query.toLowerCase());
}

/** REQ-SRCH-02 */
export function matchesVenue(venue: string, filter: string): boolean {
  return venue === filter;
}

export type SortKey = 'title' | 'startsAt';

export function compareBy(key: SortKey) {
  return (a: EventSummary, b: EventSummary): number =>
    key === 'title'
      ? a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
      : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

/** REQ-SRCH-03/04: the whole list, sorted, then cut into pages. */
export function expectedOrder(all: EventSummary[], key: SortKey): EventSummary[] {
  return [...all].sort(compareBy(key));
}

export function expectedPage(all: EventSummary[], key: SortKey, page: number, size = PAGE_SIZE): number[] {
  return expectedOrder(all, key)
    .slice((page - 1) * size, page * size)
    .map((e) => e.id);
}

export function isSortedBy(items: EventSummary[], key: SortKey): boolean {
  const cmp = compareBy(key);
  return items.every((item, i) => i === 0 || cmp(items[i - 1], item) <= 0);
}

/** REQ-SRCH-05: ids that appear on more than one page, and ids that never appear. */
export function pageCoverage(pages: number[][], allIds: number[]): { duplicates: number[]; missing: number[] } {
  const seen = new Map<number, number>();
  for (const id of pages.flat()) seen.set(id, (seen.get(id) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  const missing = allIds.filter((id) => !seen.has(id));
  return { duplicates, missing };
}

/** REQ-TZ-01: the calendar parts of an instant as seen in Vietnam. */
export function vnParts(iso: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Does a piece of on-screen text show the Vietnam calendar date of `iso` (any of the common formats)? */
export function showsVnDate(text: string, iso: string): boolean {
  const { year, month, day } = vnParts(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yy = String(year).slice(2);
  const candidates = [
    `${year}-${pad(month)}-${pad(day)}`,
    `${month}/${day}/${yy}`,
    `${month}/${day}/${year}`,
    `${pad(day)}/${pad(month)}/${year}`,
    `${day}/${month}/${year}`,
  ];
  return candidates.some((c) => text.includes(c));
}

/** Does the text show the Vietnam wall-clock time of `iso` (24 h or 12 h form)? */
export function showsVnTime(text: string, iso: string): boolean {
  const { hour, minute } = vnParts(iso);
  const mm = String(minute).padStart(2, '0');
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return text.includes(`${String(hour).padStart(2, '0')}:${mm}`) || text.includes(`${h12}:${mm} ${ampm}`);
}
