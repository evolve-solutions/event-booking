# Test plan and strategy

| | |
|---|---|
| Product | Event Booking (candidate-01 environment) |
| Author | tunt01102 |
| Version | 1.2, 2026-09-24 (iteration 3: open items closed through a reviewed design) |
| Method | Spec-driven: brief → requirement ids → test cases → automated checks → bugs, all traced in the RTM |

## 1. Objective

Find the defects that matter most to buyers and to the business, and leave behind a repeatable suite
that says, per business rule, whether the live system obeys the brief. "Done" means every requirement
in `spec/requirements.json` has an explicit state in the RTM (passing, failing with a bug, designed but
not runnable with a reason, or not covered), and every bug has evidence someone else can replay.

## 2. Scope

**In scope:** every rule in the brief (34 requirement ids), all 27 documented API operations, the
buyer screens on desktop and at 360 px, authorisation between customers and towards admin routes, and the
frontend bundle as a source of UI behaviour (its feature flags point at UI defects).

**Out of scope, and why:**

| Area | Reason |
|---|---|
| Administrator flows as an admin | No admin account is provided; only the customer side of admin rules can be tested |
| Load and performance | Shared environment used by other candidates; load would harm them |
| Destructive admin checks | Only no-op bodies and non-existent ids are sent to admin routes, so a defect can never alter shared data |
| Checkout of carts that would drain shared stock | e.g. 100,000 tickets, negative carts; observed in the cart only |
| Full regression on Firefox and WebKit | Time-boxed: smoke runs on both engines and the phone tests on WebKit's iPhone profile; the defects found are server-side or layout-level, not engine quirks |

## 3. Approach (SDD loop)

1. **Specify.** Read the brief directly (never a paraphrase), turn each rule into a `REQ-*` id with the
   quoted sentence. List what the brief does not say as `GAP-*`.
2. **Observe the real system before writing code against it.** Capture the OpenAPI document, the test
   ids in the bundle and live responses; the capture outranks any assumption.
3. **Encode the rules as an oracle** (`automation/src/spec`): pricing, refunds, validators, listing,
   Vietnam time. The oracle is unit tested and a deliberate sabotage proves the tests can fail.
4. **Design test cases** from the requirements with equivalence classes, boundaries (0/1, 4/5 VIP,
   9/10/15/16 digits, 50/51 characters, 24 h), negative and authorisation cases.
5. **Automate** each case at the lowest layer that proves the rule: API for business rules, browser
   for layout, labels, messages and time display.
6. **Run, classify, investigate.** A failure is either a known bug (linked id) or unexplained; an
   unexplained failure is investigated until it is a new bug or a test defect, never left.
7. **Record evidence** for every bug in a real browser: video, screenshot, HAR and a request/response log.
8. **Trace.** Requirement ↔ test case ↔ automated result ↔ bug in the RTM; drift between catalogue and
   code is reported, not ignored.

## 4. Test levels and suites

| Suite | Tool | Purpose | When |
|---|---|---|---|
| Unit | Vitest + v8 coverage (gate 80%) | The oracle and the test tooling itself are correct | Every change |
| API | Playwright `request` over a typed client | Every business rule and every documented operation | Every run |
| Smoke (E2E) | Playwright Chromium | The shortest buyer path works: list, detail, register, login, cart, checkout, my orders | First, before anything else |
| Regression (E2E) | Playwright Chromium, desktop + 360 px | Layout, labels, messages, time zone, search/sort/paging in the UI, admin screens | Every run |
| Slow | Playwright, real waits | 10 min cart hold, 30 min session | Nightly or on demand |
| Evidence | Playwright with video, HAR | One reproduction per bug; passes while the bug reproduces | After triage, and before a retest; never in CI |
| Cross-engine | Playwright Firefox and WebKit | Smoke on Firefox and WebKit; the 360 px phone tests on WebKit's iPhone 13 profile | Every run (gated) |
| Gate | `scripts/gate.mjs` | The CI verdict: fails on unexplained or flaky results, a missing report, or a bug-tagged test that passes | After every run |
| Stability | `scripts/stability.mjs` | Smoke, API and regression three times; any changed outcome fails | Before a pull request |

## 5. Test design techniques

| Technique | Where |
|---|---|
| Boundary value | quantity 0/1, VIP 4/5 and 5/6, phone 9/10/15/16, recipient 50/51, password 7/8, pageSize 0/1/100/101, refund 24 h |
| Equivalence classes | ticket type (Standard vs VIP vs Student) for discounts; valid / malformed email |
| Decision table | refund tier by time to start; discount by ticket type |
| State transition | order CONFIRMED → CANCELLED → (cancel again); cart hold active → lapsed |
| Authorisation matrix | anonymous / customer / other customer × every protected route |
| Oracle comparison | every price, fee, total and refund compared with the spec oracle, never with the system itself |
| Exploratory charters | pricing abuse, cross-account access, phone layout, time display |

## 6. Risk-based priorities

| Risk | Impact | Likelihood | Priority |
|---|---|---|---|
| Money is computed wrong (discount, fee, refund) | High | High | P1 |
| One customer acts on another's data | High | Medium | P1 |
| Admin operations reachable by customers | High | Medium | P1 |
| A phone buyer cannot purchase | High | Medium | P1 |
| Stock integrity (oversell, double cancel) | High | Medium | P1 |
| Search and paging hide events | Medium | High | P2 |
| Times shown in the wrong zone | Medium | Medium | P2 |
| Validation and labels | Low | High | P3 |

## 7. Environment and data

