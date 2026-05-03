// Step 6: 降水（月別降水ラベル + 暖流由来湿潤帯 + 山脈風上/風下マスク + 極前線拡張 + 山脈起伏）の月別導出。
// 一次参照: Pasta Part VIb Step 6 Precipitation + Worldbuilder's Log #31/#32（Madeline James 手法）。
//   詳細は [docs/spec/06_降水.md §4] を参照。
//
// 規約:
//   - 計算層は副作用を持たない純粋関数（[技術方針.md §1.5.1]）。
//   - 物理量の識別子に単位を含める（[開発ガイド.md §2.2.3]）。
//   - 入出力契約は [要件定義書.md §4.3] / [docs/spec/06_降水.md §5]。
//
// 範囲（最小実装、[docs/spec/06_降水.md §4]）:
//   §4.1 暖流由来 wet（onshore + 内陸延長 ≤ maxWetExtensionKm、急傾斜 ≥ 1km で停止）
//   §4.2 ITCZ ±N°: 既存 wet → very_wet、影響帯内 onshore 海岸 → wet
//   §4.4 地形性降雨: 風上→ wet、風下＋起伏≥しきい値→ dry（緯度補正で 1〜3 km）
//   §4.5 高地乾燥: 標高 > 4 km の陸地→ dry
//   §4.7 極前線拡張: 冬半球の中高緯度内陸 (|lat| 40〜60°、winterMin 冷涼) → wet
//   §4.8 dry: 亜熱帯高気圧帯（≈ 30°）の wet 化されない陸地→ dry
//
// 割愛（後続実装で精緻化）:
//   §4.3 Madeline James 季節低気圧の詳細位置（Step 4 の PressureCenter は受領のみ）
//   §4.6 Lee Cyclogenesis 詳細
//   monthlyFrontPassageFrequency は全 0（Madeline James 手法では前線通過を縮退）
//   warmCurrentHumidBeltMask の海岸別 Fetch（外洋扱い、内海・湖の Fetch 計算は §7.4 確定後）

import type {
  AirflowResult,
  Grid,
  GridMap,
  ITCZBand,
  ITCZResult,
  Months12,
  OceanCurrentResult,
  PlanetParams,
  PrecipitationLabel,
  PrecipitationResult,
  TemperatureResult,
  WindBeltResult,
  WindVector,
} from '@/domain';

const MONTHS_PER_YEAR = 12;
const DEG_TO_RAD = Math.PI / 180;

/** 急傾斜山脈による wet 帯停止のしきい値（m、[docs/spec/06_降水.md §4.1.3] Pasta 1 km）。 */
const SHARP_MOUNTAIN_RELIEF_METERS = 1000;

/** 起伏マップ計算で参照する局所窓の半径（セル数）。3×3 窓 → 半径 1。 */
const RELIEF_WINDOW_RADIUS = 1;

/** 起伏窓内で海洋セルを「標高 0 」として扱う（負の海底深度は含めない）。陸海境界の段差を起伏に算入。 */
const OCEAN_AS_ELEVATION_METERS = 0;

/** 風向きステップで主軸成分の優位を判定する比（dominant 比）。8 方向に丸める。 */
const WIND_DIR_DOMINANCE_RATIO = 0.3;

/** 風が弱すぎてステップ方向が決まらないしきい値（m/s）。これ以下では trace を打ち切る。 */
const MIN_WIND_SPEED_FOR_TRACE_MPS = 0.05;

/** 亜熱帯高気圧帯（dry の付与対象）の緯度範囲（度、[docs/spec/06_降水.md §4.8]）。 */
const SUBTROPICAL_HIGH_LAT_MIN_DEG = 25;
const SUBTROPICAL_HIGH_LAT_MAX_DEG = 35;

/** 極前線拡張帯の緯度範囲（度、[docs/spec/06_降水.md §4.7] 中高緯度）。 */
const POLAR_FRONT_LAT_MIN_DEG = 40;
const POLAR_FRONT_LAT_MAX_DEG = 60;

/**
 * 極前線拡張帯と判定する winterMinTemperature 上限（°C）。
 * 中高緯度のうち冬がこの値以下なら極前線が冬期に届くと近似する。
 */
const POLAR_FRONT_WINTER_TEMP_THRESHOLD_CELSIUS = 5;

/** 北半球の冬月インデックス（12 月＝11、1 月＝0、2 月＝1）。 */
const NH_WINTER_MONTH_INDICES: ReadonlyArray<number> = [11, 0, 1];
/** 南半球の冬月インデックス（6 月＝5、7 月＝6、8 月＝7）。 */
const SH_WINTER_MONTH_INDICES: ReadonlyArray<number> = [5, 6, 7];

/**
 * 風上/風下マスク探索の lookahead セル数。
 * 山脈の影響範囲を表す。1° 解像度で 3 セル ≈ 333 km、Pasta の地形性降水の典型スケール。
 */
const OROGRAPHIC_LOOKAHEAD_CELLS = 3;

/**
 * 緯度に応じた rainshadow desert しきい値の倍率（[docs/spec/06_降水.md §4.4] 緯度補正）。
 *   赤道近傍（|lat| < 20°）: 1.5×（onshore 風方向で 3 km 必要）
 *   中緯度（20〜40°）: 1.5 → 0.5 の線形補間
 *   高緯度（|lat| > 40°）: 0.5×（内陸で 1 km から rainshadow）
 */
