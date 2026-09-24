import { describe, expect, it } from 'vitest';
import {
  canonicalEmail,
  isValidAccountPhone,
  isValidCheckoutPhone,
  isValidNewPassword,
  isValidPassword,
  isValidQuantity,
  isValidRecipient,
  isValidStudentCard,
  isWellFormedEmail,
} from '../../src/spec/validators';

describe('isWellFormedEmail (REQ-ACC-01)', () => {
  it.each(['meadow-60b5@example.invalid', 'a.b+c@d.co'])('accepts %s', (e) => expect(isWellFormedEmail(e)).toBe(true));
  it.each(['not-an-email', 'a@b', 'qa@@example.invalid', ' qa@example.invalid', 'qa@exa mple.com', ''])('rejects %j', (e) =>
    expect(isWellFormedEmail(e)).toBe(false),
  );
});

describe('isValidPassword (REQ-ACC-02)', () => {
  it('draws the line at 8 characters', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
  });
});

describe('isValidAccountPhone (REQ-ACC-03)', () => {
  it('is optional', () => {
    expect(isValidAccountPhone(undefined)).toBe(true);
    expect(isValidAccountPhone(null)).toBe(true);
  });
  it('accepts 10 to 15 digits only', () => {
    expect(isValidAccountPhone('091234567')).toBe(false);
    expect(isValidAccountPhone('0912345678')).toBe(true);
    expect(isValidAccountPhone('123456789012345')).toBe(true);
    expect(isValidAccountPhone('1234567890123456')).toBe(false);
    expect(isValidAccountPhone('abcdefghij')).toBe(false);
    expect(isValidAccountPhone('091-234-5678')).toBe(false);
  });
});

describe('isValidNewPassword (REQ-ACC-08)', () => {
  it('refuses the current password and short passwords', () => {
    expect(isValidNewPassword('eventpass123', 'eventpass123')).toBe(false);
    expect(isValidNewPassword('eventpass123', 'short')).toBe(false);
    expect(isValidNewPassword('eventpass123', 'newpass1234')).toBe(true);
  });
});

describe('isValidRecipient (REQ-BOOK-04)', () => {
  it('accepts 1 to 50 characters that are not blank', () => {
    expect(isValidRecipient('A')).toBe(true);
    expect(isValidRecipient('A'.repeat(50))).toBe(true);
    expect(isValidRecipient('A'.repeat(51))).toBe(false);
    expect(isValidRecipient('   ')).toBe(false);
    expect(isValidRecipient('')).toBe(false);
  });
});

describe('isValidCheckoutPhone (REQ-BOOK-05)', () => {
  it('needs at least 10 digits and nothing else', () => {
    expect(isValidCheckoutPhone('091234567')).toBe(false);
    expect(isValidCheckoutPhone('0912345678')).toBe(true);
    expect(isValidCheckoutPhone('09123456789012345')).toBe(true);
    expect(isValidCheckoutPhone('abcdefghij')).toBe(false);
  });
});

describe('isValidQuantity (REQ-BOOK-01)', () => {
  it.each([1, 2, 100])('accepts %d', (q) => expect(isValidQuantity(q)).toBe(true));
  it.each([0, -1, 1.5, '2', null, undefined, Number.NaN])('rejects %j', (q) => expect(isValidQuantity(q)).toBe(false));
});

describe('isValidStudentCard (REQ-BOOK-06)', () => {
  it('only needs a value', () => {
    expect(isValidStudentCard('ANY-VALUE-1')).toBe(true);
    expect(isValidStudentCard('   ')).toBe(false);
    expect(isValidStudentCard(undefined)).toBe(false);
    expect(isValidStudentCard(null)).toBe(false);
  });
});

describe('canonicalEmail (REQ-ACC-04)', () => {
  it('folds case and surrounding spaces so duplicates are detectable', () => {
    expect(canonicalEmail(' QA-1@Example.Invalid ')).toBe('qa-1@example.invalid');
  });
});
