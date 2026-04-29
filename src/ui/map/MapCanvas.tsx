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
import type {
  Cell,
  Grid,
  GridMap,
  ITCZResult,
  OceanCurrentResult,
  WindVector,
} from '@/domain';
import { useParamsStore } from '@/store/params';
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
 *
 * 表示用の影響帯は **中心線 ± halfWidthDeg の一様幅** とし、ITCZResult が保持する
 * `southBoundLatitudeDeg` / `northBoundLatitudeDeg`（[docs/spec/01_ITCZ.md §4.5] の
 * 山岳横断切取が反映済みの clipped 値）は **本表示では使わない**。
 *
 * 理由: 山岳切取は「内陸の高地で band が局所的にゼロ幅まで縮退する」現象を生み、
 * 海岸線・地形と相関した断続的な視覚ノイズになる。可視化用としては煩雑。
 * 切取済みの south/north は下流 Step 2/3 が消費するため ITCZResult 側に保持し続け、
 * 表示専用の計算を本ステージで行う。デバッグビュー（[要件定義書.md §2.3.5]）が
 * 整備されたら、切取データはそちらで個別に提示する。
 *
 * 年平均では月別中心線を `itcz.annualMeanCenterLatitudeDeg` から取得する。
 */
function computeBandPoints(
  itcz: ITCZResult,
  currentSeason: SeasonPhaseView,
  halfWidthDeg: number,
): readonly BandPoint[] {
  const annualCenters = itcz.annualMeanCenterLatitudeDeg;
  const longitudeCount = annualCenters.length;
  if (longitudeCount === 0) return [];
  const lonStep = 360 / longitudeCount;

  const buildPoint = (longitudeIndex: number, centerLatDeg: number): BandPoint => ({
    longitudeDeg: -180 + (longitudeIndex + 0.5) * lonStep,
    centerLatDeg,
    southLatDeg: Math.max(-90, centerLatDeg - halfWidthDeg),
    northLatDeg: Math.min(90, centerLatDeg + halfWidthDeg),
  });

  if (currentSeason === 'annual') {
    const points: BandPoint[] = new Array(longitudeCount);
    for (let j = 0; j < longitudeCount; j++) {
      points[j] = buildPoint(j, annualCenters[j] ?? 0);
    }
    return points;
  }

  const monthBands = itcz.monthlyBands[currentSeason];
  if (!monthBands) return [];
  return monthBands.map<BandPoint>((band, j) => buildPoint(j, band.centerLatitudeDeg));
}

interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * 段彩図の表示色（旧 ExoClim `components/visualizer/constants.ts` の配色を踏襲）。
 *
 * 陸地（ELEVATION_STOPS / ELEVATION_COLORS の discrete 5 段階）:
 *   0-200m: #7fb86e / 200-500m: #c7db7a / 500-1000m: #cc9a45 /
 *   1000-2000m: #995a32 / 2000m+: #663301
 *
 * 海洋（OCEAN_DISCRETE_COLORS の 3 段階）:
 *   ≥ -200m (shelf): #7fcdbb / -4000 〜 -200 (deep): #1d91c0 / < -4000 (abyss): #081d58
 *
 * 高緯度の氷雪付加は本配色には含めない（旧プロジェクトと同じ「物理地図」流の色彩）。
 * 海氷・雪線は Step 3 海流 / Step 5 気温のマスクが入った段階で別レイヤーとして重ねる方針。
 */
