// Builds the Postman collection in postman/: every documented API operation, then one folder per API bug
// (BUG-01 to BUG-24, ids as in spec/bugs.json). Tests assert what the brief requires, so a red [BUG-xx] test
// means the bug is still there. Usage: node scripts/build-postman.mjs
import fs from 'node:fs';
import path from 'node:path';

const bugs = Object.fromEntries(JSON.parse(fs.readFileSync('../spec/bugs.json', 'utf8')).bugs.map((b) => [b.id, b]));
const JSON_HEADER = [{ key: 'Content-Type', value: 'application/json' }];
const lines = (s) => s.trim().split('\n').map((l) => l.replace(/^ {6}/, ''));

// One request. `test` and `pre` are Postman scripts (strings).
const req = (name, method, url, { body, test, pre, desc } = {}) => ({
  name,
  event: [
    ...(pre ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(pre) } }] : []),
    ...(test ? [{ listen: 'test', script: { type: 'text/javascript', exec: lines(test) } }] : []),
  ],
  request: {
    method,
    header: body === undefined ? [] : JSON_HEADER,
    ...(body === undefined ? {} : { body: { mode: 'raw', raw: typeof body === 'string' ? body : JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } }),
    url: `{{baseUrl}}${url}`,
    ...(desc ? { description: desc } : {}),
  },
});
const folder = (name, items, description) => ({ name, ...(description ? { description } : {}), item: items });
const v = (name) => `pm.collectionVariables.get('${name}')`;
const set = (name, expr) => `pm.collectionVariables.set('${name}', ${expr});`;
const status = (...codes) => `pm.test('Status ${codes.join(' or ')}', () => pm.expect(pm.response.code).to.be.oneOf([${codes.join(', ')}]));`;

// Shared steps. Every folder uses its own variable prefix (p) so folders never read each other's state.
const reset = (p) => `Object.keys(pm.collectionVariables.toObject()).filter((k) => k.startsWith('${p}_')).forEach((k) => pm.collectionVariables.unset(k));`;
const freshEmail = `'qa-pm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '@example.invalid'`;
const register = (p, who = 'A', { first = false } = {}) => req(`Register fresh buyer ${who}`, 'POST', '/api/auth/register', {
  pre: `${first ? reset(p) + '\n' : ''}${set(`${p}_email${who}`, freshEmail)}`,
  body: `{\n  "email": "{{${p}_email${who}}}",\n  "password": "{{password}}"\n}`,
  test: status(200),
});
const login = (p, who = 'A') => req(`Log in as buyer ${who}`, 'POST', '/api/auth/login', {
  body: `{\n  "email": "{{${p}_email${who}}}",\n  "password": "{{password}}"\n}`,
  test: status(200),
});
const buyer = (p, who = 'A', opts) => [register(p, who, opts), login(p, who)];
const add = (name, tt, qty, test = status(200)) => req(name, 'POST', '/api/cart/items', { body: `{\n  "ticketTypeId": {{${tt}}},\n  "quantity": ${qty}\n}`, test });
const OK_CHECKOUT = { recipientName: 'QA Buyer', phone: '0912345678' };
// Checkout that remembers the order id (if one was created) so the clean-up can cancel it exactly once.
const checkout = (name, p, key, body = OK_CHECKOUT, test = '') => req(name, 'POST', '/api/orders', {
  body,
  test: `if (pm.response.code === 200) ${set(`${p}_${key}`, 'pm.response.json().id')}\n${test}`,
});
const cancelOnce = (p, key, name = 'Clean-up: cancel this order once') => req(name, 'POST', `/api/orders/{{${p}_${key}}}/cancel`, {
  pre: `// Skipped when no order was created or it is already cancelled: a second cancel would add stock again (BUG-11).
      if (!${v(`${p}_${key}`)} || ${v(`${p}_${key}_cancelled`)}) pm.execution.skipRequest();`,
  test: `if (pm.response.code === 200) ${set(`${p}_${key}_cancelled`, "'1'")}\n${status(200)}`,
});
const bugFolder = (id, items, extra = '') => {
  const b = bugs[id];
  const steps = b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return folder(`${id} [${b.severity}] ${b.title}`, items,
    `**Severity:** ${b.severity}\n\n**Steps in bugs.md**\n\n${steps}\n\n**Expected:** ${b.expected}\n\n**Actual (as reported):** ${b.actual}\n\nA red \`[${id}]\` test means the bug is still present.${extra ? `\n\n${extra}` : ''}`);
};
const t = (id, text, body) => `pm.test('[${id}] ${text.replace(/'/g, "\\'")}', () => {\n${body}\n});`;

