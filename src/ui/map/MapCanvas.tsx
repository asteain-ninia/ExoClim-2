// Step 1 ITCZ を Equirectangular で描画する Canvas 2D マップ。
// 仕様:
//   [要件定義書.md §2.3.1] マップ表示 / [§2.3.2] 凡例・補助線 / [§2.3.3] ズーム・パン（経度循環）。
//   [docs/spec/01_ITCZ.md §5] 出力契約を直接消費する。
// 規約: UI 層は状態層 store のみを購読する（[技術方針.md §2.1.5]）。

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Cell, Grid, ITCZResult } from '@/domain';
import { useResultsStore } from '@/store/results';
import {
  useUIStore,
  type LegendVisibility,
  type SeasonPhaseView,
} from '@/store/ui';
import {
  normalizePanOffsetPx,
  projectRaw,
  type CanvasViewport,
} from './projections';

/** Canvas 固定サイズ（Equirectangular 2:1 比、1° / 1px の素直な対応）。 */
export const CANVAS_WIDTH_PX = 960;
export const CANVAS_HEIGHT_PX = 480;

const VIEWPORT: CanvasViewport = {
  widthPx: CANVAS_WIDTH_PX,
  heightPx: CANVAS_HEIGHT_PX,
};

interface BandPoint {
  readonly longitudeDeg: number;
  readonly centerLatDeg: number;
  readonly southLatDeg: number;
  readonly northLatDeg: number;
}

/**
 * 現在の季節選択（年平均 or 月）に対応するバンド点列を組み立てる。
 * 年平均では月別の south/north 境界を平均する。
 */
function computeBandPoints(
  itcz: ITCZResult,
  currentSeason: SeasonPhaseView,
): readonly BandPoint[] {
  const annualCenters = itcz.annualMeanCenterLatitudeDeg;
  const longitudeCount = annualCenters.length;
  if (longitudeCount === 0) return [];
  const lonStep = 360 / longitudeCount;

  if (currentSeason === 'annual') {
    const points: BandPoint[] = new Array(longitudeCount);
    for (let j = 0; j < longitudeCount; j++) {
      let sumSouth = 0;
      let sumNorth = 0;
      let count = 0;
      for (const monthBands of itcz.monthlyBands) {
        const mb = monthBands[j];
        if (mb) {
          sumSouth += mb.southBoundLatitudeDeg;
          sumNorth += mb.northBoundLatitudeDeg;
          count++;
        }
      }
      points[j] = {
        longitudeDeg: -180 + (j + 0.5) * lonStep,
        centerLatDeg: annualCenters[j] ?? 0,
        southLatDeg: count > 0 ? sumSouth / count : 0,
        northLatDeg: count > 0 ? sumNorth / count : 0,
      };
    }
    return points;
  }

  const monthBands = itcz.monthlyBands[currentSeason];
  if (!monthBands) return [];
  return monthBands.map<BandPoint>((band, j) => ({
    longitudeDeg: -180 + (j + 0.5) * lonStep,
    centerLatDeg: band.centerLatitudeDeg,
    southLatDeg: band.southBoundLatitudeDeg,
    northLatDeg: band.northBoundLatitudeDeg,
  }));
}

interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * セルの陸海・標高・緯度から表示色を決める。
 * 陸地は 4 段階（低地・高原・山地・高山）、海洋は深さで 3 段階、極域（|lat| > 75°）は氷化。
 */
