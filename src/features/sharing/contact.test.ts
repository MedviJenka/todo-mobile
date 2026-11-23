import { initials, isValidEmail, nameFromEmail, normalizeEmail } from './contact';

describe('nameFromEmail', () => {
  it.each([
    ['john.doe@gmail.com', 'John Doe'],
    ['john_doe92@gmail.com', 'John Doe'],
    ['mary-ann.smith+work@example.org', 'Mary Ann Smith'],
    ['johndoe@gmail.com', 'Johndoe'],
    [' John.Doe@Gmail.com ', 'John Doe'],
    ['1234@gmail.com', ''],
    ['', ''],
  ])('%s → %s', (email, name) => {
    expect(nameFromEmail(email)).toBe(name);
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('john.doe@gmail.com')).toBe(true);
    expect(isValidEmail(' John@Example.co.uk ')).toBe(true);
  });
  it('rejects incomplete ones', () => {
    for (const bad of ['', 'john', 'john@', 'john@gmail', '@gmail.com', 'jo hn@gmail.com']) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

it('normalizes case and whitespace', () => {
  expect(normalizeEmail('  John@Gmail.COM ')).toBe('john@gmail.com');
});

it('builds initials', () => {
  expect(initials('John Doe')).toBe('JD');
  expect(initials('Johndoe')).toBe('J');
  expect(initials('Mary Ann Smith')).toBe('MA');
});