// ---------------------------------------------------------------- 00 Setup
const setup = folder('00 Setup (run first)', [
  req('Log out (clear any old session)', 'POST', '/api/auth/logout', { test: status(200, 401) }),
  req('Pick events by rule', 'GET', '/api/events?pageSize=100', {
    // The same rule as the automated suites (src/data/world.ts): only events more than 48 h away, so no clean-up
    // cancel can fall in the 50% refund tier; prefer one whose Vietnam date differs from its UTC date.
    test: `const items = pm.response.json().items;
      const vnDate = (iso) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
      const future = items.filter((e) => e.status === 'UPCOMING' && new Date(e.startsAt).getTime() - Date.now() > 48 * 3600e3)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const past = items.filter((e) => e.status === 'PAST');
      pm.test('A past event and at least two upcoming events more than 48 h away', () => { pm.expect(past.length).to.be.above(0); pm.expect(future.length).to.be.above(1); });
      const upcoming = future.find((e) => vnDate(e.startsAt) !== e.startsAt.slice(0, 10)) || future[0];
      const rest = future.filter((e) => e.id !== upcoming.id);
      const quiet = rest[rest.length - 1];
      // upcoming: event 7 in bugs.md; quiet: the latest one, used for stock counts; past: event 11 in bugs.md.
      ${set('upcomingEventId', 'upcoming.id')}
      ${set('quietEventId', 'quiet.id')}
      ${set('pastEventId', 'past[0].id')}
      console.log('upcoming', upcoming.id, upcoming.title, '| quiet', quiet.id, quiet.title, '| past', past[0].id, past[0].title);`,
  }),
  ...[['upcoming', 'up'], ['quiet', 'quiet'], ['past', 'past']].map(([ev, p]) => req(`Ticket types of the ${ev} event`, 'GET', `/api/events/{{${ev}EventId}}`, {
    test: `const tts = pm.response.json().ticketTypes;
      for (const tt of tts) { const n = tt.name[0] + tt.name.slice(1).toLowerCase(); ${set(`${p}' + n + 'Tt`, 'tt.id')} ${set(`${p}' + n + 'Price`, 'tt.price')} }
      pm.test('Standard, VIP and Student exist', () => pm.expect(tts.map((x) => x.name).sort()).to.eql(['STANDARD', 'STUDENT', 'VIP']));`,
  })),
], 'Run once before anything else, and again if the events change. Picks the events by rule and stores their ticket type ids and prices.');

