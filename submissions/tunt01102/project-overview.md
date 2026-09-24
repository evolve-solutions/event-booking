# Event Booking: system description

Written from three sources, in this order of authority: the business brief (`round-1-brief.md`), the live
system (API at `/docs/json`, the web app, probed on 2026-09-24), and the frontend bundle. Where the
system and the brief disagree, the brief decides and the disagreement is a bug. Where the brief is
silent, the gap is listed at the end, never filled by guessing.

## 1. What the product is

A ticketing site for cultural and sporting events in Vietnam. There is no seat map: a buyer picks a
**ticket type** (Standard, VIP, Student) and a **quantity**. Every event offers all three types.
Prices are in Vietnamese dong (₫), whole numbers.

| Actor | Can do |
|---|---|
| Visitor | Browse, search, filter and sort the event list; open an event |
| Customer | Everything a visitor can, plus register, log in, keep a cart, apply a discount code, check out, see and cancel own orders, edit phone and password |
| Administrator | Create, edit, delete events; adjust stock; see and export all orders filtered by status and date; delete orders |

## 2. Architecture as observed

| Layer | Observed |
|---|---|
| Frontend | React single-page app (Vite build, one bundle `/assets/index-*.js`), every element carries a `data-testid` |
| Backend | Fastify (error code `FST_ERR_VALIDATION`), JSON API under `/api`, OpenAPI 3.0.3 document at `/docs/json`, Swagger UI at `/docs` |
| Session | JWT in an `HttpOnly; Secure; SameSite=Strict` cookie named `token`; payload `sub, email, role, iat, exp` with `exp - iat = 1800 s` |
| Data | Sequential integer ids for events, ticket types, cart items and orders |
| Timestamps | Stored and returned in UTC (`2026-10-04T17:30:00.000Z`); the UI must show Vietnam time (UTC+7) |
| Config | `/api/config` returns 40 enabled feature flags (`f01` to `f65`). Ten appear in the frontend bundle, each switching one UI defect on (see BUG-25, 27, 28, 30, 32 to 37); the rest presumably act on the server |

### Screens (routes)

| Route | Purpose |
|---|---|
| `/` or `/events` | Event list: search box, venue filter, sort (by date, by name), 10 per page, Previous / Next |
| `/events/:id` | Event detail: venue, start, three ticket cards with price, remaining, quantity and Add |
| `/login` | Login and Register tabs (email, password, optional phone) |
| `/cart` | Cart lines, quantity, Remove, discount code, hold expiry, order summary (subtotal, discount, service fee, total) |
| `/checkout` | Recipient name, phone, student card number when a Student ticket is in the cart, Pay |
| `/orders/:id/confirm` | Order confirmation |
| `/my-orders` | Own orders with status, total, refund and Cancel tickets |
| `/profile` | Phone number, change password |
| `/admin/events`, `/admin/orders` | Administration screens |

### API (27 documented operations)

| Area | Operations |
|---|---|
| Meta | `GET /api/health`, `GET /api/config`, `GET /robots.txt` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Events | `GET /api/events?q&venue&sort&page&pageSize`, `GET /api/events/{id}`, `POST /api/events`, `PUT /api/events/{id}`, `DELETE /api/events/{id}`, `PATCH /api/ticket-types/{id}` |
| Cart | `GET /api/cart`, `POST /api/cart/items`, `PATCH /api/cart/items/{id}`, `POST /api/cart/discount` |
| Orders | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/{id}`, `POST /api/orders/{id}/cancel` |
| Profile | `GET /api/profile`, `PATCH /api/profile`, `POST /api/profile/password` |
| Admin | `GET /api/admin/orders?status&from&to`, `GET /api/admin/orders.csv`, `DELETE /api/admin/orders/{id}` |

## 3. Domain model

```
User(id, email, role CUSTOMER|ADMIN, phone?)
Event(id, slug, title, venue, startsAt UTC, status UPCOMING|PAST)
  └─ TicketType(id, name STANDARD|VIP|STUDENT, price, remaining)
Cart(user) ── CartItem(id, ticketTypeId, quantity, unitPrice) ; discountCode ; holdExpiresAt
  totals: gross, discount, serviceFee, total
