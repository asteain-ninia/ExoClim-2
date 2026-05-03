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
//   - 海氷マスク: |lat| > seaIceLatitudeThresholdDeg の海洋セル（基本配置、§4.7）+
//     NH/SH 冬季のみ大陸東岸（cold 復帰流側）に延長帯を加算（§4.7 拡張、Worldbuilder's Log #28）
//   - 海氷以外の月別出力は同一値の繰返し（streamline / coastalCorrection / classification の
//     季節依存は将来 Step 5 気温フィードバック後で対応）
//   - streamlines: 盆ごとに「赤道反流 + 亜熱帯ジャイヤ + 極ジャイヤ」を line tracing
//     （[§4.1〜§4.6]）。collisionPoints は赤道流 / 極側流の 2 種類を盆 × 半球で生成
//     （[§4.5 / §4.6]）。ensoDipoleCandidateMask は赤道付近 |lat|≤range の海セルで
//     当該緯度行に陸地が存在する盆に true（[§4.10]）

import type {
  CollisionPoint,
  CurrentClassification,
  CurrentStreamline,
  GeoPoint,
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
   * 寒流沿い東岸海氷延長を有効化するか。
   *
   * Worldbuilder's Log #28 の海氷ルール（[docs/spec/03_海流.md §4.7]）:
   * 「寒流が流れ込む東側の沿岸部では、緯度45度付近まで細長く海氷が伸びる」
   *
   * 大陸の東岸（極ジャイヤ西縁の cold 復帰流が南下する側）で、対応する半球の冬季のみ
   * `seaIceColdCurrentExtensionMinLatDeg` まで海氷を延長する。
   */
  readonly seaIceColdCurrentExtensionEnabled: boolean;
  /**
   * 寒流沿い東岸海氷延長の赤道側下限緯度（度、絶対値、既定 45°）。
   * `seaIceLatitudeThresholdDeg` から本値までが冬季の延長帯になる。
   */
  readonly seaIceColdCurrentExtensionMinLatDeg: number;
  /**
   * 寒流沿い東岸海氷延長の沿岸近接判定距離（度、既定 8°）。
   * 大陸東岸（極ジャイヤ復帰流側）からこの距離以内の海セルのみ延長対象とする。
   */
  readonly seaIceColdCurrentExtensionCoastalProximityDeg: number;
  /**
   * 中立帯（basin 中央）の判定幅（度）。
   * `|westDist - eastDist| ≤ this` なら中立とみなす。
   */
  readonly basinCenterNeutralWidthDeg: number;
  /**
   * ストリームライン生成で使う海洋盆の最小経度幅（度）。
   * これより狭い盆はノイズ扱いで gyre を描画しない。
   */
  readonly streamlineBasinMinWidthDeg: number;
  /**
   * 亜熱帯ジャイヤの赤道側緯度（度、絶対値）。
   * Pasta 引用「around 5-10° latitude」より中央値 7° を既定。
   */
  readonly streamlineEquatorialLatDeg: number;
  /**
   * 亜熱帯ジャイヤの中緯度反転緯度（度、絶対値）。
   * Pasta「ハドレー・セル境界 ≈ 30°」より既定 32°。
   */
  readonly streamlineMidLatitudeDeg: number;
  /**
   * 極ジャイヤの極帯反転緯度（度、絶対値）。
   * Pasta 引用「The poleward current continues to around 80° latitude, where the
   * polar easterlies will cause it to curve back west」より既定 80°
   * （[docs/spec/03_海流.md §4.6]）。
   */
  readonly streamlinePolarLatitudeDeg: number;
  /** 各エッジ（赤道流・西岸・中緯度・東岸・極帯反転）のサンプル点数。多いほど線が滑らか。 */
  readonly streamlineSamplesPerEdge: number;
  /**
   * 各セグメント（赤道流・西岸境界流・中緯度反転・東岸境界流・極帯反転 など）の中間点
   * を sin 曲線で「ジャイヤ内側」方向に膨らませる量（度）。
   *
   * 0 で従来の直線矩形。既定 4° で「角ばった矩形 → 楕円的な滑らかループ」になる。
   * 旧 ExoClim の collision-field + agent-crawl による「陸沿い這行」の手前段階として、
   * 視覚的に「南北へ完全に罫線に沿った直線」感を緩和する（ユーザフィードバック 2026-05-03
   * 「海流の跳ねっ返りが直線すぎる」への対応）。
   */
  readonly streamlineCurvatureDeg: number;
  /**
   * Collision-field deflection の影響半径（セル単位、既定 5）。
   * collision field の平滑化済み距離が本値未満のサンプル点だけが陸地反発の対象。
   * 0 で deflection 無効化（従来挙動）。
   */
  readonly streamlineDeflectionRangeCells: number;
  /**
   * Collision-field deflection の最大変位量（度、既定 3°）。
   * 陸地接触点（distance ≈ 0）でこの量だけ陸地から離れる方向にサンプル点が動く。
   * 0 で deflection 無効化（従来挙動）。
   */
  readonly streamlineMaxDeflectionDeg: number;
  /**
   * Dynamic agent-tracing を有効化するか（既定 false）。
   *
   * true なら ECC（赤道反流）に対して旧 ExoClim 風 agent-based 追跡を使用。
   * agent が collision field の勾配で陸地反発しながら velocity-driven で path を生成。
   * 既定 false で従来の static 矩形 streamline を使用（[P4-26 段階移植]）。
   */
  readonly agentTracingEnabled: boolean;
  /**
   * agent-tracing の最大 step 数（既定 200）。
   * stagnation 検出と組み合わせて無限ループを防ぐ。
   */
  readonly agentMaxSteps: number;
  /**
   * agent-tracing の 1 step あたりの基本進行量（度、既定 0.6°）。
   * 風と coriolis 由来の velocity がない場合の path stride。
   */
  readonly agentBaseSpeedDegPerStep: number;
  /**
   * agent-tracing の陸地反発の強度倍率（既定 0.5）。
   * collision field 勾配と velocity の合成バランス。
   */
  readonly agentCollisionRepulsionStrength: number;
  /**
   * ENSO ダイポール候補マスクを有効化するか。
   *
   * 仕様: [docs/spec/03_海流.md §4.10]。「東西を陸地に挟まれた赤道付近の海域」を
   * 候補として true で示す。Pasta は明示的にシミュレーションしない方針のため、
   * 本実装は候補海域マスクのみを出力する。
   */
  readonly ensoEnabled: boolean;
  /**
   * ENSO 候補海域の赤道からの緯度範囲（度、絶対値、既定 10°）。
   * |lat| <= 本値かつ「東西を陸地に挟まれた盆」の海セルが候補となる。
   */
  readonly ensoLatitudeRangeDeg: number;
}

export const DEFAULT_OCEAN_CURRENT_STEP_PARAMS: OceanCurrentStepParams = {
  warmCurrentMaxRiseCelsius: 15,
  coldCurrentMaxDropCelsius: 10,
  coastalInfluenceRangeDeg: 10,
  seaIceLatitudeThresholdDeg: 70,
  seaIceColdCurrentExtensionEnabled: true,
  seaIceColdCurrentExtensionMinLatDeg: 45,
  seaIceColdCurrentExtensionCoastalProximityDeg: 8,
  basinCenterNeutralWidthDeg: 5,
  streamlineBasinMinWidthDeg: 30,
  streamlineEquatorialLatDeg: 7,
  streamlineMidLatitudeDeg: 32,
  streamlinePolarLatitudeDeg: 80,
  streamlineSamplesPerEdge: 20,
  streamlineCurvatureDeg: 4,
  streamlineDeflectionRangeCells: 5,
  streamlineMaxDeflectionDeg: 3,
  agentTracingEnabled: false,
  agentMaxSteps: 200,
  agentBaseSpeedDegPerStep: 0.6,
  agentCollisionRepulsionStrength: 0.5,
  ensoEnabled: true,
  ensoLatitudeRangeDeg: 10,
};