// ---------------------------------------------------------------- 01 API reference (every documented operation)
const R = 'ref';
const reference = folder('01 API reference (27 operations)', [
  folder('Meta', [
    req('GET /api/health', 'GET', '/api/health', { test: `${status(200)}\npm.test('ok', () => pm.expect(pm.response.json().status).to.eql('ok'));` }),
    req('GET /robots.txt', 'GET', '/robots.txt', { test: status(200) }),
    req('GET /api/config', 'GET', '/api/config', { test: status(200) }),
  ]),
  folder('Auth', [
    req('POST /api/auth/register', 'POST', '/api/auth/register', {
      pre: `${reset(R)}\n${set(`${R}_emailA`, freshEmail)}`,
      body: `{\n  "email": "{{${R}_emailA}}",\n  "password": "{{password}}",\n  "phone": "0912345678"\n}`,
      test: `${status(200)}\npm.test('Role CUSTOMER', () => pm.expect(pm.response.json().role).to.eql('CUSTOMER'));`,
    }),
    req('POST /api/auth/login', 'POST', '/api/auth/login', { body: `{\n  "email": "{{${R}_emailA}}",\n  "password": "{{password}}"\n}`, test: status(200) }),
    req('GET /api/auth/me', 'GET', '/api/auth/me', { test: `${status(200)}\npm.test('Same email', () => pm.expect(pm.response.json().email).to.eql(${v(`${R}_emailA`)}));` }),
  ]),
  folder('Events', [
    req('GET /api/events (q, venue, sort, page, pageSize)', 'GET', '/api/events?page=1&pageSize=10', {
      desc: 'Optional query parameters: q (name search), venue (exact venue), sort (title or startsAt), page, pageSize (1 to 100).',
      test: `${status(200)}\npm.test('10 per page', () => pm.expect(pm.response.json().items.length).to.be.at.most(10));`,
    }),
    req('GET /api/events/{id}', 'GET', '/api/events/{{upcomingEventId}}', { test: status(200) }),
    req('POST /api/events (admin only: expect 403)', 'POST', '/api/events', {
      desc: 'Reuses an existing slug, so even a missing guard could not create an event on the shared site.',
      pre: `pm.sendRequest(pm.variables.replaceIn('{{baseUrl}}/api/events/{{upcomingEventId}}'), (err, res) => { const e = res.json(); ${set(`${R}_eventBody`, 'JSON.stringify({ slug: e.slug, title: e.title, venue: e.venue, startsAt: e.startsAt }, null, 2)')} });`,
      body: `{{${R}_eventBody}}`,
      test: status(403),
    }),
    req('PUT /api/events/{id} (admin only; non-existent id)', 'PUT', '/api/events/999999', {
      desc: 'A non-existent id, so nothing can change. The real edit route is shown in BUG-01.',
      body: { slug: 'qa-no-such-event', title: 'QA no such event', venue: 'Nowhere', startsAt: '2030-01-01T00:00:00.000Z' },
      test: status(403, 404),
    }),
    req('DELETE /api/events/{id} (admin only: expect 403)', 'DELETE', '/api/events/999999', { test: status(403) }),
    req('PATCH /api/ticket-types/{id} (admin only: expect 403)', 'PATCH', '/api/ticket-types/999999', { body: { remaining: 0 }, test: status(403) }),
  ]),
  folder('Cart', [
    req('GET /api/cart', 'GET', '/api/cart', { test: `${status(200)}\npm.test('Empty cart', () => pm.expect(pm.response.json().items).to.eql([]));` }),
    add('POST /api/cart/items', 'quietStandardTt', 1, `${status(200)}\n${set(`${R}_line`, 'pm.response.json().items[0].id')}`),
    req('PATCH /api/cart/items/{id}', 'PATCH', `/api/cart/items/{{${R}_line}}`, {
      body: { quantity: 2 },
      test: `${status(200)}\npm.test('Quantity 2', () => pm.expect(pm.response.json().items[0].quantity).to.eql(2));`,
    }),
    req('POST /api/cart/discount', 'POST', '/api/cart/discount', { body: { code: 'WELCOME10' }, test: status(200) }),
  ]),
  folder('Orders', [
    checkout('POST /api/orders (checkout)', R, 'order', OK_CHECKOUT, status(200)),
    req('GET /api/orders', 'GET', '/api/orders', { test: status(200) }),
    req('GET /api/orders/{id}', 'GET', `/api/orders/{{${R}_order}}`, { test: `${status(200)}\npm.test('CONFIRMED', () => pm.expect(pm.response.json().status).to.eql('CONFIRMED'));` }),
    cancelOnce(R, 'order', 'POST /api/orders/{id}/cancel'),
  ]),
  folder('Profile', [
    req('GET /api/profile', 'GET', '/api/profile', { test: status(200) }),
    req('PATCH /api/profile', 'PATCH', '/api/profile', { body: { phone: '0987654321' }, test: status(200) }),
  ]),
  folder('Administration (customer: expect 403)', [
    req('GET /api/admin/orders', 'GET', '/api/admin/orders?status=CONFIRMED', { test: status(403) }),
    req('GET /api/admin/orders.csv', 'GET', '/api/admin/orders.csv', { test: status(403) }),
    req('DELETE /api/admin/orders/{id}', 'DELETE', '/api/admin/orders/999999', { test: status(403) }),
  ]),
  folder('Session end', [
    req('POST /api/profile/password', 'POST', '/api/profile/password', { body: '{\n  "currentPassword": "{{password}}",\n  "newPassword": "eventpass456"\n}', test: status(200) }),
    req('POST /api/auth/logout', 'POST', '/api/auth/logout', { test: status(200) }),
  ]),
], 'One request per documented operation (27, from /docs/json), in a working order with a fresh buyer. Admin routes are called as a customer with non-existent ids or unchanged data, so nothing on the shared site can change. The one order created is cancelled once.');

// ---------------------------------------------------------------- 02 Bug reproductions
const cartTotals = `const c = pm.response.json();`;
const B = [];

B.push(bugFolder('BUG-01', [
  ...buyer('b01', 'A', { first: true }),
  req('Read the event (keep its values)', 'GET', '/api/events/{{upcomingEventId}}', {
    test: `const e = pm.response.json();\n${set('b01_body', 'JSON.stringify({ slug: e.slug, title: e.title, venue: e.venue, startsAt: e.startsAt }, null, 2)')}\n${status(200)}`,
  }),
  req('PUT the same values back (an edit that changes nothing)', 'PUT', '/api/events/{{upcomingEventId}}', {
    body: '{{b01_body}}',
    test: t('BUG-01', 'Brief: a customer cannot edit an event (403)', '  pm.expect(pm.response.code).to.eql(403);'),
  }),
  req('Compare: POST /api/events from the same session', 'POST', '/api/events', { body: '{{b01_body}}', test: status(403) }),
  req('Compare: DELETE /api/events/999999', 'DELETE', '/api/events/999999', { test: status(403) }),
  req('Compare: GET /api/admin/orders', 'GET', '/api/admin/orders', { test: status(403) }),
], 'Safe on the shared site: the PUT sends the event\'s own current values.'));

