// Step 1: ITCZ 中心線と影響帯の月別導出。
// 一次参照: Pasta Part VIb Step 6 ITCZ サブセクション。詳細は [docs/spec/01_ITCZ.md §4] を参照。
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/01_ITCZ.md §5]。

import type {
  Grid,
  ITCZBand,
  ITCZResult,
  LongitudeProfile,
  Months12,
  PlanetParams,
} from '@/domain';

const MONTHS_PER_YEAR = 12;

/**
 * Step 1 ITCZ の利用者調整パラメータ（[docs/spec/01_ITCZ.md §6.1]）。
 * UI 露出ポリシー（[開発ガイド.md §2.2.4]）に従い、Phase 4-3 以降で状態層と UI に併せて配線する。
 */
export interface ITCZStepParams {
  /** 影響帯の半幅（度）。Pasta 既定 15°（[docs/spec/01_ITCZ.md §4.4]）。 */
  readonly baseInfluenceHalfWidthDeg: number;
  /**
   * 経度方向の平滑化窓幅（度）。Pasta は数十度のオーダーを既定とする
   * （[docs/spec/01_ITCZ.md §4.3]）。
   */
  readonly smoothingWindowDeg: number;
  /**
   * 陸海熱容量差による熱赤道引き寄せの強度（度）。
   * 「夏半球の陸地割合 − 冬半球の陸地割合」（範囲 [-1, +1]）に乗じて加算する。
   * 0 で陸海補正なし（軌道幾何のみ）。
   */
  readonly monsoonPullStrengthDeg: number;
  /**
   * 影響帯を切り取る山岳標高しきい値（メートル）。
   * Pasta は具体値を提示していないため経験値（[docs/spec/01_ITCZ.md §6.1]）。
   */
  readonly mountainCutoffMeters: number;
}

/**
 * Step 1 ITCZ の既定パラメータ。
 * 影響帯 15° と Pasta の山岳横断回避指示（"don't cross mountains"）に整合。
 */
export const DEFAULT_ITCZ_STEP_PARAMS: ITCZStepParams = {
  baseInfluenceHalfWidthDeg: 15,
  smoothingWindowDeg: 30,
  monsoonPullStrengthDeg: 5,
  mountainCutoffMeters: 3000,
};

/**
 * 月別太陽直下点緯度（度、円軌道近似）。
 * [docs/spec/01_ITCZ.md §4.1] 熱赤道の幾何的近似。
 *
 * - 形式: δ(t) = -ε · cos(2π · t)、t = (m + 0.5) / 12（中月位相）。
 * - 慣習: t = 0 → 北半球冬至（δ = -ε）、t = 0.5 → 北半球夏至（δ = +ε）。
 * - 月インデックス 0 = 1 月相当、6 = 7 月相当（{@link Months12} と整合）。
 *
 * 離心率と近日点引数による南北非対称は本最小実装では未対応
 * （[docs/spec/01_ITCZ.md §7.2] 大陸質量による振れ幅と合わせて将来取り込む）。
 */
export function solarDeclinationDeg(monthIndex: number, axialTiltDeg: number): number {
  const phase = (monthIndex + 0.5) / MONTHS_PER_YEAR;
  return -axialTiltDeg * Math.cos(2 * Math.PI * phase);
}

/**
 * ある経度列で「夏半球の陸地割合 − 冬半球の陸地割合」を返す。
 * 太陽直下点緯度の符号で夏半球を決める（δ > 0 → 北半球が夏）。
 *
 * - 戻り値の範囲は [-1, +1]。
 * - 正なら夏半球により多くの陸地、負なら冬半球により多くの陸地。
 * - 赤道（δ = 0）では非対称が定義できないため 0 を返す。
 */
function summerMinusWinterLandFraction(
  grid: Grid,
  longitudeIndex: number,
  declinationDeg: number,
): number {
  if (declinationDeg === 0) return 0;
  const summerSign = declinationDeg > 0 ? 1 : -1;
  let summerLand = 0;
  let summerCount = 0;
  let winterLand = 0;
  let winterCount = 0;
  for (let i = 0; i < grid.latitudeCount; i++) {
    const row = grid.cells[i];
    if (!row) continue;
    const cell = row[longitudeIndex];
    if (!cell) continue;
    const hemisphereSign = Math.sign(cell.latitudeDeg);
    if (hemisphereSign === summerSign) {
      summerCount++;
      if (cell.isLand) summerLand++;
    } else if (hemisphereSign === -summerSign) {
      winterCount++;
      if (cell.isLand) winterLand++;
    }
  }
  const summerFrac = summerCount > 0 ? summerLand / summerCount : 0;
  const winterFrac = winterCount > 0 ? winterLand / winterCount : 0;
  return summerFrac - winterFrac;
}

/**
 * 経度方向の循環移動平均（東端と西端を連続として扱う）。
 * 窓セル数 windowCells が 1 以下なら入力をそのまま返す。
 */
function smoothCircularLongitude(
  values: ReadonlyArray<number>,
  windowCells: number,
): number[] {
  const n = values.length;
  if (n === 0 || windowCells <= 1) return [...values];
  const halfBelow = Math.floor((windowCells - 1) / 2);
  const halfAbove = windowCells - 1 - halfBelow;
  const result = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -halfBelow; k <= halfAbove; k++) {
      const idx = (i + k + n) % n;
      const v = values[idx];
      if (v === undefined) continue;
      sum += v;
      count++;
    }
    result[i] = count > 0 ? sum / count : (values[i] ?? 0);
  }
  return result;
}

