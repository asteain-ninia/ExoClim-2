// Step 2: 風帯（卓越風・気圧・モンスーン・沿岸湧昇）の月別導出。
// 一次参照: Pasta Part VIb Step 1 + Step 5。詳細は [docs/spec/02_風帯.md §4] を参照。
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/02_風帯.md §5]。

import type {
  Grid,
  GridMap,
  ITCZResult,
  LongitudeProfile,
  Months12,
  PlanetParams,
  WindBeltResult,
  WindVector,
} from '@/domain';

const MONTHS_PER_YEAR = 12;

/** 三セル構造の Hadley / Ferrel 境界（亜熱帯高気圧帯の基本緯度）。 */
const BASE_SUBTROPICAL_LAT_DEG = 30;
/** 三セル構造の Ferrel / Polar 境界（亜寒帯低気圧帯）。 */
const BASE_SUBPOLAR_LAT_DEG = 60;

/** 帯状気圧 anomaly（hPa、基準気圧からの相対値）。Pasta Part VIb Step 1 に基づく。 */
const ITCZ_LOW_HPA = -8;
const SUBTROPICAL_HIGH_HPA = +6;
const SUBPOLAR_LOW_HPA = -5;
const POLAR_HIGH_HPA = +3;

/** 帯状気圧 anomaly のゾーン境界（緯度絶対値、°）。 */
const PRESSURE_ZONE_BOUNDARIES_DEG = [15, 45, 75] as const;

/**
 * Step 2 風帯の利用者調整パラメータ（[docs/spec/02_風帯.md §6.1]）。
 *
 * セル数・セル基準緯度などの未確定論点（[docs/spec/02_風帯.md §7.1]）は
 * 本最小実装では地球並み三セル構造に固定する。
 */
export interface WindBeltStepParams {
  /**
   * 亜熱帯高気圧帯の季節移動振幅（°）。
   * Pasta: 冬 25°→ 夏 35°なので±5°相当。`Math.sign(declination)` で
   * 夏半球側に正、冬半球側に負を取る。
   */
  readonly subtropicalHighSeasonalShiftDeg: number;
  /**
   * 大陸季節高低気圧の anomaly 強度（hPa）。
   * 夏半球の陸地は -値（低気圧）、冬半球の陸地は +値（高気圧）として加算する。
   */
  readonly continentalPressureAnomalyHpa: number;
  /**
   * 卓越風の代表速さ（m/s）。
   * 三セル構造のいずれの帯でも同一速度を割り当てる単純化（地球並み 5 m/s 程度）。
   */
  readonly meanWindSpeedMps: number;
}

export const DEFAULT_WIND_BELT_STEP_PARAMS: WindBeltStepParams = {
  subtropicalHighSeasonalShiftDeg: 5,
  continentalPressureAnomalyHpa: 5,
  meanWindSpeedMps: 5,
};

/** 自転方向に応じた東西成分の符号（順行 +1、逆行 -1）。 */
type RotationSign = 1 | -1;

/**
 * 緯度 → 卓越風ベクトル（m/s、東向き正・北向き正）。
 * [docs/spec/02_風帯.md §4.2]:
 *   - 0–30°（Hadley）: 貿易風 — 赤道向き + 東偏（順行）
 *   - 30–60°（Ferrel）: 偏西風 — 極向き + 東偏（順行）
 *   - 60–90°（Polar）: 極東風 — 赤道向き + 東偏（順行）
 *
 * 「東偏（東向きの偏向）」は順行惑星の Coriolis に基づく Pasta 表記。逆行では東西成分が反転する。
 */
function prevailingWindAtLatitude(
  latitudeDeg: number,
  rotationSign: RotationSign,
  speedMps: number,
): WindVector {
  const absLat = Math.abs(latitudeDeg);
  const isNorthernHemisphere = latitudeDeg >= 0;

  if (absLat <= BASE_SUBTROPICAL_LAT_DEG) {
    // Hadley: 貿易風。赤道向き（NH 南、SH 北）+ 西向き（順行 NH/SH）。
    const v = isNorthernHemisphere ? -1 : +1;
    const u = -1 * rotationSign;
    return normalizeWind(u, v, speedMps);
  }
  if (absLat <= BASE_SUBPOLAR_LAT_DEG) {
    // Ferrel: 偏西風。極向き（NH 北、SH 南）+ 東向き（順行）。
    const v = isNorthernHemisphere ? +1 : -1;
    const u = +1 * rotationSign;
    return normalizeWind(u, v, speedMps);
  }
  // Polar: 極東風。赤道向き + 西向き（順行）。
  const v = isNorthernHemisphere ? -1 : +1;
  const u = -1 * rotationSign;
  return normalizeWind(u, v, speedMps);
}

function normalizeWind(uRaw: number, vRaw: number, speedMps: number): WindVector {
  const norm = Math.sqrt(uRaw * uRaw + vRaw * vRaw);
  if (norm === 0 || speedMps === 0) return { uMps: 0, vMps: 0 };
  return {
    uMps: speedMps * (uRaw / norm),
    vMps: speedMps * (vRaw / norm),
  };
}