- Live site shared with other candidates; results can shift with their traffic. Events are chosen by rule
  at the start of each run (upcoming, a second upcoming, a quiet one, a past one) and the choice is saved in
  `automation/reports/world/<run id>.json`. Stock-delta checks run on the quiet event, which no other test uses.
  Every test registers its own buyers.
- Test accounts use addresses such as `qa-<name>-<id>@example.invalid`, like the brief's published accounts.
  `.invalid` is a top-level domain reserved so that it never resolves (RFC 2606, RFC 6761): the addresses are
  well-formed, so the site must accept them, yet no mail can ever reach a real person. The suffix does not mark
  the input as invalid. The malformed-email cases (TC-REG, BUG-17) break the syntax instead: `not-an-email-<id>`,
  `a<id>@b`, `qa-<id>@@example.invalid` (two @ signs), each with a fresh id so an earlier run cannot answer 409.
- Browser time zone is set to Europe/London so a correct Vietnam-time display has to be converted.
- Every order a test creates is cancelled once at teardown so shared stock returns.
- The three published accounts are not used by any test: every test registers its own buyers, so the carts and
  order histories other candidates share are never touched. The accounts are public fixtures, not secrets.
- Known side effect: three checks cancel an order twice, because the double cancel is BUG-11 itself: TC-CAN-02
  (API suite), the BUG-11 evidence recording and the BUG-11 folder of the Postman collection. While BUG-11
  exists, each of them adds its order's quantity (1 or 2 Standard tickets) to stock again. The early runs did this
  on event 4 (Da Nang Startup Summit): 228 Standard on 2026-09-24 against 200 at the start. Since the review all
  three use the quiet event (23, New Year Countdown Hanoi), whose Standard stock read 604 on 2026-09-24 and 633 on
  2026-09-25 (other candidates buy and cancel there too, so not all of the change is ours). Reported here so
  nobody mistakes it for other activity.

## 8. Entry and exit criteria

| Entry | Exit |
|---|---|
| Site and `/api/health` respond; OpenAPI document readable | Every requirement has an RTM state |
| Smoke passes (otherwise stop and report) | `npm run gate` passes: 0 unexplained, 0 flaky, no bug-tagged test passing while its bug is open |
| Global setup finds a past event and three upcoming events more than 48 h away | `npm run test:stability` passes: no outcome changes across three runs |
| Oracle unit tests green, coverage ≥ 80% | Every bug has steps, expected, actual, severity and evidence |
| | Known gaps are named with the reason |

## 9. Severity and priority

Severity is judged by who is harmed and how much: **Critical** (money, security or purchase broken for
many, no workaround), **High** (a stated rule broken with real harm), **Medium** (limited harm or easy
workaround), **Low** (cosmetic or consistency). Each bug names who is harmed.

## 10. What was not tested, and why it worries me

1. **The 50% refund tier** (REQ-REF-02). No event starts within 24 h and customers cannot create one.
   It is the tier most likely to hide an off-by-one at exactly 24 h, and it moves real money.
2. **Checkout of a negative or zero-quantity cart.** The cart accepts them (BUG-04); I did not check out,
   because doing so would change shared stock. If it confirms, a buyer can offset a line with a negative one.
3. **Concurrency on the last tickets.** Two buyers checking out the final seat at once could oversell;
   testing it safely needs an event with tiny stock, which only an admin can set up.
4. **Admin flows as an admin**: CSV contents, date filters in Vietnam time vs UTC, delete semantics.
5. **Server-side feature flags.** 30 of the 40 enabled flags do not appear in the frontend bundle, so they
   presumably switch server behaviour. I mapped the bugs I found to behaviour, not to those flags; some flags
   may hide defects on paths I did not exercise (for example admin-only ones).
6. **Real devices.** Smoke passes on Firefox and WebKit, and the three phone bugs (BUG-25, BUG-26, BUG-37)
   reproduce on both Chromium's and WebKit's phone emulation. BUG-25 and BUG-37 were also confirmed by hand on a
   real iPhone 15 Pro Max; BUG-26 and Android phones were not checked on a real device. The full regression
   suite runs on Chromium only.
7. **A fast check for the cart hold and the session expiry.** Both need state older than 10 or 30 minutes. A
   check reusing a cart from an earlier run was designed and dropped after review: it would store working
   logins of shared-site accounts, would always skip in CI, and would skip exactly when BUG-12 is fixed. Both
   bugs stay on the slow suite (nightly in the CI template) and their recorded evidence.

## 11. Deliverables

`project-overview.md`, this plan, `spec/requirements.json`, `spec/test-cases.json` (+ `test-cases.md`
for the discount flow), `spec/bugs.json` (+ `bugs.md`), `rtm.md`, `assets/BUG-*` evidence, the
`automation/` suites, the Postman collection (`automation/postman/`) and the QA dashboard.

## 12. Review and what changed

After the first pass I reviewed the work from five angles (SDET, QA manager, fullstack developer, solution
architect, DevOps). The main changes: six more UI bugs found through the bundle's feature flags (BUG-32 to
BUG-37); two checks that could pass for the wrong reason fixed; a stricter rule for what counts as a "known
bug" failure; events chosen at run time instead of hard-coded; schema checks on the spec files; a CI gate and a
CI template; concrete numbers in every discount test case. The full list, with the rule each change applies,
is in `spec/process-log.json` and on the dashboard's Process tab.

## 13. Iteration 3

The open items from section 12 were specified in a short design, reviewed from five angles before
any code was written, and revised (draft 2). The review added a severity pass (BUG-07 raised to High; every
Critical and High now carries its reasoning, enforced by the spec check), and cut three items down. Built: cross-engine projects, compile-time ids, sharding with a guarded merge, one
dashboard data copy, quiet-event isolation enforced by a test, and report retention.
