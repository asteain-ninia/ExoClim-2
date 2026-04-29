import { describe, expect, it } from 'vitest';
import { fbmSphere, hash33, noise3D, ridgeSphere } from '@/domain/noise';

describe('domain/noise: 球面ノイズユーティリティ', () => {
  describe('hash33（決定性）', () => {
    it('同入力で同出力を返す', () => {
      expect(hash33(0.1, 0.2, 0.3, 42)).toBe(hash33(0.1, 0.2, 0.3, 42));
    });

    it('異 seed で異出力を返す', () => {
      expect(hash33(0.1, 0.2, 0.3, 42)).not.toBe(hash33(0.1, 0.2, 0.3, 43));
    });

    it('戻り値は [0, 1) に収まる', () => {
      for (const seed of [0, 1, 42, 1000]) {
        const v = hash33(0.5, -0.3, 0.7, seed);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('全成分 0・seed 0 でも有限値を返す（縮退ケース）', () => {
      const v = hash33(0, 0, 0, 0);
      expect(Number.isFinite(v)).toBe(true);
    });
  });

  describe('noise3D（補間）', () => {
    it('同入力で同出力（決定性）', () => {
      expect(noise3D(1.5, 2.3, 0.7, 42)).toBe(noise3D(1.5, 2.3, 0.7, 42));
    });

    it('戻り値は [0, 1] 近傍（有限）', () => {
      const v = noise3D(0.5, 0.5, 0.5, 0);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-0.1);
      expect(v).toBeLessThanOrEqual(1.1);
    });
  });

  describe('fbmSphere（複数オクターブ重ね合わせ）', () => {
    it('同入力で同出力（決定性）', () => {
      const a = fbmSphere(0.6, 0.4, 0.7, 4, 11);
      const b = fbmSphere(0.6, 0.4, 0.7, 4, 11);
      expect(a).toBe(b);
    });

    it('単位ベクトル全体で有限値を返す（極・赤道含む）', () => {
      const samples: ReadonlyArray<readonly [number, number, number]> = [
        [1, 0, 0], // 赤道・経度 0
        [0, 1, 0], // 北極
        [0, -1, 0], // 南極
        [0, 0, 1],
        [-1, 0, 0],
      ];
      for (const [nx, ny, nz] of samples) {
        const v = fbmSphere(nx, ny, nz, 6, 11);
        expect(Number.isFinite(v)).toBe(true);
      }
    });

    it('異 seed で異出力を生む', () => {
      const a = fbmSphere(0.6, 0.4, 0.7, 4, 11);
      const b = fbmSphere(0.6, 0.4, 0.7, 4, 22);
      expect(a).not.toBe(b);
    });
  });

  describe('ridgeSphere（鋭い尾根）', () => {
    it('同入力で同出力（決定性）', () => {
      const a = ridgeSphere(0.6, 0.4, 0.7, 4, 311);
      const b = ridgeSphere(0.6, 0.4, 0.7, 4, 311);
      expect(a).toBe(b);
    });

    it('全領域で非負値（鋭い尾根は |2n−1| を反転して正に揃える性質）', () => {
      const samples: ReadonlyArray<readonly [number, number, number]> = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [0.5, 0.5, 0.7],
      ];
      for (const [nx, ny, nz] of samples) {
        const v = ridgeSphere(nx, ny, nz, 4, 311);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(v)).toBe(true);
      }
    });
  });
});
