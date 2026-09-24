import { describe, expect, it } from 'vitest';
import {
  expectedOrder,
  expectedPage,
  isSortedBy,
  matchesSearch,
  matchesVenue,
  pageCoverage,
  showsVnDate,
  showsVnTime,
  vnParts,
  type EventSummary,
} from '../../src/spec/listing';

const ev = (id: number, title: string, startsAt: string, venue = 'V'): EventSummary => ({ id, title, venue, startsAt });
const events = [
  ev(1, 'Trinh Cong Son Tribute Night', '2026-11-12T13:00:00Z'),
  ev(2, 'Hanoi Rock Fest', '2026-11-20T12:00:00Z'),
  ev(11, 'Autumn Symphony Night', '2026-08-15T12:00:00Z'),
  ev(8, 'bat Trang Pottery Workshop', '2026-10-25T02:00:00Z'),
];

describe('matchesSearch (REQ-SRCH-01)', () => {
  it('matches any part of the name, ignoring case', () => {
    expect(matchesSearch('Hanoi Rock Fest', 'rock')).toBe(true);
    expect(matchesSearch('Hanoi Rock Fest', 'ROCK FEST')).toBe(true);
    expect(matchesSearch('Hanoi Rock Fest', 'jazz')).toBe(false);
  });
  it('treats wildcard characters as literal text', () => {
    expect(matchesSearch('Hanoi Rock Fest', '%')).toBe(false);
    expect(matchesSearch('Hanoi Rock Fest', '_')).toBe(false);
  });
});

describe('matchesVenue (REQ-SRCH-02)', () => {
  it('is exact', () => {
    expect(matchesVenue('Hanoi Opera House', 'Hanoi Opera House')).toBe(true);
    expect(matchesVenue('Hanoi Opera House', 'hanoi opera house')).toBe(false);
    expect(matchesVenue('Hanoi Opera House', 'Hanoi Opera')).toBe(false);
  });
});

describe('sorting (REQ-SRCH-03/04)', () => {
  it('sorts by name case-insensitively over the whole list', () => {
    expect(expectedOrder(events, 'title').map((e) => e.id)).toEqual([11, 8, 2, 1]);
  });
  it('sorts by date ascending', () => {
    expect(expectedOrder(events, 'startsAt').map((e) => e.id)).toEqual([11, 8, 1, 2]);
  });
  it('slices pages from the whole sorted list', () => {
    expect(expectedPage(events, 'title', 1, 2)).toEqual([11, 8]);
    expect(expectedPage(events, 'title', 2, 2)).toEqual([2, 1]);
    expect(expectedPage(events, 'title', 3, 2)).toEqual([]);
  });
  it('detects an unsorted page', () => {
    expect(isSortedBy(expectedOrder(events, 'title'), 'title')).toBe(true);
    expect(isSortedBy(events, 'title')).toBe(false);
    expect(isSortedBy(events, 'startsAt')).toBe(false);
    expect(isSortedBy([], 'startsAt')).toBe(true);
  });
});

describe('pageCoverage (REQ-SRCH-05)', () => {
  it('reports repeats and gaps', () => {
    expect(pageCoverage([[1, 2, 3], [3, 4]], [1, 2, 3, 4, 5])).toEqual({ duplicates: [3], missing: [5] });
  });
  it('is clean when each id appears once', () => {
    expect(pageCoverage([[1, 2], [3]], [1, 2, 3])).toEqual({ duplicates: [], missing: [] });
  });
});

describe('Vietnam time (REQ-TZ-01)', () => {
  const iso = '2026-10-04T17:30:00.000Z'; // 00:30 on 5 Oct in Vietnam

  it('shifts to UTC+7, crossing midnight', () => {
    expect(vnParts(iso)).toEqual({ year: 2026, month: 10, day: 5, hour: 0, minute: 30 });
  });
  it('recognises the Vietnam date in common formats and rejects the UTC date', () => {
    expect(showsVnDate('10/5/26, 12:30 AM', iso)).toBe(true);
    expect(showsVnDate('05/10/2026 00:30', iso)).toBe(true);
    expect(showsVnDate('2026-10-05', iso)).toBe(true);
    expect(showsVnDate('2026-10-04', iso)).toBe(false);
  });
  it('recognises the Vietnam time in 12 h and 24 h forms', () => {
    expect(showsVnTime('10/5/26, 12:30 AM', iso)).toBe(true);
    expect(showsVnTime('00:30', iso)).toBe(true);
    expect(showsVnTime('5:30 PM', iso)).toBe(false);
    expect(showsVnTime('7:00 PM', '2026-08-15T12:00:00.000Z')).toBe(true);
  });
});