B.push(bugFolder('BUG-02', [
  ...buyer('b02', 'A', { first: true }),
  add('A adds 1 Standard', 'upStandardTt', 1),
  checkout('A checks out', 'b02', 'order', OK_CHECKOUT, status(200)),
  ...buyer('b02', 'B'),
  req('B cancels A\'s order', 'POST', '/api/orders/{{b02_order}}/cancel', {
    test: `if (pm.response.code === 200) ${set('b02_order_cancelled', "'1'")}\n${t('BUG-02', 'Brief: B cannot cancel another customer\'s order (403 or 404)', '  pm.expect(pm.response.code).to.be.oneOf([403, 404]);')}`,
  }),
  login('b02', 'A'),
  req('A reads the order', 'GET', '/api/orders/{{b02_order}}', {
    test: `${status(200)}\n${t('BUG-02', 'A\'s order is still CONFIRMED', "  pm.expect(pm.response.json().status).to.eql('CONFIRMED');")}`,
  }),
  cancelOnce('b02', 'order'),
], 'Two fresh buyers. The clean-up is skipped when B\'s cancel went through, so the order is never cancelled twice.'));

B.push(bugFolder('BUG-03', [
  ...buyer('b03', 'A', { first: true }),
  add('A adds 1 Standard', 'upStandardTt', 1),
  checkout('A checks out', 'b03', 'order', OK_CHECKOUT, status(200)),
  ...buyer('b03', 'B'),
  req('B reads A\'s order', 'GET', '/api/orders/{{b03_order}}', {
    test: `${t('BUG-03', 'Brief: B cannot read another customer\'s order (403 or 404)', '  pm.expect(pm.response.code).to.be.oneOf([403, 404]);')}
      if (pm.response.code === 200) console.log('B sees recipient', pm.response.json().recipientName, pm.response.json().phone);`,
  }),
  login('b03', 'A'),
  cancelOnce('b03', 'order'),
]));

B.push(bugFolder('BUG-04', [
  ...buyer('b04', 'A', { first: true }),
  add('Add quantity 0', 'upStandardTt', 0, t('BUG-04', 'Brief: quantity 0 is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')),
  add('Add quantity -1', 'upStandardTt', -1, t('BUG-04', 'Brief: quantity -1 is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')),
  req('Read the cart', 'GET', '/api/cart', {
    test: `${cartTotals}\n${t('BUG-04', 'No line below 1 and total not negative', '  pm.expect(c.items.every((i) => i.quantity >= 1)).to.be.true;\n  pm.expect(c.total).to.be.at.least(0);')}`,
  }),
], 'No order is created.'));

const discountExpect = (id, n) => t(id, `After ${n} applies: one code and 10% of the Standard subtotal`, `  const c = pm.response.json();
  pm.expect(c.discountCode).to.eql('WELCOME10');
  pm.expect(c.discount).to.eql(Math.round(c.gross * 0.10));`);
B.push(bugFolder('BUG-05', [
  ...buyer('b05', 'A', { first: true }),
  add('Add 2 Standard', 'upStandardTt', 2),
  req('Apply WELCOME10 (first time)', 'POST', '/api/cart/discount', { body: { code: 'WELCOME10' }, test: `${status(200)}\n${discountExpect('BUG-05', 1)}` }),
  req('Apply WELCOME10 again', 'POST', '/api/cart/discount', { body: { code: 'WELCOME10' }, test: `pm.test('Refused or ignored', () => pm.expect(pm.response.code).to.be.oneOf([200, 400, 409]));` }),
  req('Apply WELCOME10 a third time', 'POST', '/api/cart/discount', { body: { code: 'WELCOME10' } }),
  req('Read the cart', 'GET', '/api/cart', { test: discountExpect('BUG-05', 3) }),
  checkout('Check out', 'b05', 'order', OK_CHECKOUT, t('BUG-05', 'The order carries one code and a single 10% discount', `  const o = pm.response.json();
  pm.expect(o.discountCode).to.eql('WELCOME10');
  pm.expect(o.discountAmount).to.eql(Math.round(o.grossAmount * 0.10));`)),
  cancelOnce('b05', 'order'),
]));