/** 緯度 → 帯状気圧 anomaly（hPa、基準気圧からの相対値）。 */
function zonalPressureAnomalyHpa(latitudeDeg: number): number {
  const absLat = Math.abs(latitudeDeg);
  if (absLat <= PRESSURE_ZONE_BOUNDARIES_DEG[0]) return ITCZ_LOW_HPA;
  if (absLat <= PRESSURE_ZONE_BOUNDARIES_DEG[1]) return SUBTROPICAL_HIGH_HPA;
  if (absLat <= PRESSURE_ZONE_BOUNDARIES_DEG[2]) return SUBPOLAR_LOW_HPA;
  return POLAR_HIGH_HPA;
}

/** ITCZ 月別中心線の経度平均（その月の代表 declination として使う）。 */
function meanITCZCenterDeg(itczResult: ITCZResult, monthIndex: number): number {
  const bands = itczResult.monthlyBands[monthIndex];
  if (!bands || bands.length === 0) return 0;
  let sum = 0;
  for (const band of bands) sum += band.centerLatitudeDeg;
  return sum / bands.length;
}

/**
 * Step 2 風帯 純粋関数。
 *
 * [docs/spec/02_風帯.md §4] の段階を月別に適用:
 *   §4.1 セル境界（亜熱帯高気圧帯の季節移動を含む）
 *   §4.2 卓越風（自転方向で東西反転）
 *   §4.3 亜熱帯高気圧帯の季節位置
 *   §4.4 大陸季節高低気圧
 *   §4.5 モンスーン領域（ITCZ 移動範囲内の陸地セル）
 *   §4.6 沿岸湧昇（最小実装では未対応、`false` 一様）
 *
 * 入力契約: PlanetParams（軌道・本体・大気海洋）+ Grid + ITCZResult + WindBeltStepParams。
 * 出力契約: WindBeltResult（[docs/spec/02_風帯.md §5]）。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。乱数・現在時刻・グローバル状態を参照しない。
 */
