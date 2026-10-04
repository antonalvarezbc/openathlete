import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it.each([
    ['athlete@example.com', 'a***@example.com'],
    ['a@b.co', 'a***@b.co'],
    ['not-an-email', '***'],
    ['@example.com', '***'],
    ['', '<no email>'],
    [undefined, '<no email>'],
  ])('masks %p as %p', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });
});