B.push(bugFolder('BUG-06', [
  ...buyer('b06', 'A', { first: true }),
  add('A adds 1 VIP', 'upVipTt', 1),
  req('A applies WELCOME10', 'POST', '/api/cart/discount', {
    body: { code: 'WELCOME10' },
    test: t('BUG-06', 'Brief: codes apply to Standard only, so a VIP-only cart gets discount 0', `  const c = pm.response.json();\n  pm.expect(c.discount).to.eql(0);\n  pm.expect(c.total).to.eql(Math.round(c.gross * 1.05));`),
  }),
  ...buyer('b06', 'B'),
  add('B adds 1 Student', 'upStudentTt', 1),
  req('B applies WELCOME10', 'POST', '/api/cart/discount', {
    body: { code: 'WELCOME10' },
    test: t('BUG-06', 'A Student-only cart also gets discount 0', '  pm.expect(pm.response.json().discount).to.eql(0);'),
  }),
], 'No order is created.'));

B.push(bugFolder('BUG-07', [
  ...buyer('b07', 'A', { first: true }),
  add('Add 2 Standard', 'upStandardTt', 2),
  req('Apply WELCOME10 and read the fee', 'POST', '/api/cart/discount', {
    body: { code: 'WELCOME10' },
    test: `${status(200)}\n${t('BUG-07', 'Brief: fee is 5% of (subtotal - discount), total = subtotal - discount + fee', `  const c = pm.response.json();
  const fee = Math.round((c.gross - c.discount) * 0.05);
  pm.expect(c.serviceFee).to.eql(fee);
  pm.expect(c.total).to.eql(c.gross - c.discount + fee);`)}`,
  }),
], 'API side of an API + UI bug; the cart screen shows the same numbers. No order is created.'));

B.push(bugFolder('BUG-08', [
  ...buyer('b08', 'A', { first: true }),
  add('Add 5 VIP in one add', 'upVipTt', 5, t('BUG-08', 'Brief: at most 4 VIP per order, so 5 is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')),
  req('Read the cart', 'GET', '/api/cart', {
    test: t('BUG-08', 'The cart holds at most 4 VIP', "  pm.expect(pm.response.json().items.filter((i) => i.ticketTypeName === 'VIP').reduce((s, i) => s + i.quantity, 0)).to.be.at.most(4);"),
  }),
  checkout('Check out', 'b08', 'order', OK_CHECKOUT, `pm.test('Checkout responded', () => pm.expect(pm.response.code).to.be.below(500));
      if (pm.response.code === 200) ${t('BUG-08', 'No order holds 5 VIP', "  pm.expect(pm.response.json().items.filter((i) => i.ticketTypeName === 'VIP').reduce((s, i) => s + i.quantity, 0)).to.be.at.most(4);")}`),
  cancelOnce('b08', 'order'),
]));

const pastBooking = (p, id) => [
  req('Read the past event', 'GET', '/api/events/{{pastEventId}}', { test: `pm.test('Status PAST', () => pm.expect(pm.response.json().status).to.eql('PAST'));` }),
  // In BUG-10 these two steps are only the set-up: no test here, so a fixed BUG-09 cannot turn red under BUG-10.
  add('Add 1 Standard of the past event', 'pastStandardTt', 1, id === 'BUG-09' ? t('BUG-09', 'Brief: past events cannot be booked, so the add is refused', '  pm.expect(pm.response.code).to.be.within(400, 499);') : `console.log('add', pm.response.code);`),
  checkout('Check out', p, 'order', OK_CHECKOUT, id === 'BUG-09' ? t('BUG-09', 'The checkout is refused', '  pm.expect(pm.response.code).to.be.within(400, 499);') : `console.log('checkout', pm.response.code, '(BUG-10 can only be shown while BUG-09 lets this through)');`),
];
B.push(bugFolder('BUG-09', [...buyer('b09', 'A', { first: true }), ...pastBooking('b09', 'BUG-09'), cancelOnce('b09', 'order')]));
B.push(bugFolder('BUG-10', [
  ...buyer('b10', 'A', { first: true }),
  ...pastBooking('b10', 'BUG-10'),
  req('Cancel the order (after the start)', 'POST', '/api/orders/{{b10_order}}/cancel', {
    pre: `if (!${v('b10_order')}) pm.execution.skipRequest(); // only reachable while BUG-09 exists`,
    test: `if (pm.response.code === 200) ${set('b10_order_cancelled', "'1'")}\n${t('BUG-10', 'Brief: cancelled after the start refunds 0%', '  pm.expect(pm.response.json().refundAmount).to.eql(0);')}`,
  }),
], 'Needs BUG-09 to create the order. The cancel is the reproduction, so there is no separate clean-up.'));

