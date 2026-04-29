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
  GeoPoint,
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
   * 山脈の風下側（rainshadow）の風成分を法線方向に減衰させる（[docs/spec/04_気流.md §4.6]）。
   */
  readonly mountainDeflectionThresholdMeters: number;
  /**
   * 気圧中心検出のしきい値（hPa）。帯状平均からの偏差絶対値がこの値以上で
   * 連結成分が `pressureCenterMinAreaDeg2` 以上のとき高/低気圧中心として検出する。
   */
  readonly pressureCenterThresholdHpa: number;
  /**
   * 気圧中心検出の最小連結面積（度²）。これ未満の連結成分はノイズ扱いで無視する。
   * 1° 解像度で 25 ≈ 5°×5° の塊以上を検出。
   */
  readonly pressureCenterMinAreaDeg2: number;
  /**
   * モンスーン領域での風向反転強度（0〜1）。1 で夏に完全に風向反転、
   * 0 で反転なし。卓越風 + 地衡風成分に対して `1 - 2 * strength` を乗算する形で適用。
   */
  readonly monsoonReversalStrength: number;
}

export const DEFAULT_AIRFLOW_STEP_PARAMS: AirflowStepParams = {
  pressureGradientCoefficient: 1,
  mountainDeflectionThresholdMeters: 2000,
  pressureCenterThresholdHpa: 2,
  pressureCenterMinAreaDeg2: 25,
  monsoonReversalStrength: 1,
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
 * 帯状（経度方向）平均からの偏差の連結成分を抽出し、各成分の質量中心と最大強度を
 * 気圧中心として返す。
 *
 * 設計意図:
 *   - 圧力 anomaly = (zonal pattern) + (continental + その他局地寄与)。zonal pattern は
 *     帯状ベルトであり「点状の中心」ではないので、帯状平均を引いて純粋な局地寄与だけ残す。
 *   - 連結成分は経度方向の wraparound を許容（東経 +180° と -180° は隣接）。
 *   - 経度の質量中心は単純平均すると wrap で破綻するので、円平均（cos/sin の重み付き和）で求める。
 *
 * 強度しきい値・最小面積はパラメータとして外部から差し込み、Pasta が定量指定しない部分の
 * チューニングを利用者に開放する（[docs/spec/04_気流.md §6.1]）。
 */
function detectPressureCenters(
  pressureAnomalyHpa: GridMap<number>,
  grid: Grid,
  thresholdHpa: number,
  minAreaDeg2: number,
): PressureCenter[] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const minCells = Math.max(
    4,
    Math.round(minAreaDeg2 / (grid.resolutionDeg * grid.resolutionDeg)),
  );

  // 1. 帯状平均（緯度別）
  const zonalMeanByRow = new Array<number>(rows);
  for (let i = 0; i < rows; i++) {
    const row = pressureAnomalyHpa[i];
    let sum = 0;
    let count = 0;
    if (row) {
      for (let j = 0; j < cols; j++) {
        sum += row[j] ?? 0;
        count++;
      }
    }
    zonalMeanByRow[i] = count > 0 ? sum / count : 0;
  }

  // 2. 偏差マップ
  const deviation: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const row = pressureAnomalyHpa[i];
    const devRow = new Array<number>(cols);
    const zMean = zonalMeanByRow[i] ?? 0;
    for (let j = 0; j < cols; j++) {
      devRow[j] = (row?.[j] ?? 0) - zMean;
    }
    deviation[i] = devRow;
  }

  // 3. 連結成分ラベリング（経度 wraparound あり）+ 中心抽出
  const visited: boolean[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    visited[i] = new Array<boolean>(cols).fill(false);
  }
  const centers: PressureCenter[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (visited[i]![j]) continue;
      const v = deviation[i]![j]!;
      if (Math.abs(v) < thresholdHpa) {
        visited[i]![j] = true;
        continue;
      }
      const positive = v > 0;
      // BFS
      const stack: Array<[number, number]> = [[i, j]];
      const cellList: Array<{ readonly i: number; readonly j: number; readonly v: number }> = [];
      while (stack.length > 0) {
        const popped = stack.pop()!;
        const ci = popped[0]!;
        const cjRaw = popped[1]!;
        if (ci < 0 || ci >= rows) continue;
        const cj = ((cjRaw % cols) + cols) % cols;
        if (visited[ci]![cj]) continue;
        const cv = deviation[ci]![cj]!;
        const sameSign = positive ? cv > thresholdHpa : cv < -thresholdHpa;
        if (!sameSign) continue;
        visited[ci]![cj] = true;
        cellList.push({ i: ci, j: cj, v: cv });
        stack.push([ci + 1, cj]);
        stack.push([ci - 1, cj]);
        stack.push([ci, cj + 1]);
        stack.push([ci, cj - 1]);
      }
      if (cellList.length < minCells) continue;
      // 重心（緯度は単純平均、経度は円平均）と最大強度
      let sumLatW = 0;
      let sumLonX = 0;
      let sumLonY = 0;
      let sumW = 0;
      let maxAbs = 0;
      for (const c of cellList) {
        const cell = grid.cells[c.i]?.[c.j];
        if (!cell) continue;
        const w = Math.abs(c.v);
        sumLatW += cell.latitudeDeg * w;
        const lonRad = cell.longitudeDeg * DEG_TO_RAD;
        sumLonX += w * Math.cos(lonRad);
        sumLonY += w * Math.sin(lonRad);
        sumW += w;
        if (w > maxAbs) maxAbs = w;
      }
      if (sumW <= 0) continue;
      const meanLat = sumLatW / sumW;
      const meanLonRad = Math.atan2(sumLonY, sumLonX);
      const meanLonDeg = meanLonRad / DEG_TO_RAD;
      const position: GeoPoint = { latitudeDeg: meanLat, longitudeDeg: meanLonDeg };
      centers.push({
        type: positive ? 'high' : 'low',
        position,
        intensityHpa: maxAbs,
      });
    }
  }
  return centers;
}

