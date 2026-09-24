# Test cases: applying a discount code

**Flow picked: applying a discount code.** 16 cases below (7 positive, 7 negative, 2 boundary). Each is automated (API suite `automation/tests/api/discount.spec.ts`, UI cases in `tests/e2e/regression`) and traced to the brief in [rtm.md](./rtm.md). The full catalogue of 125 cases for every flow is in `spec/test-cases.json` and on the dashboard.

Rules under test (quoted from the brief): "Discount codes apply to Standard tickets. Each order takes one discount code once." and "take the subtotal, subtract the discount, then charge the 5% service fee on what is left after the discount". The brief names no codes; `WELCOME10` (10% off) was found on the live system (GAP-01).

Priority: **P1** release blocker if it fails; **P2** must be fixed before the next release; **P3** fix when convenient. Amounts use the live prices of the upcoming event at the time of writing (Standard ₫100,000, VIP ₫300,000, Student ₫50,000); the automated checks compute the same figures from the live price, so they stay right if prices change.

| Id | Title | Type | Priority | Requirement | Last result |
|---|---|---|---|---|---|
| [TC-DISC-01](#tc-disc-01) | WELCOME10 takes 10% off a Standard-only cart | positive | P1 | REQ-DISC-01, REQ-PRICE-01 | passed |
| [TC-DISC-02](#tc-disc-02) | Unknown code is refused and totals do not change | negative | P2 | REQ-DISC-02 | passed |
| [TC-DISC-03](#tc-disc-03) | Applying the same code twice does not discount twice | negative | P1 | REQ-DISC-02 | failed-known-bug |
| [TC-DISC-04](#tc-disc-04) | Discount does not reduce VIP tickets | negative | P1 | REQ-DISC-01 | failed-known-bug |
| [TC-DISC-05](#tc-disc-05) | Discount does not reduce Student tickets | negative | P1 | REQ-DISC-01 | failed-known-bug |
| [TC-DISC-06](#tc-disc-06) | Mixed cart: discount only on the Standard part | positive | P1 | REQ-DISC-01, REQ-PRICE-01 | failed-known-bug |
| [TC-DISC-07](#tc-disc-07) | Service fee is charged on what is left after the discount | positive | P1 | REQ-PRICE-01 | failed-known-bug |
| [TC-DISC-08](#tc-disc-08) | Order confirmation keeps the cart's discount and a single code | positive | P1 | REQ-DISC-02, REQ-PRICE-02 | failed-known-bug |
| [TC-DISC-09](#tc-disc-09) | Blank code is refused | negative | P3 | REQ-DISC-02 | passed |
| [TC-DISC-10](#tc-disc-10) | Discount follows Standard tickets added after the code | positive | P3 | REQ-DISC-01 | failed-known-bug |
| [TC-DISC-11](#tc-disc-11) | Anonymous caller cannot apply a code | negative | P3 | REQ-ACC-05 | passed |
| [TC-DISC-12](#tc-disc-12) | UI: applying WELCOME10 in the cart shows the code and the discount line | positive | P1 | REQ-DISC-01, REQ-PRICE-02 | failed-known-bug |
| [TC-DISC-13](#tc-disc-13) | UI: after a refused code, applying a valid code leaves no stale error | negative | P2 | REQ-UI-03 | passed |
| [TC-DISC-14](#tc-disc-14) | Smallest discounted cart: one Standard ticket | boundary | P2 | REQ-DISC-01, REQ-PRICE-01 | failed-known-bug |
| [TC-DISC-15](#tc-disc-15) | Removing every Standard line takes the discount back to zero | boundary | P2 | REQ-DISC-01, REQ-PRICE-01 | failed-known-bug |
| [TC-DISC-16](#tc-disc-16) | Discount follows a quantity change on the Standard line | positive | P3 | REQ-DISC-01, REQ-PRICE-01 | failed-known-bug |

## TC-DISC-01

**WELCOME10 takes 10% off a Standard-only cart**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P1 | REQ-DISC-01, REQ-PRICE-01 | api | none |

**Preconditions:** Logged-in buyer with 2 Standard tickets (100,000 each) in the cart

**Steps**

1. Send POST /api/cart/discount with code "WELCOME10"
2. Read the cart totals in the response

**Expected result:** discountCode "WELCOME10"; gross 200,000; discount 20,000; serviceFee 9,000; total 189,000

## TC-DISC-02

**Unknown code is refused and totals do not change**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P2 | REQ-DISC-02 | api | none |

**Preconditions:** Logged-in buyer with 1 Standard ticket (100,000) in the cart

**Steps**

1. Send POST /api/cart/discount with code "NOPE99"
2. Send GET /api/cart

**Expected result:** First call 404 "Discount code not found"; cart discountCode null, discount 0, total 105,000

## TC-DISC-03

**Applying the same code twice does not discount twice**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P1 | REQ-DISC-02 | api | BUG-05 |

**Preconditions:** Logged-in buyer with 2 Standard tickets (100,000 each) and WELCOME10 applied once

**Steps**

1. Send POST /api/cart/discount with "WELCOME10" again
2. Send GET /api/cart

**Expected result:** Second apply refused (4xx) or ignored; discountCode "WELCOME10" (once); discount 20,000; total 189,000

## TC-DISC-04

**Discount does not reduce VIP tickets**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P1 | REQ-DISC-01 | api | BUG-06 |

**Preconditions:** Logged-in buyer with 1 VIP ticket (300,000) and nothing else in the cart

**Steps**

1. Send POST /api/cart/discount with "WELCOME10"
2. Send GET /api/cart

**Expected result:** discount 0; serviceFee 15,000; total 315,000

## TC-DISC-05

**Discount does not reduce Student tickets**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P1 | REQ-DISC-01 | api | BUG-06 |

**Preconditions:** Logged-in buyer with 1 Student ticket (50,000) and nothing else in the cart

**Steps**

1. Send POST /api/cart/discount with "WELCOME10"
2. Send GET /api/cart

**Expected result:** discount 0; serviceFee 2,500; total 52,500

## TC-DISC-06

**Mixed cart: discount only on the Standard part**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P1 | REQ-DISC-01, REQ-PRICE-01 | api | BUG-06, BUG-07 |

**Preconditions:** Logged-in buyer with 2 Standard, 1 VIP and 1 Student ticket of the same event in the cart

**Steps**

1. Send POST /api/cart/discount with "WELCOME10"
2. Send GET /api/cart

**Expected result:** gross 550,000; discount 20,000 (10% of the 200,000 Standard part only); serviceFee 26,500; total 556,500

## TC-DISC-07

**Service fee is charged on what is left after the discount**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P1 | REQ-PRICE-01 | api | BUG-07 |

**Preconditions:** Logged-in buyer with 2 Standard tickets (100,000 each) in the cart

**Steps**

1. Send POST /api/cart/discount with "WELCOME10"
2. Read serviceFee and total

**Expected result:** discount 20,000; serviceFee 9,000 (5% of 180,000), not 10,000; total 189,000

## TC-DISC-08

**Order confirmation keeps the cart's discount and a single code**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P1 | REQ-DISC-02, REQ-PRICE-02 | api | BUG-05, BUG-07 |

**Preconditions:** Logged-in buyer with 2 Standard tickets (100,000 each) and WELCOME10 applied

**Steps**

1. Send POST /api/orders with recipient "QA Buyer" and phone "0912345678"
2. Read the amounts of the returned order

**Expected result:** status CONFIRMED; discountCode "WELCOME10"; grossAmount 200,000; discountAmount 20,000; serviceFeeAmount 9,000; totalAmount 189,000. Clean-up cancels the order.

## TC-DISC-09

**Blank code is refused**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P3 | REQ-DISC-02 | api | none |

**Preconditions:** Cart with Standard 1

**Steps**

1. POST /api/cart/discount code ''

**Expected result:** 4xx; discountCode null

## TC-DISC-10

**Discount follows Standard tickets added after the code**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P3 | REQ-DISC-01 | api | BUG-07 |

**Preconditions:** Logged-in buyer with an empty cart

**Steps**

1. Send POST /api/cart/discount with "WELCOME10"
2. Send POST /api/cart/items with 2 Standard tickets
3. Send GET /api/cart

**Expected result:** The brief does not say whether a code may be applied to an empty cart. The live site accepts it (step 1 returns 200); given that, step 3 shows discount 20,000, serviceFee 9,000, total 189,000. If step 1 is refused, the check is skipped with that reason.

## TC-DISC-11

**Anonymous caller cannot apply a code**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P3 | REQ-ACC-05 | api | none |

**Preconditions:** No session

**Steps**

1. POST /api/cart/discount 'WELCOME10' without a cookie

**Expected result:** Status 401

## TC-DISC-12

**UI: applying WELCOME10 in the cart shows the code and the discount line**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P1 | REQ-DISC-01, REQ-PRICE-02 | regression | none |

**Preconditions:** Logged-in buyer with 2 Standard tickets (100,000 each) in the cart

**Steps**

1. Open /cart
2. Type "WELCOME10" in the discount field
3. Click Apply

**Expected result:** Badge reads WELCOME10; Discount line ₫20,000; Service fee line ₫9,000; Total ₫189,000

## TC-DISC-13

**UI: after a refused code, applying a valid code leaves no stale error**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| negative | P2 | REQ-UI-03 | regression | none |

**Preconditions:** Logged-in buyer with 1 Standard ticket (100,000) in the cart

**Steps**

1. Open /cart
2. Type 'NOPE99'
3. Click Apply
4. Replace with 'WELCOME10'
5. Click Apply

**Expected result:** After step 3 an error reading "Discount code not found" is shown; after step 5 no error is shown and the badge reads WELCOME10

## TC-DISC-14

**Smallest discounted cart: one Standard ticket**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| boundary | P2 | REQ-DISC-01, REQ-PRICE-01 | api | BUG-07 |

**Preconditions:** Logged-in buyer with 1 Standard ticket (100,000) in the cart

**Steps**

1. Send POST /api/cart/discount with "WELCOME10"
2. Read the cart totals

**Expected result:** discount 10,000; serviceFee 4,500; total 94,500

## TC-DISC-15

**Removing every Standard line takes the discount back to zero**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| boundary | P2 | REQ-DISC-01, REQ-PRICE-01 | api | BUG-06 |

**Preconditions:** Logged-in buyer with 1 Standard and 1 VIP ticket and WELCOME10 applied

**Steps**

1. Send PATCH /api/cart/items/{Standard line id} with quantity 0
2. Send GET /api/cart

**Expected result:** Only the VIP line remains; discount 0; serviceFee 15,000; total 315,000

## TC-DISC-16

**Discount follows a quantity change on the Standard line**

| Type | Priority | Requirement | Suite | Linked bug |
|---|---|---|---|---|
| positive | P3 | REQ-DISC-01, REQ-PRICE-01 | api | BUG-07 |

**Preconditions:** Logged-in buyer with 2 Standard tickets and WELCOME10 applied

**Steps**

1. Send PATCH /api/cart/items/{line id} with quantity 3
2. Read the cart totals

**Expected result:** gross 300,000; discount 30,000; serviceFee 13,500; total 283,500