Order(id, status CONFIRMED|CANCELLED, recipientName, phone, studentCardNo?, discountCode?,
      grossAmount, discountAmount, serviceFeeAmount, totalAmount, refundAmount, createdAt)
  └─ OrderItem(ticketTypeId, ticketTypeName, eventTitle, unitPrice, quantity)
```

## 4. Business rules (the specification)

Each rule has an id used by the test cases, the RTM and the bug list (`spec/requirements.json`).

### Accounts
- **REQ-ACC-01** Email must be well formed. **REQ-ACC-02** Password at least 8 characters.
- **REQ-ACC-03** Phone, if given, 10 to 15 digits. **REQ-ACC-04** One email, one account.
- **REQ-ACC-05** Login returns a cookie session. **REQ-ACC-06** Session expires after 30 minutes.
- **REQ-ACC-07** Profile can change phone and password. **REQ-ACC-08** New password must differ from the current one.
- Forgotten passwords are reset by an administrator; the system sends no mail.

### Booking
- **REQ-BOOK-01** Each add is a whole number of at least 1.
- **REQ-BOOK-02** At most 4 VIP tickets per order.
- **REQ-BOOK-03** Cart holds tickets 10 minutes from the most recent add; after that it must be refreshed before checkout.
- **REQ-BOOK-04** Recipient name at most 50 characters. **REQ-BOOK-05** Phone at least 10 digits.
- **REQ-BOOK-06** Student tickets need a student card number (any value, not validated).
- **REQ-BOOK-07** Past events stay listed with a Past label and cannot be booked.

### Pricing (order of operations)

```
subtotal      = Σ unitPrice × quantity
discount      = code % × (Standard lines only)          REQ-DISC-01, applied once REQ-DISC-02
after         = subtotal − discount
service fee   = 5% × after                              REQ-PRICE-01
total         = after + service fee                     fee on its own line: REQ-PRICE-02
```

Worked example: 2 Standard at ₫100,000 with WELCOME10 gives subtotal 200,000, discount 20,000,
fee 9,000, total **189,000**.

### Refunds

| Cancelled | Refund | Id |
|---|---|---|
| More than 24 h before start | 100% | REQ-REF-01 |
| Within 24 h of start | 50% | REQ-REF-02 |
| After start | 0% | REQ-REF-03 |

### Search and sorting
- **REQ-SRCH-01** Search matches any part of the name, ignoring case (`rock` finds *Hanoi Rock Fest*).
- **REQ-SRCH-02** Venue filter is an exact match.
- **REQ-SRCH-03/04** Sort by name (alphabetical) or date (ascending) over the whole list; page 1 opens with the first of the full sorted list.
- **REQ-SRCH-05** 10 per page; every event exactly once across pages.

### Time zone, screens, administration
- **REQ-TZ-01** Every time shown is Vietnam time (UTC+7).
- **REQ-UI-01** Fully usable at 360 px, purchase included, without zoom or sideways scroll.
- **REQ-UI-02** Every field has a visible label; clicking it focuses the field.
- **REQ-UI-03** Messages describe the most recent action.
- **REQ-ADM-01** Admin operations are never available to a customer, by any route.
- **REQ-SEC-01** (implied) A customer reads and cancels only their own orders.
- **REQ-INV-01** (implied) A cancel returns stock once; a cancelled order cannot be cancelled again.

### Intentional behaviour (not defects)
1. The 5% fee makes the total higher than quantity × price, shown on its own line.
2. The student card number is required but not validated.
3. Past events stay in the list with a Past label.

## 5. Test data found on the live system

| Item | Value |
|---|---|
| Events | 23; one PAST (*Autumn Symphony Night*, 15 Aug 2026); next start *Mid-Autumn Lantern Night* 2026-10-04T17:30Z |
| Ticket prices | e.g. event 7: Standard 100,000, Student 50,000, VIP 300,000 |
| Discount code | `WELCOME10` (10%), found by probing; the brief names no codes |
| Accounts | Three published customer accounts; this work registers its own per test run |

## 6. Specification gaps (questions for the product owner)

| Id | Question |
|---|---|
| GAP-01 | Which discount codes exist, and their values? |
| GAP-02 | Exactly 24 h before start: 100% or 50%? (read here as 50%) |
| GAP-03 | Is the service fee refunded? (system refunds it) |
| GAP-04 | VIP cap per event or per order? (read as per order) |
| GAP-05 | Can a cart hold more than the remaining stock? |
| GAP-06 | Does a password change end other sessions? |
| GAP-07 | Is a whitespace-only recipient valid? (read as invalid) |
| GAP-08 | The 50% tier cannot be exercised: no event starts within 24 h and only an admin can create one |
| GAP-09 | "Discount codes apply to Standard tickets": only to Standard? (read here as only) |

## 7. How the testing is built (test architecture)

```
spec/requirements.json ─┐   (34 REQ ids, quoted from the brief, + spec gaps)
spec/test-cases.json ───┼─► checked by src/spec/catalogue.ts (schema + cross-references), in unit tests and in the build
spec/bugs.json ─────────┘
        │
        ▼