function rainshadowDesertReliefMultiplier(absLatitudeDeg: number): number {
  if (absLatitudeDeg < 20) return 1.5;
  if (absLatitudeDeg > 40) return 0.5;
  // 線形補間: 20°→1.5、40°→0.5
  return 1.5 - ((absLatitudeDeg - 20) / 20) * 1.0;
}

/**
 * Step 6 降水の利用者調整パラメータ（[docs/spec/06_降水.md §6.1]）。
 */
export interface PrecipitationStepParams {
  /**
   * 暖流由来 wet 帯の最大延伸距離（km、Pasta 既定 2000、[docs/spec/06_降水.md §4.1.1]）。
   * 内海 Fetch ルールは未対応のため、すべての暖流海岸で本値が上限となる。
   */
  readonly maxWetExtensionKm: number;
  /**
   * rainshadow desert 形成の起伏しきい値（m、Pasta 既定 2000、[§4.4]）。
   * 緯度補正で 1〜3 km の範囲に動く。本値はその中間（中緯度）の基準値。
   */
  readonly rainshadowDesertReliefMeters: number;
  /**
   * 高地乾燥の標高しきい値（m、Pasta 既定 4000、[§4.5]）。
   */
  readonly highElevationDryThresholdMeters: number;
  /**
   * 風上斜面 wet 化の最低起伏（m、Pasta 既定 1000、[§4.4]）。
   * 風下/風上方向に lookahead セル内でこれ以上の標高差を持つ高地があるとき適用。
   */
  readonly windwardWetMinReliefMeters: number;
  /**
   * ITCZ 影響帯の幅（中心線から ±度、Pasta 既定 15、[§4.2]）。
   * 表示用 Step 1 の `baseInfluenceHalfWidthDeg` と独立に持つ（降水ロジックの調整自由度確保）。
   */
  readonly itczInfluenceHalfWidthDeg: number;
  /**
   * 暖流海岸 wet 帯トレースの最大ステップ数（過剰反復ガード）。
   * 1° 解像度で 1 ステップ ≈ 110 km、200 ステップで ≈ 22,000 km と地球周長の半分強。
   */
  readonly warmCurrentTraceMaxSteps: number;
}

export const DEFAULT_PRECIPITATION_STEP_PARAMS: PrecipitationStepParams = {
  maxWetExtensionKm: 2000,
  rainshadowDesertReliefMeters: 2000,
  highElevationDryThresholdMeters: 4000,
  windwardWetMinReliefMeters: 1000,
  itczInfluenceHalfWidthDeg: 15,
  warmCurrentTraceMaxSteps: 200,
};

/** ±1 / 0 の符号関数（IEEE 754 -0 を 0 に丸める、[開発ガイド.md §6.1.1] と同じ防御）。 */
function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/**
 * 緯度・経度変位（度）と緯度から、地表上の距離（km）を返す。
 * 北南方向は kmPerDeg、東西方向は kmPerDeg × cos(lat) で換算する。
 */
function cellStepKm(planet: PlanetParams, grid: Grid, latitudeDeg: number, di: number, dj: number): number {
  const kmPerDeg = planet.body.radiusKm * DEG_TO_RAD;
  const cosLat = Math.cos(latitudeDeg * DEG_TO_RAD);
  const dyKm = Math.abs(di) * grid.resolutionDeg * kmPerDeg;
  const dxKm = Math.abs(dj) * grid.resolutionDeg * kmPerDeg * Math.max(0.05, cosLat);
  return Math.sqrt(dxKm * dxKm + dyKm * dyKm);
}

/** 月別風ベクトル場の年平均（セル単位の単純平均）。風上・風下マスク導出に使う。 */
function computeAnnualMeanWind(monthlyWindField: Months12<GridMap<WindVector>>): WindVector[][] {
  const firstMonth = monthlyWindField[0];
  const rows = firstMonth.length;
  const cols = firstMonth[0]?.length ?? 0;
  const result: WindVector[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    const row: WindVector[] = new Array(cols);
    for (let j = 0; j < cols; j++) {
      let sumU = 0;
      let sumV = 0;
      let count = 0;
      for (const monthField of monthlyWindField) {
        const w = monthField[i]?.[j];
        if (w) {
          sumU += w.uMps;
          sumV += w.vMps;
          count++;
        }
      }
      row[j] = count > 0 ? { uMps: sumU / count, vMps: sumV / count } : { uMps: 0, vMps: 0 };
    }
    result[i] = row;
  }
  return result;
}

/**
 * 各陸地セルの局所起伏（m）を計算する（[docs/spec/06_降水.md §6.2] 起伏値）。
 *
 * 3×3 窓の (max - min) を起伏として返す。海洋セルは標高 0 として算入し、
 * 陸海境界の段差を含めることで「海岸近くの低地」と「内陸の山岳」を区別する。
 * 経度方向は wraparound、緯度方向はクランプ。
 */
