import { describe, expect, it } from 'vitest';
import { deepEqual } from '@/worker/deepEqual';

describe('worker/deepEqual: 構造的同値性判定', () => {
  describe('プリミティブ', () => {
    it('同値プリミティブは true', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('a', 'a')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(undefined, undefined)).toBe(true);
    });

    it('異値プリミティブは false', () => {
      expect(deepEqual(1, 2)).toBe(false);
      expect(deepEqual('a', 'b')).toBe(false);
      expect(deepEqual(null, undefined)).toBe(false);
      expect(deepEqual(0, false)).toBe(false);
      expect(deepEqual('1', 1)).toBe(false);
    });
  });

  describe('浮動小数点数の厳密一致（[技術方針.md §2.2.3] / [開発ガイド.md §6.1.1]）', () => {
    it('NaN === NaN を真と扱う（Object.is 準拠）', () => {
      expect(deepEqual(NaN, NaN)).toBe(true);
    });

    it('-0 と +0 を区別する', () => {
      expect(deepEqual(-0, +0)).toBe(false);
      expect(deepEqual(-0, -0)).toBe(true);
    });

    it('Infinity と -Infinity を区別する', () => {
      expect(deepEqual(Infinity, Infinity)).toBe(true);
      expect(deepEqual(Infinity, -Infinity)).toBe(false);
    });
  });

  describe('配列', () => {
    it('要素ごとに同値なら true', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(deepEqual([], [])).toBe(true);
    });

    it('要素が異なれば false', () => {
      expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    });

    it('長さが異なれば false', () => {
      expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    });
  });

  describe('オブジェクト', () => {
    it('同値プロパティなら true（キー順序非依存）', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
      expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it('異値プロパティなら false', () => {
      expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('プロパティ数が異なれば false（明示的 undefined キーを別物と扱う）', () => {
      expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    });
  });

  describe('ネスト構造', () => {
    it('入れ子の配列・オブジェクトを再帰的に比較する', () => {
      const a = { x: [1, { y: 'z' }] };
      const b = { x: [1, { y: 'z' }] };
      expect(deepEqual(a, b)).toBe(true);
      const c = { x: [1, { y: 'w' }] };
      expect(deepEqual(a, c)).toBe(false);
    });
  });

  describe('配列とオブジェクトの混同回避', () => {
    it('空配列と空オブジェクトは別物', () => {
      expect(deepEqual([], {})).toBe(false);
    });
  });
});