/** 北半球冬月インデックス（12 月＝11、1 月＝0、2 月＝1）。[src/sim/06_precipitation.ts] と同一規約。 */
const NH_WINTER_MONTH_INDICES: ReadonlyArray<number> = [11, 0, 1];
/** 南半球冬月インデックス（6 月＝5、7 月＝6、8 月＝7）。 */
const SH_WINTER_MONTH_INDICES: ReadonlyArray<number> = [5, 6, 7];

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
 * 海洋盆を識別するための「ある緯度における連続オセアン経度区間」を返す。
 *
 * 経度循環を考慮し、行末と行頭が両方海なら結合する（ラッピング済み区間として返す）。
 * 区間は開始経度（度、`-180` 起点）と終了経度（度、`+180` 終端）で表現する。
 * 終了 < 開始 のときは「経度 180° をまたぐ循環区間」を意味する。
 *
 * 短い区間（経度幅 < `minWidthDeg`）はノイズ扱いで除外。
 */
function findOceanBasinsAtLatitudeIndex(
  grid: Grid,
  latitudeIndex: number,
  minWidthDeg: number,
): Array<{ readonly startLonDeg: number; readonly endLonDeg: number }> {
  const cellRow = grid.cells[latitudeIndex];
  const cols = grid.longitudeCount;
  if (!cellRow) return [];

  // ロー全体が海洋なら 1 つの「経度全周」区間として扱う
  let allOcean = true;
  let allLand = true;
  for (const cell of cellRow) {
    if (cell.isLand) allOcean = false;
    else allLand = false;
  }
  if (allLand) return [];
  if (allOcean) {
    return [{ startLonDeg: -180, endLonDeg: 180 }];
  }

  // 海セルの開始/終了 index を集める（連続区間 = 同じ isLand 状態）
  const segments: Array<{ startJ: number; endJ: number }> = [];
  let runStart = -1;
  for (let j = 0; j < cols; j++) {
    const isOcean = !cellRow[j]!.isLand;
    if (isOcean && runStart < 0) runStart = j;
    if (!isOcean && runStart >= 0) {
      segments.push({ startJ: runStart, endJ: j - 1 });
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    segments.push({ startJ: runStart, endJ: cols - 1 });
  }

  // 行頭と行末が両方海なら結合（経度循環）
  if (
    segments.length >= 2 &&
    segments[0]!.startJ === 0 &&
    segments[segments.length - 1]!.endJ === cols - 1
  ) {
    const first = segments.shift()!;
    const last = segments.pop()!;
    segments.push({ startJ: last.startJ, endJ: first.endJ });
  }

  const indexToLon = (j: number): number => -180 + (j + 0.5) * grid.resolutionDeg;
  const result: Array<{ startLonDeg: number; endLonDeg: number }> = [];
  for (const seg of segments) {
    const startLon = indexToLon(seg.startJ);
    const endLon = indexToLon(seg.endJ);
    let widthDeg: number;
    if (endLon >= startLon) {
      widthDeg = endLon - startLon;
    } else {
      widthDeg = 360 - (startLon - endLon);
    }
    if (widthDeg >= minWidthDeg) {
      result.push({ startLonDeg: startLon, endLonDeg: endLon });
    }
  }
  return result;
}

/**
 * 緯度経度から grid セルが陸地かを判定する。grid 範囲外は false を返す。
 */
function isLandAtGeoPoint(grid: Grid, latitudeDeg: number, longitudeDeg: number): boolean {
  const i = Math.round((latitudeDeg + 90) / grid.resolutionDeg - 0.5);
  if (i < 0 || i >= grid.latitudeCount) return false;
  let lon = longitudeDeg;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  const j = Math.round((lon + 180) / grid.resolutionDeg - 0.5);
  if (j < 0 || j >= grid.longitudeCount) return false;
  const cell = grid.cells[i]?.[j];
  return cell?.isLand === true;
}

/**
 * Streamline の path を、「陸セル上のサンプル点」で分断して 1 つ以上の path に分割する
 * （[docs/spec/03_海流.md §既知の未対応事項] / Worldbuilder's Log #28、ユーザフィードバック
 * 2026-05-03「海流が陸の形状を全く無視している」への中間対応）。
 *
 * 旧 ExoClim の collision-field + agent-tracing 方式の完全移植は別サイクルで対応する予定。
 * 本関数は最小実装として「矩形ループの辺が島嶼を通過する場合、その辺を分断する」
 * ことで「streamline が大陸を素通り」する視覚的不自然を緩和する。
 *
 * 連続する海セルが 2 点未満なら破棄（streamline は 2 点以上の path を要求）。
 */
function splitPathByLand(path: ReadonlyArray<GeoPoint>, grid: Grid): GeoPoint[][] {
  const result: GeoPoint[][] = [];
  let current: GeoPoint[] = [];
  for (const point of path) {
    if (isLandAtGeoPoint(grid, point.latitudeDeg, point.longitudeDeg)) {
      // 陸セルで分断
      if (current.length >= 2) result.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length >= 2) result.push(current);
  return result;
}

/**
 * 1 つの classification + 親 path を grid で陸地分断し、`CurrentStreamline[]` を返す。
 * 分断された各サブ path が独立した streamline になる。陸地が無ければ単一 streamline。
 */
function buildSplitStreamlines(
  classification: CurrentClassification,
  path: ReadonlyArray<GeoPoint>,
  grid: Grid,
): CurrentStreamline[] {
  const splits = splitPathByLand(path, grid);
  return splits.map((subPath) => ({ classification, path: subPath }));
}

/**
 * セグメント（横向き = lat 一定 / 縦向き = lon 一定）を sin 曲線で膨らませる
 * （ユーザフィードバック 2026-05-03「海流の跳ねっ返りが直線すぎる」への対応）。
 *
 * 端点を固定し、`t = k / (n-1)` で `Math.sin(π * t) * deflectionDeg` を法線方向に加算する。
 * `axis = 'lat'` なら lat 方向、`axis = 'lon'` なら lon 方向に膨らむ。
 *
 * deflectionDeg = 0 もしくは path 長 < 3 ならコピーをそのまま返す。
 * 経度ラップは加算後に -180 〜 +180 に折りたたむ。
 */
function curveSegment(
  path: ReadonlyArray<GeoPoint>,
  axis: 'lat' | 'lon',
  deflectionDeg: number,
): GeoPoint[] {
  if (path.length < 3 || deflectionDeg === 0) {
    return path.map((p) => ({ ...p }));
  }
  const last = path.length - 1;
  return path.map((p, k) => {
    const t = k / last;
    const bulge = Math.sin(Math.PI * t) * deflectionDeg;
    if (axis === 'lat') {
      return { latitudeDeg: p.latitudeDeg + bulge, longitudeDeg: p.longitudeDeg };
    }
    let lon = p.longitudeDeg + bulge;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    return { latitudeDeg: p.latitudeDeg, longitudeDeg: lon };
  });
}

/**
 * 経度ラップを考慮して `[startLonDeg, endLonDeg]` を `nSamples` 等分してサンプル経度列を返す。
 * `endLonDeg >= startLonDeg` なら線形補間、`endLonDeg < startLonDeg` なら 360 を加えて補間後 -180 〜 +180 に折りたたむ。
 */
function sampleLongitudes(startLonDeg: number, endLonDeg: number, nSamples: number): number[] {
  let widthDeg: number;
  if (endLonDeg >= startLonDeg) widthDeg = endLonDeg - startLonDeg;
  else widthDeg = 360 - (startLonDeg - endLonDeg);
  const step = widthDeg / Math.max(1, nSamples - 1);
  const out: number[] = new Array(nSamples);
  for (let k = 0; k < nSamples; k++) {
    let lon = startLonDeg + step * k;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    out[k] = lon;
  }
  return out;
}

/**
 * ある盆の閉じた亜熱帯ジャイヤを 4 セグメントとして生成し、各セグメントを陸地分断した
 * ストリームライン群を返す（[docs/spec/03_海流.md §4.1〜§4.5]）。
 *
 * `grid = null` を渡すと陸地分断をスキップして従来挙動になる（テスト互換性のため）。
 */
function generateSubtropicalGyre(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  equatorialLatDeg: number,
  midLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null = null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  // NH（hemisphereSign = +1）: 亜熱帯ジャイヤは時計回り（東向き赤道側 → 北 → 西向き ⇒ ズレ修正）
  //   実際の Pasta 説明:
  //     - 赤道側（lat ≈ +5）: 西向き（赤道流） → 西岸（暖流北上） → 中緯度 30° で東向き → 東岸（寒流南下） → 赤道流に合流
  //   逆行惑星（rotationSign = -1）では東西成分が反転する（[§4.9]）。
  // SH（hemisphereSign = -1）: 同じパターンを赤道反転で適用。
  const eqLat = hemisphereSign * equatorialLatDeg;
  const midLat = hemisphereSign * midLatitudeDeg;

  // 基本西向きの赤道流: end → start に走る（地理上）
  // rotationSign = -1（逆行）では東向きにする
  const equatorWesternStartLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const equatorWesternEndLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;

  const equatorialPath: GeoPoint[] = sampleLongitudes(
    equatorWesternStartLon,
    equatorWesternEndLon,
    samplesPerEdge,
  ).map((lon) => ({ latitudeDeg: eqLat, longitudeDeg: lon }));

  // 西岸境界流（暖流）: 赤道流の終点（基本では basin.startLonDeg）から極向き
  const westernBoundaryLon =
    rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const westernBoundaryPath: GeoPoint[] = [];
  const latStep = (midLat - eqLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    westernBoundaryPath.push({
      latitudeDeg: eqLat + latStep * k,
      longitudeDeg: westernBoundaryLon,
    });
  }

  // 中緯度東向き反転: westernBoundaryLon → 反対側
  const midLatStartLon = westernBoundaryLon;
  const midLatEndLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const midLatitudePath: GeoPoint[] = sampleLongitudes(
    midLatStartLon,
    midLatEndLon,
    samplesPerEdge,
  ).map((lon) => ({ latitudeDeg: midLat, longitudeDeg: lon }));

  // 東岸境界流（寒流、赤道側分岐）: 中緯度の終点から赤道方向へ
  const easternBoundaryLon = midLatEndLon;
  const easternBoundaryPath: GeoPoint[] = [];
  for (let k = 0; k < samplesPerEdge; k++) {
    easternBoundaryPath.push({
      latitudeDeg: midLat - latStep * k,
      longitudeDeg: easternBoundaryLon,
    });
  }

  // 曲線化（ジャイヤ内側に sin で膨らます）。
  //   赤道流 (lat = ±eqLat): 内側 = 極側 → +hemisphereSign 方向に lat 揺らぎ
  //   西岸境界流 (lon = westernBoundaryLon): 内側 = 東側 (順行) / 西側 (逆行)
  //                                        = +rotationSign 方向に lon 揺らぎ
  //   中緯度反転 (lat = ±midLat): 内側 = 赤道側 → -hemisphereSign 方向に lat 揺らぎ
  //   東岸境界流 (lon = easternBoundaryLon): 内側 = 西側 (順行) / 東側 (逆行)
  //                                        = -rotationSign 方向に lon 揺らぎ
  const eqCurved = curveSegment(equatorialPath, 'lat', hemisphereSign * curvatureDeg);
  const westCurved = curveSegment(westernBoundaryPath, 'lon', rotationSign * curvatureDeg);
  const midCurved = curveSegment(midLatitudePath, 'lat', -hemisphereSign * curvatureDeg);
  const eastCurved = curveSegment(easternBoundaryPath, 'lon', -rotationSign * curvatureDeg);

  if (!grid) {
    return [
      { classification: 'neutral', path: eqCurved },          // 赤道流（暖→冷遷移）
      { classification: 'warm', path: westCurved },           // 西岸境界流（暖流）
      { classification: 'neutral', path: midCurved },         // 中緯度東向き
      { classification: 'cold', path: eastCurved },           // 東岸境界流（寒流）
    ];
  }
  return [
    ...buildSplitStreamlines('neutral', eqCurved, grid),
    ...buildSplitStreamlines('warm', westCurved, grid),
    ...buildSplitStreamlines('neutral', midCurved, grid),
    ...buildSplitStreamlines('cold', eastCurved, grid),
  ];
}

/**
 * 極ジャイヤを 3 つの分類済みストリームラインとして返す（[docs/spec/03_海流.md §4.5 / §4.6]）。
 *
 * §4.5 の「極側分岐」（亜熱帯ジャイヤ東岸での分岐の極向き枝）が basin の東縁に沿って
 * `midLat → polarLat` まで進み、§4.6 の polar easterlies により `polarLat` で西向きに
 * 反転して basin の西縁に到達、そこから赤道方向へ寒水を運ぶ復帰流として `polarLat → midLat`
 * を下る、という 3 セグメントのループを生成する。
 *
 * 分類:
 *  - 東縁極向き継続: warm（亜熱帯ジャイヤ東岸の暖水を極向きに継続して運ぶ）
 *  - 極帯反転: neutral（polar easterlies 由来、暖寒の混合）
 *  - 西縁赤道向き復帰: cold（極水を低緯度方向に運ぶ復帰流）
 *
 * 逆行惑星（rotationSign = -1）では東西成分が反転する（[§4.9]）ため、`westernBoundaryLon`
 * と `easternBoundaryLon` の役割が亜熱帯ジャイヤと同じ規則で入れ替わる。
 */
function generatePolarGyre(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  midLatitudeDeg: number,
  polarLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null = null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const midLat = hemisphereSign * midLatitudeDeg;
  const polarLat = hemisphereSign * polarLatitudeDeg;

  // 亜熱帯ジャイヤと同じ規則: 順行で westernBoundary = startLon, eastern = endLon。
  // 逆行ではこの 2 つを入れ替える（東西成分反転、§4.9）。
  const westernBoundaryLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const easternBoundaryLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;

  // 1) 東縁極向き継続（warm）: midLat → polarLat at easternBoundaryLon
  const easternPolewardPath: GeoPoint[] = [];
  const polewardLatStep = (polarLat - midLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    easternPolewardPath.push({
      latitudeDeg: midLat + polewardLatStep * k,
      longitudeDeg: easternBoundaryLon,
    });
  }

  // 2) 極帯反転（neutral）: easternBoundaryLon → westernBoundaryLon at polarLat
  //   polar easterlies により西向き（順行）/ 東向き（逆行）に走る。経度方向の向きは
  //   sampleLongitudes が start → end の順で線形補間するため、東西は引数順で表現する。
  const polarReversalPath: GeoPoint[] = sampleLongitudes(
    easternBoundaryLon,
    westernBoundaryLon,
    samplesPerEdge,
  ).map((lon) => ({ latitudeDeg: polarLat, longitudeDeg: lon }));

  // 3) 西縁赤道向き復帰（cold）: polarLat → midLat at westernBoundaryLon
  const westernEquatorwardPath: GeoPoint[] = [];
  const equatorwardLatStep = (midLat - polarLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    westernEquatorwardPath.push({
      latitudeDeg: polarLat + equatorwardLatStep * k,
      longitudeDeg: westernBoundaryLon,
    });
  }

  // 曲線化（極ジャイヤの内側方向に膨らます）。NH 順行を時計回りと考えると:
  //   東縁極向き warm (lon = easternBoundaryLon, lat midLat → polarLat):
  //     ジャイヤ内側 = 西側 = -rotationSign の lon 揺らぎ
  //   極帯反転 neutral (lat = ±polarLat, lon east → west):
  //     ジャイヤ内側 = 赤道側 = -hemisphereSign の lat 揺らぎ
  //   西縁赤道向き cold (lon = westernBoundaryLon, lat polarLat → midLat):
  //     ジャイヤ内側 = 東側 = +rotationSign の lon 揺らぎ
  const eastPolewardCurved = curveSegment(easternPolewardPath, 'lon', -rotationSign * curvatureDeg);
  const polarReversalCurved = curveSegment(polarReversalPath, 'lat', -hemisphereSign * curvatureDeg);
  const westEquatorwardCurved = curveSegment(westernEquatorwardPath, 'lon', rotationSign * curvatureDeg);

  if (!grid) {
    return [
      { classification: 'warm', path: eastPolewardCurved },
      { classification: 'neutral', path: polarReversalCurved },
      { classification: 'cold', path: westEquatorwardCurved },
    ];
  }
  return [
    ...buildSplitStreamlines('warm', eastPolewardCurved, grid),
    ...buildSplitStreamlines('neutral', polarReversalCurved, grid),
    ...buildSplitStreamlines('cold', westEquatorwardCurved, grid),
  ];
}

/**
 * 赤道反流（東向き）を生成する（[docs/spec/03_海流.md §4.1]）。
 * `grid` を渡すと陸地横断点で分断し、複数 streamline として返す。null の場合は単一 streamline。
 */
function generateEquatorialCountercurrent(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  rotationSign: 1 | -1,
  samples: number,
  grid: Grid | null = null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  // 順行: 赤道反流は東向き。逆行では西向き（コリオリ符号反転による、§4.9）
  const startLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const endLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const path: GeoPoint[] = sampleLongitudes(startLon, endLon, samples).map((lon) => ({
    latitudeDeg: 0,
    longitudeDeg: lon,
  }));
  // 赤道反流は両ジャイヤの境界。曲げ量は控えめ（半分）にして lat 0° 中心の弱い揺らぎ。
  // 半球符号がないため、北側に膨らます（NH 亜熱帯ジャイヤの底辺と整合）。
  const curved = curveSegment(path, 'lat', curvatureDeg * 0.5);
  if (!grid) {
    return [{ classification: 'neutral', path: curved }];
  }
  return buildSplitStreamlines('neutral', curved, grid);
}

/**
 * 全海洋盆について衝突点を生成する（[docs/spec/03_海流.md §4.5 / §4.6]）。
 *
 * 1 盆 × 2 半球 × 2 種類 = 4 衝突点を出力:
 *   - `equatorial_current`: 赤道流（lat ±eqLat）が大陸西岸（basin 西縁）で衝突し、西岸境界流に転向する起点
 *   - `polar_current`: 極側流（lat ±polarLat）が polar easterlies で西進し、basin 西縁で陸に衝突する点
 *
 * 順行: basin の西縁 (startLonDeg) が衝突側。逆行 ([§4.9]) では東縁 (endLonDeg) が衝突側に反転。
 *
 * 中緯度 (lat ±midLat) での 2 分岐衝突点 ([§4.5] の東岸再衝突) は CollisionPointType の
 * 既定 2 種に含まれないため最小実装では出力しない（[現状.md §既知の未対応事項]）。
 */
function buildAllCollisionPoints(
  grid: Grid,
  rotationSign: 1 | -1,
  basinMinWidthDeg: number,
  equatorialLatDeg: number,
  polarLatitudeDeg: number,
): CollisionPoint[] {
  const equatorIndex = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
  const basins = findOceanBasinsAtLatitudeIndex(grid, equatorIndex, basinMinWidthDeg);
  const result: CollisionPoint[] = [];
  for (const basin of basins) {
    const westernBoundaryLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
    for (const hemisphereSign of [1, -1] as const) {
      // 赤道流衝突点（西岸境界流の起点）
      result.push({
        type: 'equatorial_current',
        position: {
          latitudeDeg: hemisphereSign * equatorialLatDeg,
          longitudeDeg: westernBoundaryLon,
        },
      });
      // 極側流衝突点（西縁復帰流の起点）
      result.push({
        type: 'polar_current',
        position: {
          latitudeDeg: hemisphereSign * polarLatitudeDeg,
          longitudeDeg: westernBoundaryLon,
        },
      });
    }
  }
  return result;
}

/**
 * 各セルから最近接の陸セルまでの Chebyshev 距離（セル単位）を計算する
 * （旧 ExoClim collision field の基盤、[docs/spec/03_海流.md §4 補足]、P4-24 導入）。
 *
 * 陸セル = 0、海セル = 正の値。2-pass Chamfer 法で近似（水平/垂直 +1、対角 +1.4）。
 * 経度方向は循環ラップ、緯度方向はラップなし（極でクランプ）。
 *
 * 旧 ExoClim では `services/physics/ocean.ts` で同等の `distCoast` を Step 0 で計算していたが、
 * ExoClim-2 では Cell 型に持たせず Step 3 内で都度計算する（worker キャッシュが grid 不変なら同一参照を維持）。
 */
function computeDistanceToLandField(grid: Grid): number[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const DIAG = 1.4; // sqrt(2) 近似
  const dist: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    dist[i] = new Array<number>(cols).fill(Infinity);
    const row = grid.cells[i];
    if (!row) continue;
    for (let j = 0; j < cols; j++) {
      if (row[j]?.isLand === true) dist[i]![j] = 0;
    }
  }
  // forward pass
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (dist[i]![j] === 0) continue;
      let m = dist[i]![j]!;
      const jL = j > 0 ? j - 1 : cols - 1;
      if (i > 0) {
        const r = dist[i - 1]!;
        const v1 = r[jL]! + DIAG;
        const v2 = r[j]! + 1;
        const jR2 = j < cols - 1 ? j + 1 : 0;
        const v3 = r[jR2]! + DIAG;
        if (v1 < m) m = v1;
        if (v2 < m) m = v2;
        if (v3 < m) m = v3;
      }
      const v4 = dist[i]![jL]! + 1;
      if (v4 < m) m = v4;
      dist[i]![j] = m;
    }
  }
  // backward pass
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      if (dist[i]![j] === 0) continue;
      let m = dist[i]![j]!;
      const jR = j < cols - 1 ? j + 1 : 0;
      if (i < rows - 1) {
        const r = dist[i + 1]!;
        const v1 = r[jR]! + DIAG;
        const v2 = r[j]! + 1;
        const jL2 = j > 0 ? j - 1 : cols - 1;
        const v3 = r[jL2]! + DIAG;
        if (v1 < m) m = v1;
        if (v2 < m) m = v2;
        if (v3 < m) m = v3;
      }
      const v4 = dist[i]![jR]! + 1;
      if (v4 < m) m = v4;
      dist[i]![j] = m;
    }
  }
  return dist;
}