function cellColor(cell: Cell): RGB {
  const isHighLatitude = Math.abs(cell.latitudeDeg) > 75;
  if (cell.isLand) {
    let base: RGB;
    const elevation = cell.elevationMeters;
    if (elevation < 500) base = { r: 0x4a, g: 0x6b, b: 0x3e };
    else if (elevation < 1500) base = { r: 0x6b, g: 0x6b, b: 0x4a };
    else if (elevation < 3000) base = { r: 0x8a, g: 0x7a, b: 0x5a };
    else base = { r: 0xb0, g: 0xa8, b: 0x90 };
    if (isHighLatitude) {
      // 高緯度の陸地は氷雪で覆われる近似（白とのブレンド）
      return {
        r: Math.round(base.r * 0.4 + 255 * 0.6),
        g: Math.round(base.g * 0.4 + 255 * 0.6),
        b: Math.round(base.b * 0.4 + 255 * 0.6),
      };
    }
    return base;
  }
  // 海洋
  if (isHighLatitude) {
    // 極海は薄青（海氷の近似、Step 3 海流の海氷マスクが入れば置換）
    return { r: 0xa0, g: 0xc0, b: 0xd0 };
  }
  const depth = -cell.elevationMeters;
  if (depth < 200) return { r: 0x1a, g: 0x3c, b: 0x5c };
  if (depth < 2000) return { r: 0x10, g: 0x2c, b: 0x4a };
  return { r: 0x08, g: 0x1c, b: 0x32 };
}

/**
 * Grid から陸海・標高で塗り分けたオフスクリーン Canvas を構築する（grid 解像度のピクセルで生成）。
 * 主 Canvas には drawImage で拡大コピーする。pan の循環表示は drawImage を複数 offset で繰り返して実現。
 */
function buildTerrainBitmap(grid: Grid): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const offCanvas = document.createElement('canvas');
  offCanvas.width = cols;
  offCanvas.height = rows;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return offCanvas;
  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;
  // grid.cells は南→北（i=0 が南極側）。ImageData は y=0 が上端。よって行を反転して書き込む。
  for (let r = 0; r < rows; r++) {
    const gridRow = grid.cells[r];
    if (!gridRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const cell = gridRow[c];
      if (!cell) continue;
      const offset = (imageY * cols + c) * 4;
      const color = cellColor(cell);
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = 255;
    }
  }
  offCtx.putImageData(imgData, 0, 0);
  return offCanvas;
}

/** オフスクリーン地形ビットマップを 2 オフセットで主 Canvas に描き、経度循環を実現する。 */
function drawTerrainBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  normPanPx: number,
): void {
  const previousSmoothing = ctx.imageSmoothingEnabled;
  // ピクセルアート的な見た目を保つため smoothing は切る
  ctx.imageSmoothingEnabled = false;
  for (const drawOffset of [normPanPx, normPanPx - CANVAS_WIDTH_PX]) {
    ctx.drawImage(bitmap, drawOffset, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
  }
  ctx.imageSmoothingEnabled = previousSmoothing;
}

/**
 * 経度緯度の補助線（30° グリッド）を描く。
 * 緯度線は水平のため pan に追従しない。経度線は norm と norm - width の 2 つで重ね描きして循環。
 */
function drawGrid(ctx: CanvasRenderingContext2D, normPanPx: number): void {
  ctx.strokeStyle = '#1f3a52';
  ctx.lineWidth = 1;

  // 緯度線（30° 毎、赤道は別色で強調）
  for (let lat = -60; lat <= 60; lat += 30) {
    if (lat === 0) continue;
    const { y } = projectRaw(lat, 0, VIEWPORT, 0);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH_PX, y);
    ctx.stroke();
  }

  // 赤道
  {
    const { y } = projectRaw(0, 0, VIEWPORT, 0);
    ctx.strokeStyle = '#3a5a78';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH_PX, y);
    ctx.stroke();
  }

  // 経度線（30° 毎、循環描画）
  ctx.strokeStyle = '#1f3a52';
  ctx.lineWidth = 1;
  for (const drawOffset of [normPanPx, normPanPx - CANVAS_WIDTH_PX]) {
    for (let lon = -180; lon < 180; lon += 30) {
      const { x } = projectRaw(0, lon, VIEWPORT, drawOffset);
      if (x < 0 || x > CANVAS_WIDTH_PX) continue;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT_PX);
      ctx.stroke();
    }
  }
}

