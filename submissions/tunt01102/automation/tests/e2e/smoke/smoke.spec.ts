import { DEFAULT_PASSWORD, EVENTS, VALID_PHONE, VALID_RECIPIENT, uniqueEmail } from '../../../src/data/factory';
import { expectedTotals } from '../../../src/spec/pricing';
import { expect, signInBrowser, test, ticketTypes, tc } from '../../support/fixtures';
import { addTicketViaUi, money, openEvent } from '../../support/ui';

// Smoke: the shortest path a buyer takes. Any red here blocks everything else.
test.describe('Smoke @smoke', () => {
  test(tc('TC-SMK-01', 'the event list loads'), async ({ page, anon }) => {
    const total = (await anon.listEvents()).body.total;
    await page.goto('/');
    await expect(page.locator('[data-testid^="events-item-title-"]')).toHaveCount(10);
    await expect(page.getByTestId('events-total')).toContainText(String(total));
    await expect(page.getByTestId(`events-item-past-${EVENTS.past.id}`)).toContainText('Past');
  });

  test(tc('TC-SMK-02', 'an event detail shows the three ticket types'), async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(`events-item-link-${EVENTS.upcoming.id}`).click();
    await expect(page.getByTestId('event-detail-title')).toHaveText(EVENTS.upcoming.title);
    for (const t of ['STANDARD', 'STUDENT', 'VIP']) {
      await expect(page.getByTestId(`event-detail-ticket-${t}`)).toBeVisible();
      expect(await money(page.getByTestId(`event-detail-ticket-${t}-price`))).toBeGreaterThan(0);
    }
  });

  test(tc('TC-SMK-03', 'register through the UI'), async ({ page }) => {
    const email = uniqueEmail('qa-ui');
    await page.goto('/login');
    await page.getByTestId('auth-tab-register').click();
    await page.getByTestId('auth-email-input').fill(email);
    await page.getByTestId('auth-password-input').fill(DEFAULT_PASSWORD);
    await page.getByTestId('auth-submit-button').click();
    await expect(page.getByTestId('nav-user-email')).toHaveText(email);
  });

  test(tc('TC-SMK-04', 'log in through the UI'), async ({ page, buyer }) => {
    await page.goto('/login');
    await page.getByTestId('auth-tab-login').click();
    await page.getByTestId('auth-email-input').fill(buyer.email);
    await page.getByTestId('auth-password-input').fill(buyer.password);
    await page.getByTestId('auth-submit-button').click();
    await expect(page.getByTestId('nav-user-email')).toHaveText(buyer.email);
  });

  test(tc('TC-SMK-05', 'add a Standard ticket and see it priced in the cart'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    await signInBrowser(context, buyer.api);
    await openEvent(page, EVENTS.upcoming2.id);
    await addTicketViaUi(page, 'STANDARD', 1);
    await expect(page.getByTestId('event-detail-message')).toBeVisible();
    await page.goto('/cart');
    await expect(page.locator('[data-testid^="cart-item-name-"]')).toHaveCount(1);
    const want = expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 1 }]);
    expect(await money(page.getByTestId('cart-service-fee'))).toBe(want.serviceFee);
    expect(await money(page.getByTestId('cart-total'))).toBe(want.total);
  });

  test(tc('TC-SMK-06', 'check out through the UI and see the confirmation'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    await signInBrowser(context, buyer.api);
    await page.goto('/checkout');
    await page.getByTestId('checkout-recipient-input').fill(VALID_RECIPIENT);
    await page.getByTestId('checkout-phone-input').fill(VALID_PHONE);
    await page.getByTestId('checkout-pay-button').click();
    await expect(page).toHaveURL(/\/orders\/\d+\/confirm$/);
    await expect(page.getByTestId('order-confirm-status')).toHaveText('CONFIRMED');
    expect(await money(page.getByTestId('order-confirm-id'))).toBeGreaterThan(0);
    const want = expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 1 }]);
    expect(await money(page.getByTestId('order-confirm-total'))).toBe(want.total);
    expect(await money(page.getByTestId('order-confirm-service-fee'))).toBe(want.serviceFee);
  });

  test(tc('TC-SMK-07', 'my orders shows the new order'), async ({ page, context, buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const o = (await buyer.api.checkout({ recipientName: VALID_RECIPIENT, phone: VALID_PHONE })).body;
    await signInBrowser(context, buyer.api);
    await page.goto('/my-orders');
    await expect(page.getByTestId(`my-orders-status-${o.id}`)).toHaveText('CONFIRMED');
    expect(await money(page.getByTestId(`my-orders-total-${o.id}`))).toBe(o.totalAmount);
  });
});
