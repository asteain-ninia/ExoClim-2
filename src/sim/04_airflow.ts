// Step 4: 気流（最終地表風・圧力 anomaly・気圧中心・山脈偏向フラグ）の月別導出。
// 一次参照: Pasta Part VIb Step 5 Winds + Worldbuilder's Log #32（Madeline James 手法）。
//   詳細は [docs/spec/04_気流.md §4] を参照。
//
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/04_気流.md §5]。
//
// 範囲（最小実装）:
//   - §4.7 風帯と気圧 anomaly の合成 → **地衡風近似**で実装
//     圧力勾配 ∇p を Coriolis で 90° 回転（NH 右、SH 左）して風成分にし、
//     prevailingWind に重み付き加算する。
//   - §4.5 高気圧/低気圧周りの渦巻き → 地衡風近似から自動的に出る（高気圧周り
//     は時計回り NH / 反時計 SH、低気圧は逆）。
//   - §4.6 山脈による偏向 → 標高 > mountainThresholdMeters で flag を立てるのみ
//     （実際の流路偏向は streamline 実装と同期して将来対応）。
//   - §4.1〜§4.4 大陸 anomaly → Step 2 が既に pressure に反映済みなので、勾配経由で
//     final wind に伝播する。
//   - §4.8 モンスーン反転 → 最小実装ではスキップ。
//   - 圧力中心（pressureCenters）の検出は最小実装では空配列（局地極値検出は将来）。

import type {
  AirflowResult,
  Grid,
  GridMap,
  ITCZResult,
  Months12,
  OceanCurrentResult,
  PlanetParams,
  PressureCenter,
  WindBeltResult,
  WindVector,
} from '@/domain';

const MONTHS_PER_YEAR = 12;
const DEG_TO_RAD = Math.PI / 180;

/**
 * 地衡風近似の経験的内部スケール係数。
 *
 * 単位を厳密に整合させずに `(hPa/deg) × 1/sin(lat)` を直接 m/s に充てているため、
 * 単純合算では地形効果が知覚しづらい結果になる（卓越風 5 m/s に対して数 m/s 程度の
 * 寄与しか出ず、しかも陸海境界の 1 セル幅でしか勾配が立たないので可視点が少ない）。
 * Pasta は §7.3 で地衡風強度を定量指定していないため、UI で見て地形に応答する強度に
 * なるよう経験的に内部スケールを掛ける。利用者調整は `pressureGradientCoefficient`
 * を介して 0–3 倍の範囲で重畳する。
 */
const INTERNAL_GEOSTROPHIC_SCALE = 2.5;

/**
 * Step 4 気流の利用者調整パラメータ（[docs/spec/04_気流.md §6.1]）。
 */
export interface AirflowStepParams {
  /**
   * 圧力勾配風（地衡風近似）の合成係数。0 で off（最終風 = 卓越風）、1 で勾配寄与最大。
   * 単純化のため次元を揃えた経験的スケールとして使う（[docs/spec/04_気流.md §4.7] の
   * Pasta は定量指定なし、§7.3 未確定論点）。
   */
  readonly pressureGradientCoefficient: number;
  /**
   * 山脈偏向のしきい値（メートル）。標高 > この値のセルで mountainDeflectionApplied を true にする。
   * 実際の風流路偏向は最小実装では未適用（[docs/spec/04_気流.md §4.6]）。
   */
  readonly mountainDeflectionThresholdMeters: number;
}

export const DEFAULT_AIRFLOW_STEP_PARAMS: AirflowStepParams = {
  pressureGradientCoefficient: 1,
  mountainDeflectionThresholdMeters: 2000,
};

/**
 * 隣接 4 方向の有限差分で圧力勾配を求め、Coriolis 90° 回転で地衡風成分を返す。
 *
 * 地衡風近似（NH）:
 *   u = -∂p/∂y * scale
 *   v = +∂p/∂x * scale
 * SH では Coriolis 符号反転で:
 *   u = +∂p/∂y * scale
 *   v = -∂p/∂x * scale
 *
 * - ∂p/∂x（東西方向）: 経度循環を考慮して隣接セルから差分。`cos(lat)` 補正で地球表面距離化。
 * - ∂p/∂y（南北方向）: 北隣セルと南隣セルの差分。
 * - 極（|lat| > 88°）では Coriolis が大きくなりすぎるため減衰。
 * - 結果単位は m/s 相当だが、Pasta が定量指定していないため経験的スケール係数で調整。
 */
