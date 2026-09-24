import { expectedOrder, expectedPage, isSortedBy, matchesSearch, pageCoverage, PAGE_SIZE, type EventSummary } from '../../src/spec/listing';
import { EVENTS } from '../../src/data/factory';
import { bug, expect, test, tc } from '../support/fixtures';

async function allEvents(anon: any): Promise<EventSummary[]> {
  const r = await anon.listEvents({ pageSize: 100 });
  expect(r.status).toBe(200);
  expect(r.body.items.length).toBe(r.body.total);
  expect(r.body.total).toBeGreaterThan(PAGE_SIZE); // otherwise the paging checks below would pass on an empty world
  return r.body.items;
}

async function pages(anon: any, query: Record<string, string>, total: number): Promise<number[][]> {
  const out: number[][] = [];
  for (let page = 1; page <= Math.ceil(total / PAGE_SIZE); page++) {
    const r = await anon.listEvents({ ...query, page });
    expect(r.status).toBe(200);
    out.push(r.body.items.map((e: EventSummary) => e.id));
  }
  return out;
}

test.describe('Event listing', () => {
  test(tc('TC-EVT-01', 'paginated at 10 per page with a total'), async ({ anon }) => {
    const all = await allEvents(anon);
    const r = await anon.listEvents();
    expect(r.body).toMatchObject({ page: 1, pageSize: 10, total: all.length });
    expect(r.body.items).toHaveLength(10);
  });

  test(tc('TC-EVT-02', 'detail offers Standard, VIP and Student'), async ({ anon }) => {
    const r = await anon.getEvent(EVENTS.upcoming.id);
    expect(r.status).toBe(200);
    expect(r.body.ticketTypes.map((t: any) => t.name).sort()).toEqual(['STANDARD', 'STUDENT', 'VIP']);
    for (const t of r.body.ticketTypes) {
      expect(t.price).toBeGreaterThan(0);
      expect(t.remaining).toBeGreaterThanOrEqual(0);
    }
  });

  test(tc('TC-EVT-03', 'unknown event id returns 404'), async ({ anon }) => {
    expect((await anon.getEvent(999999)).status).toBe(404);
  });

  test(tc('TC-EVT-04', 'search "rock" returns Hanoi Rock Fest'), bug('BUG-21'), async ({ anon }) => {
    const all = await allEvents(anon);
    const rock = await anon.listEvents({ q: 'rock', pageSize: 100 });
    expect(rock.body.items.map((e: EventSummary) => e.title)).toContain('Hanoi Rock Fest');
    const fest = await anon.listEvents({ q: 'fest', pageSize: 100 });
    const expected = all.filter((e) => matchesSearch(e.title, 'fest')).map((e) => e.id).sort();
    expect(fest.body.items.map((e: EventSummary) => e.id).sort()).toEqual(expected);
  });

  test(tc('TC-EVT-05', 'search ignores letter case'), async ({ anon }) => {
    const lower = await anon.listEvents({ q: 'hanoi', pageSize: 100 });
    const upper = await anon.listEvents({ q: 'HANOI', pageSize: 100 });
    expect(lower.body.total).toBeGreaterThan(0);
    expect(upper.body.items.map((e: EventSummary) => e.id)).toEqual(lower.body.items.map((e: EventSummary) => e.id));
  });

  test(tc('TC-EVT-06', 'search treats % and _ as literal text'), bug('BUG-22'), async ({ anon }) => {
    const all = await allEvents(anon);
    expect(all.some((e) => /[%_]/.test(e.title))).toBe(false);
    expect((await anon.listEvents({ q: '%' })).body.total).toBe(0);
    expect((await anon.listEvents({ q: '_' })).body.total).toBe(0);
  });

  test(tc('TC-EVT-07', 'venue filter returns the exact venue'), async ({ anon }) => {
    const r = await anon.listEvents({ venue: 'Hanoi Opera House', pageSize: 100 });
    expect(r.body.total).toBeGreaterThan(0);
    for (const e of r.body.items) expect(e.venue).toBe('Hanoi Opera House');
  });

  test(tc('TC-EVT-08', 'venue filter does not match partial or differently cased venues'), async ({ anon }) => {
    expect((await anon.listEvents({ venue: 'Hanoi Opera' })).body.total).toBe(0);
    expect((await anon.listEvents({ venue: 'hanoi opera house' })).body.total).toBe(0);
  });

  test(tc('TC-EVT-09', 'sort by name covers the whole list'), bug('BUG-23'), async ({ anon }) => {
    const all = await allEvents(anon);
    const got = await pages(anon, { sort: 'title' }, all.length);
    expect(got[0][0], 'page 1 must open with the first event of the full sorted list').toBe(expectedOrder(all, 'title')[0].id);
    got.forEach((ids, i) => expect(ids, `page ${i + 1}`).toEqual(expectedPage(all, 'title', i + 1)));
  });

  test(tc('TC-EVT-10', 'sort by date is ascending over the whole list'), async ({ anon }) => {
    const all = await allEvents(anon);
    const got = (await pages(anon, { sort: 'startsAt' }, all.length)).flat();
    const byId = new Map(all.map((e) => [e.id, e]));
    const unique = [...new Set(got)].map((id) => byId.get(id)!);
    expect(isSortedBy(unique, 'startsAt')).toBe(true);
  });

  test(tc('TC-EVT-11', 'paging shows each event exactly once'), bug('BUG-24'), async ({ anon }) => {
    const all = await allEvents(anon);
    const got = await pages(anon, {}, all.length);
    expect(pageCoverage(got, all.map((e) => e.id))).toEqual({ duplicates: [], missing: [] });
    expect(got.flat()).toHaveLength(all.length);
  });

  test(tc('TC-EVT-12', 'pageSize boundaries'), async ({ anon }) => {
    expect((await anon.listEvents({ pageSize: 0 })).status).toBe(400);
    const one = await anon.listEvents({ pageSize: 1 });
    expect(one.status).toBe(200);
    expect(one.body.items).toHaveLength(1);
    expect((await anon.listEvents({ pageSize: 100 })).status).toBe(200);
    expect((await anon.listEvents({ pageSize: 101 })).status).toBe(400);
  });

  test(tc('TC-EVT-13', 'events that already started are marked PAST'), async ({ anon }) => {
    const all = await allEvents(anon);
    const now = Date.now();
    expect(all.some((e) => e.status === 'PAST')).toBe(true);
    for (const e of all) expect(e.status, e.title).toBe(new Date(e.startsAt).getTime() < now ? 'PAST' : 'UPCOMING');
  });
});