function computeMountainRelief(grid: Grid): number[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const relief: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    relief[i] = new Array<number>(cols).fill(0);
  }
  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    if (!cellRow) continue;
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (!cell || !cell.isLand) continue;
      let minH = cell.elevationMeters;
      let maxH = cell.elevationMeters;
      for (let di = -RELIEF_WINDOW_RADIUS; di <= RELIEF_WINDOW_RADIUS; di++) {
        const ni = i + di;
        if (ni < 0 || ni >= rows) continue;
        const ncellRow = grid.cells[ni];
        if (!ncellRow) continue;
        for (let dj = -RELIEF_WINDOW_RADIUS; dj <= RELIEF_WINDOW_RADIUS; dj++) {
          const nj = ((j + dj) % cols + cols) % cols;
          const neighbor = ncellRow[nj];
          if (!neighbor) continue;
          const h = neighbor.isLand ? neighbor.elevationMeters : OCEAN_AS_ELEVATION_METERS;
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
        }
      }
      relief[i]![j] = maxH - minH;
    }
  }
  return relief;
}

interface OrographicMasks {
  readonly windward: boolean[][];
  readonly leeward: boolean[][];
  /** 各 leeward セルの「上流側にある山の比高（m）」。rainshadow desert 判定の根拠。 */
  readonly leewardBlockingReliefMeters: number[][];
}

/**
 * 各陸地セルから、年平均風の風上・風下方向に lookahead セル分隣接を探索し、
 * 標高差 ≥ minRelief の高地を見つけたら windward / leeward を true にする。
 *
 * - 風下方向（+u, +v）に高い陸地 → 自セルは **windward**（風上斜面、地形性降雨で wet 化）
 * - 風上方向（-u, -v）に高い陸地 → 自セルは **leeward**（rainshadow 候補、blocking relief を記録）
 *
 * 風向きは 8 方向に丸める（dominant 比 0.3 で副軸成分を採用）。風速が
 * MIN_WIND_SPEED_FOR_TRACE_MPS 未満のセルは「静止風帯」としてスキップ。
 */
function computeOrographicMasks(
  grid: Grid,
  annualWind: WindVector[][],
  minReliefMeters: number,
  lookaheadCells: number,
): OrographicMasks {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const windward: boolean[][] = new Array(rows);
  const leeward: boolean[][] = new Array(rows);
  const leewardBlockingReliefMeters: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    windward[i] = new Array<boolean>(cols).fill(false);
    leeward[i] = new Array<boolean>(cols).fill(false);
    leewardBlockingReliefMeters[i] = new Array<number>(cols).fill(0);
  }

  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    if (!cellRow) continue;
    const windRow = annualWind[i];
    if (!windRow) continue;
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (!cell || !cell.isLand) continue;
      const myElev = cell.elevationMeters;
      const w: WindVector | undefined = windRow[j];
      if (!w) continue;
      const absU = Math.abs(w.uMps);
      const absV = Math.abs(w.vMps);
      if (absU < MIN_WIND_SPEED_FOR_TRACE_MPS && absV < MIN_WIND_SPEED_FOR_TRACE_MPS) continue;
      const di: -1 | 0 | 1 = absV > WIND_DIR_DOMINANCE_RATIO * absU ? sign(w.vMps) : 0;
      const dj: -1 | 0 | 1 = absU > WIND_DIR_DOMINANCE_RATIO * absV ? sign(w.uMps) : 0;
      if (di === 0 && dj === 0) continue;
      for (let step = 1; step <= lookaheadCells; step++) {
        // 風下方向の高地探索 → 自セルは windward
        const downI = i + di * step;
        const downJ = ((j + dj * step) % cols + cols) % cols;
        if (downI >= 0 && downI < rows) {
          const dn = grid.cells[downI]?.[downJ];
          if (dn && dn.isLand) {
            const diffMeters = dn.elevationMeters - myElev;
            if (diffMeters >= minReliefMeters) {
              windward[i]![j] = true;
            }
          }
        }
        // 風上方向の高地探索 → 自セルは leeward
        const upI = i - di * step;
        const upJ = ((j - dj * step) % cols + cols) % cols;
        if (upI >= 0 && upI < rows) {
          const up = grid.cells[upI]?.[upJ];
          if (up && up.isLand) {
            const diffMeters = up.elevationMeters - myElev;
            if (diffMeters >= minReliefMeters) {
              leeward[i]![j] = true;
              if (diffMeters > leewardBlockingReliefMeters[i]![j]!) {
                leewardBlockingReliefMeters[i]![j] = diffMeters;
              }
            }
          }
        }
      }
    }
  }

  return { windward, leeward, leewardBlockingReliefMeters };
}

interface CoastalNormal {
  /** 海から陸方向の単位ベクトル（東西成分）。陸セルから見て海から陸への向き。 */
  readonly nx: number;
  /** 海から陸方向の単位ベクトル（南北成分）。 */
  readonly ny: number;
}

/**
 * 陸地セル (i,j) の「海岸法線（海→陸方向）」を返す。海洋に隣接していない陸地セルでは null。
 * 4 近傍の海洋セルを集計し、その重心方向の反対（陸地中心向き）を法線とする。
 */
