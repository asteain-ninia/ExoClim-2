import { describe, expect, it } from 'vitest';

describe('bootstrap sanity', () => {
  it('Vitest 実行環境が健全であること', () => {
    expect(1 + 1).toBe(2);
  });

  it('TypeScript の型システムが動作していること', () => {
    const value: number = 42;
    expect(typeof value).toBe('number');
  });
});