function geostrophicComponent(
  pressureMap: GridMap<number>,
  i: number,
  j: number,
  rows: number,
  cols: number,
  latitudeDeg: number,
  resolutionDeg: number,
  rotationSign: 1 | -1,
  coefficient: number,
): WindVector {
  const absLat = Math.abs(latitudeDeg);
  if (absLat > 88) return { uMps: 0, vMps: 0 };
  const sinLat = Math.sin(latitudeDeg * DEG_TO_RAD);
  const cosLat = Math.cos(latitudeDeg * DEG_TO_RAD);
  if (Math.abs(sinLat) < 0.05) return { uMps: 0, vMps: 0 }; // 赤道近傍では地衡風近似破綻

  const jWest = (j - 1 + cols) % cols;
  const jEast = (j + 1) % cols;
  const pressureWest = pressureMap[i]?.[jWest] ?? 0;
  const pressureEast = pressureMap[i]?.[jEast] ?? 0;
  const pressureNorth = i + 1 < rows ? (pressureMap[i + 1]?.[j] ?? pressureMap[i]?.[j] ?? 0) : (pressureMap[i]?.[j] ?? 0);
  const pressureSouth = i - 1 >= 0 ? (pressureMap[i - 1]?.[j] ?? pressureMap[i]?.[j] ?? 0) : (pressureMap[i]?.[j] ?? 0);

  // 距離は度単位で 2 * resolutionDeg、経度は cos(lat) 補正
  const dPdxHpaPerDeg = (pressureEast - pressureWest) / (2 * resolutionDeg * Math.max(cosLat, 0.05));
  const dPdyHpaPerDeg = (pressureNorth - pressureSouth) / (2 * resolutionDeg);

  // 地衡風（係数は経験スケール、Coriolis sin(lat) で除算する正攻法ではなく単純化）
  // f = 2 * omega * sin(lat) の符号をここに織り込み、coefficient で大きさを調整
  const fSign = sinLat > 0 ? 1 : -1; // NH +1, SH -1
  const scale =
    (INTERNAL_GEOSTROPHIC_SCALE * coefficient) / Math.max(Math.abs(sinLat), 0.1);
  const u = -dPdyHpaPerDeg * scale * fSign * rotationSign;
  const v = +dPdxHpaPerDeg * scale * fSign * rotationSign;
  return { uMps: u, vMps: v };
}

/**
 * Step 4 気流 純粋関数。
 *
 * 入力: PlanetParams + Grid + ITCZResult + WindBeltResult + OceanCurrentResult + params。
 * 出力: AirflowResult（[docs/spec/04_気流.md §5]）。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。
 */