const remaining = (name, key) => req(name, 'GET', '/api/events/{{quietEventId}}', {
  test: `${set(`b11_${key}`, "pm.response.json().ticketTypes.find((x) => x.name === 'STANDARD').remaining")}\nconsole.log('${key}', ${v(`b11_${key}`)});`,
});
B.push(bugFolder('BUG-11', [
  ...buyer('b11', 'A', { first: true }),
  add('Add 1 Standard of the quiet event', 'quietStandardTt', 1),
  checkout('Check out', 'b11', 'order', OK_CHECKOUT, status(200)),
  remaining('Remaining after the purchase (R)', 'afterBuy'),
  req('Cancel the order', 'POST', '/api/orders/{{b11_order}}/cancel', { test: status(200) }),
  remaining('Remaining after one cancel (R + 1)', 'afterCancel'),
  req('Cancel the same order again', 'POST', '/api/orders/{{b11_order}}/cancel', {
    test: t('BUG-11', 'Brief: a cancelled order cannot be cancelled again (4xx)', '  pm.expect(pm.response.code).to.be.within(400, 499);'),
  }),
  req('Remaining after the second cancel', 'GET', '/api/events/{{quietEventId}}', {
    test: t('BUG-11', 'Stock is returned once: remaining unchanged by the second cancel', `  const now = pm.response.json().ticketTypes.find((x) => x.name === 'STANDARD').remaining;
  pm.expect(now).to.eql(Number(${v('b11_afterCancel')}));`),
  }),
], 'Side effect by design: while the bug exists, each run adds 1 Standard ticket to the quiet event\'s stock (test-plan.md, section 7). Other buyers can move the stock at the same moment, so a one-off difference is possible.'));

B.push(bugFolder('BUG-14', [
  ...buyer('b14', 'A', { first: true }),
  add('Add 1 Standard', 'upStandardTt', 1),
  checkout('Check out with a 51 character recipient name', 'b14', 'order', { recipientName: 'A'.repeat(51), phone: '0912345678' },
    `${t('BUG-14', 'Brief: at most 50 characters, so 51 is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')}
      if (pm.response.code === 200) console.log('stored name length', pm.response.json().recipientName.length);`),
  cancelOnce('b14', 'order'),
]));

B.push(bugFolder('BUG-15', [
  ...buyer('b15', 'A', { first: true }),
  add('Add 1 Standard', 'upStandardTt', 1),
  checkout('Check out with a 9 digit phone', 'b15', 'order1', { recipientName: 'QA Buyer', phone: '091234567' }, t('BUG-15', 'Brief: at least 10 digits, so 9 is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')),
  cancelOnce('b15', 'order1'),
  add('Add 1 Standard again', 'upStandardTt', 1),
  checkout('Check out with phone abcdefghij', 'b15', 'order2', { recipientName: 'QA Buyer', phone: 'abcdefghij' }, t('BUG-15', 'A phone with no digits is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')),
  cancelOnce('b15', 'order2'),
]));

B.push(bugFolder('BUG-16', [
  ...buyer('b16', 'A', { first: true }),
  add('Add 1 Standard', 'upStandardTt', 1),
  checkout('Check out with recipient name of spaces', 'b16', 'order', { recipientName: '   ', phone: '0912345678' }, t('BUG-16', 'A blank recipient name is refused (400)', '  pm.expect(pm.response.code).to.eql(400);')),
  cancelOnce('b16', 'order'),
]));

const malformed = (label, expr) => req(`Register ${label}`, 'POST', '/api/auth/register', {
  pre: set('b17_email', expr),
  body: '{\n  "email": "{{b17_email}}",\n  "password": "{{password}}"\n}',
  test: t('BUG-17', `Brief: a malformed email (${label}) is refused (400)`, '  pm.expect(pm.response.code).to.eql(400);'),
});
const rnd = `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)`;
B.push(bugFolder('BUG-17', [
  malformed('with no @ (not-an-email)', `'not-an-email-' + ${rnd}`),
  malformed('with two @ signs', `'qa-' + ${rnd} + '@@example.invalid'`),
  malformed('with no dot in the domain (a@b)', `'a' + ${rnd} + '@b'`),
], 'Each value carries a random part, so the check never meets an address created by an earlier run.'));

