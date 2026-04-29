import { describe, expect, it } from 'vitest';
import {
  normalizePanOffsetPx,
  projectRaw,
  unprojectRaw,
  type CanvasViewport,
} from '@/ui/map/projections';

const VIEWPORT: CanvasViewport = { widthPx: 960, heightPx: 480 };

describe('ui/map/projections: 正距円筒図法', () => {
  describe('projectRaw（緯度経度 → Canvas 座標）', () => {
    it('赤道・本初子午線（0, 0）は Canvas 中央に投影される', () => {
      const { x, y } = projectRaw(0, 0, VIEWPORT, 0);
      expect(x).toBeCloseTo(VIEWPORT.widthPx / 2, 6);
      expect(y).toBeCloseTo(VIEWPORT.heightPx / 2, 6);
    });

    it('北極（+90°）は Canvas 上端、南極（-90°）は下端', () => {
      expect(projectRaw(90, 0, VIEWPORT, 0).y).toBeCloseTo(0, 6);
      expect(projectRaw(-90, 0, VIEWPORT, 0).y).toBeCloseTo(VIEWPORT.heightPx, 6);
    });

    it('経度 -180° は左端、+180° は右端（unwrapped）', () => {
      expect(projectRaw(0, -180, VIEWPORT, 0).x).toBeCloseTo(0, 6);
      expect(projectRaw(0, 180, VIEWPORT, 0).x).toBeCloseTo(VIEWPORT.widthPx, 6);
    });

    it('panOffsetPx が x 座標に直接加算される（modulo は適用しない）', () => {
      const { x } = projectRaw(0, 0, VIEWPORT, 200);
      expect(x).toBeCloseTo(VIEWPORT.widthPx / 2 + 200, 6);
    });

    it('縮退入力（軸傾斜 0 系の 0 / 0）でも -0 を生まず +0 に正規化される', () => {
      const { x, y } = projectRaw(90, -180, VIEWPORT, 0);
      // 北極かつ経度 -180° → x=0, y=0
      expect(Math.abs(x)).toBe(0);
      expect(Math.abs(y)).toBe(0);
    });
  });

  describe('normalizePanOffsetPx（pan 量を [0, widthPx) に正規化）', () => {
    it('0 → 0', () => {
      expect(normalizePanOffsetPx(0, VIEWPORT)).toBe(0);
    });

    it('正の小値はそのまま', () => {
      expect(normalizePanOffsetPx(100, VIEWPORT)).toBe(100);
    });

    it('width と等しい値は 0 に丸まる', () => {
      expect(normalizePanOffsetPx(VIEWPORT.widthPx, VIEWPORT)).toBe(0);
    });

    it('width の倍数も 0 に丸まる', () => {
      expect(normalizePanOffsetPx(VIEWPORT.widthPx * 3, VIEWPORT)).toBe(0);
    });

    it('負値は width 単位で正に巻き戻される', () => {
      expect(normalizePanOffsetPx(-100, VIEWPORT)).toBe(VIEWPORT.widthPx - 100);
      expect(normalizePanOffsetPx(-VIEWPORT.widthPx, VIEWPORT)).toBe(0);
    });

    it('width を超える正値は width 内に折りたたまれる', () => {
      expect(normalizePanOffsetPx(VIEWPORT.widthPx + 50, VIEWPORT)).toBe(50);
    });
  });

  describe('unprojectRaw（Canvas 座標 → 緯度経度、picking 用）', () => {
    it('Canvas 中央は赤道・本初子午線', () => {
      const { latitudeDeg, longitudeDeg } = unprojectRaw(
        VIEWPORT.widthPx / 2,
        VIEWPORT.heightPx / 2,
        VIEWPORT,
        0,
      );
      expect(latitudeDeg).toBeCloseTo(0, 6);
      expect(longitudeDeg).toBeCloseTo(0, 6);
    });

    it('左端は経度 -180°、右端は +180° → 循環で -180° に巻き戻る', () => {
      expect(unprojectRaw(0, VIEWPORT.heightPx / 2, VIEWPORT, 0).longitudeDeg).toBeCloseTo(
        -180,
        6,
      );
      // 右端 (x=widthPx) は +180° に対応するが、循環正規化で -180° に揃う
      expect(unprojectRaw(VIEWPORT.widthPx, VIEWPORT.heightPx / 2, VIEWPORT, 0).longitudeDeg).toBeCloseTo(
        -180,
        6,
      );
    });

    it('上端は北極 +90°、下端は南極 -90°', () => {
      expect(unprojectRaw(VIEWPORT.widthPx / 2, 0, VIEWPORT, 0).latitudeDeg).toBeCloseTo(90, 6);
      expect(
        unprojectRaw(VIEWPORT.widthPx / 2, VIEWPORT.heightPx, VIEWPORT, 0).latitudeDeg,
      ).toBeCloseTo(-90, 6);
    });

    it('panOffset を加味して逆変換される', () => {
      // pan +100 で Canvas 中央 (480 + 100, 240) は赤道・本初子午線に対応
      const { latitudeDeg, longitudeDeg } = unprojectRaw(
        VIEWPORT.widthPx / 2 + 100,
        VIEWPORT.heightPx / 2,
        VIEWPORT,
        100,
      );
      expect(latitudeDeg).toBeCloseTo(0, 6);
      expect(longitudeDeg).toBeCloseTo(0, 6);
    });
  });

  describe('project と unproject の往復', () => {
    it('複数の (lat, lon) で往復が一致する（pan = 0）', () => {
      const samples: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [45, 30],
        [-30, -90],
        [60, 120],
        [-60, -150],
      ];
      for (const [lat, lon] of samples) {
        const { x, y } = projectRaw(lat, lon, VIEWPORT, 0);
        const { latitudeDeg, longitudeDeg } = unprojectRaw(x, y, VIEWPORT, 0);
        expect(latitudeDeg).toBeCloseTo(lat, 6);
        expect(longitudeDeg).toBeCloseTo(lon, 6);
      }
    });

    it('panOffset を介しても往復が一致する', () => {
      const offset = 250;
      const { x, y } = projectRaw(30, 60, VIEWPORT, offset);
      const { latitudeDeg, longitudeDeg } = unprojectRaw(x, y, VIEWPORT, offset);
      expect(latitudeDeg).toBeCloseTo(30, 6);
      expect(longitudeDeg).toBeCloseTo(60, 6);
    });
  });
});
