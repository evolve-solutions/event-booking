# Postman collection

`event-booking.postman_collection.json` holds every documented API operation and one folder per API bug,
named with the same ids and titles as [`bugs.md`](../../bugs.md). `event-booking.postman_environment.json`
sets `baseUrl` (the candidate-01 site) and `password` (the password every fresh test buyer gets).

| Folder | What it does |
|---|---|
| `00 Setup (run first)` | Picks the events by the automated suites' rule (upcoming events more than 48 h away; the latest one for stock counts; a past one) and stores their ticket type ids and prices |
| `01 API reference (27 operations)` | One request per operation in `/docs/json`, in a working order, with a fresh buyer; admin routes return 403 for a customer |
| `02 Bug reproductions` | `BUG-01` to `BUG-24` (without 12 and 13), each self-contained: it registers its own buyers and cleans up |
| `03 Slow bugs (manual waits)` | `BUG-12` (wait 11 minutes) and `BUG-13` (wait 31 minutes), sent by hand |

**Reading the results.** Tests assert what the brief requires. A red test named `[BUG-xx]` means that bug is
still present; every other test should be green. A green `[BUG-xx]` test means the bug is fixed or the
request no longer matches the report. BUG-07, BUG-21, BUG-23 and BUG-24 are API + UI bugs: only their API
side is here. BUG-25 to BUG-37 are UI bugs and have no API reproduction.

**Shared site.** Admin routes get unchanged data or non-existent ids. Every order a folder creates is cancelled
exactly once (a clean-up that would cancel twice is skipped). BUG-11 is the exception: its double cancel is the
bug, and while it exists each run adds 1 Standard ticket to the quiet event's stock.

## Use it

In Postman: import both files, select the environment, run `00 Setup`, then send any folder's requests in order
or run the folder. From the command line (run output saved locally under `runs/<YYYYMMDDTHHmmssSSS>.json`):

```bash
cd automation
npm run postman:build   # regenerate both files from scripts/build-postman.mjs and spec/bugs.json
npm run postman:run     # 00 + 01 + 02 with Newman; expected: only [BUG-xx] tests red
```

Last run (2026-09-25): 153 requests and 154 assertions. The 37 red assertions are all `[BUG-xx]` tests and
cover all 22 bugs in folder 02; there were no other failures, and no order was left CONFIRMED. `00 Setup` picks
events with the same rule as the automated suites (`src/data/world.ts`), so both test events 7, 23 and 11 today.
