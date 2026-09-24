# Round 1 submission: tunt01102

Spec-driven QA of the Event Booking site. The two required deliverables are **[bugs.md](./bugs.md)**
(37 bugs, most severe first, with a summary on top) and **[test-cases.md](./test-cases.md)** (flow: applying a
discount code). Everything else supports them.

**Dashboard:** open [`dashboard/index.html`](./dashboard/index.html) in a browser after cloning (tabs: overview,
project, test plan, test cases, RTM, automation, bug tracker with video and screenshots, process). GitHub shows
the file as source, so it has to be opened locally.

| File | What it is |
|---|---|
| [bugs.md](./bugs.md) | 37 bugs: steps, expected, actual, severity, who is harmed, root-cause group, likely location, hypothesis, evidence |
| [test-cases.md](./test-cases.md) | Chosen flow: **applying a discount code**, 16 cases (positive, negative, boundary), all automated |
| [assets/](./assets/) | Per bug, newest complete recording run `assets/BUG-xx/<YYYYMMDDTHHmmssSSS>/`: `recording.webm`, `screenshot.png`, `network.har` (cookies and tokens redacted), `log.json` (every API request and response). BUG-12 and BUG-13 add `-start` files recorded before their 10 and 30 minute waits |
| [project-overview.md](./project-overview.md) | The system as described by the brief, the API and the live app, plus how the testing is built |
| [test-plan.md](./test-plan.md) | Strategy, scope, risks, levels, entry and exit criteria, what was not tested and why |
| [rtm.md](./rtm.md) | Requirements traceability: brief rule ↔ test case ↔ automated result ↔ bug |
| [spec/](./spec/) | Sources of truth: `requirements.json`, `test-cases.json` (all 125 cases), `bugs.json`, `process-log.json` |
| [automation/](./automation/) | Unit (Vitest, 80% gate), API, smoke, regression, slow and evidence suites (Playwright), cross-engine projects (Firefox, WebKit, iPhone), gate, CI template |

## Method in one paragraph

Every rule in the brief became a `REQ-*` id. Test cases were designed against those ids, and the rules were
encoded as a unit-tested oracle, so no expected value is ever taken from the system under test. The suites run
against the live site with fresh accounts and with events chosen by rule at the start of each run. A test that
exposes a bug stays red, tagged with the bug id; only an assertion failure counts as that bug, so a timeout or a
crash cannot hide behind it. Every failure was either mapped to a bug or fixed as a test defect. Every bug was
then reproduced in a real browser while recording video and network traffic. After a first pass I reviewed the
whole submission from five angles (SDET, QA manager, developer, architect, DevOps); what changed is in
`spec/process-log.json`.

## How this was produced

I used an AI coding assistant throughout, as the brief allows. Every bug in `bugs.md` was re-verified by an
automated check against the live site and by a browser recording, and every test failure was read before it
was accepted as a bug. The process log records the mistakes the checks caught along the way.

## Reproduce

Requires Node 22.18 or later (`automation/.nvmrc`).

```bash
cd automation
npm ci && npx playwright install chromium firefox webkit
npm run test:unit            # oracle and tooling, coverage gate 80%
npm run test:smoke           # run first: the shortest buyer path, must be green
npm run test:api             # every documented operation (27) and every business rule
npm run test:regression      # UI: 360 px, labels, time zone, search, paging, cart, orders, admin screens
npm run test:cross           # smoke on Firefox and WebKit, phone tests on WebKit's iPhone 13 profile
npm run gate                 # the verdict: fails only on unexplained or flaky results or a missing report
npm run test:all             # all of the above in order, ending with the gate
npm run test:stability       # smoke + API + regression three times; any changed outcome fails
npm run test:slow            # real 10 and 30 minute waits (cart hold, session expiry)
npm run test:evidence        # re-record evidence for every bug into ../assets
npm run evidence:prune       # keep the newest evidence run per bug; move older ones to evidence-archive/
npm run reports:prune        # keep the newest 3 reports per project; move older ones to reports-archive/
npm run dashboard            # regenerate bugs.md, test-cases.md, rtm.md and the dashboard; fails on drift,
                             # then checks the page itself (widths, overflow, alignment, broken ids; light and dark)
```

`BASE_URL` selects the site (default: the candidate-01 host; required when `CI` is set). The API and regression
suites exit non-zero while bugs are open; that is expected, and `npm run gate` is what a pipeline should gate
on. `automation/ci/github-actions.yml` is a ready CI template (not active here: the brief allows no changes
outside this folder).

Every run writes under its own `YYYYMMDDTHHmmssSSS` id (Vietnam time): `automation/reports/<suite>/<id>.json`,
`automation/reports/world/<id>.json` (which events the run used), `automation/coverage/<id>/`,
`automation/test-results/<id>-<suite>/` and `assets/BUG-xx/<id>/`. Nothing is overwritten; filtered runs go to
`<suite>-partial`. A sharded run (`SHARD=1/2 RUN_ID=<id> npx playwright test --project=api`, then the same with
`2/2`) writes one blob per shard; `node scripts/merge-shards.mjs api <id>` merges them into the usual report.

Test data: every run registers fresh buyers at `@example.invalid`. That domain is reserved so that it never
resolves (RFC 2606, RFC 6761), so the addresses are well-formed but can never email a real person; `.invalid`
does not mean the test input is invalid (see `test-plan.md`, section 7).

Safety on the shared site: admin routes were probed only with unchanged or duplicate data and non-existent ids,
and every order a test creates is cancelled once at teardown. The one known side effect (stock inflated by the
double-cancel bug) is described in `test-plan.md`, section 7.