B.push(bugFolder('BUG-18', [
  req('Register with phone abcdefghij', 'POST', '/api/auth/register', {
    pre: `${reset('b18')}\n${set('b18_emailA', freshEmail)}`,
    body: '{\n  "email": "{{b18_emailA}}",\n  "password": "{{password}}",\n  "phone": "abcdefghij"\n}',
    test: t('BUG-18', 'Brief: phone must be 10 to 15 digits, so letters are refused at registration (400)', '  pm.expect(pm.response.code).to.eql(400);'),
  }),
  ...buyer('b18', 'B'),
  req('Change the profile phone to abcdefghij', 'PATCH', '/api/profile', {
    body: { phone: 'abcdefghij' },
    test: t('BUG-18', 'Letters are refused in the profile (400)', '  pm.expect(pm.response.code).to.eql(400);'),
  }),
]));

B.push(bugFolder('BUG-19', [
  register('b19', 'A', { first: true }),
  req('Register the same email with a leading space', 'POST', '/api/auth/register', {
    body: '{\n  "email": " {{b19_emailA}}",\n  "password": "{{password}}"\n}',
    test: t('BUG-19', 'Brief: one email, one account, so the second registration is refused (409 or 400)', '  pm.expect(pm.response.code).to.be.oneOf([400, 409]);'),
  }),
  req('Compare: the same email in upper case', 'POST', '/api/auth/register', {
    pre: `${set('b19_upper', `${v('b19_emailA')}.toUpperCase()`)}`,
    body: '{\n  "email": "{{b19_upper}}",\n  "password": "{{password}}"\n}',
    test: status(409),
  }),
]));

B.push(bugFolder('BUG-20', [
  ...buyer('b20', 'A', { first: true }),
  req('Change the password to the same password', 'POST', '/api/profile/password', {
    body: '{\n  "currentPassword": "{{password}}",\n  "newPassword": "{{password}}"\n}',
    test: t('BUG-20', 'Brief: the new password must differ, so the same one is refused (400)', '  pm.expect(pm.response.code).to.eql(400);'),
  }),
]));

const titles = `const titles = pm.response.json().items.map((e) => e.title);`;
B.push(bugFolder('BUG-21', [
  req('Search rock', 'GET', '/api/events?q=rock', { test: `${titles}\n${t('BUG-21', "Brief: 'rock' returns Hanoi Rock Fest", "  pm.expect(titles).to.include('Hanoi Rock Fest');")}` }),
  req('Search fest', 'GET', '/api/events?q=fest', { test: `${titles}\n${t('BUG-21', "'fest' (end of the name) also returns Hanoi Rock Fest", "  pm.expect(titles).to.include('Hanoi Rock Fest');")}` }),
  req('Compare: search hanoi rock', 'GET', '/api/events?q=hanoi%20rock', { test: `${titles}\npm.test('Start of the name matches', () => pm.expect(titles).to.include('Hanoi Rock Fest'));` }),
], 'API side of an API + UI bug. Read only.'));

B.push(bugFolder('BUG-22', [
  req('Search %', 'GET', '/api/events?q=%25', { test: t('BUG-22', "No title contains '%', so 0 results", '  pm.expect(pm.response.json().total).to.eql(0);') }),
  req('Search _', 'GET', '/api/events?q=_', { test: t('BUG-22', "No title contains '_', so 0 results", '  pm.expect(pm.response.json().total).to.eql(0);') }),
], 'Read only.'));

B.push(bugFolder('BUG-23', [
  req('Every event, to sort them here', 'GET', '/api/events?pageSize=100', {
    test: `const sorted = pm.response.json().items.map((e) => e.title).sort((a, b) => a.localeCompare(b, 'en'));
      ${set('b23_first', 'sorted[0]')}
      console.log('first title of the whole list:', sorted[0]);`,
  }),
  req('Sort by name, page 1', 'GET', '/api/events?sort=title&page=1', {
    test: t('BUG-23', 'Brief: page 1 opens with the first title of the whole sorted list', `  pm.expect(pm.response.json().items[0].title).to.eql(${v('b23_first')});`),
  }),
  req('Sort by name, page 2', 'GET', '/api/events?sort=title&page=2', { test: `console.log('page 2 opens with', pm.response.json().items[0].title);` }),
], 'API side of an API + UI bug. Read only.'));

