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
- One customer account, below.
- This document.
- An API reference at **https://candidate-01.207.148.118.135.sslip.io/docs**
- A shared spreadsheet with one tab for you, where you record your findings. The link comes with
  your invitation email.

### Customer account

| Email | Password |
|---|---|
| `meadow-60b5@example.invalid` | `eventpass123` |

This account is published here, so other people may be using it at the same time. If you want a
cart and an order history nobody else touches, register an account of your own — registration is
open and takes a moment.

Whenever a case needs a second buyer — comparing what two customers can see, or two people
competing for the same ticket — register a fresh account of your own. Registration is open and
takes a moment.

You do **not** get the source code.

## What you hand back

You work through this **on your own**, at your own pace, with nobody watching. Two things go into
your tab of the spreadsheet:

1. **A bug list.** Every bug you find, in the columns of the bug list in your tab.
2. **A set of test cases** for the one flow the interviewer named when they sent you this exercise,
   in the seven columns defined by [`test-case-template.md`](./test-case-template.md).

Work to the deadline the interviewer gave you.

## Using an AI assistant

You are **free to use an AI assistant**, with no need to declare it and no penalty.

Said plainly so you can prepare: round 2 is a **live online session** where you present what you
found and answer questions about it. That session is where we assess real ability, so make sure you
understand everything you hand in.