function coastalNormalIntoLand(grid: Grid, i: number, j: number): CoastalNormal | null {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const cell = grid.cells[i]?.[j];
  if (!cell || !cell.isLand) return null;
  let sumNx = 0;
  let sumNy = 0;
  let oceanNeighborCount = 0;
  // 4 近傍を順に評価
  const neighbors: ReadonlyArray<{ readonly di: number; readonly dj: number }> = [
    { di: 1, dj: 0 },
    { di: -1, dj: 0 },
    { di: 0, dj: 1 },
    { di: 0, dj: -1 },
  ];
  for (const { di, dj } of neighbors) {
    const ni = i + di;
    if (ni < 0 || ni >= rows) continue;
    const nj = ((j + dj) % cols + cols) % cols;
    const neighbor = grid.cells[ni]?.[nj];
    if (!neighbor) continue;
    if (neighbor.isLand) continue;
    // 海洋隣接セル (ni,nj) → 自セル方向（陸方向）が海岸法線
    sumNx += -dj; // 海方向 dj の反対
    sumNy += -di;
    oceanNeighborCount++;
  }
  if (oceanNeighborCount === 0) return null;
  const len = Math.sqrt(sumNx * sumNx + sumNy * sumNy);
  if (len < 1e-9) return null;
  return { nx: sumNx / len, ny: sumNy / len };
}

/**
 * セル (i,j) が ITCZ 影響帯内かを判定する。
 *
 * Step 1 の ITCZBand は south/north が「山岳横断切取済み」の clipped 値だが、降水ステップでは
 * ITCZ 中心線 ± `itczInfluenceHalfWidthDeg` の **一様幅** を使う（表示と同じ哲学、[src/ui/map/MapCanvas.tsx]
 * computeBandPoints のコメント参照）。山岳切取で band がゼロ幅まで縮退したセルは降水 wet
 * 判定の対象外となる前提で、可視化との整合を取る。
 */
function isInITCZBandAt(
  band: ITCZBand | undefined,
  latitudeDeg: number,
  halfWidthDeg: number,
): boolean {
  if (!band) return false;
  const south = band.centerLatitudeDeg - halfWidthDeg;
  const north = band.centerLatitudeDeg + halfWidthDeg;
  return latitudeDeg >= south && latitudeDeg <= north;
}

interface WarmCurrentTraceOutputs {
  /** 月別 wet 帯マスク（暖流海岸 onshore + 内陸トレース）。 */
  readonly monthlyMask: boolean[][][];
  /** 年集約 humid belt mask（月別の論理和）。 */
  readonly annualMask: boolean[][];
  /** 年集約 fetch 距離（km、月別の最大値）。 */
  readonly annualFetchKm: number[][];
}

/**
 * 暖流由来 wet 帯を月別にトレースする（[docs/spec/06_降水.md §4.1]）。
 *
 * 各月で:
 *   1. 海洋セルのうち `monthlyCoastalTemperatureCorrectionCelsius > 0` を「暖流」とみなす。
 *   2. 暖流に隣接する陸地セルが onshore 風（風が海→陸方向）なら出発点とする。
 *   3. 出発点から風向きに従って 8 方向ステップで内陸へ進み、累積 fetch ≤ maxKm まで
 *      陸地セルを wet マスク。
 *   4. 急傾斜山脈（relief ≥ SHARP_MOUNTAIN_RELIEF_METERS）に当たったら停止（rainshadow）。
 *   5. 海洋に戻ったら停止（風下に水域が来た時点で wet 帯はそこから先には及ばない）。
 *
 * 一回の trace 内で訪問済みセルは再訪しない（多重ループ防止、[開発ガイド.md §6.1.3] と同じ
 * 「同一セル多重処理」を避ける思想）。
 */