export function computeWindBelt(
  planet: PlanetParams,
  grid: Grid,
  itczResult: ITCZResult,
  params: WindBeltStepParams = DEFAULT_WIND_BELT_STEP_PARAMS,
): WindBeltResult {
  const rotationSign: RotationSign =
    planet.body.rotationDirection === 'prograde' ? +1 : -1;
  const basePressureHpa = planet.atmosphereOcean.surfacePressureHpa;
  const { latitudeCount, longitudeCount } = grid;

  // 経度ごとの ITCZ 中心線の年内 min / max（モンスーン領域判定用）
  const itczMinByLongitude = new Array<number>(longitudeCount).fill(Infinity);
  const itczMaxByLongitude = new Array<number>(longitudeCount).fill(-Infinity);
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const bands = itczResult.monthlyBands[m];
    if (!bands) continue;
    for (let j = 0; j < longitudeCount; j++) {
      const center = bands[j]?.centerLatitudeDeg ?? 0;
      if (center < (itczMinByLongitude[j] ?? Infinity)) itczMinByLongitude[j] = center;
      if (center > (itczMaxByLongitude[j] ?? -Infinity)) itczMaxByLongitude[j] = center;
    }
  }

  const computeMonth = (m: number) => {
    const declinationDeg = meanITCZCenterDeg(itczResult, m);
    const sign = Math.sign(declinationDeg);
    // 夏半球側に高気圧帯を広げ、冬半球側に縮める形にする。
    // declination > 0（NH 夏）: NH 亜熱帯高気圧 35°、SH 亜熱帯高気圧 25° → NH +5、SH -5（赤道側に縮む）
    const subtropicalShiftNH = +params.subtropicalHighSeasonalShiftDeg * sign;
    const subtropicalShiftSH = -params.subtropicalHighSeasonalShiftDeg * sign;
    const cellBoundariesDeg: ReadonlyArray<number> = [
      -BASE_SUBPOLAR_LAT_DEG,
      -BASE_SUBTROPICAL_LAT_DEG + subtropicalShiftSH,
      0,
      BASE_SUBTROPICAL_LAT_DEG + subtropicalShiftNH,
      BASE_SUBPOLAR_LAT_DEG,
    ];

    const wind: WindVector[][] = new Array(latitudeCount);
    const pressure: number[][] = new Array(latitudeCount);
    const monsoon: boolean[][] = new Array(latitudeCount);
    const upwelling: boolean[][] = new Array(latitudeCount);

    for (let i = 0; i < latitudeCount; i++) {
      const row = grid.cells[i];
      const windRow: WindVector[] = new Array(longitudeCount);
      const pressureRow: number[] = new Array(longitudeCount);
      const monsoonRow: boolean[] = new Array(longitudeCount);
      const upwellingRow: boolean[] = new Array(longitudeCount);

      if (row) {
        for (let j = 0; j < longitudeCount; j++) {
          const cell = row[j];
          if (!cell) {
            windRow[j] = { uMps: 0, vMps: 0 };
            pressureRow[j] = basePressureHpa;
            monsoonRow[j] = false;
            upwellingRow[j] = false;
            continue;
          }
          const lat = cell.latitudeDeg;

          // §4.2 卓越風
          windRow[j] = prevailingWindAtLatitude(lat, rotationSign, params.meanWindSpeedMps);

          // §4.3 + §4.4 気圧（帯状 + 大陸 anomaly）
          let p = basePressureHpa + zonalPressureAnomalyHpa(lat);
          if (cell.isLand && declinationDeg !== 0) {
            const inSummerHemisphere = Math.sign(lat) === sign;
            p += inSummerHemisphere
              ? -params.continentalPressureAnomalyHpa
              : +params.continentalPressureAnomalyHpa;
          }
          pressureRow[j] = p;

          // §4.5 モンスーン領域（ITCZ 移動範囲内の陸地セル）
          if (cell.isLand) {
            const itczMin = itczMinByLongitude[j] ?? 0;
            const itczMax = itczMaxByLongitude[j] ?? 0;
            const range = itczMax - itczMin;
            // 範囲が 5° 以上で、現セルがその範囲内（±3° 余裕）にあるとき有効化
            if (range > 5 && lat >= itczMin - 3 && lat <= itczMax + 3) {
              monsoonRow[j] = true;
            } else {
              monsoonRow[j] = false;
            }
          } else {
            monsoonRow[j] = false;
          }

          // §4.6 沿岸湧昇は最小実装では未対応（[docs/spec/02_風帯.md §6.2] 内部派生値）
          upwellingRow[j] = false;
        }
      }

      wind[i] = windRow;
      pressure[i] = pressureRow;
      monsoon[i] = monsoonRow;
      upwelling[i] = upwellingRow;
    }

    return { wind, pressure, cellBoundariesDeg, monsoon, upwelling };
  };

  const months = Array.from({ length: MONTHS_PER_YEAR }, (_, m) => computeMonth(m));

  const monthlyPrevailingWind: Months12<GridMap<WindVector>> = [
    months[0]!.wind, months[1]!.wind, months[2]!.wind, months[3]!.wind,
    months[4]!.wind, months[5]!.wind, months[6]!.wind, months[7]!.wind,
    months[8]!.wind, months[9]!.wind, months[10]!.wind, months[11]!.wind,
  ];
  const monthlySurfacePressureHpa: Months12<GridMap<number>> = [
    months[0]!.pressure, months[1]!.pressure, months[2]!.pressure, months[3]!.pressure,
    months[4]!.pressure, months[5]!.pressure, months[6]!.pressure, months[7]!.pressure,
    months[8]!.pressure, months[9]!.pressure, months[10]!.pressure, months[11]!.pressure,
  ];
  const monthlyCellBoundariesDeg: Months12<ReadonlyArray<number>> = [
    months[0]!.cellBoundariesDeg, months[1]!.cellBoundariesDeg, months[2]!.cellBoundariesDeg, months[3]!.cellBoundariesDeg,
    months[4]!.cellBoundariesDeg, months[5]!.cellBoundariesDeg, months[6]!.cellBoundariesDeg, months[7]!.cellBoundariesDeg,
    months[8]!.cellBoundariesDeg, months[9]!.cellBoundariesDeg, months[10]!.cellBoundariesDeg, months[11]!.cellBoundariesDeg,
  ];
  const monthlyMonsoonMask: Months12<GridMap<boolean>> = [
    months[0]!.monsoon, months[1]!.monsoon, months[2]!.monsoon, months[3]!.monsoon,
    months[4]!.monsoon, months[5]!.monsoon, months[6]!.monsoon, months[7]!.monsoon,
    months[8]!.monsoon, months[9]!.monsoon, months[10]!.monsoon, months[11]!.monsoon,
  ];
  const monthlyCoastalUpwellingMask: Months12<GridMap<boolean>> = [
    months[0]!.upwelling, months[1]!.upwelling, months[2]!.upwelling, months[3]!.upwelling,
    months[4]!.upwelling, months[5]!.upwelling, months[6]!.upwelling, months[7]!.upwelling,
    months[8]!.upwelling, months[9]!.upwelling, months[10]!.upwelling, months[11]!.upwelling,
  ];

  // ITCZ 影響帯への調整値（最小実装では 0 一様。Step 1 へのフィードバックは将来対応）
  const zeroProfile: LongitudeProfile<number> = new Array<number>(longitudeCount).fill(0);
  const itczInfluenceAdjustmentDeg: Months12<LongitudeProfile<number>> = [
    zeroProfile, zeroProfile, zeroProfile, zeroProfile,
    zeroProfile, zeroProfile, zeroProfile, zeroProfile,
    zeroProfile, zeroProfile, zeroProfile, zeroProfile,
  ];

  return {
    monthlyPrevailingWind,
    monthlySurfacePressureHpa,
    monthlyCellBoundariesDeg,
    monthlyMonsoonMask,
    monthlyCoastalUpwellingMask,
    itczInfluenceAdjustmentDeg,
  };
}
