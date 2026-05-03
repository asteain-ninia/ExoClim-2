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
  AirflowResult,
  Cell,
  ClimateZoneResult,
  CollisionPoint,
  CurrentStreamline,
  Grid,
  GridMap,
  IsothermLine,
  ITCZResult,
  OceanCurrentResult,
  PrecipitationLabel,
  PrecipitationResult,
  PressureCenter,
  TemperatureResult,
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
  unprojectRaw,
  type CanvasViewport,
} from './projections';

/**
 * Canvas 固定サイズ（Equirectangular 2:1 比、1° = 3.5 px の拡大表示）。
 * 1° = 1px は情報密度が低かったため、1° = 3.5px に拡大して読みやすくする。
 * 2:1 比は世界地図の標準的な縦横比（[要件定義書.md §2.3.1]）。
 */
export const CANVAS_WIDTH_PX = 1260;
export const CANVAS_HEIGHT_PX = 630;

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
 *   warm: 橙色 #dc823c に絶対値スケール α（warmMaxCelsius で正規化）
 *   cold: 青色 #3c82dc に絶対値スケール α（coldMaxCelsius で正規化）
 *   neutral: 透明
 *
 * 暖流と寒流で max が異なるため（既定 +15 / -10）、片方だけで正規化すると寒流が
 * 最大でも 0.67 までしか濃くならず西岸寒流が見えにくくなる。両者を別々に正規化する。
 *
 * 季節依存なしのため、`monthlyCoastalTemperatureCorrectionCelsius[0]`（1 月）を代表値として使う。
 * 将来 Step 5 気温フィードバックで月別差分が出たら currentSeason 依存に拡張する。
 */