automation/src/spec      oracle: pricing, refunds, validators, listing, Vietnam time  ◄── unit tests (Vitest, 80% gate)
automation/src/config.ts one place for BASE_URL, time zones, workers (CI refuses to start without BASE_URL)
automation/src/projects.ts the one list of test projects (suite × engine); config, gate, runner and dashboard read it
automation/src/data      world.ts chooses events by rule at run start; factory.ts registers fresh buyers
automation/src/api       typed client for all 27 operations; Node fetch or in-page fetch (evidence)
        │
        ▼
tests/api · tests/e2e/smoke · tests/e2e/regression · tests/slow · tests/evidence   (Playwright, retries 0)
        │  titles use tc('TC-…', …) and bug('BUG-…'), typed by the generated tests/support/ids.ts
        │  projects: smoke, api, regression (Chromium) + smoke-firefox, smoke-webkit, mobile-webkit (iPhone 13)
        │  every run under its own id: reports/<project>/<YYYYMMDDTHHmmssSSS>.json, reports/world/<id>.json
        │  sharded (SHARD=i/n, shared RUN_ID): per-shard blobs, merged by scripts/merge-shards.mjs
        ▼
src/report/aggregate.ts  outcome per test: passed / failed-known-bug (assertion + bug tag) / failed-unexplained / flaky / skipped
        │
        ├─► scripts/gate.mjs        CI verdict (fails on unexplained, flaky, missing report, bug-tagged pass)
        ├─► scripts/stability.mjs   three runs, any changed outcome fails
        └─► dashboard/build.mjs     bugs.md, test-cases.md, rtm.md, dashboard/index.html (fails on spec problems or drift)
```

Design choices, each with its reason:

| Choice | Reason |
|---|---|
| Expected values come only from the oracle | A check that compares the system with itself can never fail |
| Tests that expose a bug stay red, tagged with the bug id | A fixed bug turns the test green on its own; nothing hides behind "expected to fail" |
| Only an assertion failure counts as "known bug" | A timeout or crash in a bug-tagged test is a new problem, not the old bug |
| Events chosen by rule at run start, saved per run | No hard-coded ids; a reseeded or different environment still works, and the run records what it used |
| Stock-delta checks on a "quiet" event | Parallel tests and other candidates must not blur a delta |
| Evidence written to `.incomplete`, renamed when complete | An aborted recording can never pass for the latest evidence |
| Run ids instead of fixed file names | No run overwrites another; filtered runs go to `<suite>-partial` |
| One project list (`src/projects.ts`) | A new engine or suite is added once; the gate and dashboard pick it up without edits |
| Test-case and bug ids are TypeScript unions generated from the catalogue | A misspelt id in a test does not compile; a unit test fails if the generated file is stale |
| The quiet event is used only by stock-delta checks, and in a parallel-mode file only by the one that measures | Enforced by a unit test over the source (`tests/unit/isolation.test.ts`), not by convention |
| Stored artefacts: throwaway emails yes, session tokens and cookies never | Tokens and cookies are redacted from every HAR and log; the only password in the code is the public default of disposable accounts |
| Old reports and evidence are moved to ignored archives, not deleted | The repository keeps the newest runs; nothing produced is lost locally (`reports:prune`, `evidence:prune`) |