/** ITCZ 影響帯（north と south の間）を半透明赤で塗る。3 オフセットで循環描画。 */
function drawInfluenceBand(
  ctx: CanvasRenderingContext2D,
  bands: readonly BandPoint[],
  normPanPx: number,
): void {
  ctx.fillStyle = 'rgba(220, 80, 80, 0.25)';
  for (const drawOffset of [normPanPx, normPanPx - CANVAS_WIDTH_PX, normPanPx + CANVAS_WIDTH_PX]) {
    ctx.beginPath();
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]!;
      const { x, y } = projectRaw(b.northLatDeg, b.longitudeDeg, VIEWPORT, drawOffset);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = bands.length - 1; i >= 0; i--) {
      const b = bands[i]!;
      const { x, y } = projectRaw(b.southLatDeg, b.longitudeDeg, VIEWPORT, drawOffset);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** ITCZ 中心線をストロークする。3 オフセットで循環描画し、隣接インスタンス間も連結する。 */
function drawCenterLine(
  ctx: CanvasRenderingContext2D,
  bands: readonly BandPoint[],
  normPanPx: number,
): void {
  ctx.strokeStyle = '#dc5050';
  ctx.lineWidth = 2;
  for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
    ctx.beginPath();
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]!;
      const { x, y } = projectRaw(b.centerLatDeg, b.longitudeDeg, VIEWPORT, drawOffset);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  panOffsetPx: number,
  terrainBitmap: HTMLCanvasElement | null,
  itcz: ITCZResult | null,
  currentSeason: SeasonPhaseView,
  legendVisibility: LegendVisibility,
): void {
  const norm = normalizePanOffsetPx(panOffsetPx, VIEWPORT);

  if (terrainBitmap) {
    drawTerrainBitmap(ctx, terrainBitmap, norm);
  } else {
    // 地形未解決時のフォールバック背景（全海洋扱い）
    ctx.fillStyle = '#0e2233';
    ctx.fillRect(0, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
  }

  drawGrid(ctx, norm);

  if (!itcz) return;
  const bands = computeBandPoints(itcz, currentSeason);
  if (bands.length === 0) return;

  if (legendVisibility.itczInfluenceBand) {
    drawInfluenceBand(ctx, bands, norm);
  }
  if (legendVisibility.itczCenterLine) {
    drawCenterLine(ctx, bands, norm);
  }
}

/**
 * Canvas 2D マップビューコンポーネント。
 * pointer drag で経度方向に無限にパンできる（[要件定義書.md §2.3.3]）。
 */
export function MapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [panOffsetPx, setPanOffsetPx] = useState(0);
  const dragRef = useRef<{ startClientX: number; startOffset: number } | null>(null);

  const itcz = useResultsStore((s) => s.itcz);
  const grid = useResultsStore((s) => s.grid);
  const currentSeason = useUIStore((s) => s.currentSeason);
  const legendVisibility = useUIStore((s) => s.legendVisibility);

  // grid 変化時にオフスクリーン地形ビットマップを再構築する（地形生成は重いので memoize）
  const terrainBitmap = useMemo(() => (grid ? buildTerrainBitmap(grid) : null), [grid]);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startClientX: e.clientX, startOffset: panOffsetPx };
    },
    [panOffsetPx],
  );

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    setPanOffsetPx(drag.startOffset + dx);
  }, []);

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawMap(ctx, panOffsetPx, terrainBitmap, itcz, currentSeason, legendVisibility);
  }, [panOffsetPx, terrainBitmap, itcz, currentSeason, legendVisibility]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH_PX}
      height={CANVAS_HEIGHT_PX}
      data-testid="map-canvas"
      style={{
        display: 'block',
        // grid 親に潰されないよう CSS でも固定サイズを強制（[要件定義書.md §2.3.1]）
        width: `${CANVAS_WIDTH_PX}px`,
        height: `${CANVAS_HEIGHT_PX}px`,
        cursor: 'grab',
        border: '1px solid #2a4055',
        background: '#0e2233',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
