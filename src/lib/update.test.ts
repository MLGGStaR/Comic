import { describe, expect, test } from 'vitest';
import { shouldReload, updateUrl, withoutUpdateParam } from './update';

const base = { mine: 'aaa111', latest: 'bbb222', now: 1_000_000, lastReloadAt: 0, foreground: true, idle: false };

describe('shouldReload', () => {
  test('a newer deploy reloads when the app comes to the foreground', () => {
    expect(shouldReload(base)).toBe(true);
  });
  test('same build, unknown build or a dev build: stay', () => {
    expect(shouldReload({ ...base, latest: 'aaa111' })).toBe(false);
    expect(shouldReload({ ...base, latest: null })).toBe(false);
    expect(shouldReload({ ...base, mine: '' })).toBe(false);
  });
  test('while in use it waits for a moment when nothing is open', () => {
    expect(shouldReload({ ...base, foreground: false, idle: false })).toBe(false);
    expect(shouldReload({ ...base, foreground: false, idle: true })).toBe(true);
  });
  test('never reloads in a loop', () => {
    expect(shouldReload({ ...base, lastReloadAt: base.now - 30_000 })).toBe(false);
    expect(shouldReload({ ...base, lastReloadAt: base.now - 120_000 })).toBe(true);
  });
});

describe('update URL', () => {
  test('the reload goes to a one-off address no cache has seen', () => {
    expect(updateUrl('/Comic/', 'bbb222ccc333ddd')).toBe('/Comic/?v=bbb222ccc333');
  });
  test('the marker is removed again once loaded, keeping anything else', () => {
    expect(withoutUpdateParam('?v=bbb222')).toBe('');
    expect(withoutUpdateParam('?v=bbb222&x=1')).toBe('?x=1');
    expect(withoutUpdateParam('?x=1')).toBe('?x=1');
  });
});