function traceWarmCurrentWetBelts(
  planet: PlanetParams,
  grid: Grid,
  monthlyWindField: Months12<GridMap<WindVector>>,
  oceanCurrentResult: OceanCurrentResult,
  reliefMeters: number[][],
  maxKm: number,
  maxSteps: number,
): WarmCurrentTraceOutputs {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;

  const monthlyMask: boolean[][][] = new Array(MONTHS_PER_YEAR);
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const month: boolean[][] = new Array(rows);
    for (let i = 0; i < rows; i++) month[i] = new Array<boolean>(cols).fill(false);
    monthlyMask[m] = month;
  }
  const annualMask: boolean[][] = new Array(rows);
  const annualFetchKm: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    annualMask[i] = new Array<boolean>(cols).fill(false);
    annualFetchKm[i] = new Array<number>(cols).fill(0);
  }

  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const windField = monthlyWindField[m];
    const warmCorrection = oceanCurrentResult.monthlyCoastalTemperatureCorrectionCelsius[m];
    const monthMask = monthlyMask[m]!;
    if (!windField || !warmCorrection) continue;

    // 海岸出発点を列挙
    for (let i = 0; i < rows; i++) {
      const cellRow = grid.cells[i];
      if (!cellRow) continue;
      const windRow = windField[i];
      if (!windRow) continue;
      for (let j = 0; j < cols; j++) {
        const cell = cellRow[j];
        if (!cell || !cell.isLand) continue;
        // 隣接ocean に暖流があるか
        let warmAdj = false;
        const adjacents: ReadonlyArray<{ readonly di: number; readonly dj: number }> = [
          { di: 1, dj: 0 },
          { di: -1, dj: 0 },
          { di: 0, dj: 1 },
          { di: 0, dj: -1 },
        ];
        for (const { di, dj } of adjacents) {
          const ni = i + di;
          if (ni < 0 || ni >= rows) continue;
          const nj = ((j + dj) % cols + cols) % cols;
          const corr = warmCorrection[ni]?.[nj] ?? 0;
          if (corr > 0) {
            warmAdj = true;
            break;
          }
        }
        if (!warmAdj) continue;

        // onshore 風判定: 海岸法線と風ベクトルの内積
        const normal = coastalNormalIntoLand(grid, i, j);
        if (!normal) continue;
        const w = windRow[j];
        if (!w) continue;
        const onshoreDot = w.uMps * normal.nx + w.vMps * normal.ny;
        if (onshoreDot <= 0) continue; // offshore/parallel はスキップ

        // 内陸トレース
        let curI = i;
        let curJ = j;
        let fetchKm = 0;
        const visitedKey = new Set<number>();
        for (let step = 0; step < maxSteps; step++) {
          const key = curI * cols + curJ;
          if (visitedKey.has(key)) break;
          visitedKey.add(key);

          // 現セルを wet にマーク（陸地のみ）
          const curCell = grid.cells[curI]?.[curJ];
          if (curCell && curCell.isLand) {
            monthMask[curI]![curJ] = true;
            annualMask[curI]![curJ] = true;
            if (fetchKm > annualFetchKm[curI]![curJ]!) {
              annualFetchKm[curI]![curJ] = fetchKm;
            }
          }

          // 次セルを決定
          const curWind = monthlyWindField[m]?.[curI]?.[curJ];
          if (!curWind) break;
          const absU = Math.abs(curWind.uMps);
          const absV = Math.abs(curWind.vMps);
          if (absU < MIN_WIND_SPEED_FOR_TRACE_MPS && absV < MIN_WIND_SPEED_FOR_TRACE_MPS) break;
          const di = absV > WIND_DIR_DOMINANCE_RATIO * absU ? sign(curWind.vMps) : 0;
          const dj = absU > WIND_DIR_DOMINANCE_RATIO * absV ? sign(curWind.uMps) : 0;
          if (di === 0 && dj === 0) break;

          const nextI = curI + di;
          const nextJ = ((curJ + dj) % cols + cols) % cols;
          if (nextI < 0 || nextI >= rows) break;

          // 距離（km）
          const curLat = grid.cells[curI]?.[curJ]?.latitudeDeg ?? 0;
          const stepKm = cellStepKm(planet, grid, curLat, di, dj);
          if (fetchKm + stepKm > maxKm) break;

          // 急傾斜山脈で停止（次セルの relief を見る）
          const nextRelief = reliefMeters[nextI]?.[nextJ] ?? 0;
          const nextCell = grid.cells[nextI]?.[nextJ];
          if (
            nextCell &&
            nextCell.isLand &&
            nextRelief >= SHARP_MOUNTAIN_RELIEF_METERS
          ) {
            // 山脈セル自体は wet にしない（風が堰き止められる）
            break;
          }
          // 海洋に戻ったら停止
          if (nextCell && !nextCell.isLand) break;

          fetchKm += stepKm;
          curI = nextI;
          curJ = nextJ;
        }
      }
    }
  }

  return { monthlyMask, annualMask, annualFetchKm };
}

/**
 * 極前線拡張マスク（GridMap<boolean>）を構築する。
 *
 * 中高緯度（|lat| in [40, 60]）の陸地で、winterMin が
 * `POLAR_FRONT_WINTER_TEMP_THRESHOLD_CELSIUS` 以下のセルを true にする。
 * 月別ラベルの組立で、北半球はその月が NH 冬月、南半球は SH 冬月のときのみ wet 化に寄与する。
 */
function computePolarFrontExtensionMask(
  grid: Grid,
  winterMinTemperature: GridMap<number>,
): boolean[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const mask: boolean[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    mask[i] = new Array<boolean>(cols).fill(false);
  }
  for (let i = 0; i < rows; i++) {
    const cellRow = grid.cells[i];
    const tempRow = winterMinTemperature[i];
    if (!cellRow || !tempRow) continue;
    for (let j = 0; j < cols; j++) {
      const cell = cellRow[j];
      if (!cell || !cell.isLand) continue;
      const absLat = Math.abs(cell.latitudeDeg);
      if (absLat < POLAR_FRONT_LAT_MIN_DEG || absLat > POLAR_FRONT_LAT_MAX_DEG) continue;
      const t = tempRow[j];
      if (t === undefined) continue;
      if (t <= POLAR_FRONT_WINTER_TEMP_THRESHOLD_CELSIUS) {
        mask[i]![j] = true;
      }
    }
  }
  return mask;
}

/** 月インデックス m が、緯度 lat の半球の冬月かを返す。 */
function isWinterMonthForLatitude(monthIndex: number, latitudeDeg: number): boolean {
  if (latitudeDeg >= 0) {
    return NH_WINTER_MONTH_INDICES.includes(monthIndex);
  }
  return SH_WINTER_MONTH_INDICES.includes(monthIndex);
}

/**
 * Step 6 降水 純粋関数。
 *
 * 入力契約: PlanetParams + Grid + Step 1〜5 の各 Result + params。
 * 出力契約: PrecipitationResult（[docs/spec/06_降水.md §5]）。
 *
 * 決定性: 同入力 → 同出力（[要件定義書.md §3.2]）。
 */
