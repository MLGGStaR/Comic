import { describe, expect, test } from 'vitest';
import { pushRoute, type Route } from './nav';

const comic = (id: string): Route => ({ t: 'comic', id });

describe('pushRoute', () => {
  test('a double tap opens the page once', () => {
    const once = pushRoute([], comic('1'));
    expect(pushRoute(once, comic('1'))).toBe(once);
  });
  test('a different page, or the same page further down, still pushes', () => {
    expect(pushRoute([comic('1')], comic('2')).map((r) => (r as { id: string }).id)).toEqual(['1', '2']);
    expect(pushRoute([comic('1'), { t: 'series', id: '9' }], comic('1'))).toHaveLength(3);
  });
});