/**
 * 山脈による風流路偏向（[docs/spec/04_気流.md §4.6]）。
 *
 * 山脈セル（mountainDeflectionApplied=true）から風下方向を判定し、風下側 1 セル隣の
 * 風成分のうち「山脈に直交する成分（法線成分）」を減衰させる。これで、流れが山脈を
 * 横切る代わりに山脈に沿って迂回する効果が出る。
 *
 * 山脈の向き判定は最小実装として「南北方向（u 法線）」と「東西方向（v 法線）」のうち
 * 連続する山脈セル数が多い方向を採用。陸地連結性まで踏み込まず、各山脈セル単位で
 * 局所的に判定する。
 *
 * Pasta は具体係数を指定しない（§7.4 未確定論点）ので、減衰率は法線成分を半分に下げる。
 */
function applyMountainDeflection(
  windField: WindVector[][],
  mountainMask: boolean[][],
  rows: number,
  cols: number,
): void {
  const NORMAL_DAMPING = 0.5;
  const isMountain = (i: number, j: number): boolean => {
    if (i < 0 || i >= rows) return false;
    const jj = ((j % cols) + cols) % cols;
    return !!mountainMask[i]?.[jj];
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (!mountainMask[i]?.[j]) continue;
      // 連続する山脈セル数: 東西方向と南北方向
      let nsRun = 1;
      if (isMountain(i + 1, j)) nsRun++;
      if (isMountain(i - 1, j)) nsRun++;
      let ewRun = 1;
      if (isMountain(i, j + 1)) ewRun++;
      if (isMountain(i, j - 1)) ewRun++;
      // 風下側 1 セル隣の風成分を減衰
      const wind = windField[i]?.[j];
      if (!wind) continue;
      // 風下方向（風が吹いていく方向）の隣セルを更新
      const downstreamJ = wind.uMps > 0 ? j + 1 : j - 1;
      const downstreamI = wind.vMps > 0 ? i + 1 : i - 1;
      // 南北方向に伸びる山脈は東西成分（u）を減衰
      if (nsRun >= ewRun) {
        const target = windField[i]?.[((downstreamJ % cols) + cols) % cols];
        if (target) {
          windField[i]![((downstreamJ % cols) + cols) % cols] = {
            uMps: target.uMps * NORMAL_DAMPING,
            vMps: target.vMps,
          };
        }
      }
      // 東西方向に伸びる山脈は南北成分（v）を減衰
      if (ewRun > nsRun) {
        if (downstreamI >= 0 && downstreamI < rows) {
          const target = windField[downstreamI]?.[j];
          if (target) {
            windField[downstreamI]![j] = {
              uMps: target.uMps,
              vMps: target.vMps * NORMAL_DAMPING,
            };
          }
        }
      }
    }
  }
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
  itczResult: ITCZResult,
  windBeltResult: WindBeltResult,
  // OceanCurrentResult は最小実装では未使用だが、契約として受け取る。
  // 将来 §4.1 海洋ジャイア中心利用 で参照する。
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
    const monsoonMask = windBeltResult.monthlyMonsoonMask[m];
    // モンスーン反転: 夏半球で吹く向きを反転。ITCZ 月別中心線の経度平均（declination 相当）で
    // 半球を判定する（[docs/spec/04_気流.md §4.8]）。
    const monthBands = itczResult.monthlyBands[m];
    let declinationDeg = 0;
    if (monthBands && monthBands.length > 0) {
      let sum = 0;
      for (const b of monthBands) sum += b.centerLatitudeDeg;
      declinationDeg = sum / monthBands.length;
    }
    const declSign = Math.sign(declinationDeg);
    const monsoonFactor = 1 - 2 * params.monsoonReversalStrength;
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
      const monsoonRow = monsoonMask?.[i];
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

        // モンスーン反転: 夏半球の monsoon mask セルで卓越風を反転（強度 0〜1）
        let prevU = prev.uMps;
        let prevV = prev.vMps;
        const isMonsoon = monsoonRow?.[j] === true;
        if (isMonsoon && declSign !== 0 && Math.sign(cell.latitudeDeg) === declSign) {
          prevU *= monsoonFactor;
          prevV *= monsoonFactor;
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
          uMps: prevU + geo.uMps,
          vMps: prevV + geo.vMps,
        };
      }

      windField[i] = windRow;
      pressureAnomaly[i] = anomalyRow;
    }

    // 山脈による風下側風成分の偏向（法線成分減衰）
    applyMountainDeflection(
      windField,
      mountainDeflectionApplied,
      latitudeCount,
      longitudeCount,
    );

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

  // 圧力中心: 月別に帯状偏差ベースの連結成分検出で導出
  const monthlyCentersArr: Array<ReadonlyArray<PressureCenter>> = months.map((mo) =>
    detectPressureCenters(
      mo.pressureAnomaly,
      grid,
      params.pressureCenterThresholdHpa,
      params.pressureCenterMinAreaDeg2,
    ),
  );
  const monthlyPressureCenters: Months12<ReadonlyArray<PressureCenter>> = [
    monthlyCentersArr[0]!, monthlyCentersArr[1]!, monthlyCentersArr[2]!, monthlyCentersArr[3]!,
    monthlyCentersArr[4]!, monthlyCentersArr[5]!, monthlyCentersArr[6]!, monthlyCentersArr[7]!,
    monthlyCentersArr[8]!, monthlyCentersArr[9]!, monthlyCentersArr[10]!, monthlyCentersArr[11]!,
  ];

  return {
    monthlyWindField,
    monthlyPressureAnomalyHpa,
    monthlyPressureCenters,
    mountainDeflectionApplied: mountainDeflectionApplied as GridMap<boolean>,
  };
}