B.push(bugFolder('BUG-24', [
  req('Page through the default list', 'GET', '/api/events?page={{b24_page}}', {
    pre: `if (!${v('b24_page')}) { ${set('b24_page', '1')} ${set('b24_ids', "'[]'")} }`,
    test: `const r = pm.response.json();
      const ids = JSON.parse(${v('b24_ids')}).concat(r.items.map((e) => e.id));
      const page = Number(${v('b24_page')});
      if (page < Math.ceil(r.total / r.pageSize)) {
        ${set('b24_ids', 'JSON.stringify(ids)')} ${set('b24_page', 'String(page + 1)')}
        postman.setNextRequest(pm.info.requestName); // runner: fetch the next page; by hand: press Send again
      } else {
        ${t('BUG-24', 'Brief: each event appears exactly once across all pages', '  pm.expect(new Set(ids).size, \'distinct ids\').to.eql(ids.length);\n  pm.expect(ids.length, \'rows\').to.eql(r.total);').split('\n').join('\n        ')}
        pm.collectionVariables.unset('b24_page'); pm.collectionVariables.unset('b24_ids');
      }`,
  }),
], 'API side of an API + UI bug. Read only. In the runner the request repeats itself for every page; when sending by hand, press Send once per page (3 pages for 23 events), the test runs on the last page.'));

// ---------------------------------------------------------------- 03 Slow (real waits)
const slow = folder('03 Slow bugs (manual waits)', [
  bugFolder('BUG-12', [
    ...buyer('b12', 'A', { first: true }),
    add('Step 1: add 1 Standard of the quiet event (note holdExpiresAt)', 'quietStandardTt', 1, `${status(200)}\nconsole.log('holdExpiresAt', pm.response.json().holdExpiresAt);`),
    checkout('Step 2, 11 minutes later: check out', 'b12', 'order', OK_CHECKOUT, t('BUG-12', 'Brief: after the 10 minute hold the checkout is refused until the cart is refreshed', '  pm.expect(pm.response.code).to.be.within(400, 499);')),
    cancelOnce('b12', 'order'),
  ], 'Send step 1, wait 11 minutes without touching the cart, then send step 2 and the clean-up. Not for an unattended run.'),
  bugFolder('BUG-13', [
    ...buyer('b13', 'A', { first: true }),
    req('Step 1: GET /api/auth/me now', 'GET', '/api/auth/me', { test: `${status(200)}\nconsole.log('logged in at', new Date().toISOString());` }),
    req('Step 2, 31 minutes later: GET /api/auth/me', 'GET', '/api/auth/me', { test: t('BUG-13', 'Brief: the session expires after 30 minutes (401)', '  pm.expect(pm.response.code).to.eql(401);') }),
    req('Step 2, 31 minutes later: GET /api/cart', 'GET', '/api/cart', { test: t('BUG-13', 'A login-only action needs a fresh login (401)', '  pm.expect(pm.response.code).to.eql(401);') }),
  ], 'Log in and send step 1, wait 31 minutes without logging in again, then send both step 2 requests. Not for an unattended run.'),
], 'These two bugs need real waits of 11 and 31 minutes, so they are kept out of the normal run.');

const collection = {
  info: {
    name: 'Event Booking QA: API reference and bug reproductions',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: `Manual API testing for the Event Booking assessment (candidate-01).

**How to use:** import this collection and \`event-booking.postman_environment.json\`, pick the environment, run **00 Setup** once, then any folder. Every folder registers its own fresh buyers at \`@example.invalid\` (a reserved domain that never delivers mail), so folders do not depend on each other.

**Reading the results:** tests assert what the brief requires. A red test named \`[BUG-xx]\` means that bug is still present; the ids and titles match \`bugs.md\`. Every other test should be green. BUG-07, BUG-21, BUG-23 and BUG-24 are API + UI bugs: only their API side is here. UI-only bugs (BUG-25 to BUG-37) are not API reproducible.

**Shared site safety:** admin routes are called with unchanged data or non-existent ids. Every order a folder creates is cancelled exactly once, except in BUG-11, whose double cancel is the bug (it adds 1 ticket to the quiet event's stock per run while the bug exists).`,
  },
  item: [setup, reference, folder('02 Bug reproductions', B, 'One folder per API bug, BUG-01 to BUG-24 (BUG-12 and BUG-13 are in 03). Each folder can run on its own after 00 Setup.'), slow],
  variable: [],
};
const environment = {
  name: 'Event Booking candidate-01',
  values: [
    { key: 'baseUrl', value: 'https://candidate-01.207.148.118.135.sslip.io', type: 'default', enabled: true },
    { key: 'password', value: 'eventpass123', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};
fs.mkdirSync('postman', { recursive: true });
fs.writeFileSync(path.join('postman', 'event-booking.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join('postman', 'event-booking.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
const count = (items) => items.reduce((n, i) => n + (i.item ? count(i.item) : 1), 0);
console.log(`postman: ${count(collection.item)} requests, ${B.length + 2} bug folders`);
