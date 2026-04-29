// Step 3: 海流（流線・海氷・海岸温度補正・暖寒流分類）の月別導出。
// 一次参照: Pasta Part VIb Step 3 Drawing Currents / Currents and Temperature。
//   詳細は [docs/spec/03_海流.md §4] を参照。
//
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/03_海流.md §5]。
//
// 範囲（最小実装）:
//   - per-cell 分類: 東/西方向への海岸距離比較で warm / cold / neutral を判定
//     - westDist < eastDist (順行) → 西側が陸近く = 西岸境界流側 → 暖流（[docs/spec/03_海流.md §4.3]）
//     - westDist > eastDist → 東岸寒流側 → 寒流（§4.5）
//     - 中央の差が小さい cells（basinCenterNeutralWidthDeg 以下）→ 中立
//     - 高緯度（|lat| > 60°）はゾーン外として中立
//     - 逆行惑星では分類が反転（§4.9）
//   - 海岸温度補正: per-cell に warm +15 / cold -10 を上限とし、海岸距離で線形減衰（§4.8）
//   - 海氷マスク: |lat| > seaIceLatitudeThresholdDeg の海洋セル（§4.7 基本配置のみ）
//   - 月別出力は同一値の繰返し（季節依存は将来 Step 5 気温フィードバック後で対応）
//   - streamlines / collisionPoints / ensoDipoleCandidateMask は空（最小実装）

import type {
  CollisionPoint,
  CurrentClassification,
  CurrentStreamline,
  Grid,
  GridMap,
  ITCZResult,
  Months12,
  OceanCurrentResult,
  PlanetParams,
  WindBeltResult,
} from '@/domain';

/**
 * Step 3 海流の利用者調整パラメータ（[docs/spec/03_海流.md §6.1]）。
 */
export interface OceanCurrentStepParams {
  /** 暖流の最大昇温（°C、Pasta 既定 +15）。 */
  readonly warmCurrentMaxRiseCelsius: number;
  /** 寒流の最大降温の絶対値（°C、Pasta 既定 10、適用時に符号反転して -10）。 */
  readonly coldCurrentMaxDropCelsius: number;
  /** 海岸からの影響保持距離（度、Pasta 既定 10）。 */
  readonly coastalInfluenceRangeDeg: number;
  /** 海氷形成の基本緯度しきい値（度、Pasta 70-80° の下限値を採用）。 */
  readonly seaIceLatitudeThresholdDeg: number;
  /**
   * 中立帯（basin 中央）の判定幅（度）。
   * `|westDist - eastDist| ≤ this` なら中立とみなす。
   */
  readonly basinCenterNeutralWidthDeg: number;
}

export const DEFAULT_OCEAN_CURRENT_STEP_PARAMS: OceanCurrentStepParams = {
  warmCurrentMaxRiseCelsius: 15,
  coldCurrentMaxDropCelsius: 10,
  coastalInfluenceRangeDeg: 10,
  seaIceLatitudeThresholdDeg: 70,
  basinCenterNeutralWidthDeg: 5,
};

/** ある経度行の各セルから東/西方向への陸地までの距離（度）。陸が見つからない場合は Infinity。 */
interface OceanDistances {
  readonly westDeg: number;
  readonly eastDeg: number;
}

/**
 * 各海洋セルから東西方向に最も近い陸地までの距離を経度行ごとに前計算する。
 * 経度循環を考慮するため 2 周ぶんスキャンする（O(rows × cols × 2)）。
 *
 * 陸セルは {west: 0, east: 0} を入れる（参照用、分類では使わない）。
 * 全行海洋（land なし）の行は {west: Infinity, east: Infinity}。
 */
