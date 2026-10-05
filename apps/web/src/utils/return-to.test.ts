// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { rememberReturnTo, safeReturnPath, takeReturnTo } from './return-to';

describe('safeReturnPath', () => {
  it('keeps paths of the app, with their query and hash', () => {
    expect(safeReturnPath('/dashboard/settings?tab=subscription')).toBe(
      '/dashboard/settings?tab=subscription',
    );
    expect(safeReturnPath('/dashboard/calendar#today')).toBe(
      '/dashboard/calendar#today',
    );
  });

  it('refuses anything that could leave the app', () => {
    for (const value of [
      'https://evil.example/dashboard',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'dashboard',
      '',
      null,
    ]) {
      expect(safeReturnPath(value)).toBeNull();
    }
  });

  it('refuses the auth pages, which would loop', () => {
    expect(safeReturnPath('/auth/login')).toBeNull();
    expect(safeReturnPath('/auth')).toBeNull();
  });
});

describe('remembered page', () => {
  beforeEach(() => sessionStorage.clear());

  it('is followed once, then forgotten', () => {
    rememberReturnTo('/dashboard/settings?tab=ai');

    expect(takeReturnTo('/dashboard')).toBe('/dashboard/settings?tab=ai');
    expect(takeReturnTo('/dashboard')).toBe('/dashboard');
  });

  it('ignores unsafe paths', () => {
    rememberReturnTo('//evil.example');

    expect(takeReturnTo('/dashboard')).toBe('/dashboard');
  });
});