/**
 * 2D フィールドを 3×3 平均フィルタで `iterations` 回平滑化する。
 * 経度方向は循環ラップ、緯度方向はラップなし。collision field の角ばった陸地縁を滑らかにする。
 */
function smoothField(field: ReadonlyArray<ReadonlyArray<number>>, grid: Grid, iterations: number): number[][] {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  let cur: number[][] = field.map((row) => row.slice());
  for (let iter = 0; iter < iterations; iter++) {
    const next: number[][] = new Array(rows);
    for (let i = 0; i < rows; i++) {
      next[i] = new Array<number>(cols).fill(0);
      for (let j = 0; j < cols; j++) {
        let sum = 0;
        let cnt = 0;
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          if (ni < 0 || ni >= rows) continue;
          for (let dj = -1; dj <= 1; dj++) {
            let nj = j + dj;
            if (nj < 0) nj += cols;
            if (nj >= cols) nj -= cols;
            sum += cur[ni]![nj]!;
            cnt++;
          }
        }
        next[i]![j] = sum / cnt;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * 2D フィールドの中央差分による勾配を計算する。
 * 経度方向は循環ラップ、緯度方向は端点でクランプ（前進/後退差分）。
 *
 * 戻り値の `gradLon[i][j]` / `gradLat[i][j]` は「陸方向への増加率」を表す
 * （collision field は陸 = 0 / 海 = 大なので、勾配ベクトルは「陸方向」を指す）。
 */
function computeFieldGradient(
  field: ReadonlyArray<ReadonlyArray<number>>,
  grid: Grid,
): { readonly gradLon: number[][]; readonly gradLat: number[][] } {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const gradLon: number[][] = new Array(rows);
  const gradLat: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    gradLon[i] = new Array<number>(cols).fill(0);
    gradLat[i] = new Array<number>(cols).fill(0);
    const iUp = i > 0 ? i - 1 : i;
    const iDown = i < rows - 1 ? i + 1 : i;
    for (let j = 0; j < cols; j++) {
      const jLeft = j > 0 ? j - 1 : cols - 1;
      const jRight = j < cols - 1 ? j + 1 : 0;
      gradLon[i]![j] = (field[i]![jRight]! - field[i]![jLeft]!) * 0.5;
      gradLat[i]![j] = (field[iDown]![j]! - field[iUp]![j]!) * 0.5;
    }
  }
  return { gradLon, gradLat };
}

/**
 * Collision field（陸地距離 + 平滑化 + 勾配）を一括構築する。
 * agent-based tracing および post-processing deflection で「陸地方向ベクトル場」として消費する。
 */
export interface CollisionField {
  readonly distance: number[][];
  readonly smoothed: number[][];
  readonly gradLon: number[][];
  readonly gradLat: number[][];
}

/**
 * Streamline path の各サンプル点を collision field の勾配ベクトル（陸方向）と
 * **逆向き**（陸から離れる方向）に変位させる post-processing 変形（P4-25 導入）。
 *
 * 旧 ExoClim の dynamic agent-tracing（時間ステップで衝突反射）の代わりに、
 * static path を「陸地の影響範囲内なら反発方向にスナップ」する 1-pass 簡易版。
 * 影響強度: distance = 0 で max、distance ≥ rangeCells で 0、線形減衰。
 *
 * `rangeCells = 0` または `maxDeflectionDeg = 0` で no-op（従来挙動）。
 */
function deflectPathByCollisionField(
  path: ReadonlyArray<GeoPoint>,
  field: CollisionField,
  grid: Grid,
  rangeCells: number,
  maxDeflectionDeg: number,
): GeoPoint[] {
  if (rangeCells <= 0 || maxDeflectionDeg <= 0) return path.map((p) => ({ ...p }));
  return path.map((p) => {
    const i = Math.round((p.latitudeDeg + 90) / grid.resolutionDeg - 0.5);
    let lon = p.longitudeDeg;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    const j = Math.round((lon + 180) / grid.resolutionDeg - 0.5);
    if (i < 0 || i >= grid.latitudeCount || j < 0 || j >= grid.longitudeCount) {
      return { ...p };
    }
    const dist = field.smoothed[i]?.[j];
    if (dist === undefined || !Number.isFinite(dist)) return { ...p };
    if (dist >= rangeCells) return { ...p };
    const gx = field.gradLon[i]?.[j] ?? 0;
    const gy = field.gradLat[i]?.[j] ?? 0;
    const gMag = Math.hypot(gx, gy);
    if (gMag < 1e-6) return { ...p };
    // 単位ベクトル: 陸から離れる方向 = distance 増加方向 = +gradient
    // （陸 = 0 / 海 = 大なので、勾配ベクトルは海方向 = 陸から離れる方向を指す）
    const ux = gx / gMag;
    const uy = gy / gMag;
    // 影響強度: 陸に近いほど強い（[0, 1]）
    const strength = 1 - dist / rangeCells;
    const dlat = uy * strength * maxDeflectionDeg;
    const dlon = ux * strength * maxDeflectionDeg;
    let newLon = p.longitudeDeg + dlon;
    if (newLon > 180) newLon -= 360;
    if (newLon < -180) newLon += 360;
    return { latitudeDeg: p.latitudeDeg + dlat, longitudeDeg: newLon };
  });
}

function buildCollisionField(grid: Grid, smoothingIterations = 3): CollisionField {
  const distance = computeDistanceToLandField(grid);
  const smoothed = smoothField(distance, grid, smoothingIterations);
  const { gradLon, gradLat } = computeFieldGradient(smoothed, grid);
  return { distance, smoothed, gradLon, gradLat };
}

/**
 * Dynamic agent-tracing 用の単一 agent 状態（[P4-26]、旧 ExoClim ECC pass の最小移植）。
 *
 * lat / lon は度、velocity は度/step。pathHistory は agent が辿った位置の履歴
 * （stagnation 検出用に直近 8 点を保持、メイン出力としても使う）。
 */
interface OceanAgent {
  latitudeDeg: number;
  longitudeDeg: number;
  vLatPerStep: number;
  vLonPerStep: number;
  active: boolean;
  pathHistory: GeoPoint[];
  /** 過去 stagnation チェック用の position 履歴（直近 N 点）。 */
  positionRingBuffer: Array<{ lat: number; lon: number }>;
}

/** Agent 進行 1 step の基本パラメータ（[P4-26]）。 */
interface AgentTraceParams {
  readonly baseSpeedDegPerStep: number;
  readonly collisionRepulsionStrength: number;
  readonly maxSteps: number;
}

/** Stagnation 検出: 過去 RING_SIZE step の position 移動量がしきい値未満なら停止判定。 */
const AGENT_STAGNATION_RING_SIZE = 8;
const AGENT_STAGNATION_THRESHOLD_DEG = 0.3;

/** Agent を 1 step 進める。velocity 更新（drag + 陸地反発）→ position 更新 → stagnation 判定。 */
function stepOceanAgent(
  agent: OceanAgent,
  field: CollisionField,
  grid: Grid,
  params: AgentTraceParams,
): void {
  if (!agent.active) return;
  // velocity 速度減衰（drag）
  agent.vLatPerStep *= 0.92;
  agent.vLonPerStep *= 0.92;
  // collision field 勾配で陸地反発を加速度として加える
  const i = Math.round((agent.latitudeDeg + 90) / grid.resolutionDeg - 0.5);
  let lonNorm = agent.longitudeDeg;
  while (lonNorm > 180) lonNorm -= 360;
  while (lonNorm < -180) lonNorm += 360;
  const j = Math.round((lonNorm + 180) / grid.resolutionDeg - 0.5);
  if (i >= 0 && i < grid.latitudeCount && j >= 0 && j < grid.longitudeCount) {
    const dist = field.smoothed[i]?.[j];
    if (dist !== undefined && Number.isFinite(dist) && dist < 4) {
      const gx = field.gradLon[i]?.[j] ?? 0;
      const gy = field.gradLat[i]?.[j] ?? 0;
      const gMag = Math.hypot(gx, gy);
      if (gMag > 1e-6) {
        const ux = gx / gMag;
        const uy = gy / gMag;
        const repulsion = (1 - dist / 4) * params.collisionRepulsionStrength;
        agent.vLonPerStep += ux * repulsion;
        agent.vLatPerStep += uy * repulsion;
      }
    }
    // 陸セル内に侵入した場合は active=false（stagnation）
    if (grid.cells[i]?.[j]?.isLand === true) {
      agent.active = false;
      return;
    }
  }
  // velocity 速度の上限クランプ（基準速度の 2 倍まで）
  const speed = Math.hypot(agent.vLonPerStep, agent.vLatPerStep);
  const maxSpeed = params.baseSpeedDegPerStep * 2;
  if (speed > maxSpeed) {
    agent.vLonPerStep = (agent.vLonPerStep / speed) * maxSpeed;
    agent.vLatPerStep = (agent.vLatPerStep / speed) * maxSpeed;
  }
  // position 更新（経度ラップ）
  agent.latitudeDeg += agent.vLatPerStep;
  agent.longitudeDeg += agent.vLonPerStep;
  if (agent.longitudeDeg > 180) agent.longitudeDeg -= 360;
  if (agent.longitudeDeg < -180) agent.longitudeDeg += 360;
  // 緯度クランプ（極を超えない）
  if (agent.latitudeDeg > 89) {
    agent.latitudeDeg = 89;
    agent.active = false;
    return;
  }
  if (agent.latitudeDeg < -89) {
    agent.latitudeDeg = -89;
    agent.active = false;
    return;
  }
  // path 追加 + stagnation ring buffer 更新
  agent.pathHistory.push({
    latitudeDeg: agent.latitudeDeg,
    longitudeDeg: agent.longitudeDeg,
  });
  agent.positionRingBuffer.push({ lat: agent.latitudeDeg, lon: agent.longitudeDeg });
  if (agent.positionRingBuffer.length > AGENT_STAGNATION_RING_SIZE) {
    agent.positionRingBuffer.shift();
  }
  // Stagnation 検出: ring buffer の lat / lon 変動量
  if (agent.positionRingBuffer.length >= AGENT_STAGNATION_RING_SIZE) {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const pos of agent.positionRingBuffer) {
      if (pos.lat < minLat) minLat = pos.lat;
      if (pos.lat > maxLat) maxLat = pos.lat;
      if (pos.lon < minLon) minLon = pos.lon;
      if (pos.lon > maxLon) maxLon = pos.lon;
    }
    const variance = Math.max(maxLat - minLat, maxLon - minLon);
    if (variance < AGENT_STAGNATION_THRESHOLD_DEG) {
      agent.active = false;
    }
  }
}

/**
 * 赤道反流 (ECC) 用の agent を 1 本トレースする（[docs/spec/03_海流.md §4.1]、[P4-26]）。
 *
 * 起点: basin の西縁（順行）/ 東縁（逆行）の赤道（lat = 0°）
 * 初速: 東向き（順行）/ 西向き（逆行）の baseSpeed
 * 終了条件: maxSteps 到達、stagnation、陸セル侵入、緯度クランプ
 */
function traceEquatorialCountercurrentAgent(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  rotationSign: 1 | -1,
  field: CollisionField,
  grid: Grid,
  params: AgentTraceParams,
): GeoPoint[] {
  const startLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const initialVLon = rotationSign === 1 ? params.baseSpeedDegPerStep : -params.baseSpeedDegPerStep;
  const agent: OceanAgent = {
    latitudeDeg: 0,
    longitudeDeg: startLon,
    vLatPerStep: 0,
    vLonPerStep: initialVLon,
    active: true,
    pathHistory: [{ latitudeDeg: 0, longitudeDeg: startLon }],
    positionRingBuffer: [{ lat: 0, lon: startLon }],
  };
  for (let step = 0; step < params.maxSteps && agent.active; step++) {
    stepOceanAgent(agent, field, grid, params);
  }
  return agent.pathHistory;
}

/**
 * 緯度（度）から basin を検出するラッパ。grid 範囲外なら空配列。
 */
function findOceanBasinsAtLatitudeDeg(
  grid: Grid,
  latDeg: number,
  minWidthDeg: number,
): Array<{ readonly startLonDeg: number; readonly endLonDeg: number }> {
  const i = Math.round((latDeg + 90) / grid.resolutionDeg - 0.5);
  if (i < 0 || i >= grid.latitudeCount) return [];
  return findOceanBasinsAtLatitudeIndex(grid, i, minWidthDeg);
}

/**
 * 中緯度反転セグメント（横向き、`lat = hemisphereSign × midLatitudeDeg`）を 1 本生成する
 * （[docs/spec/03_海流.md §4.4]）。
 *
 * `generateSubtropicalGyre` が赤道帯 basin から生成する中緯度反転とは別系統で、
 * **中緯度 basin が複数検出された場合の補完描画**として使う（[現状.md §既知の未対応事項]
 * 「中緯度の島嶼があっても streamline は素通り」への P4-22 対応）。
 */
function generateMidLatitudeReversalSegment(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  midLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const midLat = hemisphereSign * midLatitudeDeg;
  const startLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const endLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const path = sampleLongitudes(startLon, endLon, samplesPerEdge).map((lon) => ({
    latitudeDeg: midLat,
    longitudeDeg: lon,
  }));
  // ジャイヤ内側 = 赤道側 = -hemisphereSign 方向の lat 揺らぎ
  const curved = curveSegment(path, 'lat', -hemisphereSign * curvatureDeg);
  if (!grid) return [{ classification: 'neutral', path: curved }];
  return buildSplitStreamlines('neutral', curved, grid);
}

/**
 * 極帯反転セグメント（横向き、`lat = hemisphereSign × polarLatitudeDeg`）を 1 本生成する
 * （[docs/spec/03_海流.md §4.6]）。
 *
 * `generatePolarGyre` が赤道帯 basin から生成する極帯反転とは別系統で、
 * **極帯 basin が複数検出された場合の補完描画**として使う（P4-22 対応）。
 */
function generatePolarReversalSegment(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  polarLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const polarLat = hemisphereSign * polarLatitudeDeg;
  // 極帯反転は polar easterlies 由来。順行: east → west、逆行: west → east
  const easternBoundaryLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const westernBoundaryLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const path = sampleLongitudes(easternBoundaryLon, westernBoundaryLon, samplesPerEdge).map(
    (lon) => ({ latitudeDeg: polarLat, longitudeDeg: lon }),
  );
  const curved = curveSegment(path, 'lat', -hemisphereSign * curvatureDeg);
  if (!grid) return [{ classification: 'neutral', path: curved }];
  return buildSplitStreamlines('neutral', curved, grid);
}

/**
 * 西岸境界流セグメント（縦向き、`lon = westernBoundaryLon`、`eqLat → midLat`）を 1 本生成する
 * （[docs/spec/03_海流.md §4.3]）。
 *
 * `generateSubtropicalGyre` が赤道帯 basin から生成する西岸境界流とは別系統で、
 * **中緯度 basin が複数検出された場合の縦線補完**として使う（P4-23 対応）。分類は warm（暖流）。
 */
function generateWesternBoundarySegment(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  equatorialLatDeg: number,
  midLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const eqLat = hemisphereSign * equatorialLatDeg;
  const midLat = hemisphereSign * midLatitudeDeg;
  const westernBoundaryLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const path: GeoPoint[] = [];
  const latStep = (midLat - eqLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    path.push({ latitudeDeg: eqLat + latStep * k, longitudeDeg: westernBoundaryLon });
  }
  // ジャイヤ内側 = 東側 = +rotationSign の lon 揺らぎ
  const curved = curveSegment(path, 'lon', rotationSign * curvatureDeg);
  if (!grid) return [{ classification: 'warm', path: curved }];
  return buildSplitStreamlines('warm', curved, grid);
}

/**
 * 東岸境界流セグメント（縦向き、`lon = easternBoundaryLon`、`midLat → eqLat`）を 1 本生成する
 * （[docs/spec/03_海流.md §4.5] 東岸再衝突の赤道側分岐）。分類は cold（寒流）。
 */
function generateEasternBoundarySegment(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  equatorialLatDeg: number,
  midLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const eqLat = hemisphereSign * equatorialLatDeg;
  const midLat = hemisphereSign * midLatitudeDeg;
  const easternBoundaryLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const path: GeoPoint[] = [];
  const latStep = (midLat - eqLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    path.push({ latitudeDeg: midLat - latStep * k, longitudeDeg: easternBoundaryLon });
  }
  // ジャイヤ内側 = 西側 = -rotationSign の lon 揺らぎ
  const curved = curveSegment(path, 'lon', -rotationSign * curvatureDeg);
  if (!grid) return [{ classification: 'cold', path: curved }];
  return buildSplitStreamlines('cold', curved, grid);
}

/**
 * 極ジャイヤ東縁極向きセグメント（縦向き、`lon = easternBoundaryLon`、`midLat → polarLat`、warm）。
 * `generatePolarGyre` の補完版（極帯 basin が複数検出された場合）。
 */
function generatePolarPolewardSegment(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  midLatitudeDeg: number,
  polarLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const midLat = hemisphereSign * midLatitudeDeg;
  const polarLat = hemisphereSign * polarLatitudeDeg;
  const easternBoundaryLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const path: GeoPoint[] = [];
  const latStep = (polarLat - midLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    path.push({ latitudeDeg: midLat + latStep * k, longitudeDeg: easternBoundaryLon });
  }
  // ジャイヤ内側 = 西側 = -rotationSign の lon 揺らぎ
  const curved = curveSegment(path, 'lon', -rotationSign * curvatureDeg);
  if (!grid) return [{ classification: 'warm', path: curved }];
  return buildSplitStreamlines('warm', curved, grid);
}

/**
 * 極ジャイヤ西縁赤道向きセグメント（縦向き、`lon = westernBoundaryLon`、`polarLat → midLat`、cold）。
 * `generatePolarGyre` の補完版（極帯 basin が複数検出された場合）。
 */
function generatePolarEquatorwardSegment(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  midLatitudeDeg: number,
  polarLatitudeDeg: number,
  samplesPerEdge: number,
  grid: Grid | null,
  curvatureDeg = 0,
): CurrentStreamline[] {
  const midLat = hemisphereSign * midLatitudeDeg;
  const polarLat = hemisphereSign * polarLatitudeDeg;
  const westernBoundaryLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const path: GeoPoint[] = [];
  const latStep = (midLat - polarLat) / Math.max(1, samplesPerEdge - 1);
  for (let k = 0; k < samplesPerEdge; k++) {
    path.push({ latitudeDeg: polarLat + latStep * k, longitudeDeg: westernBoundaryLon });
  }
  // ジャイヤ内側 = 東側 = +rotationSign の lon 揺らぎ
  const curved = curveSegment(path, 'lon', rotationSign * curvatureDeg);
  if (!grid) return [{ classification: 'cold', path: curved }];
  return buildSplitStreamlines('cold', curved, grid);
}

/**
 * 全海洋盆について「赤道反流 + 亜熱帯ジャイヤ + 極ジャイヤ」を生成する
 * （[§4.1〜§4.6] の最小幾何近似）。
 *
 * 月別差はないため 12 ヶ月で同一の streamline 集合を返す（季節依存は将来 Step 5 気温
 * フィードバック後で対応）。
 */
function buildAllStreamlines(
  grid: Grid,
  rotationSign: 1 | -1,
  basinMinWidthDeg: number,
  equatorialLatDeg: number,
  midLatitudeDeg: number,
  polarLatitudeDeg: number,
  samplesPerEdge: number,
  curvatureDeg = 0,
  deflectionRangeCells = 0,
  maxDeflectionDeg = 0,
  agentTracingEnabled = false,
  agentTraceParams: AgentTraceParams = {
    baseSpeedDegPerStep: 0.6,
    collisionRepulsionStrength: 0.5,
    maxSteps: 200,
  },
): CurrentStreamline[] {
  // 赤道帯（±2°）で盆を検出。grid 解像度に応じて適切な lat index を選ぶ。
  const equatorIndex = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
  const basins = findOceanBasinsAtLatitudeIndex(grid, equatorIndex, basinMinWidthDeg);
  const result: CurrentStreamline[] = [];
  // agent-tracing が有効なら collision field を一度だけ構築して再利用
  const sharedField =
    agentTracingEnabled || (deflectionRangeCells > 0 && maxDeflectionDeg > 0)
      ? buildCollisionField(grid)
      : null;

  for (const basin of basins) {
    if (agentTracingEnabled && sharedField) {
      // 赤道反流: dynamic agent-tracing 版（[P4-26]）
      const path = traceEquatorialCountercurrentAgent(
        basin,
        rotationSign,
        sharedField,
        grid,
        agentTraceParams,
      );
      if (path.length >= 2) {
        result.push(...buildSplitStreamlines('neutral', path, grid));
      }
    } else {
      // 赤道反流（陸地横断点で分断、複数 streamline になり得る）
      result.push(...generateEquatorialCountercurrent(basin, rotationSign, samplesPerEdge, grid, curvatureDeg));
    }
    // 北半球 亜熱帯ジャイヤ + 極ジャイヤ
    result.push(
      ...generateSubtropicalGyre(
        basin,
        1,
        rotationSign,
        equatorialLatDeg,
        midLatitudeDeg,
        samplesPerEdge,
        grid,
        curvatureDeg,
      ),
      ...generatePolarGyre(
        basin,
        1,
        rotationSign,
        midLatitudeDeg,
        polarLatitudeDeg,
        samplesPerEdge,
        grid,
        curvatureDeg,
      ),
    );
    // 南半球 亜熱帯ジャイヤ + 極ジャイヤ
    result.push(
      ...generateSubtropicalGyre(
        basin,
        -1,
        rotationSign,
        equatorialLatDeg,
        midLatitudeDeg,
        samplesPerEdge,
        grid,
        curvatureDeg,
      ),
      ...generatePolarGyre(
        basin,
        -1,
        rotationSign,
        midLatitudeDeg,
        polarLatitudeDeg,
        samplesPerEdge,
        grid,
        curvatureDeg,
      ),
    );
  }

  // 中緯度・極帯で別途 basin を検出し、複数 basin が存在する場合に独立な反転セグメントを補完する
  // （[現状.md §既知の未対応事項] / [docs/spec/03_海流.md §4.4 / §4.6] / P4-22 対応）。
  // 赤道帯と中緯度で大陸配置が異なる（赤道で 1 盆、中緯度で 2 盆など）場合に、
  // 中緯度反転 / 極帯反転を中緯度・極帯 basin それぞれで描画する。
  // 赤道帯と同じ basin 数の場合（length ≤ 1）は既存の generators が描いた線と同等のため省略。
  for (const hemisphereSign of [1, -1] as const) {
    const midLat = hemisphereSign * midLatitudeDeg;
    const polarLat = hemisphereSign * polarLatitudeDeg;
    const midBasins = findOceanBasinsAtLatitudeDeg(grid, midLat, basinMinWidthDeg);
    const polarBasins = findOceanBasinsAtLatitudeDeg(grid, polarLat, basinMinWidthDeg);
    if (midBasins.length > 1) {
      for (const midBasin of midBasins) {
        // 横線（中緯度反転）+ 縦線（西岸/東岸境界流）を中緯度 basin の縁経度で生成
        result.push(
          ...generateMidLatitudeReversalSegment(
            midBasin,
            hemisphereSign,
            rotationSign,
            midLatitudeDeg,
            samplesPerEdge,
            grid,
            curvatureDeg,
          ),
          ...generateWesternBoundarySegment(
            midBasin,
            hemisphereSign,
            rotationSign,
            equatorialLatDeg,
            midLatitudeDeg,
            samplesPerEdge,
            grid,
            curvatureDeg,
          ),
          ...generateEasternBoundarySegment(
            midBasin,
            hemisphereSign,
            rotationSign,
            equatorialLatDeg,
            midLatitudeDeg,
            samplesPerEdge,
            grid,
            curvatureDeg,
          ),
        );
      }
    }
    if (polarBasins.length > 1) {
      for (const polarBasin of polarBasins) {
        // 横線（極帯反転）+ 縦線（極側継続/復帰）を極帯 basin の縁経度で生成
        result.push(
          ...generatePolarReversalSegment(
            polarBasin,
            hemisphereSign,
            rotationSign,
            polarLatitudeDeg,
            samplesPerEdge,
            grid,
            curvatureDeg,
          ),
          ...generatePolarPolewardSegment(
            polarBasin,
            hemisphereSign,
            rotationSign,
            midLatitudeDeg,
            polarLatitudeDeg,
            samplesPerEdge,
            grid,
            curvatureDeg,
          ),
          ...generatePolarEquatorwardSegment(
            polarBasin,
            hemisphereSign,
            rotationSign,
            midLatitudeDeg,
            polarLatitudeDeg,
            samplesPerEdge,
            grid,
            curvatureDeg,
          ),
        );
      }
    }
  }

  // collision-field deflection: 陸地に近いサンプル点を陸地から離れる方向に変位させる
  // （[P4-25]、旧 ExoClim agent-tracing の static 簡易版）。
  // agent-tracing 適用済み path（赤道反流）には deflection を適用しない（既に陸地反発済み）
  // ため、ここで適用する対象を agent-未対応の streamline のみに絞ることもできるが、
  // 簡略化のため deflection は post-pass として全 streamline に適用（path が既に陸を避けて
  // いれば distance > range で no-op になる）。
  if (deflectionRangeCells > 0 && maxDeflectionDeg > 0 && sharedField) {
    return result.map((sl) => ({
      classification: sl.classification,
      path: deflectPathByCollisionField(
        sl.path,
        sharedField,
        grid,
        deflectionRangeCells,
        maxDeflectionDeg,
      ),
    }));
  }

  return result;
}

/**
 * 寒流沿い東岸海氷延長を季節（月）別に生成する（[docs/spec/03_海流.md §4.7]、Worldbuilder's Log #28）。
 *
 * 大陸の **東岸**（極ジャイヤ西縁の cold 復帰流が流れ下る側）で、対応する半球の冬季のみ
 * 海氷を `seaIceColdCurrentExtensionMinLatDeg` まで延長する。
 *
 * 順行惑星: cold 復帰流は basin の **西縁**（startLon）に沿って南下するため、
 * 「西側に陸近く」（westDeg ≤ proximity）の海セルが対象。
 * 逆行惑星: 東西反転により basin の **東縁**（endLon）が cold 側になるため、
 * 「東側に陸近く」（eastDeg ≤ proximity）の海セルが対象（[§4.9]）。
 *
 * 戻り値は base マスクとは別の新規配列。base マスク自体は不変に保つ。
 */
function buildMonthlySeaIceWithExtension(
  baseSeaIce: ReadonlyArray<ReadonlyArray<boolean>>,
  grid: Grid,
  oceanDistances: ReadonlyArray<ReadonlyArray<OceanDistances>>,
  rotationSign: 1 | -1,
  monthIndex: number,
  params: OceanCurrentStepParams,
): boolean[][] {
  const isNHWinter = NH_WINTER_MONTH_INDICES.includes(monthIndex);
  const isSHWinter = SH_WINTER_MONTH_INDICES.includes(monthIndex);
  if (!params.seaIceColdCurrentExtensionEnabled || (!isNHWinter && !isSHWinter)) {
    // 拡張対象月でない → base のコピーを返す（呼び出し元での共有を避ける）
    return baseSeaIce.map((row) => row.slice());
  }

  const minLat = params.seaIceColdCurrentExtensionMinLatDeg;
  const maxLat = params.seaIceLatitudeThresholdDeg;
  const proximity = params.seaIceColdCurrentExtensionCoastalProximityDeg;

  const out: boolean[][] = baseSeaIce.map((row) => row.slice());
  for (let i = 0; i < grid.latitudeCount; i++) {
    const row = grid.cells[i];
    const distRow = oceanDistances[i];
    if (!row || !distRow) continue;
    const lat = row[0]?.latitudeDeg ?? 0;
    const absLat = Math.abs(lat);
    // 延長帯緯度範囲: [minLat, maxLat]（基本海氷帯 |lat| > maxLat とは重複しない）
    if (absLat < minLat || absLat > maxLat) continue;
    // 半球と季節の整合: NH 冬は lat > 0、SH 冬は lat < 0
    if (lat > 0 && !isNHWinter) continue;
    if (lat < 0 && !isSHWinter) continue;

    for (let j = 0; j < grid.longitudeCount; j++) {
      const cell = row[j];
      const dist = distRow[j];
      if (!cell || !dist) continue;
      if (cell.isLand) continue;
      // 大陸東岸 = 順行で westDeg、逆行で eastDeg が小さい側（[§4.9]）
      const coldSideDistDeg = rotationSign === 1 ? dist.westDeg : dist.eastDeg;
      if (!Number.isFinite(coldSideDistDeg)) continue;
      if (coldSideDistDeg <= proximity) {
        out[i]![j] = true;
      }
    }
  }
  return out;
}

/**
 * ENSO ダイポール候補マスクを生成する（[docs/spec/03_海流.md §4.10]）。
 *
 * 条件:
 *   - |lat| <= ensoLatitudeRangeDeg（赤道付近）
 *   - 海セル
 *   - 当該緯度行の盆が「東西を陸地に挟まれた」（= 全周海洋ではない）
 *
 * Pasta は ENSO の動的シミュレーションを行わない方針（Part VIb の "too subtle and infrequent
 * to be worth accounting for in this tutorial"）。本関数は候補海域のみを示すマスクを返す。
 *
 * 動的振動（El Niño / La Niña 交代）の表現は将来の検討事項として現状.md に残し、
 * 本実装では時間に依存しない静的マスクとする。
 */
function buildEnsoDipoleCandidateMask(
  grid: Grid,
  params: OceanCurrentStepParams,
): GridMap<boolean> {
  const rows = grid.latitudeCount;
  const cols = grid.longitudeCount;
  const mask: boolean[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    mask[i] = new Array<boolean>(cols).fill(false);
  }
  if (!params.ensoEnabled) return mask;

  const range = params.ensoLatitudeRangeDeg;
  for (let i = 0; i < rows; i++) {
    const row = grid.cells[i];
    if (!row) continue;
    const lat = row[0]?.latitudeDeg ?? 0;
    if (Math.abs(lat) > range) continue;

    // 当該緯度行で「全周海洋でない」（= どこかに陸がある）こと = 東西を挟む条件
    let hasLand = false;
    for (const cell of row) {
      if (cell.isLand) {
        hasLand = true;
        break;
      }
    }
    if (!hasLand) continue;

    // 海セルに true を立てる（陸セルは false）
    for (let j = 0; j < cols; j++) {
      const cell = row[j];
      if (!cell) continue;
      if (cell.isLand) continue;
      mask[i]![j] = true;
    }
  }
  return mask;
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

  // ストリームライン: 赤道反流 + 北半球/南半球の亜熱帯ジャイヤ + 極ジャイヤを盆ごとに生成
  // （[§4.1〜§4.6]）。月別差はないため 12 ヶ月で同一値を共有する（季節依存は将来 Step 5
  // 気温フィードバック後で対応）。
  const streamlines = buildAllStreamlines(
    grid,
    rotationSign,
    params.streamlineBasinMinWidthDeg,
    params.streamlineEquatorialLatDeg,
    params.streamlineMidLatitudeDeg,
    params.streamlinePolarLatitudeDeg,
    params.streamlineSamplesPerEdge,
    params.streamlineCurvatureDeg,
    params.streamlineDeflectionRangeCells,
    params.streamlineMaxDeflectionDeg,
    params.agentTracingEnabled,
    {
      baseSpeedDegPerStep: params.agentBaseSpeedDegPerStep,
      collisionRepulsionStrength: params.agentCollisionRepulsionStrength,
      maxSteps: params.agentMaxSteps,
    },
  );
  // 衝突点（[§4.5 / §4.6]）。streamline と同じ盆検出ロジックを共有するため、12 ヶ月で同一値。
  const collisions: ReadonlyArray<CollisionPoint> = buildAllCollisionPoints(
    grid,
    rotationSign,
    params.streamlineBasinMinWidthDeg,
    params.streamlineEquatorialLatDeg,
    params.streamlinePolarLatitudeDeg,
  );

  // 月別タプルを構築（同一値繰返し）
  const month12 = <T>(value: T): Months12<T> => [
    value, value, value, value, value, value, value, value, value, value, value, value,
  ];

  // ENSO ダイポール候補マスク（[§4.10]）。「東西を陸地に挟まれた赤道付近の海域」を候補とする。
  const ensoMask: GridMap<boolean> = buildEnsoDipoleCandidateMask(grid, params);

  // 月別海氷マスク: base は同一だが、NH/SH 冬季は寒流沿い東岸延長を加算する（[§4.7]）。
  const seaIceByMonth: GridMap<boolean>[] = new Array(12);
  for (let m = 0; m < 12; m++) {
    seaIceByMonth[m] = buildMonthlySeaIceWithExtension(
      seaIce,
      grid,
      oceanDistances,
      rotationSign,
      m,
      params,
    );
  }
  const monthlySeaIceMask: Months12<GridMap<boolean>> = [
    seaIceByMonth[0]!, seaIceByMonth[1]!, seaIceByMonth[2]!, seaIceByMonth[3]!,
    seaIceByMonth[4]!, seaIceByMonth[5]!, seaIceByMonth[6]!, seaIceByMonth[7]!,
    seaIceByMonth[8]!, seaIceByMonth[9]!, seaIceByMonth[10]!, seaIceByMonth[11]!,
  ];

  // OceanCurrentResult の monthlyCoastalTemperatureCorrectionCelsius は符号で warm/cold/neutral を
  // 表現できる（>0 暖流の昇温、<0 寒流の降温、=0 中立 or 範囲外）。UI レイヤーは
  // {@link classificationFromCorrection} で per-cell 分類を復元できる。
  // 仕様 [docs/spec/03_海流.md §5] の monthlyStreamlines は line tracing で生成済み（§4.1〜§4.6）。

  return {
    monthlyStreamlines: month12(streamlines as ReadonlyArray<CurrentStreamline>),
    monthlySeaIceMask,
    monthlyCoastalTemperatureCorrectionCelsius: month12(coastalCorrection as GridMap<number>),
    monthlyCollisionPoints: month12(collisions),
    ensoDipoleCandidateMask: ensoMask,
  };
}

/**
 * 内部ヘルパの公開（テスト用）。
 * 戻り値のクランプ・分岐の境界を直接検証するためのみ使う（[要件定義書.md §3.2] 決定性の保証）。
 */
export const __internals = {
  findOceanBasinsAtLatitudeIndex,
  findOceanBasinsAtLatitudeDeg,
  generateSubtropicalGyre,
  generatePolarGyre,
  generateEquatorialCountercurrent,
  generateMidLatitudeReversalSegment,
  generatePolarReversalSegment,
  generateWesternBoundarySegment,
  generateEasternBoundarySegment,
  generatePolarPolewardSegment,
  generatePolarEquatorwardSegment,
  buildAllStreamlines,
  buildAllCollisionPoints,
  buildMonthlySeaIceWithExtension,
  buildEnsoDipoleCandidateMask,
  splitPathByLand,
  isLandAtGeoPoint,
  curveSegment,
  computeDistanceToLandField,
  smoothField,
  computeFieldGradient,
  buildCollisionField,
  deflectPathByCollisionField,
  stepOceanAgent,
  traceEquatorialCountercurrentAgent,
  NH_WINTER_MONTH_INDICES,
  SH_WINTER_MONTH_INDICES,
};

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
