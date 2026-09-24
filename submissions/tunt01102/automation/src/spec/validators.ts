// Executable form of the input rules in round-1-brief.md (Accounts, Booking rules).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** REQ-ACC-01 */
export function isWellFormedEmail(email: string): boolean {
  return EMAIL.test(email);
}

/** REQ-ACC-02 */
export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

/** REQ-ACC-03, REQ-ACC-07: optional; when given, 10 to 15 digits and nothing else. */
export function isValidAccountPhone(phone: string | null | undefined): boolean {
  if (phone === undefined || phone === null) return true;
  return /^\d{10,15}$/.test(phone);
}

/** REQ-ACC-08 */
export function isValidNewPassword(current: string, next: string): boolean {
  return isValidPassword(next) && next !== current;
}

/** REQ-BOOK-04, GAP-07: 1 to 50 characters, not blank. */
export function isValidRecipient(name: string): boolean {
  return name.trim().length > 0 && name.length <= 50;
}

/** REQ-BOOK-05: at least 10 digits, digits only. */
export function isValidCheckoutPhone(phone: string): boolean {
  return /^\d{10,}$/.test(phone);
}

/** REQ-BOOK-01 */
export function isValidQuantity(quantity: unknown): boolean {
  return typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1;
}

/** REQ-BOOK-06: any non-blank value is accepted; the value itself is not validated. */
export function isValidStudentCard(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Normalises an email the way "one email, one account" has to (REQ-ACC-04). */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}