export function computePrecipitation(
  planet: PlanetParams,
  grid: Grid,
  itczResult: ITCZResult,
  // WindBelt は最小実装では未使用（卓越風は AirflowResult.monthlyWindField に合成済み）。
  // 将来 §4.3 季節低気圧の沿岸域収束で消費する予定なので契約として受け取る。
  _windBeltResult: WindBeltResult,
  oceanCurrentResult: OceanCurrentResult,
  airflowResult: AirflowResult,
  temperatureResult: TemperatureResult,
  params: PrecipitationStepParams = DEFAULT_PRECIPITATION_STEP_PARAMS,
): PrecipitationResult {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;

  // 1. 起伏マップ（[§6.2] mountainReliefMeters）
  const reliefMeters = computeMountainRelief(grid);

  // 2. 年平均風 → 風上/風下マスク（[§4.4]）
  const annualWind = computeAnnualMeanWind(airflowResult.monthlyWindField);
  const orographic = computeOrographicMasks(
    grid,
    annualWind,
    params.windwardWetMinReliefMeters,
    OROGRAPHIC_LOOKAHEAD_CELLS,
  );

  // 3. 暖流 wet 帯トレース（[§4.1]）
  const warmCurrentTrace = traceWarmCurrentWetBelts(
    planet,
    grid,
    airflowResult.monthlyWindField,
    oceanCurrentResult,
    reliefMeters,
    params.maxWetExtensionKm,
    params.warmCurrentTraceMaxSteps,
  );

  // 4. 極前線拡張マスク（[§4.7]）
  const polarFrontExtensionMask = computePolarFrontExtensionMask(
    grid,
    temperatureResult.winterMinTemperatureCelsius,
  );

  // 5. 月別ラベル組み立て
  const monthlyLabels: PrecipitationLabel[][][] = new Array(MONTHS_PER_YEAR);
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const monthLabel: PrecipitationLabel[][] = new Array(rows);
    const monthBands = itczResult.monthlyBands[m];
    const warmMonthlyMask = warmCurrentTrace.monthlyMask[m]!;
    const windField = airflowResult.monthlyWindField[m];

    for (let i = 0; i < rows; i++) {
      const cellRow = grid.cells[i];
      const labelRow: PrecipitationLabel[] = new Array(cols);
      for (let j = 0; j < cols; j++) {
        const cell = cellRow?.[j];
        if (!cell) {
          labelRow[j] = 'normal';
          continue;
        }
        const absLat = Math.abs(cell.latitudeDeg);

        // §4.5 高地乾燥: 標高 > しきい値 → dry（最強優先）
        if (cell.isLand && cell.elevationMeters > params.highElevationDryThresholdMeters) {
          labelRow[j] = 'dry';
          continue;
        }

        // §4.4 leeward rainshadow: 起伏（緯度補正） >= 緯度補正しきい値 → dry
        const isLee = orographic.leeward[i]?.[j] === true;
        const leeBlockRelief = orographic.leewardBlockingReliefMeters[i]?.[j] ?? 0;
        if (cell.isLand && isLee) {
          const reliefThreshold =
            params.rainshadowDesertReliefMeters * rainshadowDesertReliefMultiplier(absLat);
          if (leeBlockRelief >= reliefThreshold) {
            labelRow[j] = 'dry';
            continue;
          }
        }

        // ITCZ 影響帯判定
        const band = monthBands?.[j];
        const inITCZ = isInITCZBandAt(band, cell.latitudeDeg, params.itczInfluenceHalfWidthDeg);

        // 暖流 wet（陸地のみ）。
        // [P4-60] 亜熱帯（lat 22-35°）の冬月では暖流 wet を抑制 → 冬季乾燥
        // を作って Cwa（温暖冬季少雨気候）が東岸に出るようにする。Pasta WL#37
        // 「亜熱帯モンスーン」の reverse 効果（夏 SE モンスーン onshore /
        // 冬 NW continental offshore）を簡略実装。
        const inWarmWetRaw = cell.isLand && warmMonthlyMask[i]?.[j] === true;
        const isSubtropicalWinter =
          absLat >= 22 &&
          absLat <= 35 &&
          isWinterMonthForLatitude(m, cell.latitudeDeg);
        const inWarmWet = inWarmWetRaw && !isSubtropicalWinter;
        // 風上斜面 wet（陸地のみ）
        const inWindward = cell.isLand && orographic.windward[i]?.[j] === true;
        // 極前線（冬季のみ）
        const inPolarFront =
          cell.isLand &&
          polarFrontExtensionMask[i]?.[j] === true &&
          isWinterMonthForLatitude(m, cell.latitudeDeg);

        const isWetCandidate = inWarmWet || inWindward || inPolarFront;

        // ITCZ 影響帯内 onshore 海岸: 海岸セル + その月の風が onshore なら wet 追加（§4.2 後段）
        let isITCZCoastalOnshore = false;
        if (inITCZ && cell.isLand) {
          const normal = coastalNormalIntoLand(grid, i, j);
          if (normal) {
            const w = windField?.[i]?.[j];
            if (w) {
              const dot = w.uMps * normal.nx + w.vMps * normal.ny;
              if (dot > 0) isITCZCoastalOnshore = true;
            }
          }
        }

        // [P4-56] 拡張モンスーン: lat 15-40° 海岸セルで、その月の風が onshore
        // （陸向き）+ 隣接海セルに warm correction (>0) があれば summer wet。
        // ITCZ band 外でも亜熱帯モンスーン（China/SE US/India analog）を再現。
        // 結果として東岸 25-35° の Cwa（温暖冬季少雨）が出るようになる。
        let isMonsoonOnshore = false;
        if (cell.isLand && absLat >= 15 && absLat <= 40 && !inITCZ) {
          const normal = coastalNormalIntoLand(grid, i, j);
          if (normal) {
            const w = windField?.[i]?.[j];
            if (w) {
              const dot = w.uMps * normal.nx + w.vMps * normal.ny;
              // onshore（正の dot）+ 隣接海セルに warm current がある場合
              if (dot > 0) {
                const monthCorr =
                  oceanCurrentResult.monthlyCoastalTemperatureCorrectionCelsius[m];
                let warmAdj = false;
                // 4 + 拡張近傍を見る（east coast cell の east side ocean を捕捉）
                for (const [di, dj] of [
                  [0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [1, 1], [-1, 1],
                ] as ReadonlyArray<readonly [number, number]>) {
                  const ni = i + di;
                  if (ni < 0 || ni >= rows) continue;
                  const nj = ((j + dj) % cols + cols) % cols;
                  const nCell = grid.cells[ni]?.[nj];
                  if (!nCell || nCell.isLand) continue;
                  // 暖流隣接判定: 0 より大なら採用（旧 > 0.5 は厳しすぎ）
                  if ((monthCorr?.[ni]?.[nj] ?? 0) > 0) {
                    warmAdj = true;
                    break;
                  }
                }
                if (warmAdj) isMonsoonOnshore = true;
              }
            }
          }
        }

        // 優先順序:
        //   ITCZ + wet候補 → very_wet
        //   wet候補 → wet
        //   ITCZ + onshore海岸 → wet
        //   亜熱帯高気圧帯 (lat 25–35°、陸地) → dry
        //   それ以外 → normal
        // §4.x [P4-53] 寒流隣接 dry 帯: lat 10-30° 西岸（cold current が
        // adjacent ocean に発生する位置）の land は dry。Sahara / Atacama analog。
        // 既存の subtropical high (25-35°) と組み合わせて lat 10-35° の
        // west coast / interior が dry → BWh の必要条件 (annual precip 低) を満たす
        let coldCurrentDry = false;
        if (cell.isLand && absLat >= 10 && absLat <= 30) {
          const monthCorr = oceanCurrentResult.monthlyCoastalTemperatureCorrectionCelsius[m];
          // 4 近傍に cold current 海セル (correction < -2°C) があるか
          const adjs: ReadonlyArray<readonly [number, number]> = [
            [0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2],
          ];
          for (const [di, dj] of adjs) {
            const ni = i + di;
            if (ni < 0 || ni >= rows) continue;
            const nj = ((j + dj) % cols + cols) % cols;
            const nCell = grid.cells[ni]?.[nj];
            if (!nCell || nCell.isLand) continue;
            const corr = monthCorr?.[ni]?.[nj] ?? 0;
            if (corr < -2) {
              coldCurrentDry = true;
              break;
            }
          }
        }

        // §4.x [P4-54] 熱帯乾季: lat 5-25° 陸地で「ITCZ 圏外 + 暖流wet なし +
        // orographic windward なし」のとき dry にする。これがないと年中 60mm
        // (normal) で driestMonth ≥ 60 → Af になり、Aw（サバナ）が出ない。
        // Pasta WL#37 によれば「ITCZ が冬半球側に移ると亜熱帯高気圧が降りてきて
        // 乾季を作る」のが Aw / Am の本質。
        const isTropicalDrySeason =
          cell.isLand &&
          absLat >= 5 &&
          absLat < 25 &&
          !inITCZ &&
          !inWarmWet &&
          !inWindward &&
          !isITCZCoastalOnshore;

        // [P4-57/58] Siberian high (NH 高緯度内陸 winter dry): lat 45-65°N の
        // **東半分内陸** に冬月 dry / 夏月 wet。Pasta「東アジア (Mongolia/NE 中国/
        // シベリア東部)」を再現。ユーザ FB「Dw 中央分布おかしい」(2026-05-04) で
        // 東偏重が指示された。
        // - 4 方向 ±6 セル先まで陸続き = 内陸判定（reach 8 → 6 に緩和）
        // - 加えて east coast までの距離が west coast 距離より小さい = 東半分
        // Dw 条件「夏 wettest >= 10*冬 driest」を満たすため夏 wet (120) /
        // 冬 dry (10) で ratio 12 を確保。
        let isHighLatInterior = false;
        if (
          cell.isLand &&
          cell.latitudeDeg >= 45 &&
          cell.latitudeDeg <= 65 &&
          !inWarmWet &&
          !inWindward
        ) {
          let allLand = true;
          let westCoastCells = 999;
          let eastCoastCells = 999;
          // 東西方向に最近海セルまでの距離をスキャン（最大 60°）
          for (let dc = 1; dc < 60; dc++) {
            const njW = ((j - dc) % cols + cols) % cols;
            const njE = ((j + dc) % cols + cols) % cols;
            if (westCoastCells === 999 && grid.cells[i]?.[njW]?.isLand === false) westCoastCells = dc;
            if (eastCoastCells === 999 && grid.cells[i]?.[njE]?.isLand === false) eastCoastCells = dc;
            if (westCoastCells !== 999 && eastCoastCells !== 999) break;
          }
          // 4 方向 ±6 セル radius 内陸判定
          for (const [di, dj] of [[0, 6], [0, -6], [6, 0], [-6, 0]] as ReadonlyArray<
            readonly [number, number]
          >) {
            const ni = i + di;
            if (ni < 0 || ni >= rows) {
              allLand = false;
              break;
            }
            const nj = ((j + dj) % cols + cols) % cols;
            const nCell = grid.cells[ni]?.[nj];
            if (!nCell || !nCell.isLand) {
              allLand = false;
              break;
            }
          }
          // 東半分判定（東岸まで西岸までより近い）
          const isEasternHalf = eastCoastCells <= westCoastCells;
          isHighLatInterior = allLand && isEasternHalf;
        }
        const isSiberianWinterDry =
          isHighLatInterior && isWinterMonthForLatitude(m, cell.latitudeDeg);
        const isContinentalSummerWet =
          isHighLatInterior && !isWinterMonthForLatitude(m, cell.latitudeDeg);

        if (inITCZ && isWetCandidate) {
          labelRow[j] = 'very_wet';
        } else if (isWetCandidate) {
          labelRow[j] = 'wet';
        } else if (isITCZCoastalOnshore) {
          labelRow[j] = 'wet';
        } else if (isMonsoonOnshore) {
          // [P4-56] 亜熱帯モンスーン onshore wet（subtropical high dry rule より優先）
          labelRow[j] = 'wet';
        } else if (isContinentalSummerWet) {
          // [P4-57] NH 高緯度内陸の夏季対流性降水（Dw 形成のため夏 wet）
          labelRow[j] = 'wet';
        } else if (inITCZ && absLat < 15) {
          // [P4-54] ITCZ 圏内の対流性降水: 深熱帯（lat<15°）に限定。
          // 暖流wet/orographic がなくとも 'wet'。lat 15° 以上は影響帯端で
          // 雨量薄く normal のままにし、亜熱帯高気圧帯（25-35°）の dry を
          // 食い潰さないようにする
          labelRow[j] = 'wet';
        } else if (
          cell.isLand &&
          absLat >= SUBTROPICAL_HIGH_LAT_MIN_DEG &&
          absLat <= SUBTROPICAL_HIGH_LAT_MAX_DEG
        ) {
          labelRow[j] = 'dry';
        } else if (coldCurrentDry) {
          labelRow[j] = 'dry';
        } else if (isTropicalDrySeason) {
          labelRow[j] = 'dry';
        } else if (isSiberianWinterDry) {
          labelRow[j] = 'dry';
        } else {
          labelRow[j] = 'normal';
        }
      }
      monthLabel[i] = labelRow;
    }
    monthlyLabels[m] = monthLabel;
  }

  // 6. 月別前線通過頻度（Madeline James 手法では未使用、全 0 で出力）
  const zeroFreqGrid: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) zeroFreqGrid[i] = new Array<number>(cols).fill(0);
  const monthlyFrontPassageFrequency: Months12<GridMap<number>> = [
    zeroFreqGrid, zeroFreqGrid, zeroFreqGrid, zeroFreqGrid,
    zeroFreqGrid, zeroFreqGrid, zeroFreqGrid, zeroFreqGrid,
    zeroFreqGrid, zeroFreqGrid, zeroFreqGrid, zeroFreqGrid,
  ];

  // 7. Months12 タプル化
  const monthlyPrecipitationLabels: Months12<GridMap<PrecipitationLabel>> = [
    monthlyLabels[0]!, monthlyLabels[1]!, monthlyLabels[2]!, monthlyLabels[3]!,
    monthlyLabels[4]!, monthlyLabels[5]!, monthlyLabels[6]!, monthlyLabels[7]!,
    monthlyLabels[8]!, monthlyLabels[9]!, monthlyLabels[10]!, monthlyLabels[11]!,
  ];

  return {
    monthlyPrecipitationLabels,
    warmCurrentHumidBeltMask: warmCurrentTrace.annualMask as GridMap<boolean>,
    warmCurrentFetchKm: warmCurrentTrace.annualFetchKm as GridMap<number>,
    mountainWindwardMask: orographic.windward as GridMap<boolean>,
    mountainLeewardMask: orographic.leeward as GridMap<boolean>,
    monthlyFrontPassageFrequency,
    polarFrontExtensionMask: polarFrontExtensionMask as GridMap<boolean>,
    mountainReliefMeters: reliefMeters as GridMap<number>,
  };
}

/**
 * 内部ヘルパの公開（テスト用）。
 * 戻り値のクランプ・分岐の境界を直接検証するためのみ使う（[要件定義書.md §3.2] 決定性の保証）。
 */
export const __internals = {
  cellStepKm,
  computeAnnualMeanWind,
  computeMountainRelief,
  computeOrographicMasks,
  computePolarFrontExtensionMask,
  coastalNormalIntoLand,
  isInITCZBandAt,
  isWinterMonthForLatitude,
  rainshadowDesertReliefMultiplier,
};