function precomputeOceanDistances(grid: Grid): GridMap<OceanDistances> {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const lonStep = grid.resolutionDeg;
  const result: OceanDistances[][] = new Array(rows);

  for (let i = 0; i < rows; i++) {
    const row = grid.cells[i];
    const distRow: OceanDistances[] = new Array(cols);
    if (!row) {
      for (let j = 0; j < cols; j++) {
        distRow[j] = { westDeg: Infinity, eastDeg: Infinity };
      }
      result[i] = distRow;
      continue;
    }

    // 行に陸地があるか早期判定
    let hasLand = false;
    for (const cell of row) {
      if (cell.isLand) {
        hasLand = true;
        break;
      }
    }
    if (!hasLand) {
      for (let j = 0; j < cols; j++) {
        distRow[j] = { westDeg: Infinity, eastDeg: Infinity };
      }
      result[i] = distRow;
      continue;
    }

    const westDeg = new Array<number>(cols).fill(Infinity);
    const eastDeg = new Array<number>(cols).fill(Infinity);

    // West dist: 西側（j を小さい方向）に最も近い陸までの距離。
    // 左→右にスキャンして「直前に見た陸の global j」を保持し、ocean セルでは current - last。
    let lastLandG = -Infinity;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < cols; j++) {
        const cell = row[j];
        if (!cell) continue;
        const globalJ = pass * cols + j;
        if (cell.isLand) {
          lastLandG = globalJ;
          continue;
        }
        if (Number.isFinite(lastLandG)) {
          const distInDeg = (globalJ - lastLandG) * lonStep;
          if (distInDeg < westDeg[j]!) westDeg[j] = distInDeg;
        }
      }
    }

    // East dist: 東側（j を大きい方向）に最も近い陸までの距離。
    // 右→左にスキャンして「直前に見た陸の global k」を保持し、ocean セルでは current - last。
    let lastLandG2 = -Infinity;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = cols - 1; j >= 0; j--) {
        const cell = row[j];
        if (!cell) continue;
        const globalK = pass * cols + (cols - 1 - j);
        if (cell.isLand) {
          lastLandG2 = globalK;
          continue;
        }
        if (Number.isFinite(lastLandG2)) {
          const distInDeg = (globalK - lastLandG2) * lonStep;
          if (distInDeg < eastDeg[j]!) eastDeg[j] = distInDeg;
        }
      }
    }

    for (let j = 0; j < cols; j++) {
      distRow[j] = { westDeg: westDeg[j]!, eastDeg: eastDeg[j]! };
    }
    result[i] = distRow;
  }

  return result;
}

/**
 * 海洋セルの暖寒流分類（rotationSign が +1 = 順行、-1 = 逆行）。
 * 順行: westDeg < eastDeg → 西岸暖流側（暖流）、逆 → 東岸寒流側（寒流）。
 * 逆行: 分類を反転。
 * 高緯度（|lat| > 60°）または大洋中央（|west - east| ≤ neutralWidth）は中立。
 */
function classifyOceanCell(
  latitudeDeg: number,
  distances: OceanDistances,
  rotationSign: 1 | -1,
  neutralWidthDeg: number,
): CurrentClassification {
  if (Math.abs(latitudeDeg) > 60) return 'neutral';
  if (!Number.isFinite(distances.westDeg) || !Number.isFinite(distances.eastDeg)) {
    return 'neutral';
  }
  const diff = distances.westDeg - distances.eastDeg;
  if (Math.abs(diff) <= neutralWidthDeg) return 'neutral';
  // 順行: westDeg < eastDeg → 西側陸近く = 西岸境界流（暖流）
  const proGradeWarm = diff < 0;
  const isWarm = rotationSign === 1 ? proGradeWarm : !proGradeWarm;
  return isWarm ? 'warm' : 'cold';
}

/**
 * 海岸からの影響保持距離での線形減衰を加味した温度補正値（°C）。
 * 暖流: +warmMaxRise * (1 - distToCoast / influenceRange)
 * 寒流: -coldMaxDrop * (1 - distToCoast / influenceRange)
 * 中立 / 影響範囲外: 0
 */
function coastalTemperatureCorrection(
  classification: CurrentClassification,
  distToCoastDeg: number,
  params: OceanCurrentStepParams,
): number {
  if (classification === 'neutral') return 0;
  if (distToCoastDeg >= params.coastalInfluenceRangeDeg) return 0;
  const decay = 1 - distToCoastDeg / params.coastalInfluenceRangeDeg;
  if (classification === 'warm') return params.warmCurrentMaxRiseCelsius * decay;
  return -params.coldCurrentMaxDropCelsius * decay;
}

/**
 * Step 3 海流 純粋関数。
 *
 * 入力: PlanetParams（rotationDirection 経由で gyre 方向決定）+ Grid（陸海分布）+
 *   ITCZResult / WindBeltResult（最小実装では未使用、契約として受け取る）+ params。
 * 出力: OceanCurrentResult（[docs/spec/03_海流.md §5]）。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。
 *
 * 月別データは同一値の繰返し（最小実装）。Step 5 気温フィードバック後で
 * 季節依存（夏冬で海氷縁が動く等）を導入する。
 */