function buildOceanCurrentBitmap(
  oceanCurrent: OceanCurrentResult,
  grid: Grid,
  warmMaxCelsius: number,
  coldMaxCelsius: number,
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
      const max = correction > 0 ? warmMaxCelsius : coldMaxCelsius;
      const intensity = Math.min(1, Math.abs(correction) / Math.max(1, max));
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

/**
 * 圧力 anomaly ヒートマップをオフスクリーン Canvas に構築する。
 *
 * 正値（高気圧）→ 赤、負値（低気圧）→ 青。値の絶対値で alpha スケール。
 * 参照月は currentSeason に従う（年平均なら 12 ヶ月平均）。
 */
function buildPressureAnomalyBitmap(
  airflow: AirflowResult,
  monthIndex: number | null,
  grid: Grid,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  // monthIndex = null なら 12 ヶ月平均
  const monthsArr = airflow.monthlyPressureAnomalyHpa;
  const getValue = (i: number, j: number): number => {
    if (monthIndex !== null) {
      return monthsArr[monthIndex]?.[i]?.[j] ?? 0;
    }
    let sum = 0;
    let count = 0;
    for (const month of monthsArr) {
      const v = month[i]?.[j];
      if (v !== undefined) {
        sum += v;
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  };

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;
  const SCALE_HPA = 12;

  for (let r = 0; r < rows; r++) {
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const value = getValue(r, c);
      if (value === 0) continue;
      const intensity = Math.min(1, Math.abs(value) / SCALE_HPA);
      const alpha = Math.round(intensity * 0.45 * 255);
      const offset = (imageY * cols + c) * 4;
      if (value > 0) {
        data[offset] = 220;
        data[offset + 1] = 80;
        data[offset + 2] = 80;
        data[offset + 3] = alpha;
      } else {
        data[offset] = 60;
        data[offset + 1] = 110;
        data[offset + 2] = 200;
        data[offset + 3] = alpha;
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/**
 * 気温ヒートマップの表示レンジ（°C）。`TEMPERATURE_COLD_CELSIUS` 以下を最も冷たい色、
 * `TEMPERATURE_HOT_CELSIUS` 以上を最も暖かい色にし、間は線形補間する。
 * 旧 ExoClim と同じく地球の Köppen 帯境界（-30 / +30）に揃えた。
 */
const TEMPERATURE_COLD_CELSIUS = -30;
const TEMPERATURE_HOT_CELSIUS = 30;
/** 気温ヒートマップの最大不透明度（255 中、地形が透けて見える程度）。 */
const TEMPERATURE_HEATMAP_ALPHA = 165;

/**
 * 気温ヒートマップビットマップを構築する。
 *
 * 月別表示なら指定月の `monthlyTemperatureCelsius`、年平均なら `annualMeanTemperatureCelsius`
 * を読み、温度を青→白→赤の 3 色グラデーションに変換する。
 * 値が `TEMPERATURE_COLD_CELSIUS` 以下なら濃青、`TEMPERATURE_HOT_CELSIUS` 以上なら濃赤、
 * 中央付近（0 °C）は白っぽく半透明。
 */
function buildTemperatureBitmap(
  temperature: TemperatureResult,
  monthIndex: number | null,
  grid: Grid,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const sourceMap =
    monthIndex !== null
      ? temperature.monthlyTemperatureCelsius[monthIndex]
      : temperature.annualMeanTemperatureCelsius;
  if (!sourceMap) return off;

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;
  const range = TEMPERATURE_HOT_CELSIUS - TEMPERATURE_COLD_CELSIUS;

  for (let r = 0; r < rows; r++) {
    const tempRow = sourceMap[r];
    if (!tempRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const t = tempRow[c];
      if (t === undefined || !Number.isFinite(t)) continue;
      const offset = (imageY * cols + c) * 4;
      // -1..+1 に正規化（-30 = -1、+30 = +1）
      const normalized = Math.max(-1, Math.min(1, (t - (TEMPERATURE_COLD_CELSIUS + range / 2)) / (range / 2)));
      // 青(80,130,220) → 白(240,240,240) → 赤(220,80,60) の補間
      let red: number;
      let green: number;
      let blue: number;
      if (normalized < 0) {
        const k = -normalized;
        red = Math.round(240 + (80 - 240) * k);
        green = Math.round(240 + (130 - 240) * k);
        blue = Math.round(240 + (220 - 240) * k);
      } else {
        const k = normalized;
        red = Math.round(240 + (220 - 240) * k);
        green = Math.round(240 + (80 - 240) * k);
        blue = Math.round(240 + (60 - 240) * k);
      }
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = TEMPERATURE_HEATMAP_ALPHA;
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/**
 * 降水ラベル overlay の表示色（[docs/spec/06_降水.md §4]）。
 *   dry: 黄系（乾燥砂漠の連想）
 *   wet: 水色（湿潤の連想）
 *   very_wet: 濃い青（多湿の連想）
 *   normal: 透明（地形を阻害しない）
 */
const PRECIPITATION_LABEL_COLORS: Readonly<Record<PrecipitationLabel, RGB | null>> = {
  dry: { r: 220, g: 180, b: 90 },
  normal: null,
  wet: { r: 70, g: 160, b: 220 },
  very_wet: { r: 40, g: 90, b: 180 },
};

/** 降水ラベル overlay の最大不透明度（255 中、地形が透けて見える程度）。 */
const PRECIPITATION_LABEL_ALPHA = 130;

/**
 * 降水ラベル overlay ビットマップを構築する（[docs/spec/06_降水.md §5]）。
 *
 * 月別表示なら指定月の `monthlyPrecipitationLabels`、年平均なら 12 ヶ月分から
 * セル毎の最頻ラベルを採用する。海洋セルは透明（陸の湿度ラベル可視化のみ）。
 */
function buildPrecipitationBitmap(
  precipitation: PrecipitationResult,
  monthIndex: number | null,
  grid: Grid,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const monthsArr = precipitation.monthlyPrecipitationLabels;
  const getLabel = (i: number, j: number): PrecipitationLabel => {
    if (monthIndex !== null) {
      return monthsArr[monthIndex]?.[i]?.[j] ?? 'normal';
    }
    // 年平均: 12 ヶ月の最頻ラベル
    const counts: Record<PrecipitationLabel, number> = {
      dry: 0,
      normal: 0,
      wet: 0,
      very_wet: 0,
    };
    for (const month of monthsArr) {
      const v = month[i]?.[j] ?? 'normal';
      counts[v]++;
    }
    let best: PrecipitationLabel = 'normal';
    let bestCount = -1;
    (Object.keys(counts) as PrecipitationLabel[]).forEach((k) => {
      if (counts[k] > bestCount) {
        best = k;
        bestCount = counts[k];
      }
    });
    return best;
  };

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const cellRow = grid.cells[r];
    if (!cellRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const cell = cellRow[c];
      if (!cell || !cell.isLand) continue; // 陸地のみ描画
      const label = getLabel(r, c);
      const color = PRECIPITATION_LABEL_COLORS[label];
      if (!color) continue; // normal は透明
      const offset = (imageY * cols + c) * 4;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = PRECIPITATION_LABEL_ALPHA;
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/**
 * Köppen-Geiger 気候帯の表示色（[docs/spec/07_気候帯.md §5]）。
 * Wikipedia / Pasta `koppenpasta` の標準配色を踏襲（A 群青、B 群暖色、C 群緑、D 群紫、E 群灰）。
 * 未マッピングのコード（系統 2 等）はフォールバックで透明扱い。
 */
const KOPPEN_ZONE_COLORS: Readonly<Record<string, RGB>> = {
  // Tropical (A)
  Af: { r: 0, g: 0, b: 254 },
  Am: { r: 0, g: 119, b: 255 },
  As: { r: 70, g: 169, b: 250 },
  Aw: { r: 70, g: 169, b: 250 },
  // Arid (B)
  BWh: { r: 255, g: 0, b: 0 },
  BWk: { r: 255, g: 150, b: 150 },
  BSh: { r: 245, g: 165, b: 0 },
  BSk: { r: 255, g: 220, b: 100 },
  // Temperate (C)
  Csa: { r: 255, g: 255, b: 0 },
  Csb: { r: 198, g: 199, b: 0 },
  Csc: { r: 150, g: 150, b: 0 },
  Cwa: { r: 150, g: 255, b: 150 },
  Cwb: { r: 100, g: 200, b: 100 },
  Cwc: { r: 50, g: 150, b: 50 },
  Cfa: { r: 200, g: 255, b: 80 },
  Cfb: { r: 100, g: 255, b: 80 },
  Cfc: { r: 50, g: 200, b: 0 },
  // Continental (D)
  Dsa: { r: 255, g: 0, b: 255 },
  Dsb: { r: 200, g: 0, b: 200 },
  Dsc: { r: 150, g: 50, b: 150 },
  Dsd: { r: 150, g: 100, b: 150 },
  Dwa: { r: 170, g: 175, b: 255 },
  Dwb: { r: 90, g: 120, b: 220 },
  Dwc: { r: 75, g: 80, b: 180 },
  Dwd: { r: 50, g: 0, b: 135 },
  Dfa: { r: 0, g: 255, b: 255 },
  Dfb: { r: 56, g: 200, b: 200 },
  Dfc: { r: 0, g: 125, b: 125 },
  Dfd: { r: 0, g: 70, b: 95 },
  // Polar (E)
  ET: { r: 178, g: 178, b: 178 },
  EF: { r: 102, g: 102, b: 102 },
};

/** 気候帯 overlay の不透明度（255 中、地形が透けて見える程度）。 */
const CLIMATE_ZONE_ALPHA = 200;

/**
 * 気候帯 overlay ビットマップを構築する（[docs/spec/07_気候帯.md §5]）。
 *
 * セル毎に `zoneCodes[i][j]` を読み、Köppen 配色テーブルで RGB 化する。
 * 海洋セル（`zoneCodes[i][j] === null`）は透明。系統 2（Pasta Bioclimate System）の
 * コードは現状フォールバック（未マッピングは透明）として扱い、Phase 4 後段で配色を追加する。
 */
function buildClimateZoneBitmap(
  climateZone: ClimateZoneResult,
  grid: Grid,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const codeRow = climateZone.zoneCodes[r];
    if (!codeRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const code = codeRow[c];
      if (!code) continue; // 海洋セルは透明
      const color = KOPPEN_ZONE_COLORS[code];
      if (!color) continue; // 未マッピングコードは透明
      const offset = (imageY * cols + c) * 4;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = CLIMATE_ZONE_ALPHA;
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/** 海氷の表示用フェード幅（°）。しきい値の前後 SEA_ICE_FADE_WIDTH_DEG で α を線形補間する。 */
const SEA_ICE_FADE_WIDTH_DEG = 5;
/** 海氷の最大不透明度（α 1 のときの最終 alpha 値、255 中）。 */
const SEA_ICE_MAX_ALPHA = 217; // ~85%

/**
 * 海氷オーバーレイをオフスクリーン Canvas に構築する。
 *
 * `OceanCurrentResult.monthlySeaIceMask` は二値だが、表示は「特定緯度でスパーンと切れる」
 * のを避けるため、UI 側でしきい値前後 SEA_ICE_FADE_WIDTH_DEG の範囲に α 線形フェードをかける:
 *   - 基本配置（|lat| > threshold-fade）: 線形フェード [0, 1] → 1
 *   - 寒流沿い東岸延長（|lat| ≤ threshold-fade で mask=true、[docs/spec/03_海流.md §4.7]）:
 *     full alpha（緯度フェードは非対称領域なので適用しない）
 * 海洋セル (`!cell.isLand`) のみを対象とする。
 *
 * 二値 mask は Step 5 気温（雪氷フィードバック）が消費するため、計算層では維持。
 * UI 側で表示を滑らかにするのは凡例と同等の責務（[要件定義書.md §2.3.2]）。
 *
 * `mask` を null で渡すと「緯度しきい値のみ」（年平均など季節非依存表示）に縮退する。
 */
function buildSeaIceBitmap(
  grid: Grid,
  mask: GridMap<boolean> | null,
  thresholdDeg: number,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  const fadeStart = thresholdDeg - SEA_ICE_FADE_WIDTH_DEG;
  const fadeEnd = thresholdDeg + SEA_ICE_FADE_WIDTH_DEG;

  for (let r = 0; r < rows; r++) {
    const cellRow = grid.cells[r];
    if (!cellRow) continue;
    const maskRow = mask?.[r];
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const cell = cellRow[c];
      if (!cell || cell.isLand) continue;
      const absLat = Math.abs(cell.latitudeDeg);
      const inBasicFadeRange = absLat > fadeStart;
      const isExtensionCell = !inBasicFadeRange && maskRow?.[c] === true;
      if (!inBasicFadeRange && !isExtensionCell) continue;
      // mask が指定されている場合、基本配置帯でも実マスクを尊重（陸接続などで非氷化されるケースに対応）
      if (inBasicFadeRange && maskRow && maskRow[c] !== true) continue;
      const offset = (imageY * cols + c) * 4;
      data[offset] = 230;
      data[offset + 1] = 240;
      data[offset + 2] = 250;
      if (isExtensionCell) {
        data[offset + 3] = SEA_ICE_MAX_ALPHA;
      } else {
        const t = absLat >= fadeEnd ? 1 : (absLat - fadeStart) / (fadeEnd - fadeStart);
        data[offset + 3] = Math.round(t * SEA_ICE_MAX_ALPHA);
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/** 沿岸湧昇マスクオーバーレイの最大不透明度（255 中、~55%）。 */
const COASTAL_UPWELLING_MAX_ALPHA = 140;

/** ENSO 候補マスクオーバーレイの最大不透明度（255 中、~45%、診断的なので湧昇より控えめ）。 */
const ENSO_CANDIDATE_MAX_ALPHA = 115;

/**
 * ENSO ダイポール候補マスクオーバーレイをオフスクリーン Canvas に構築する
 * （[docs/spec/03_海流.md §4.10]）。
 *
 * 「東西を陸地に挟まれた赤道付近の海域」を温色（オレンジ寄り）で塗る。Pasta は El Niño /
 * La Niña の振動を simulate しないため候補海域マスクのみ。半透明で重畳して、地形・海流
 * との関係を読み取れるようにする。
 */
function buildEnsoCandidateBitmap(
  grid: Grid,
  mask: GridMap<boolean>,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const maskRow = mask[r];
    const cellRow = grid.cells[r];
    if (!maskRow || !cellRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      if (maskRow[c] !== true) continue;
      const cell = cellRow[c];
      if (!cell || cell.isLand) continue;
      const offset = (imageY * cols + c) * 4;
      data[offset] = 220;
      data[offset + 1] = 100;
      data[offset + 2] = 60;
      data[offset + 3] = ENSO_CANDIDATE_MAX_ALPHA;
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return off;
}

/**
 * 沿岸湧昇マスクオーバーレイをオフスクリーン Canvas に構築する
 * （[docs/spec/02_風帯.md] / [docs/spec/03_海流.md §既知の未対応事項]）。
 *
 * Step 2 風帯が出力する `WindBeltResult.monthlyCoastalUpwellingMask` を per-cell に塗る。
 * 寒流強化要因として可視化する候補だったマスク（[現状.md §既知の未対応事項]）。
 * 色は深いシアン（湧昇の冷水・栄養塩イメージ）。
 */
function buildCoastalUpwellingBitmap(
  grid: Grid,
  mask: GridMap<boolean>,
): HTMLCanvasElement {
  const cols = grid.longitudeCount;
  const rows = grid.latitudeCount;
  const off = document.createElement('canvas');
  off.width = cols;
  off.height = rows;
  const offCtx = off.getContext('2d');
  if (!offCtx) return off;

  const imgData = offCtx.createImageData(cols, rows);
  const data = imgData.data;

  for (let r = 0; r < rows; r++) {
    const maskRow = mask[r];
    const cellRow = grid.cells[r];
    if (!maskRow || !cellRow) continue;
    const imageY = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      if (maskRow[c] !== true) continue;
      const cell = cellRow[c];
      if (!cell || cell.isLand) continue;
      const offset = (imageY * cols + c) * 4;
      data[offset] = 32;
      data[offset + 1] = 178;
      data[offset + 2] = 200;
      data[offset + 3] = COASTAL_UPWELLING_MAX_ALPHA;
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
  smoothing = false,
): void {
  const previousSmoothing = ctx.imageSmoothingEnabled;
  const previousQuality = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = smoothing;
  if (smoothing) ctx.imageSmoothingQuality = 'high';
  for (const drawOffset of [normPanPx, normPanPx - CANVAS_WIDTH_PX]) {
    ctx.drawImage(bitmap, drawOffset, 0, CANVAS_WIDTH_PX, CANVAS_HEIGHT_PX);
  }
  ctx.imageSmoothingEnabled = previousSmoothing;
  ctx.imageSmoothingQuality = previousQuality;
}

/**
 * 等温線（[docs/spec/05_気温.md §4.12]）を白系の細線で描く。
 *
 * 各等値レベルを 1 本の連続線としてではなく独立セグメント集合として渡されるため、
 * セグメント単位で stroke する。ラベル（温度値）は経度 0° の交点付近に小さく表示。
 *
 * 経度方向は 3 オフセット（norm-W / norm / norm+W）で循環描画。
 * 0°C 線は強調（黄色 + 太め）、その他は淡い水色。
 */
function drawIsotherms(
  ctx: CanvasRenderingContext2D,
  isotherms: ReadonlyArray<IsothermLine>,
  normPanPx: number,
): void {
  ctx.lineCap = 'round';
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const line of isotherms) {
    const isFreezingPoint = Math.abs(line.temperatureCelsius) < 1e-6;
    ctx.strokeStyle = isFreezingPoint ? '#f0e060' : '#b0d0e0';
    ctx.lineWidth = isFreezingPoint ? 1.4 : 0.9;

    for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
      ctx.beginPath();
      for (const seg of line.segments) {
        const { x: x0, y: y0 } = projectRaw(
          seg.start.latitudeDeg,
          seg.start.longitudeDeg,
          VIEWPORT,
          drawOffset,
        );
        const { x: x1, y: y1 } = projectRaw(
          seg.end.latitudeDeg,
          seg.end.longitudeDeg,
          VIEWPORT,
          drawOffset,
        );
        // 経度をまたぐ長い線分（pan ループのアーティファクト）は描画しない
        const dxAbs = Math.abs(x1 - x0);
        if (dxAbs > CANVAS_WIDTH_PX / 2) continue;
        if (x0 < -50 && x1 < -50) continue;
        if (x0 > CANVAS_WIDTH_PX + 50 && x1 > CANVAS_WIDTH_PX + 50) continue;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  }

  // ラベル: 線描画と同じく 3 オフセットで循環描画する。
  // 経度 0° 付近の代表セグメントを 1 つ選び、その位置を 3 タイル分（西/中央/東）に
  // 投影してラベルを置く。pan で経度 0° タイルが画面外に出ても、隣接タイルのラベルが
  // 見える状態を維持する。
  for (const line of isotherms) {
    const isFreezingPoint = Math.abs(line.temperatureCelsius) < 1e-6;
    // 経度 0° に最も近いセグメントを 1 つ選ぶ（描画は 3 オフセットで重複）
    let representative: { lat: number; lon: number } | null = null;
    for (const seg of line.segments) {
      const midLon = (seg.start.longitudeDeg + seg.end.longitudeDeg) / 2;
      if (Math.abs(midLon) < 5) {
        representative = {
          lat: (seg.start.latitudeDeg + seg.end.latitudeDeg) / 2,
          lon: midLon,
        };
        break;
      }
    }
    if (!representative) continue;
    for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
      const { x, y } = projectRaw(representative.lat, representative.lon, VIEWPORT, drawOffset);
      // ラベル幅相当（30px）を超えて画面外なら省略
      if (x < -30 || x > CANVAS_WIDTH_PX + 30) continue;
      // 影で輪郭
      ctx.fillStyle = '#0a1722';
      ctx.fillText(`${line.temperatureCelsius}°`, x + 1, y + 1);
      ctx.fillStyle = isFreezingPoint ? '#f0e060' : '#d8e6f4';
      ctx.fillText(`${line.temperatureCelsius}°`, x, y);
    }
  }
}

/** Step 4 の気圧中心（H = 高気圧 / L = 低気圧）を文字マーカーで描く。 */
function drawPressureCenters(
  ctx: CanvasRenderingContext2D,
  centers: ReadonlyArray<PressureCenter>,
  normPanPx: number,
): void {
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
    for (const center of centers) {
      const { x, y } = projectRaw(
        center.position.latitudeDeg,
        center.position.longitudeDeg,
        VIEWPORT,
        drawOffset,
      );
      // マーカー文字幅は 10px 程度、その半分の余白を取る
      if (x < -10 || x > CANVAS_WIDTH_PX + 10) continue;
      const isHigh = center.type === 'high';
      const label = isHigh ? 'H' : 'L';
      const color = isHigh ? '#f04040' : '#4090f0';
      // 影で輪郭を出す
      ctx.fillStyle = '#000000';
      ctx.fillText(label, x + 1, y + 1);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y);
    }
  }
}

/** 最終地表風（Step 4）を Step 2 と同じ格子点に色違い（黄系）の矢印で描く。
 *
 * 3 オフセット（西タイル / 主タイル / 東タイル）すべてに描画し、cull は **行わない**。
 * サンプル数（~12 lon × 11 lat × 3 offset = 396 矢印）は小さく、Canvas クリッピングが
 * 自動で off-canvas を切り捨てる。cull check を入れると、サンプル離散点と margin の
 * 関係で「東縁から少し外に出た wrap 矢印」が消えてしまい、pan 中の見た目が断続的になる
 * （[開発ガイド.md §6.2.2]）。
 */
function drawFinalWindVectors(
  ctx: CanvasRenderingContext2D,
  windField: GridMap<WindVector>,
  grid: Grid,
  normPanPx: number,
): void {
  const sampleLatStepDeg = 15;
  const sampleLonStepDeg = 30;
  const speedToPx = 14 / 5;
  const arrowHeadPx = 4;

  ctx.strokeStyle = '#f0d870';
  ctx.fillStyle = '#f0d870';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';

  for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
    for (let lat = -75; lat <= 75; lat += sampleLatStepDeg) {
      const i = Math.round((lat + 90) / grid.resolutionDeg - 0.5);
      const row = windField[i];
      if (!row) continue;
      for (let lon = -180 + sampleLonStepDeg / 2; lon < 180; lon += sampleLonStepDeg) {
        const j = Math.round((lon + 180) / grid.resolutionDeg - 0.5);
        const wind = row[j];
        if (!wind) continue;
        const { x: x0, y: y0 } = projectRaw(lat, lon, VIEWPORT, drawOffset);
        const dx = wind.uMps * speedToPx;
        const dy = -wind.vMps * speedToPx;
        const x1 = x0 + dx;
        const y1 = y0 + dy;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 1) {
          const headDx = (dx / length) * arrowHeadPx;
          const headDy = (dy / length) * arrowHeadPx;
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
        // cull は行わず Canvas クリッピングに任せる（[開発ガイド.md §6.2.2]）

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

/**
 * 海流ストリームライン（[docs/spec/03_海流.md §4.1〜§4.5]）を分類別の色で描画する。
 *
 * - warm: 暖色（橙赤）
 * - cold: 寒色（水色）
 * - neutral: 薄水色（赤道流・中緯度東向き反転など）
 *
 * 経度循環は 3 オフセット（norm-W / norm / norm+W）で重ね描き。
 * セグメントの両端が全タイル外なら描画スキップ（[開発ガイド.md §6.2.2]）。
 * 経度ラップで dx > W/2 の極端なジャンプは別セグメントとして分断する。
 */
function drawCurrentStreamlines(
  ctx: CanvasRenderingContext2D,
  streamlines: ReadonlyArray<CurrentStreamline>,
  normPanPx: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stream of streamlines) {
    if (stream.path.length < 2) continue;
    let strokeStyle: string;
    let lineWidth: number;
    switch (stream.classification) {
      case 'warm':
        strokeStyle = '#ff7040';
        lineWidth = 2;
        break;
      case 'cold':
        strokeStyle = '#40a0ff';
        lineWidth = 2;
        break;
      default:
        strokeStyle = '#a0c8e0';
        lineWidth = 1.4;
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
      ctx.beginPath();
      let prev: { x: number; y: number } | null = null;
      for (const point of stream.path) {
        const { x, y } = projectRaw(point.latitudeDeg, point.longitudeDeg, VIEWPORT, drawOffset);
        if (!prev) {
          ctx.moveTo(x, y);
        } else {
          // 経度ラップ起因の長距離ジャンプを分断
          const dx = Math.abs(x - prev.x);
          if (dx > CANVAS_WIDTH_PX / 2) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        prev = { x, y };
      }
      ctx.stroke();
    }
  }
}

/** 衝突点を 3 オフセットで丸マーカーとして描画する（[docs/spec/03_海流.md §4.5 / §4.6]）。
 *  - equatorial_current: 黄色（暖流分岐の起点、赤道流→西岸境界流）
 *  - polar_current: 紫色（極流が陸に衝突して終端）
 */
function drawCollisionPoints(
  ctx: CanvasRenderingContext2D,
  collisions: ReadonlyArray<CollisionPoint>,
  normPanPx: number,
): void {
  for (const point of collisions) {
    const fillStyle = point.type === 'equatorial_current' ? '#ffd040' : '#c060ff';
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = '#202028';
    ctx.lineWidth = 1;
    for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
      const { x, y } = projectRaw(
        point.position.latitudeDeg,
        point.position.longitudeDeg,
        VIEWPORT,
        drawOffset,
      );
      // 画面外（マージン込み）はスキップ（[§6.2.2] 単一サンプルなので margin は半径相当の余白でよい）
      if (x < -10 || x > CANVAS_WIDTH_PX + 10) continue;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** マウスオーバー中のセル（[現状.md §6 U15]、P4-40）に黄色枠を描く。
 *  hovered grid index (lat/lon) からセル境界の (lat ± resolution/2, lon ± resolution/2) を
 *  計算し、3 オフセットで stroke。経度ラップ起因の長距離ジャンプは drawCurrentStreamlines と
 *  同じく `dx > W/2` で skip。
 */
function drawHoveredCellHighlight(
  ctx: CanvasRenderingContext2D,
  hoveredCell: { latIndex: number; lonIndex: number },
  grid: Grid,
  normPanPx: number,
): void {
  const cell = grid.cells[hoveredCell.latIndex]?.[hoveredCell.lonIndex];
  if (!cell) return;
  const half = grid.resolutionDeg / 2;
  const minLat = cell.latitudeDeg - half;
  const maxLat = cell.latitudeDeg + half;
  const minLon = cell.longitudeDeg - half;
  const maxLon = cell.longitudeDeg + half;
  ctx.strokeStyle = '#ffe060';
  ctx.lineWidth = 2;
  for (const drawOffset of [normPanPx - CANVAS_WIDTH_PX, normPanPx, normPanPx + CANVAS_WIDTH_PX]) {
    const tl = projectRaw(maxLat, minLon, VIEWPORT, drawOffset);
    const tr = projectRaw(maxLat, maxLon, VIEWPORT, drawOffset);
    const br = projectRaw(minLat, maxLon, VIEWPORT, drawOffset);
    const bl = projectRaw(minLat, minLon, VIEWPORT, drawOffset);
    // 経度ラップで矩形が画面幅を超えるケースは描かない（座標 wrap 起因の歪み防止）
    if (Math.abs(tr.x - tl.x) > CANVAS_WIDTH_PX / 2) continue;
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.stroke();
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
  coastalUpwellingBitmap: HTMLCanvasElement | null,
  ensoCandidateBitmap: HTMLCanvasElement | null,
  pressureAnomalyBitmap: HTMLCanvasElement | null,
  temperatureBitmap: HTMLCanvasElement | null,
  precipitationBitmap: HTMLCanvasElement | null,
  climateZoneBitmap: HTMLCanvasElement | null,
  influenceBandBitmap: HTMLCanvasElement | null,
  centerLineBands: readonly BandPoint[] | null,
  windField: GridMap<WindVector> | null,
  finalWindField: GridMap<WindVector> | null,
  pressureCenters: ReadonlyArray<PressureCenter> | null,
  isotherms: ReadonlyArray<IsothermLine> | null,
  oceanStreamlines: ReadonlyArray<CurrentStreamline> | null,
  collisionPoints: ReadonlyArray<CollisionPoint> | null,
  hoveredCell: { latIndex: number; lonIndex: number } | null,
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
  // 圧力 anomaly ヒートマップ（陸海の上）
  if (legendVisibility.pressureAnomaly && pressureAnomalyBitmap) {
    drawOverlayBitmap(ctx, pressureAnomalyBitmap, norm);
  }
  // 気温ヒートマップ（陸海の上、半透明で地形が透けて見える）
  if (legendVisibility.temperatureHeatmap && temperatureBitmap) {
    drawOverlayBitmap(ctx, temperatureBitmap, norm);
  }
  // 降水ラベル overlay（陸地のみ、半透明）
  if (legendVisibility.precipitationLabels && precipitationBitmap) {
    drawOverlayBitmap(ctx, precipitationBitmap, norm);
  }
  // 気候帯 overlay（陸地のみ、Köppen 配色）— 最終出力なので半透明度高めで主役表示。
  // [P4-61] 1° per-cell の「カックカク」感緩和のため bilinear smoothing を有効化。
  // 純色境界が薄くブレンドされて 1260×630 上で滑らかに見える。代償として境界の
  // intermediate ピクセルが Köppen 配色テーブルに無い色になるが、視覚的には自然
  // （実 Earth Köppen マップの遷移帯と同じ印象）。
  if (legendVisibility.climateZones && climateZoneBitmap) {
    drawOverlayBitmap(ctx, climateZoneBitmap, norm, true);
  }
  // 沿岸湧昇マスク（陸海の上、海氷の下、シアン半透明）
  if (legendVisibility.coastalUpwelling && coastalUpwellingBitmap) {
    drawOverlayBitmap(ctx, coastalUpwellingBitmap, norm);
  }
  // ENSO 候補マスク（陸海の上、海氷の下、温色半透明）— 沿岸湧昇と並行する診断 overlay
  if (legendVisibility.ensoCandidateMask && ensoCandidateBitmap) {
    drawOverlayBitmap(ctx, ensoCandidateBitmap, norm);
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
  // 海流ストリームライン（[docs/spec/03_海流.md §4.1〜§4.5]）— grid 線の上、矢印の前
  if (legendVisibility.oceanStreamlines && oceanStreamlines && oceanStreamlines.length > 0) {
    drawCurrentStreamlines(ctx, oceanStreamlines, norm);
  }
  // 海流衝突点マーカー（[docs/spec/03_海流.md §4.5 / §4.6]）— streamline の上に乗せて視認性確保
  if (legendVisibility.collisionPoints && collisionPoints && collisionPoints.length > 0) {
    drawCollisionPoints(ctx, collisionPoints, norm);
  }
  if (legendVisibility.windVectors && windField && grid) {
    drawWindVectors(ctx, windField, grid, norm);
  }
  if (legendVisibility.finalWindVectors && finalWindField && grid) {
    drawFinalWindVectors(ctx, finalWindField, grid, norm);
  }
  if (legendVisibility.pressureCenters && pressureCenters && pressureCenters.length > 0) {
    drawPressureCenters(ctx, pressureCenters, norm);
  }
  if (legendVisibility.isotherms && isotherms && isotherms.length > 0) {
    drawIsotherms(ctx, isotherms, norm);
  }
  // マウスオーバー中のセル黄枠（[現状.md §6 U15]、P4-40）— 全 overlay の上に描画
  if (hoveredCell && grid) {
    drawHoveredCellHighlight(ctx, hoveredCell, grid, norm);
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
  const airflow = useResultsStore((s) => s.airflow);
  const temperature = useResultsStore((s) => s.temperature);
  const precipitation = useResultsStore((s) => s.precipitation);
  const climateZone = useResultsStore((s) => s.climateZone);
  const grid = useResultsStore((s) => s.grid);
  const currentSeason = useUIStore((s) => s.currentSeason);
  const legendVisibility = useUIStore((s) => s.legendVisibility);
  const setHoveredCell = useUIStore((s) => s.setHoveredCell);
  const hoveredCell = useUIStore((s) => s.hoveredCell);
  const baseInfluenceHalfWidthDeg = useParamsStore(
    (s) => s.itczParams.baseInfluenceHalfWidthDeg,
  );
  const oceanWarmMaxRise = useParamsStore(
    (s) => s.oceanCurrentParams.warmCurrentMaxRiseCelsius,
  );
  const oceanColdMaxDrop = useParamsStore(
    (s) => s.oceanCurrentParams.coldCurrentMaxDropCelsius,
  );
  const seaIceThresholdDeg = useParamsStore(
    (s) => s.oceanCurrentParams.seaIceLatitudeThresholdDeg,
  );

  // grid 変化時にオフスクリーン地形ビットマップを再構築する（地形生成は重いので memoize）
  const terrainBitmap = useMemo(() => (grid ? buildTerrainBitmap(grid) : null), [grid]);

  // 海流オーバーレイ・海氷ビットマップ（[oceanCurrent, grid] が変化するたび再構築）
  const oceanCurrentBitmap = useMemo(
    () =>
      oceanCurrent && grid
        ? buildOceanCurrentBitmap(oceanCurrent, grid, oceanWarmMaxRise, oceanColdMaxDrop)
        : null,
    [oceanCurrent, grid, oceanWarmMaxRise, oceanColdMaxDrop],
  );
  const seaIceBitmap = useMemo(() => {
    if (!grid) return null;
    // 季節非依存（年平均）では実マスクを使わず緯度しきい値の対称表示で従来挙動を維持。
    // 月別表示時は monthlySeaIceMask[monthIndex] を使い、寒流沿い東岸延長（[§4.7]）を反映する。
    const mask =
      oceanCurrent && currentSeason !== 'annual'
        ? oceanCurrent.monthlySeaIceMask[currentSeason] ?? null
        : null;
    return buildSeaIceBitmap(grid, mask, seaIceThresholdDeg);
  }, [grid, oceanCurrent, currentSeason, seaIceThresholdDeg]);

  // 沿岸湧昇マスクビットマップ（windBelt.monthlyCoastalUpwellingMask 依存）
  const coastalUpwellingBitmap = useMemo(() => {
    if (!grid || !windBelt) return null;
    const monthIndex = currentSeason === 'annual' ? 0 : currentSeason;
    const mask = windBelt.monthlyCoastalUpwellingMask[monthIndex];
    if (!mask) return null;
    return buildCoastalUpwellingBitmap(grid, mask);
  }, [grid, windBelt, currentSeason]);

  // ENSO 候補マスクビットマップ（oceanCurrent.ensoDipoleCandidateMask 依存、季節非依存）
  const ensoCandidateBitmap = useMemo(() => {
    if (!grid || !oceanCurrent) return null;
    return buildEnsoCandidateBitmap(grid, oceanCurrent.ensoDipoleCandidateMask);
  }, [grid, oceanCurrent]);

  // 圧力 anomaly ビットマップ（airflow + currentSeason 依存）
  const pressureAnomalyBitmap = useMemo(() => {
    if (!airflow || !grid) return null;
    const monthIndex = currentSeason === 'annual' ? null : currentSeason;
    return buildPressureAnomalyBitmap(airflow, monthIndex, grid);
  }, [airflow, currentSeason, grid]);

  // 気温ヒートマップ（temperature + currentSeason 依存）
  const temperatureBitmap = useMemo(() => {
    if (!temperature || !grid) return null;
    const monthIndex = currentSeason === 'annual' ? null : currentSeason;
    return buildTemperatureBitmap(temperature, monthIndex, grid);
  }, [temperature, currentSeason, grid]);

  // 降水ラベル overlay ビットマップ（precipitation + currentSeason 依存）
  const precipitationBitmap = useMemo(() => {
    if (!precipitation || !grid) return null;
    const monthIndex = currentSeason === 'annual' ? null : currentSeason;
    return buildPrecipitationBitmap(precipitation, monthIndex, grid);
  }, [precipitation, currentSeason, grid]);

  // 気候帯 overlay ビットマップ（climateZone + grid 依存、季節非依存）
  const climateZoneBitmap = useMemo(
    () => (climateZone && grid ? buildClimateZoneBitmap(climateZone, grid) : null),
    [climateZone, grid],
  );

  // 海流ストリームライン（oceanCurrent + currentSeason 依存）。
  // 現状は月別差なし（同一値）だが、UI 側は currentSeason に追従して取り出す形にしておく。
  const oceanStreamlinesForSeason = useMemo<ReadonlyArray<CurrentStreamline> | null>(() => {
    if (!oceanCurrent) return null;
    const monthIndex = currentSeason === 'annual' ? 0 : currentSeason;
    return oceanCurrent.monthlyStreamlines[monthIndex] ?? null;
  }, [oceanCurrent, currentSeason]);

  // 海流衝突点（oceanCurrent + currentSeason 依存、現状は月別差なし）。
  const collisionPointsForSeason = useMemo<ReadonlyArray<CollisionPoint> | null>(() => {
    if (!oceanCurrent) return null;
    const monthIndex = currentSeason === 'annual' ? 0 : currentSeason;
    return oceanCurrent.monthlyCollisionPoints[monthIndex] ?? null;
  }, [oceanCurrent, currentSeason]);

  // 等温線（temperature + currentSeason 依存）
  const isothermsForSeason = useMemo<ReadonlyArray<IsothermLine> | null>(() => {
    if (!temperature) return null;
    if (currentSeason === 'annual') return temperature.annualIsotherms;
    return temperature.monthlyIsotherms[currentSeason] ?? null;
  }, [temperature, currentSeason]);

  // Step 4 の気圧中心（年平均は最強月を採用、月別はその月）
  const pressureCenters = useMemo<ReadonlyArray<PressureCenter> | null>(() => {
    if (!airflow) return null;
    if (currentSeason === 'annual') {
      // 年平均では「12 ヶ月のうち最も強かった月」を採用。月毎に切り替わる中心の見やすさを優先。
      let bestMonth = 0;
      let bestSum = -Infinity;
      for (let m = 0; m < airflow.monthlyPressureCenters.length; m++) {
        let sum = 0;
        for (const c of airflow.monthlyPressureCenters[m] ?? []) sum += c.intensityHpa;
        if (sum > bestSum) {
          bestSum = sum;
          bestMonth = m;
        }
      }
      return airflow.monthlyPressureCenters[bestMonth] ?? null;
    }
    return airflow.monthlyPressureCenters[currentSeason] ?? null;
  }, [airflow, currentSeason]);

  // Step 4 の最終地表風（年平均は 12 ヶ月平均、月別はその月）
  const finalWindField = useMemo<GridMap<WindVector> | null>(() => {
    if (!airflow) return null;
    if (currentSeason === 'annual') {
      const months = airflow.monthlyWindField;
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
    return airflow.monthlyWindField[currentSeason] ?? null;
  }, [airflow, currentSeason]);

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

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (drag) {
        // CSS でスケールダウンされている場合、screen px → internal canvas px に
        // 換算しないと pan の感覚速度がスケール比だけ遅くなる（[現状.md §6 U8]、P4-46）
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const dx = (e.clientX - drag.startClientX) * scaleX;
        setPanOffsetPx(drag.startOffset + dx);
        return;
      }
      // Hover 位置 → grid index 解決（pan を含めて逆投影）
      if (!grid) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      // CSS サイズと canvas の論理サイズが異なる場合のスケーリング補正
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const xCanvasPx = (e.clientX - rect.left) * scaleX;
      const yCanvasPx = (e.clientY - rect.top) * scaleY;
      const norm = normalizePanOffsetPx(panOffsetPx, VIEWPORT);
      const { latitudeDeg, longitudeDeg } = unprojectRaw(xCanvasPx, yCanvasPx, VIEWPORT, norm);
      // grid の lat/lon → index
      const i = Math.floor((latitudeDeg + 90) / grid.resolutionDeg);
      const j = Math.floor((longitudeDeg + 180) / grid.resolutionDeg);
      if (
        i >= 0 &&
        i < grid.latitudeCount &&
        j >= 0 &&
        j < grid.longitudeCount
      ) {
        setHoveredCell({ latIndex: i, lonIndex: j });
      } else {
        setHoveredCell(null);
      }
    },
    [grid, panOffsetPx, setHoveredCell],
  );

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  const handlePointerLeave = useCallback(() => {
    setHoveredCell(null);
  }, [setHoveredCell]);

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
      coastalUpwellingBitmap,
      ensoCandidateBitmap,
      pressureAnomalyBitmap,
      temperatureBitmap,
      precipitationBitmap,
      climateZoneBitmap,
      influenceBandBitmap,
      bands,
      windField,
      finalWindField,
      pressureCenters,
      isothermsForSeason,
      oceanStreamlinesForSeason,
      collisionPointsForSeason,
      hoveredCell,
      grid,
      legendVisibility,
    );
  }, [
    panOffsetPx,
    terrainBitmap,
    oceanCurrentBitmap,
    seaIceBitmap,
    coastalUpwellingBitmap,
    ensoCandidateBitmap,
    pressureAnomalyBitmap,
    temperatureBitmap,
    precipitationBitmap,
    climateZoneBitmap,
    influenceBandBitmap,
    bands,
    windField,
    finalWindField,
    pressureCenters,
    isothermsForSeason,
    oceanStreamlinesForSeason,
    collisionPointsForSeason,
    hoveredCell,
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
        // 1260×630 を内部解像度として保持しつつ、CSS では viewport 幅まで縮小可
        // 表示（モバイル横画面 720px 以下の overflow 対策、[現状.md §6 U8]、P4-46）。
        // pointer 座標は CSS サイズ基準で来るので、handler 側で内部解像度に
        // スケール変換する必要あり（getBoundingClientRect で取得済み）。
        width: '100%',
        maxWidth: `${CANVAS_WIDTH_PX}px`,
        height: 'auto',
        aspectRatio: `${CANVAS_WIDTH_PX} / ${CANVAS_HEIGHT_PX}`,
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
      onPointerLeave={handlePointerLeave}
    />
  );
}
