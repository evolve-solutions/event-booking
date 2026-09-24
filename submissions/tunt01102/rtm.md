# Requirements traceability matrix

Generated from `spec/requirements.json`, `spec/test-cases.json`, the latest automated runs and `spec/bugs.json`. States: **covered-passing** (all linked tests green), **covered-failing** (a linked test is red; see the bug), **designed-not-run** (a case exists but cannot run here, with the reason), **not-covered** (no case; shown so the gap is visible).

34 requirements: 6 passing, 27 failing, 1 designed but not run, 0 not covered.

| Requirement | Rule | Test cases | Automated runs | Passed | Failed | Bugs | State |
|---|---|---|---|---|---|---|---|
| REQ-ACC-01 | Email must be a well-formed address. | TC-REG-01, TC-REG-02, TC-REG-09, TC-SMK-03 | 6 | 4 | 2 | BUG-17, BUG-19 | covered-failing |
| REQ-ACC-02 | Password must be at least 8 characters. | TC-REG-01, TC-REG-03, TC-REG-04, TC-PROF-07, TC-SMK-03 | 7 | 7 | 0 | — | covered-passing |
| REQ-ACC-03 | Phone, if given, must be 10 to 15 digits. | TC-REG-05, TC-REG-06, TC-PROF-02, TC-PROF-03 | 4 | 2 | 2 | BUG-18 | covered-failing |
| REQ-ACC-04 | One email can register only one account. | TC-REG-07, TC-REG-08, TC-REG-09 | 3 | 2 | 1 | BUG-19 | covered-failing |
| REQ-ACC-05 | Login returns a session stored in a cookie. | TC-META-01, TC-META-03, TC-AUTH-01, TC-AUTH-02, TC-AUTH-04, TC-DISC-11, TC-SMK-04 | 9 | 9 | 0 | — | covered-passing |
| REQ-ACC-06 | Session expires after 30 minutes; afterwards every login-only action needs a fresh login. | TC-AUTH-03, TC-AUTH-05, TC-AUTH-06 | 3 | 2 | 1 | BUG-13 | covered-failing |
| REQ-ACC-07 | Profile lets the user change phone (same 10 to 15 digit rule) and password. | TC-PROF-01, TC-PROF-02, TC-PROF-03, TC-PROF-04, TC-PROF-05, TC-PROF-07 | 6 | 5 | 1 | BUG-18 | covered-failing |
| REQ-ACC-08 | New password must differ from the current one. | TC-PROF-06 | 1 | 0 | 1 | BUG-20 | covered-failing |
| REQ-BOOK-01 | Each add to cart is a whole number of at least 1. | TC-EVT-02, TC-EVT-03, TC-CART-01, TC-CART-02, TC-CART-03, TC-CART-04, TC-CART-05, TC-CHK-02, TC-SMK-02 | 11 | 9 | 2 | BUG-04 | covered-failing |
| REQ-BOOK-02 | One order takes at most 4 VIP tickets. | TC-VIP-01, TC-VIP-02, TC-VIP-03, TC-VIP-04, TC-VIP-05, TC-VIP-06 | 6 | 1 | 5 | BUG-08 | covered-failing |
| REQ-BOOK-03 | Cart holds tickets for 10 minutes from the most recent add; after that the cart must be refreshed before checkout. | TC-CART-06, TC-CHK-12, TC-UI-11 | 3 | 2 | 1 | BUG-12 | covered-failing |
| REQ-BOOK-04 | Checkout recipient name is at most 50 characters. | TC-CHK-01, TC-CHK-03, TC-CHK-04, TC-CHK-05, TC-SMK-06 | 7 | 5 | 2 | BUG-14, BUG-16 | covered-failing |
| REQ-BOOK-05 | Checkout phone number has at least 10 digits. | TC-CHK-01, TC-CHK-06, TC-CHK-07, TC-CHK-08, TC-SMK-06 | 7 | 5 | 2 | BUG-15 | covered-failing |
| REQ-BOOK-06 | Student tickets require a student card number (value not validated). | TC-CHK-09, TC-CHK-10 | 2 | 2 | 0 | — | covered-passing |
| REQ-BOOK-07 | Past events stay listed with a Past label and cannot be booked. | TC-EVT-13, TC-CHK-11, TC-SMK-01, TC-UI-08 | 6 | 5 | 1 | BUG-09 | covered-failing |
| REQ-DISC-01 | Discount codes apply to Standard tickets (read as: Standard tickets only, see GAP-09). | TC-DISC-01, TC-DISC-04, TC-DISC-05, TC-DISC-06, TC-DISC-10, TC-DISC-12, TC-DISC-14, TC-DISC-15, TC-DISC-16 | 9 | 1 | 8 | BUG-06 | covered-failing |
| REQ-DISC-02 | Each order takes one discount code, once. | TC-DISC-02, TC-DISC-03, TC-DISC-08, TC-DISC-09 | 4 | 2 | 2 | BUG-05 | covered-failing |
| REQ-PRICE-01 | Total = (subtotal - discount) + 5% of (subtotal - discount). | TC-CART-01, TC-CART-07, TC-CART-08, TC-DISC-01, TC-DISC-06, TC-DISC-07, TC-SMK-05, TC-DISC-14, TC-DISC-15, TC-DISC-16 | 12 | 7 | 5 | BUG-07 | covered-failing |
| REQ-PRICE-02 | Cart and order confirmation show the service fee on its own line. | TC-CART-01, TC-CART-08, TC-DISC-08, TC-DISC-12, TC-CHK-01, TC-SMK-05, TC-SMK-06, TC-UI-13, TC-UI-15 | 13 | 9 | 4 | BUG-30, BUG-34 | covered-failing |
| REQ-REF-01 | Cancelled more than 24 h before start: 100% refund. | TC-CAN-01, TC-UI-10 | 2 | 2 | 0 | — | covered-passing |
| REQ-REF-02 | Cancelled within 24 h of start: 50% refund. | TC-CAN-04 | 1 | 0 | 0 | — | designed-not-run |
| REQ-REF-03 | Cancelled after the start: 0% refund. | TC-CAN-03 | 1 | 0 | 1 | BUG-10 | covered-failing |
| REQ-SRCH-01 | Search matches any part of the event name, case-insensitive (rock returns Hanoi Rock Fest). | TC-EVT-04, TC-EVT-05, TC-EVT-06, TC-UI-06 | 4 | 1 | 3 | BUG-21, BUG-22 | covered-failing |
| REQ-SRCH-02 | Venue filter matches the venue name exactly. | TC-EVT-07, TC-EVT-08 | 2 | 2 | 0 | — | covered-passing |
| REQ-SRCH-03 | Sort by name is alphabetical over the whole list; page 1 opens with the first event of the full sorted list. | TC-EVT-09, TC-UI-07 | 2 | 0 | 2 | BUG-23 | covered-failing |
| REQ-SRCH-04 | Sort by date is ascending chronological over the whole list. | TC-EVT-10 | 1 | 1 | 0 | — | covered-passing |
| REQ-SRCH-05 | Listing paginated at 10 per page; each event appears exactly once across pages. | TC-EVT-01, TC-EVT-11, TC-EVT-12, TC-SMK-01, TC-UI-12, TC-UI-14 | 8 | 5 | 3 | BUG-24, BUG-32 | covered-failing |
| REQ-TZ-01 | Every time shown to a user is in Vietnam time (UTC+7); server stores UTC. | TC-UI-04, TC-UI-05, TC-UI-11 | 3 | 2 | 1 | BUG-27 | covered-failing |
| REQ-UI-01 | Fully usable at 360 px wide, buying included, without zoom or sideways scroll. | TC-UI-01, TC-UI-02, TC-UI-16, TC-UI-18, TC-UI-19 | 9 | 0 | 9 | BUG-25, BUG-26, BUG-35, BUG-37 | covered-failing |
| REQ-UI-02 | Every form field has a visible label; clicking the label focuses that field. | TC-UI-03 | 1 | 0 | 1 | BUG-28, BUG-29 | covered-failing |
| REQ-UI-03 | On-screen messages describe the result of the most recent action. | TC-DISC-13, TC-UI-09, TC-UI-13, TC-UI-15 | 4 | 1 | 3 | BUG-30, BUG-33, BUG-34 | covered-failing |
| REQ-ADM-01 | Create/edit/delete event, adjust stock, view and export order list are admin-only; a customer must never perform them by any route. | TC-META-02, TC-ADM-01, TC-ADM-02, TC-ADM-03, TC-ADM-04, TC-ADM-05, TC-ADM-06, TC-ADM-07, TC-ADM-08, TC-ADM-09 | 10 | 8 | 2 | BUG-01, BUG-31 | covered-failing |
| REQ-SEC-01 | A customer can read and cancel only their own orders (implied by ownership; admin-only order list). | TC-ORD-01, TC-ORD-02, TC-ORD-03, TC-ORD-04, TC-ORD-05, TC-SMK-07 | 8 | 6 | 2 | BUG-02, BUG-03 | covered-failing |
| REQ-INV-01 | Cancelling an order returns its tickets to stock exactly once; a cancelled order cannot be cancelled again. | TC-CAN-01, TC-CAN-02, TC-CAN-05, TC-UI-17 | 4 | 2 | 2 | BUG-11, BUG-36 | covered-failing |

## Catalogue and code consistency

- Test cases not automated: none
- Ids in test code missing from the catalogue: none
- Bugs without an automated test: none
- Bug ids in test code missing from the bug list: none
