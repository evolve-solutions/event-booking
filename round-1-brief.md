# Event ticketing — business brief

This system sells tickets for cultural and sporting events. There is no seat map: buyers pick a
**ticket type** and a **quantity**, not a seat. Every event offers three ticket types:
**Standard**, **VIP** and **Student**.

## Accounts

Users register with an email address and a password. The email must be a well-formed address; the
password must be at least 8 characters; a phone number, if given, must be 10 to 15 digits. One
email can register only one account. Logging in returns a session stored in a cookie, and the
session expires after 30 minutes; once it expires, every action that needs a login needs a fresh
one. In the profile screen a user can change their phone number and their password; the new
password must differ from the current one. Forgotten passwords are reset by an administrator — the
system sends no mail.

## Booking rules

Buyers add tickets to the cart from the event detail screen. Each add is a whole number of at least
1. For VIP tickets specifically, one order takes at most **4 VIP tickets**. The cart holds its
tickets for **10 minutes** counted from the most recent add; past that point the cart must be
refreshed before checkout. At checkout the buyer supplies a recipient name of at most 50 characters
and a phone number of at least 10 digits.

Discount codes apply to **Standard** tickets. Each order takes one discount code **once**.

The amount due is computed in this order: take the subtotal, subtract the discount, then charge the
**5%** service fee **on what is left after the discount**. That is an order of operations, not two
independent charges.

Refunds on cancellation depend on when the cancellation happens relative to the start time:

| Cancelled | Refund |
|---|---|
| More than **24 hours** before the start | **100%** |
| Within **24 hours** of the start | **50%** |
| After the start | **0%** |

## Behaviour that is intentional

The three items below are deliberate design, not defects:

1. The **5%** service fee is added to the amount due, so the total is always higher than quantity
   times unit price. Both the cart and the order confirmation show it on its own line.
2. Student tickets require a **student card number**. The system only requires the field to carry a
   value and **does not validate** that value against any source.
3. Events that have already happened stay in the listing, carry a **Past** label, and cannot be
   booked.

## Search and sorting

The search box matches any part of the event name and ignores letter case: typing `rock` must
return `Hanoi Rock Fest`. The venue filter matches the venue name exactly. Sorting by name uses
alphabetical order and sorting by date uses ascending chronological order; either way the order
covers the whole list, so page 1 always opens with the first event of the full sorted list. The
listing is paginated at 10 events per page, and each event appears exactly once when you page
through the whole list.

## Time zone

The server stores every timestamp in UTC. Every time shown to a user is in Vietnam time (UTC+7).

## Screens and devices

The site must be fully usable both in a desktop browser and on a phone screen as narrow as
**360 px**: everything a buyer needs, buying a ticket included, must be reachable without zooming or
scrolling sideways. Every form field has a visible label, and clicking that label puts the cursor in
that field. Messages on screen describe the result of the most recent action.

## Administration

Creating, editing or deleting an event, adjusting the stock of a ticket type, viewing the whole
order list filtered by status and date range, and exporting that list are **administrator-only
operations**. A customer account must never be able to perform them, by any route.

## What you get

- The site: **https://candidate-01.207.148.118.135.sslip.io**
- Three customer accounts, below.
- This document.
- An API reference at **https://candidate-01.207.148.118.135.sslip.io/docs**
- This repository, where you hand your work back as a pull request.

### Customer accounts

| Email | Password |
|---|---|
| `meadow-60b5@example.invalid` | `eventpass123` |
| `cobalt-7ad0@example.invalid` | `eventpass123` |
| `juniper-f15b@example.invalid` | `eventpass123` |

All three are ordinary customers. Use more than one whenever a case needs more than one buyer —
comparing what two customers can see, or several people acting on the same thing at the same time.

These accounts are published here, so other people may be using them at the same time. If you want
a cart and an order history nobody else touches, register accounts of your own — registration is
open and takes a moment.

You do **not** get the source code.

## What you hand back

You work through this **on your own**, at your own pace, with nobody watching. You have **one week**
from the day you receive the invitation.

Hand your work back as **one pull request to the `develop` branch** of this repository. Fork the
repository, add a folder named after your GitHub username, and open the pull request from your fork:

```
submissions/<your-github-username>/
├── bugs.md          every bug you found
├── test-cases.md    your test cases
└── assets/          screenshots, screen recordings, request/response captures
```

1. **`bugs.md` — a bug list.** Every bug you find. Each one must give someone else enough to
   reproduce it without asking you: what you did, what you expected, what happened instead, and how
   severe you judge it. Link the evidence for it from `assets/`.
2. **`test-cases.md` — a set of test cases** for **one** of these three flows, your choice: applying
   a discount code, cancelling tickets, or registering an account. Say at the top which flow you
   picked. The format is yours, but every test case needs numbered steps with one action each, an
   expected result you can observe (a number, a state or a specific message, never "the system
   works correctly"), its type — `positive`, `negative` or `boundary` — and a priority.
3. **`assets/`** — everything `bugs.md` and `test-cases.md` link to. Keep all of it inside your own
   folder.

Put your name in the pull request title. Everything must be in the pull request before the deadline;
commits pushed after it are not read. Do not change anything outside your own folder.

## Using an AI assistant

You are **free to use an AI assistant**, with no need to declare it and no penalty.

Said plainly so you can prepare: round 2 is a **live online session** where you present what you
found and answer questions about it. That session is where we assess real ability, so make sure you
understand everything you hand in.