function cellColor(cell: Cell): RGB {
  if (cell.isLand) {
    const h = cell.elevationMeters;
    if (h < 200) return { r: 0x7f, g: 0xb8, b: 0x6e };
    if (h < 500) return { r: 0xc7, g: 0xdb, b: 0x7a };
    if (h < 1000) return { r: 0xcc, g: 0x9a, b: 0x45 };
    if (h < 2000) return { r: 0x99, g: 0x5a, b: 0x32 };
    return { r: 0x66, g: 0x33, b: 0x01 };
  }
  // 海洋（負の elevation。h は深さ表現）
  const h = cell.elevationMeters;
  if (h >= -200) return { r: 0x7f, g: 0xcd, b: 0xbb };
  if (h >= -4000) return { r: 0x1d, g: 0x91, b: 0xc0 };
  return { r: 0x08, g: 0x1d, b: 0x58 };
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

/** 影響帯の塗り色（半透明赤、α=0.25）。 */
const INFLUENCE_BAND_RGBA: readonly [number, number, number, number] = [220, 80, 80, Math.round(255 * 0.25)];

/**
 * ITCZ 影響帯をオフスクリーン Canvas に per-pixel で描く。
 *
 * polygon 描画方式（north 行 → south 行 → close）は山岳切取で南北境界が反転・縮退した
 * longitude で polygon が pinch（自己交差）し、non-zero winding rule で穴が空く事象が起きた。
 * 本実装はそれを回避するため canvas X ごとに独立した縦ストリップで塗る。
 *
 * 描画範囲は `[0, CANVAS_WIDTH_PX) × [0, CANVAS_HEIGHT_PX)`（pan なし）。
 * 主 Canvas には複数オフセットで {@link drawImage} することで経度循環を実現する。
 */
function buildInfluenceBandBitmap(bands: readonly BandPoint[]): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = CANVAS_WIDTH_PX;
  off.height = CANVAS_HEIGHT_PX;
  const offCtx = off.getContext('2d');
  if (!offCtx || bands.length === 0) return off;

  const imgData = offCtx.createImageData(CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
  const data = imgData.data;
  const [bandR, bandG, bandB, bandA] = INFLUENCE_BAND_RGBA;

  for (let x = 0; x < CANVAS_WIDTH_PX; x++) {
    // 経度（pan なしの基準フレーム、[-180, +180)）
    const lonDeg = (x / CANVAS_WIDTH_PX) * 360 - 180;
    // bands は経度方向に等間隔に並ぶ前提（{@link computeBandPoints} で生成）
    let bandIdx = Math.floor(((lonDeg + 180) / 360) * bands.length);
    if (bandIdx < 0) bandIdx = 0;
    if (bandIdx >= bands.length) bandIdx = bands.length - 1;
    const band = bands[bandIdx];
    if (!band) continue;

    // 縮退（南北逆転または同一）の longitude では帯を描かない
    if (band.northLatDeg <= band.southLatDeg) continue;

    // 緯度 → canvas Y（北が小さい Y、南が大きい Y）
    const yNorth = CANVAS_HEIGHT_PX * (1 - (band.northLatDeg + 90) / 180);
    const ySouth = CANVAS_HEIGHT_PX * (1 - (band.southLatDeg + 90) / 180);
    const yStart = Math.max(0, Math.floor(Math.min(yNorth, ySouth)));
    const yEnd = Math.min(CANVAS_HEIGHT_PX - 1, Math.ceil(Math.max(yNorth, ySouth)));

    for (let y = yStart; y <= yEnd; y++) {
      const offset = (y * CANVAS_WIDTH_PX + x) * 4;
      data[offset] = bandR;
      data[offset + 1] = bandG;
      data[offset + 2] = bandB;
      data[offset + 3] = bandA;
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/** 影響帯ビットマップを 2 オフセットで主 Canvas に重ね描きし、経度循環を実現する。 */
function drawInfluenceBandBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  normPanPx: number,
): void {
  const previousSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const drawOffset of [normPanPx, normPanPx - CANVAS_WIDTH_PX]) {
    ctx.drawImage(bitmap, drawOffset, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
  }
  ctx.imageSmoothingEnabled = previousSmoothing;
}

/**
 * 海流分類オーバーレイをオフスクリーン Canvas に構築する。
 *
 * `monthlyCoastalTemperatureCorrectionCelsius[0]` の符号で warm/cold/neutral を判定し、
 * grid 解像度のピクセルとして塗る。値の絶対値で alpha を調整（影響強度に比例して濃くなる）。
 *   warm: 橙色 #dc823c に絶対値スケール α
 *   cold: 青色 #3c82dc に絶対値スケール α
 *   neutral: 透明
 *
 * 季節依存なしのため、`monthlyCoastalTemperatureCorrectionCelsius[0]`（1 月）を代表値として使う。
 * 将来 Step 5 気温フィードバックで月別差分が出たら currentSeason 依存に拡張する。
 */
function buildOceanCurrentBitmap(
  oceanCurrent: OceanCurrentResult,
  grid: Grid,
  warmMaxCelsius: number,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const correctionGrid = oceanCurrent.monthlyCoastalTemperatureCorrectionCelsius[0];
  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const correctionRow = correctionGrid[r];
    if (!correctionRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const correction = correctionRow[c];
      if (correction === undefined || correction === 0) continue;
      const offset = (imageY * cols + c) * 4;
      const intensity = Math.min(1, Math.abs(correction) / Math.max(1, warmMaxCelsius));
      const alpha = Math.round(intensity * 0.55 * 255);
      if (correction > 0) {
        // warm
        data[offset] = 220;
        data[offset + 1] = 130;
        data[offset + 2] = 60;
        data[offset + 3] = alpha;
      } else {
        // cold
        data[offset] = 60;
        data[offset + 1] = 130;
        data[offset + 2] = 220;
        data[offset + 3] = alpha;
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/** 海氷マスクをオフスクリーン Canvas に構築する。 */
function buildSeaIceBitmap(
  oceanCurrent: OceanCurrentResult,
  grid: Grid,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const seaIceGrid = oceanCurrent.monthlySeaIceMask[0];
  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const row = seaIceGrid[r];
    if (!row) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      if (!row[c]) continue;
      const offset = (imageY * cols + c) * 4;
      data[offset] = 230;
      data[offset + 1] = 240;
      data[offset + 2] = 250;
      data[offset + 3] = 217; // ~85% opacity
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/** オーバーレイビットマップを 2 オフセットで主 Canvas に重ね描き、経度循環を実現する。 */
function drawOverlayBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: HTMLCanvasElement,
  normPanPx: number,
): void {
  const previousSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const drawOffset of [normPanPx, normPanPx - CANVAS_WIDTH_PX]) {
    ctx.drawImage(bitmap, drawOffset, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
  }
  ctx.imageSmoothingEnabled = previousSmoothing;
}

/**
 * 風ベクトル（卓越風）を等間隔の格子点に短い矢印として描く。
 *
 * - サンプル間隔: 経度 30°・緯度 15°（密集回避と読み取りやすさのバランス）
 * - 矢印長: 風速に比例（meanWindSpeedMps 5 m/s で約 14 px）
 * - 矢印色: 薄青（地形・ITCZ と分離する寒色系）
 * - 経度循環: 3 オフセット（norm-W / norm / norm+W）で重ね描き
 *
 * v 軸（南北）は Canvas Y 軸と反転（北 = Y 小）するので、描画では `-vMps` を使う。
 */
function drawWindVectors(
  ctx: CanvasRenderingContext2D,
  windField: GridMap<WindVector>,
  grid: Grid,
  normPanPx: number,
): void {
  const sampleLatStepDeg = 15;
  const sampleLonStepDeg = 30;
  // m/s 1 を Canvas px に換算する係数（5 m/s で約 14 px の矢印長）
  const speedToPx = 14 / 5;
  const arrowHeadPx = 4;

  ctx.strokeStyle = '#aac8e0';
  ctx.fillStyle = '#aac8e0';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';

  for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
    for (let lat = -75; lat <= 75; lat += sampleLatStepDeg) {
      // grid の lat→i: latitudeDeg = -90 + (i + 0.5) * resolutionDeg
      const i = Math.round((lat + 90) / grid.resolutionDeg - 0.5);
      const row = windField[i];
      if (!row) continue;
      for (let lon = -180 + sampleLonStepDeg / 2; lon < 180; lon += sampleLonStepDeg) {
        const j = Math.round((lon + 180) / grid.resolutionDeg - 0.5);
        const wind = row[j];
        if (!wind) continue;

        const { x: x0, y: y0 } = projectRaw(lat, lon, VIEWPORT, drawOffset);
        if (x0 < -50 || x0 > CANVAS_WIDTH_PX + 50) continue;

        // 風ベクトルから矢印終点へ。Canvas の Y は北 = 0、南 = height。v(北向き正) は -dy で反映。
        const dx = wind.uMps * speedToPx;
        const dy = -wind.vMps * speedToPx;
        const x1 = x0 + dx;
        const y1 = y0 + dy;

        // 線
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // 矢印先端（簡易三角）
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 1) {
          const headDx = (dx / length) * arrowHeadPx;
          const headDy = (dy / length) * arrowHeadPx;
          // 直交方向の半幅
          const perpDx = -headDy * 0.6;
          const perpDy = headDx * 0.6;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 - headDx + perpDx, y1 - headDy + perpDy);
          ctx.lineTo(x1 - headDx - perpDx, y1 - headDy - perpDy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
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
  oceanCurrentBitmap: HTMLCanvasElement | null,
  seaIceBitmap: HTMLCanvasElement | null,
  influenceBandBitmap: HTMLCanvasElement | null,
  centerLineBands: readonly BandPoint[] | null,
  windField: GridMap<WindVector> | null,
  grid: Grid | null,
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

  // 海流オーバーレイは地形の上、grid 線の下に描く（海洋セルを暖/寒で着色）。
  if (legendVisibility.oceanCurrents && oceanCurrentBitmap) {
    drawOverlayBitmap(ctx, oceanCurrentBitmap, norm);
  }
  // 海氷は最後に陸海の上にかぶせる（白で覆う）。
  if (legendVisibility.seaIce && seaIceBitmap) {
    drawOverlayBitmap(ctx, seaIceBitmap, norm);
  }

  drawGrid(ctx, norm);

  if (legendVisibility.itczInfluenceBand && influenceBandBitmap) {
    drawInfluenceBandBitmap(ctx, influenceBandBitmap, norm);
  }
  if (legendVisibility.itczCenterLine && centerLineBands && centerLineBands.length > 0) {
    drawCenterLine(ctx, centerLineBands, norm);
  }
  if (legendVisibility.windVectors && windField && grid) {
    drawWindVectors(ctx, windField, grid, norm);
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
  const windBelt = useResultsStore((s) => s.windBelt);
  const oceanCurrent = useResultsStore((s) => s.oceanCurrent);
  const grid = useResultsStore((s) => s.grid);
  const currentSeason = useUIStore((s) => s.currentSeason);
  const legendVisibility = useUIStore((s) => s.legendVisibility);
  const baseInfluenceHalfWidthDeg = useParamsStore(
    (s) => s.itczParams.baseInfluenceHalfWidthDeg,
  );
  const oceanWarmMaxRise = useParamsStore(
    (s) => s.oceanCurrentParams.warmCurrentMaxRiseCelsius,
  );

  // grid 変化時にオフスクリーン地形ビットマップを再構築する（地形生成は重いので memoize）
  const terrainBitmap = useMemo(() => (grid ? buildTerrainBitmap(grid) : null), [grid]);

  // 海流オーバーレイ・海氷ビットマップ（[oceanCurrent, grid] が変化するたび再構築）
  const oceanCurrentBitmap = useMemo(
    () => (oceanCurrent && grid ? buildOceanCurrentBitmap(oceanCurrent, grid, oceanWarmMaxRise) : null),
    [oceanCurrent, grid, oceanWarmMaxRise],
  );
  const seaIceBitmap = useMemo(
    () => (oceanCurrent && grid ? buildSeaIceBitmap(oceanCurrent, grid) : null),
    [oceanCurrent, grid],
  );

  // ITCZ + season + halfwidth から bands を導出し、ビットマップとセンターラインの両方で再利用する
  const bands = useMemo(
    () => (itcz ? computeBandPoints(itcz, currentSeason, baseInfluenceHalfWidthDeg) : null),
    [itcz, currentSeason, baseInfluenceHalfWidthDeg],
  );
  const influenceBandBitmap = useMemo(
    () => (bands && bands.length > 0 ? buildInfluenceBandBitmap(bands) : null),
    [bands],
  );

  // 風ベクトル（Step 2）。年平均では月別を平均、月別ならその月のフィールドを使う
  const windField = useMemo<GridMap<WindVector> | null>(() => {
    if (!windBelt) return null;
    if (currentSeason === 'annual') {
      // 年平均: 12 ヶ月の風ベクトルをセル単位で平均
      const months = windBelt.monthlyPrevailingWind;
      const firstMonth = months[0];
      if (!firstMonth) return null;
      const rows = firstMonth.length;
      const cols = firstMonth[0]?.length ?? 0;
      const averaged: WindVector[][] = new Array(rows);
      for (let i = 0; i < rows; i++) {
        const row: WindVector[] = new Array(cols);
        for (let j = 0; j < cols; j++) {
          let sumU = 0;
          let sumV = 0;
          for (const monthField of months) {
            const cell = monthField[i]?.[j];
            if (cell) {
              sumU += cell.uMps;
              sumV += cell.vMps;
            }
          }
          row[j] = { uMps: sumU / months.length, vMps: sumV / months.length };
        }
        averaged[i] = row;
      }
      return averaged;
    }
    return windBelt.monthlyPrevailingWind[currentSeason] ?? null;
  }, [windBelt, currentSeason]);

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
    drawMap(
      ctx,
      panOffsetPx,
      terrainBitmap,
      oceanCurrentBitmap,
      seaIceBitmap,
      influenceBandBitmap,
      bands,
      windField,
      grid,
      legendVisibility,
    );
  }, [
    panOffsetPx,
    terrainBitmap,
    oceanCurrentBitmap,
    seaIceBitmap,
    influenceBandBitmap,
    bands,
    windField,
    grid,
    legendVisibility,
  ]);

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
