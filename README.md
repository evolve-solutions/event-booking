# Event Booking — QA Engineer assessment at Sannos

Thank you for your interest in the **QA Engineer** role at **Sannos**. This repository holds everything you need
for the assessment. It has **two rounds**.

## Round 1 — hands-on testing (on your own time)

You get a live event-ticketing website. Test it the way a QA engineer would on a real project:

- **Find and report the bugs** you come across.
- **Write a set of test cases** for one flow of your choice: applying a discount code, cancelling
  tickets, or registering an account.

| | |
|---|---|
| Site | **https://candidate-01.207.148.118.135.sslip.io** |
| API reference | **https://candidate-01.207.148.118.135.sslip.io/docs** |
| Customer account | `meadow-60b5@example.invalid` / `eventpass123` |

The account above is shared by everyone who reads this page. If you want a cart and an order
history nobody else touches, register an account of your own on the site — registration is open.

Start with **[`round-1-brief.md`](./round-1-brief.md)**. It is the business brief: it defines how the
system is supposed to behave, so it is what decides whether something you see is a bug. Read it
closely — some rules are only written there, not shown on screen.

Hand your work back as **one pull request to the `develop` branch** of this repository, with every
asset in it. Fork the repository and put everything under `submissions/<your-github-username>/`:

```
submissions/<your-github-username>/
├── bugs.md          every bug you found
├── test-cases.md    your test cases, in the columns of test-case-template.md
└── assets/          screenshots, screen recordings, request/response captures
```

The full rules are at the end of [`round-1-brief.md`](./round-1-brief.md#what-you-hand-back).

You have **one week** from the day you receive the invitation. Work at your own pace, unsupervised. You are **free to
use an AI assistant**, with no need to declare it. Just make sure you understand and can explain
everything you hand in, because round 2 goes deep into it.

## Round 2 — online interview (about 60 minutes)

If your round 1 work meets the bar, we invite you to a video call in two parts:

1. **Your round 1 work.** You present the bugs you found, how you approached the task and how you
   judged severity, then answer follow-up questions. Have your pull request ready to share and keep
   access to the site, so you can reproduce a bug live if asked.
2. **General interview.** We talk about your experience, how you work with developers, and where
   you want to grow. The last few minutes are for your questions to us.

Details are in **[`round-2-interview.md`](./round-2-interview.md)**. There is nothing to prepare
beyond your round 1 work — no slides, no extra assignment.

## Questions

If anything in the brief is unclear, or the site does not respond, reply to your invitation email.

— Vu Nguyen, Sannos
