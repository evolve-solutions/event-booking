import { EVENTS, VALID_PHONE, VALID_RECIPIENT, newBuyer } from '../../../src/data/factory';
import { expectedOrder, showsVnDate, showsVnTime, type EventSummary } from '../../../src/spec/listing';
import { expectedTotals } from '../../../src/spec/pricing';
import { bug, expect, linesOf, signInBrowser, test, ticketTypes, tc } from '../../support/fixtures';
import { addTicketViaUi, checkLabels, money, openEvent, type LabelCheck } from '../../support/ui';

test.describe('Phone screens (360 px) @regression', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test(tc('TC-UI-01', 'a buyer can reach quantity and Add without scrolling sideways'), bug('BUG-25'), async ({ page, context, buyer }) => {
    await signInBrowser(context, buyer.api);
    await openEvent(page, EVENTS.upcoming.id);
    for (const id of ['event-detail-ticket-STANDARD-qty', 'event-detail-ticket-STANDARD-add-button']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, `${id} is rendered`).not.toBeNull();
      expect(box!.x, `${id} left edge`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${id} right edge must be within 360 px`).toBeLessThanOrEqual(360);
    }
    await page.getByTestId('event-detail-ticket-STANDARD-add-button').click({ trial: true, timeout: 3_000 });
  });

  test(tc('TC-UI-02', 'no buyer screen scrolls sideways'), bug('BUG-26'), async ({ page, context }) => {
    // A common real-world shape (name + digits, no hyphen to wrap at). Short hyphenated test emails hide the defect.
    const buyer = await newBuyer(undefined, undefined, `nguyenvananh${Date.now()}@example.invalid`);
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    await signInBrowser(context, buyer.api);
    const widths: Record<string, number> = {};
    for (const [path, ready] of [
      ['/', 'events-title'], [`/events/${EVENTS.upcoming.id}`, 'event-detail-title'], ['/cart', 'cart-title'],
      ['/checkout', 'checkout-title'], ['/my-orders', 'my-orders-title'], ['/profile', 'profile-title'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByTestId(ready)).toBeVisible();
      await page.waitForLoadState('networkidle');
      if (path === '/profile') await expect(page.getByTestId('profile-email')).toHaveText(buyer.email); // measure the loaded screen, not the skeleton
      // Compare with the device width, not innerWidth: a mobile browser widens its layout viewport to fit overflow.
      widths[path] = await page.evaluate(() => document.documentElement.scrollWidth);
    }
    const tooWide = Object.entries(widths).filter(([, w]) => w > 360);
    expect(tooWide, `scrollWidth per screen: ${JSON.stringify(widths)}`).toEqual([]);
  });
});

test.describe('Forms and messages @regression', () => {
  test(tc('TC-UI-03', 'clicking each form label focuses its field'), bug('BUG-28', 'BUG-29'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const results: LabelCheck[] = [];
    await page.goto('/login');
    await expect(page.getByTestId('auth-title')).toBeVisible();
    results.push(...(await checkLabels(page, '/login')));
    await page.getByTestId('auth-tab-register').click();
    results.push(...(await checkLabels(page, '/login (register)')));
    await signInBrowser(context, buyer.api);
    for (const [path, ready] of [['/', 'events-title'], ['/cart', 'cart-title'], ['/checkout', 'checkout-title'], ['/profile', 'profile-title']] as const) {
      await page.goto(path);
      await expect(page.getByTestId(ready)).toBeVisible();
      await page.waitForLoadState('networkidle');
      results.push(...(await checkLabels(page, path)));
    }
    expect(results.length, 'fields were found, so an empty page cannot pass').toBeGreaterThan(8);
    const broken = results.filter((r) => !r.hasVisibleLabel || !r.labelFocusesField);
    test.info().annotations.push({ type: 'label-audit', description: JSON.stringify(results) });
    expect(broken).toEqual([]);
  });

  test(tc('TC-UI-09', 'event detail message reflects the latest add'), bug('BUG-33'), async ({ page, context, buyer }) => {
    await signInBrowser(context, buyer.api);
    await openEvent(page, EVENTS.upcoming.id);
    await addTicketViaUi(page, 'VIP', 6);
    await expect(page.getByTestId('event-detail-error')).toBeVisible();
    await addTicketViaUi(page, 'STANDARD', 1);
    await expect(page.getByTestId('event-detail-message')).toBeVisible();
    await expect(page.getByTestId('event-detail-error')).toHaveCount(0);
    // And the other way round: a failure after a success must not leave the success message up.
    await addTicketViaUi(page, 'VIP', 6);
    await expect(page.getByTestId('event-detail-error')).toBeVisible();
    await expect(page.getByTestId('event-detail-message'), 'stale "Added to cart" after a failed add').toHaveCount(0);
  });

  test(tc('TC-DISC-12', 'applying WELCOME10 in the cart shows the code and the discount line'), bug('BUG-07'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 2);
    await signInBrowser(context, buyer.api);
    await page.goto('/cart');
    await page.getByTestId('cart-discount-input').fill('WELCOME10');
    await page.getByTestId('cart-apply-discount-button').click();
    await expect(page.getByTestId('cart-discount-code')).toContainText('WELCOME10');
    const want = expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 2 }], 'WELCOME10');
    expect(await money(page.getByTestId('cart-discount'))).toBe(want.discount);
    expect(await money(page.getByTestId('cart-service-fee'))).toBe(want.serviceFee);
    expect(await money(page.getByTestId('cart-total'))).toBe(want.total);
  });

  test(tc('TC-DISC-13', 'after a refused code, a valid code leaves no stale error'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    await signInBrowser(context, buyer.api);
    await page.goto('/cart');
    await page.getByTestId('cart-discount-input').fill('NOPE99');
    await page.getByTestId('cart-apply-discount-button').click();
    await expect(page.getByTestId('cart-error')).toBeVisible();
    await page.getByTestId('cart-discount-input').fill('WELCOME10');
    await page.getByTestId('cart-apply-discount-button').click();
    await expect(page.getByTestId('cart-discount-code')).toContainText('WELCOME10');
    await expect(page.getByTestId('cart-error')).toHaveCount(0);
  });

  test(tc('TC-UI-10', 'cancel from My Orders shows CANCELLED and the refund'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const o = (await buyer.api.checkout({ recipientName: VALID_RECIPIENT, phone: VALID_PHONE })).body;
    await signInBrowser(context, buyer.api);
    const event = (await buyer.api.getEvent(EVENTS.upcoming2.id)).body;
    expect(new Date(event.startsAt).getTime() - Date.now(), 'precondition: more than 24 h to the start').toBeGreaterThan(24 * 3_600_000);
    page.on('dialog', (d) => d.accept());
    await page.goto('/my-orders');
    await page.getByTestId(`my-orders-cancel-button-${o.id}`).click();
    await expect(page.getByTestId(`my-orders-status-${o.id}`)).toHaveText('CANCELLED');
    expect(await money(page.getByTestId(`my-orders-refund-${o.id}`))).toBe(o.totalAmount);
  });
});

test.describe('Order confirmation @regression', () => {
  test(tc('TC-UI-13', 'confirmation shows every amount in the same currency format'), bug('BUG-30'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const o = (await buyer.api.checkout({ recipientName: VALID_RECIPIENT, phone: VALID_PHONE })).body;
    await signInBrowser(context, buyer.api);
    await page.goto(`/orders/${o.id}/confirm`);
    await expect(page.getByTestId('order-confirm-status')).toHaveText('CONFIRMED');
    const fee = (await page.getByTestId('order-confirm-service-fee').innerText()).trim();
    const total = (await page.getByTestId('order-confirm-total').innerText()).trim();
    expect(fee, 'reference line is currency formatted').toMatch(/^₫[\d,]+$/);
    expect(total, 'total uses the same format as the other lines').toMatch(/^₫[\d,]+$/);
  });
});

test.describe('Time zone @regression', () => {
  test(tc('TC-UI-04', 'event detail shows the start in Vietnam time'), bug('BUG-27'), async ({ page, anon }) => {
    const e = (await anon.getEvent(EVENTS.upcoming.id)).body;
    await openEvent(page, EVENTS.upcoming.id);
    const text = await page.getByTestId('event-detail-starts').innerText();
    expect(showsVnDate(text, e.startsAt), `"${text}" should show the Vietnam date of ${e.startsAt}`).toBe(true);
    expect(showsVnTime(text, e.startsAt), `"${text}" should show the Vietnam time of ${e.startsAt}`).toBe(true);
  });

  test(tc('TC-UI-05', 'event list shows starts in Vietnam time'), async ({ page, anon }) => {
    const items: EventSummary[] = (await anon.listEvents()).body.items;
    await page.goto('/');
    for (const e of items) {
      const text = await page.getByTestId(`events-item-starts-${e.id}`).innerText();
      expect(showsVnDate(text, e.startsAt) && showsVnTime(text, e.startsAt), `${e.title}: "${text}" vs ${e.startsAt}`).toBe(true);
    }
  });

  test(tc('TC-UI-11', 'cart shows the hold expiry in Vietnam time'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const c = (await buyer.api.addToCart(STANDARD.id, 1)).body;
    await signInBrowser(context, buyer.api);
    await page.goto('/cart');
    const text = await page.getByTestId('cart-hold-expires').innerText();
    expect(showsVnTime(text, c.holdExpiresAt), `"${text}" vs ${c.holdExpiresAt}`).toBe(true);
  });
});

test.describe('Search, sort and paging @regression', () => {
  test(tc('TC-UI-06', 'search "rock" shows Hanoi Rock Fest'), bug('BUG-21'), async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('events-search-input').fill('rock');
    await page.getByTestId('events-search-button').click();
    await expect(page.locator('[data-testid^="events-item-title-"]').filter({ hasText: 'Hanoi Rock Fest' })).toHaveCount(1);
  });

  test(tc('TC-UI-07', 'sort by name opens with the first event alphabetically'), bug('BUG-23'), async ({ page, anon }) => {
    const all: EventSummary[] = (await anon.listEvents({ pageSize: 100 })).body.items;
    await page.goto('/');
    await expect(page.locator('[data-testid^="events-item-title-"]')).toHaveCount(10);
    // The default list can already open with the right title, so wait for the sorted response itself
    // and compare the whole page, not just its first card.
    const sorted = page.waitForResponse((r) => r.url().includes('/api/events') && r.url().includes('sort=title'));
    await page.getByTestId('events-sort-select').selectOption('title');
    await sorted;
    const want = expectedOrder(all, 'title').slice(0, 10).map((e) => e.title);
    await expect(page.locator('[data-testid^="events-item-title-"]')).toHaveText(want);
  });

  test(tc('TC-UI-12', 'paging shows each event once'), bug('BUG-24'), async ({ page, anon }) => {
    const total = (await anon.listEvents()).body.total;
    await page.goto('/');
    const titles: string[] = [];
    for (let p = 1; p <= Math.ceil(total / 10); p++) {
      await expect(page.getByTestId('events-page')).toHaveText(String(p));
      const cards = page.locator('[data-testid^="events-item-title-"]');
      await expect(cards.first()).toBeVisible();
      const onPage = await cards.allInnerTexts();
      titles.push(...onPage);
      if (p < Math.ceil(total / 10)) {
        await page.getByTestId('events-next-button').click();
        // Wait for the list itself to change, not only the page number, before reading the next page.
        await expect(cards.first()).not.toHaveText(onPage[0]);
      }
    }
    const repeats = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(repeats).toEqual([]);
    expect(titles).toHaveLength(total);
  });

  test(tc('TC-UI-08', 'past event shows Past and offers no Add button'), async ({ page }) => {
    await openEvent(page, EVENTS.past.id);
    // Positive anchor first: the three ticket rows have rendered, so "no Add button" is about them.
    for (const t of ['STANDARD', 'STUDENT', 'VIP']) await expect(page.getByTestId(`event-detail-ticket-${t}`)).toBeVisible();
    await expect(page.locator('[data-testid$="-past"]')).toHaveCount(3);
    await expect(page.locator('[data-testid$="-add-button"]')).toHaveCount(0);
  });
});

test.describe('Administration in the UI @regression', () => {
  test(tc('TC-ADM-09', 'a customer sees no admin navigation and cannot use admin screens'), bug('BUG-31'), async ({ page, context, buyer }) => {
    await signInBrowser(context, buyer.api);
    await page.goto('/');
    await expect(page.getByTestId('nav-user-email')).toBeVisible();
    await expect(page.getByTestId('nav-admin-orders-link')).toHaveCount(0);
    await expect(page.getByTestId('nav-admin-events-link')).toHaveCount(0);
    await page.goto('/admin/orders');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main, #root').first()).not.toBeEmpty(); // the route rendered something before we look for absence
    await expect(page.locator('[data-testid^="admin-orders-row-"]')).toHaveCount(0);
    await page.goto('/admin/events');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main, #root').first()).not.toBeEmpty();
    await expect(page.getByTestId('admin-events-create-button')).toHaveCount(0);
    await expect(page.locator('[data-testid^="admin-events-delete-button-"]')).toHaveCount(0);
  });
});

test.describe('Cart, orders and navigation details @regression', () => {
  test(tc('TC-UI-14', 'Next is disabled on the last page of the event list'), bug('BUG-32'), async ({ page, anon }) => {
    const total = (await anon.listEvents()).body.total;
    const pages = Math.ceil(total / 10);
    await page.goto('/');
    const cards = page.locator('[data-testid^="events-item-title-"]');
    for (let p = 1; p < pages; p++) {
      await expect(cards.first()).toBeVisible();
      const first = await cards.first().innerText();
      await page.getByTestId('events-next-button').click();
      await expect(cards.first()).not.toHaveText(first);
    }
    await expect(page.getByTestId('events-page')).toHaveText(String(pages));
    await expect(page.getByTestId('events-next-button')).toBeDisabled();
  });

  test(tc('TC-UI-15', 'removing the last cart line resets the totals on screen'), bug('BUG-34'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    await signInBrowser(context, buyer.api);
    await page.goto('/cart');
    const qty = page.locator('[data-testid^="cart-item-qty-"]').first();
    await expect(qty).toBeVisible();
    const patched = page.waitForResponse((r) => r.url().includes('/api/cart/items/') && r.request().method() === 'PATCH');
    await qty.fill('0');
    await qty.press('Tab');
    await patched;
    await expect(page.getByTestId('cart-empty')).toBeVisible();
    const total = page.getByTestId('cart-total');
    if (await total.count()) expect(await money(total), 'total still shown after the cart emptied').toBe(0);
  });

  test(tc('TC-UI-16', 'each cart line shows its ticket type'), bug('BUG-35'), async ({ page, context, buyer }) => {
    const { STANDARD, VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    await buyer.api.addToCart(VIP.id, 1);
    await signInBrowser(context, buyer.api);
    await page.goto('/cart');
    const names = page.locator('[data-testid^="cart-item-name-"]');
    await expect(names).toHaveCount(2);
    for (const el of await names.all()) {
      const clipped = await el.evaluate((e) => e.scrollWidth > e.clientWidth);
      expect.soft(clipped, `line name "${await el.textContent()}" is clipped on screen`).toBe(false);
    }
    const visible = await names.evaluateAll((els) => els.map((e) => (e.scrollWidth > e.clientWidth ? null : e.textContent)));
    expect(new Set(visible).size, 'the two lines must be told apart by what is visible').toBe(2);
  });

  test(tc('TC-UI-17', 'a cancelled order offers no Cancel button'), bug('BUG-36'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const o = (await buyer.api.checkout({ recipientName: VALID_RECIPIENT, phone: VALID_PHONE })).body;
    expect((await buyer.api.cancelOrder(o.id)).status).toBe(200);
    await signInBrowser(context, buyer.api);
    await page.goto('/my-orders');
    await expect(page.getByTestId(`my-orders-status-${o.id}`)).toHaveText('CANCELLED');
    await expect(page.getByTestId(`my-orders-cancel-button-${o.id}`)).toHaveCount(0);
  });
});

test.describe('Phone navigation (360 px) @regression', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test(tc('TC-UI-18', 'the menu links can be tapped'), bug('BUG-37'), async ({ page, context, buyer }) => {
    await signInBrowser(context, buyer.api);
    await openEvent(page, EVENTS.upcoming.id);
    await page.evaluate(() => window.scrollBy(0, 400)); // mouse.wheel is not supported in mobile WebKit
    await page.getByTestId('nav-menu-button').click();
    const hidden: string[] = [];
    for (const id of ['nav-cart-link', 'nav-my-orders-link', 'nav-profile-link']) {
      const link = page.getByTestId(id);
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      const onTop = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid'), [box.x + box.width / 2, box.y + box.height / 2] as const);
      if (onTop !== id) hidden.push(`${id} is covered by ${onTop}`);
    }
    expect(hidden).toEqual([]);
  });
  test(tc('TC-UI-19', 'logged out, Log in in the menu can be tapped'), bug('BUG-37'), async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('events-title')).toBeVisible();
    await page.getByTestId('nav-menu-button').click();
    const link = page.getByTestId('nav-login-link');
    await expect(link).toBeVisible();
    const box = (await link.boundingBox())!;
    const onTop = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid'), [box.x + box.width / 2, box.y + box.height / 2] as const);
    expect(onTop, 'element on top of Log in').toBe('nav-login-link');
  });
});
