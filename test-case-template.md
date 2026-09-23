# Test case template

This file is the **column definition**. You fill in a **spreadsheet** (a Google Sheet) shared by
the interviewer, one tab per candidate — there is no Markdown file to hand in. Write test cases for
the one flow the interviewer named when they sent you this exercise.

All seven columns below are required.

| ID | Flow | Type | Preconditions | Steps | Expected result | Priority |
|---|---|---|---|---|---|---|
| TC-01 | Change the phone number in the profile | negative | Signed in with the customer account, on the My profile screen | 1. Clear the phone number field. 2. Type `abc`. 3. Click Save. | The system refuses and the profile keeps the previous phone number | Medium |

On the **Type** column: use exactly one of `positive`, `negative`, `boundary`. A good set has all
three.

On the **Expected result** column: it must be something you can observe — a number, a state, or a
specific message. "The system works correctly" is not an expected result.