export function computeOceanCurrent(
  planet: PlanetParams,
  grid: Grid,
  // ITCZResult / WindBeltResult は最小実装では未使用だが、契約として受け取る。
  // 将来 §4.1 赤道反流の経度位置決定（ITCZ）や §4.6 極域反転（極東風）で活用。
  _itczResult: ITCZResult,
  _windBeltResult: WindBeltResult,
  params: OceanCurrentStepParams = DEFAULT_OCEAN_CURRENT_STEP_PARAMS,
): OceanCurrentResult {
  const rotationSign: 1 | -1 = planet.body.rotationDirection === 'prograde' ? 1 : -1;
  const { latitudeCount, longitudeCount } = grid;

  const oceanDistances = precomputeOceanDistances(grid);

  // 1 度の per-cell 計算（季節依存なし）を 12 ヶ月複製する
  const classification: CurrentClassification[][] = new Array(latitudeCount);
  const coastalCorrection: number[][] = new Array(latitudeCount);
  const seaIce: boolean[][] = new Array(latitudeCount);

  for (let i = 0; i < latitudeCount; i++) {
    const row = grid.cells[i];
    const distRow = oceanDistances[i];
    const classRow: CurrentClassification[] = new Array(longitudeCount);
    const correctRow: number[] = new Array(longitudeCount);
    const iceRow: boolean[] = new Array(longitudeCount);

    if (!row || !distRow) {
      for (let j = 0; j < longitudeCount; j++) {
        classRow[j] = 'neutral';
        correctRow[j] = 0;
        iceRow[j] = false;
      }
      classification[i] = classRow;
      coastalCorrection[i] = correctRow;
      seaIce[i] = iceRow;
      continue;
    }

    for (let j = 0; j < longitudeCount; j++) {
      const cell = row[j];
      const dist = distRow[j];
      if (!cell || !dist) {
        classRow[j] = 'neutral';
        correctRow[j] = 0;
        iceRow[j] = false;
        continue;
      }
      if (cell.isLand) {
        classRow[j] = 'neutral';
        correctRow[j] = 0;
        iceRow[j] = false;
        continue;
      }

      const cls = classifyOceanCell(
        cell.latitudeDeg,
        dist,
        rotationSign,
        params.basinCenterNeutralWidthDeg,
      );
      classRow[j] = cls;

      const distToCoastDeg = Math.min(dist.westDeg, dist.eastDeg);
      correctRow[j] = coastalTemperatureCorrection(cls, distToCoastDeg, params);

      iceRow[j] = Math.abs(cell.latitudeDeg) > params.seaIceLatitudeThresholdDeg;
    }

    classification[i] = classRow;
    coastalCorrection[i] = correctRow;
    seaIce[i] = iceRow;
  }

  // CurrentStreamline 構造を最小限満たす — 各月の cells を per-cell 分類だけで近似し、
  // streamlines 配列は空にしておく（描画は overlay で代替）。
  // 将来は §4.1〜§4.6 の手順に従い line tracing を実装する。
  const emptyStreamlines: ReadonlyArray<CurrentStreamline> = [];
  const emptyCollisions: ReadonlyArray<CollisionPoint> = [];

  // 月別タプルを構築（同一値繰返し）
  const month12 = <T>(value: T): Months12<T> => [
    value, value, value, value, value, value, value, value, value, value, value, value,
  ];

  // 中立 ENSO マスク（最小実装では全 false）
  const ensoMask: GridMap<boolean> = new Array(latitudeCount).fill(null).map(() => new Array<boolean>(longitudeCount).fill(false));

  // OceanCurrentResult の monthlyCoastalTemperatureCorrectionCelsius は符号で warm/cold/neutral を
  // 表現できる（>0 暖流の昇温、<0 寒流の降温、=0 中立 or 範囲外）。UI レイヤーは
  // {@link classificationFromCorrection} で per-cell 分類を復元できる。
  // 仕様 [docs/spec/03_海流.md §5] の monthlyStreamlines は空配列で出力（後続 Step が
  // 読む必要が出た段階で line tracing を実装する）。

  return {
    monthlyStreamlines: month12(emptyStreamlines),
    monthlySeaIceMask: month12(seaIce as GridMap<boolean>),
    monthlyCoastalTemperatureCorrectionCelsius: month12(coastalCorrection as GridMap<number>),
    monthlyCollisionPoints: month12(emptyCollisions),
    ensoDipoleCandidateMask: ensoMask,
  };
}

/**
 * coastalTemperatureCorrection の符号から CurrentClassification を復元する補助関数。
 * UI 層が `OceanCurrentResult.monthlyCoastalTemperatureCorrectionCelsius` から per-cell 分類を
 * 引きだすときに使う。
 */
export function classificationFromCorrection(correctionCelsius: number): CurrentClassification {
  if (correctionCelsius > 0) return 'warm';
  if (correctionCelsius < 0) return 'cold';
  return 'neutral';
}
