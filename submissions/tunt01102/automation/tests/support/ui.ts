import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** '₫1,234,000' or '1234000' or '-₫5,000' -> number. */
export async function money(locator: Locator): Promise<number> {
  const text = (await locator.innerText()).trim();
  const digits = text.replace(/[^\d-]/g, '');
  expect(digits, `money text "${text}"`).toMatch(/^-?\d+$/);
  return Number(digits);
}

export async function openEvent(page: Page, eventId: number) {
  await page.goto(`/events/${eventId}`);
  await expect(page.getByTestId('event-detail-title')).toBeVisible();
}

export async function addTicketViaUi(page: Page, type: 'STANDARD' | 'VIP' | 'STUDENT', qty: number) {
  await page.getByTestId(`event-detail-ticket-${type}-qty`).fill(String(qty));
  await page.getByTestId(`event-detail-ticket-${type}-add-button`).click();
}

/** Result of checking one form field against REQ-UI-02. */
export interface LabelCheck { page: string; field: string; hasVisibleLabel: boolean; labelFocusesField: boolean; }

/** For every visible form field: does it have a visible <label>, and does clicking that label focus the field? */
export async function checkLabels(page: Page, pageName: string): Promise<LabelCheck[]> {
  const fields = page.locator('input:visible, select:visible, textarea:visible');
  const count = await fields.count();
  const out: LabelCheck[] = [];
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    const name = (await field.getAttribute('data-testid')) ?? (await field.getAttribute('name')) ?? `field#${i}`;
    const labelHandle = await field.evaluateHandle((el: any) => (el.labels && el.labels[0]) || null);
    const label = labelHandle.asElement();
    let hasVisibleLabel = false;
    let focuses = false;
    if (label) {
      hasVisibleLabel = await label.isVisible();
      if (hasVisibleLabel) {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // no stray click on a header link
        const box = await label.boundingBox();
        // Click the label's own text area (top-left corner), not the nested control.
        if (box) await page.mouse.click(box.x + 3, box.y + 3);
        focuses = await field.evaluate((el) => document.activeElement === el);
      }
    }
    out.push({ page: pageName, field: name, hasVisibleLabel, labelFocusesField: focuses });
  }
  return out;
}