/**
 * 中心緯度から半幅 baseHalfWidthDeg の影響帯を、山岳しきい値で切り取って返す。
 * 中心から南北それぞれの方向に走査し、経度列内で標高 > cutoffMeters のセルが見つかったら
 * 影響帯境界をそのセルの直手前に切り上げる／切り下げる。
 *
 * [docs/spec/01_ITCZ.md §4.5] 山岳横断の扱い（Pasta "don't cross mountains"）。
 * 切り取りの結果、南端 > 北端（反転）になった場合は 0 幅にクランプする。
 */
function clipBandByMountains(
  centerLatitudeDeg: number,
  baseHalfWidthDeg: number,
  longitudeIndex: number,
  grid: Grid,
  mountainCutoffMeters: number,
): { south: number; north: number } {
  let south = centerLatitudeDeg - baseHalfWidthDeg;
  let north = centerLatitudeDeg + baseHalfWidthDeg;
  const halfCellDeg = grid.resolutionDeg / 2;
  for (let i = 0; i < grid.latitudeCount; i++) {
    const row = grid.cells[i];
    if (!row) continue;
    const cell = row[longitudeIndex];
    if (!cell) continue;
    if (cell.elevationMeters <= mountainCutoffMeters) continue;
    const cellLat = cell.latitudeDeg;
    if (cellLat < centerLatitudeDeg && cellLat >= south) {
      south = Math.max(south, cellLat + halfCellDeg);
    } else if (cellLat > centerLatitudeDeg && cellLat <= north) {
      north = Math.min(north, cellLat - halfCellDeg);
    }
  }
  if (south > north) {
    south = centerLatitudeDeg;
    north = centerLatitudeDeg;
  }
  return { south, north };
}

/**
 * Step 1 ITCZ 純粋関数。
 * [docs/spec/01_ITCZ.md §4] の 5 段階（熱赤道幾何近似 → 陸海補正 → 平滑化 → 影響帯付与 → 山岳横断切取）を
 * 順に適用し、月別バンドと年平均中心線を返す。
 *
 * 入力契約: PlanetParams（軌道・本体）と Grid（地形）。
 * 出力契約: ITCZResult（[docs/spec/01_ITCZ.md §5]）。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。乱数・現在時刻・グローバル状態を参照しない。
 */
export function computeITCZ(
  planet: PlanetParams,
  grid: Grid,
  params: ITCZStepParams = DEFAULT_ITCZ_STEP_PARAMS,
): ITCZResult {
  const { axialTiltDeg } = planet.body;
  const { longitudeCount, resolutionDeg } = grid;
  const {
    baseInfluenceHalfWidthDeg,
    smoothingWindowDeg,
    monsoonPullStrengthDeg,
    mountainCutoffMeters,
  } = params;

  const windowCells = Math.max(1, Math.round(smoothingWindowDeg / resolutionDeg));

  const computeMonth = (m: number): LongitudeProfile<ITCZBand> => {
    const declination = solarDeclinationDeg(m, axialTiltDeg);
    // §4.1〜§4.2: 経度毎の中心緯度（陸海補正込み）
    const rawCenter = new Array<number>(longitudeCount);
    for (let j = 0; j < longitudeCount; j++) {
      const landDiff = summerMinusWinterLandFraction(grid, j, declination);
      const monsoonPull = monsoonPullStrengthDeg * Math.sign(declination) * landDiff;
      rawCenter[j] = declination + monsoonPull;
    }
    // §4.3: 平滑化
    const smoothed = smoothCircularLongitude(rawCenter, windowCells);
    // §4.4 + §4.5: 影響帯付与と山岳切り取り
    const bands = new Array<ITCZBand>(longitudeCount);
    for (let j = 0; j < longitudeCount; j++) {
      const center = smoothed[j] ?? 0;
      const { south, north } = clipBandByMountains(
        center,
        baseInfluenceHalfWidthDeg,
        j,
        grid,
        mountainCutoffMeters,
      );
      bands[j] = {
        centerLatitudeDeg: center,
        southBoundLatitudeDeg: south,
        northBoundLatitudeDeg: north,
      };
    }
    return bands;
  };

  const monthlyBands: Months12<LongitudeProfile<ITCZBand>> = [
    computeMonth(0),
    computeMonth(1),
    computeMonth(2),
    computeMonth(3),
    computeMonth(4),
    computeMonth(5),
    computeMonth(6),
    computeMonth(7),
    computeMonth(8),
    computeMonth(9),
    computeMonth(10),
    computeMonth(11),
  ];

  const annualMeanCenterLatitudeDeg = new Array<number>(longitudeCount);
  for (let j = 0; j < longitudeCount; j++) {
    let sum = 0;
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      sum += monthlyBands[m]?.[j]?.centerLatitudeDeg ?? 0;
    }
    annualMeanCenterLatitudeDeg[j] = sum / MONTHS_PER_YEAR;
  }

  return {
    monthlyBands,
    annualMeanCenterLatitudeDeg,
  };
}
