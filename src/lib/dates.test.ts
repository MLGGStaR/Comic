import { describe, expect, test } from 'vitest';
import { weekStart, monthGrid, weeksCovering, addDays } from './dates';

// 2026-09-23 is a Wednesday (New Comic Book Day)
describe('weekStart (release week = Wednesday → Tuesday)', () => {
  test('a Wednesday is its own week', () => {
    expect(weekStart(new Date(2026, 8, 23))).toBe('2026-09-23');
  });
  test('Saturday and the following Tuesday belong to the previous Wednesday', () => {
    expect(weekStart(new Date(2026, 8, 26))).toBe('2026-09-23');
    expect(weekStart(new Date(2026, 8, 29))).toBe('2026-09-23');
  });
  test('the next Wednesday starts a new week', () => {
    expect(weekStart(new Date(2026, 8, 30))).toBe('2026-09-30');
  });
});

describe('addDays', () => {
  test('crosses month ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('monthGrid', () => {
  test('Sunday-first 6-week grid that contains the whole month', () => {
    const g = monthGrid(2026, 8); // September 2026 starts on a Tuesday
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-08-30');
    expect(g[2]).toBe('2026-09-01');
    expect(g).toContain('2026-09-30');
  });
});

describe('weeksCovering', () => {
  test('lists every release week (Wednesday) touching the range', () => {
    expect(weeksCovering('2026-08-30', '2026-09-12')).toEqual(['2026-08-26', '2026-09-02', '2026-09-09']);
  });
});