export function computeAirflow(
  planet: PlanetParams,
  grid: Grid,
  // ITCZResult / OceanCurrentResult は最小実装では未使用だが、契約として受け取る。
  // 将来 §4.1 海洋ジャイア中心利用 や ITCZ 連動のモンスーン反転で活用する。
  _itczResult: ITCZResult,
  windBeltResult: WindBeltResult,
  _oceanCurrentResult: OceanCurrentResult,
  params: AirflowStepParams = DEFAULT_AIRFLOW_STEP_PARAMS,
): AirflowResult {
  const rotationSign: 1 | -1 = planet.body.rotationDirection === 'prograde' ? 1 : -1;
  const basePressureHpa = planet.atmosphereOcean.surfacePressureHpa;
  const { latitudeCount, longitudeCount, resolutionDeg } = grid;

  // 山脈偏向フラグ（cell.elevationMeters > threshold で true）— 月によらず一定
  const mountainDeflectionApplied: boolean[][] = new Array(latitudeCount);
  for (let i = 0; i < latitudeCount; i++) {
    const row = grid.cells[i];
    const flagRow: boolean[] = new Array(longitudeCount);
    for (let j = 0; j < longitudeCount; j++) {
      const cell = row?.[j];
      flagRow[j] = !!cell && cell.elevationMeters > params.mountainDeflectionThresholdMeters;
    }
    mountainDeflectionApplied[i] = flagRow;
  }

  const computeMonth = (m: number) => {
    const prevailingWind = windBeltResult.monthlyPrevailingWind[m];
    const pressureMap = windBeltResult.monthlySurfacePressureHpa[m];
    const windField: WindVector[][] = new Array(latitudeCount);
    const pressureAnomaly: number[][] = new Array(latitudeCount);

    if (!prevailingWind || !pressureMap) {
      for (let i = 0; i < latitudeCount; i++) {
        const row: WindVector[] = new Array(longitudeCount).fill({ uMps: 0, vMps: 0 });
        const anomalyRow: number[] = new Array(longitudeCount).fill(0);
        windField[i] = row;
        pressureAnomaly[i] = anomalyRow;
      }
      return { windField, pressureAnomaly };
    }

    for (let i = 0; i < latitudeCount; i++) {
      const cellRow = grid.cells[i];
      const prevailRow = prevailingWind[i];
      const pressureRow = pressureMap[i];
      const windRow: WindVector[] = new Array(longitudeCount);
      const anomalyRow: number[] = new Array(longitudeCount);

      if (!cellRow || !prevailRow || !pressureRow) {
        for (let j = 0; j < longitudeCount; j++) {
          windRow[j] = { uMps: 0, vMps: 0 };
          anomalyRow[j] = 0;
        }
        windField[i] = windRow;
        pressureAnomaly[i] = anomalyRow;
        continue;
      }

      for (let j = 0; j < longitudeCount; j++) {
        const cell = cellRow[j];
        const prev = prevailRow[j] ?? { uMps: 0, vMps: 0 };
        const p = pressureRow[j] ?? basePressureHpa;
        anomalyRow[j] = p - basePressureHpa;

        if (!cell) {
          windRow[j] = prev;
          continue;
        }

        // 地衡風成分を加算
        const geo = geostrophicComponent(
          pressureMap,
          i,
          j,
          latitudeCount,
          longitudeCount,
          cell.latitudeDeg,
          resolutionDeg,
          rotationSign,
          params.pressureGradientCoefficient,
        );
        windRow[j] = {
          uMps: prev.uMps + geo.uMps,
          vMps: prev.vMps + geo.vMps,
        };
      }

      windField[i] = windRow;
      pressureAnomaly[i] = anomalyRow;
    }

    return { windField, pressureAnomaly };
  };

  const months = Array.from({ length: MONTHS_PER_YEAR }, (_, m) => computeMonth(m));

  const monthlyWindField: Months12<GridMap<WindVector>> = [
    months[0]!.windField, months[1]!.windField, months[2]!.windField, months[3]!.windField,
    months[4]!.windField, months[5]!.windField, months[6]!.windField, months[7]!.windField,
    months[8]!.windField, months[9]!.windField, months[10]!.windField, months[11]!.windField,
  ];
  const monthlyPressureAnomalyHpa: Months12<GridMap<number>> = [
    months[0]!.pressureAnomaly, months[1]!.pressureAnomaly, months[2]!.pressureAnomaly, months[3]!.pressureAnomaly,
    months[4]!.pressureAnomaly, months[5]!.pressureAnomaly, months[6]!.pressureAnomaly, months[7]!.pressureAnomaly,
    months[8]!.pressureAnomaly, months[9]!.pressureAnomaly, months[10]!.pressureAnomaly, months[11]!.pressureAnomaly,
  ];

  // 圧力中心は最小実装では空配列（[docs/spec/04_気流.md §4.1〜§4.4] の検出ロジックは将来）
  const emptyCenters: ReadonlyArray<PressureCenter> = [];
  const monthlyPressureCenters: Months12<ReadonlyArray<PressureCenter>> = [
    emptyCenters, emptyCenters, emptyCenters, emptyCenters,
    emptyCenters, emptyCenters, emptyCenters, emptyCenters,
    emptyCenters, emptyCenters, emptyCenters, emptyCenters,
  ];

  return {
    monthlyWindField,
    monthlyPressureAnomalyHpa,
    monthlyPressureCenters,
    mountainDeflectionApplied: mountainDeflectionApplied as GridMap<boolean>,
  };
}
