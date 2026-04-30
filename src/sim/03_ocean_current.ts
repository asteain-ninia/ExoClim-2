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
  /** 各エッジ（赤道流・西岸・中緯度・東岸）のサンプル点数。多いほど線が滑らか。 */
  readonly streamlineSamplesPerEdge: number;
}

export const DEFAULT_OCEAN_CURRENT_STEP_PARAMS: OceanCurrentStepParams = {
  warmCurrentMaxRiseCelsius: 15,
  coldCurrentMaxDropCelsius: 10,
  coastalInfluenceRangeDeg: 10,
  seaIceLatitudeThresholdDeg: 70,
  basinCenterNeutralWidthDeg: 5,
  streamlineBasinMinWidthDeg: 30,
  streamlineEquatorialLatDeg: 7,
  streamlineMidLatitudeDeg: 32,
  streamlineSamplesPerEdge: 20,
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

/** ある盆の閉じた亜熱帯ジャイヤを 4 つの分類済みストリームラインとして返す（[docs/spec/03_海流.md §4.1〜§4.5]）。 */
function generateSubtropicalGyre(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  hemisphereSign: 1 | -1,
  rotationSign: 1 | -1,
  equatorialLatDeg: number,
  midLatitudeDeg: number,
  samplesPerEdge: number,
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

  return [
    { classification: 'neutral', path: equatorialPath },          // 赤道流（暖→冷遷移）
    { classification: 'warm', path: westernBoundaryPath },        // 西岸境界流（暖流）
    { classification: 'neutral', path: midLatitudePath },         // 中緯度東向き
    { classification: 'cold', path: easternBoundaryPath },        // 東岸境界流（寒流）
  ];
}

/** 赤道反流（東向き）を生成する（[docs/spec/03_海流.md §4.1]）。 */
function generateEquatorialCountercurrent(
  basin: { readonly startLonDeg: number; readonly endLonDeg: number },
  rotationSign: 1 | -1,
  samples: number,
): CurrentStreamline {
  // 順行: 赤道反流は東向き。逆行では西向き（コリオリ符号反転による、§4.9）
  const startLon = rotationSign === 1 ? basin.startLonDeg : basin.endLonDeg;
  const endLon = rotationSign === 1 ? basin.endLonDeg : basin.startLonDeg;
  const path: GeoPoint[] = sampleLongitudes(startLon, endLon, samples).map((lon) => ({
    latitudeDeg: 0,
    longitudeDeg: lon,
  }));
  return { classification: 'neutral', path };
}

/**
 * 全海洋盆について「亜熱帯ジャイヤ + 赤道反流」を生成する（[§4.1〜§4.5] の最小幾何近似）。
 *
 * §4.6 極域反転は最小実装ではスキップ（極ジャイヤは実装範囲外として現状.md に記録）。
 * 月別差はないため 12 ヶ月で同一の streamline 集合を返す（季節依存は将来 Step 5 気温
 * フィードバック後で対応）。
 */
function buildAllStreamlines(
  grid: Grid,
  rotationSign: 1 | -1,
  basinMinWidthDeg: number,
  equatorialLatDeg: number,
  midLatitudeDeg: number,
  samplesPerEdge: number,
): CurrentStreamline[] {
  // 赤道帯（±2°）で盆を検出。grid 解像度に応じて適切な lat index を選ぶ。
  const equatorIndex = Math.round((0 + 90) / grid.resolutionDeg - 0.5);
  const basins = findOceanBasinsAtLatitudeIndex(grid, equatorIndex, basinMinWidthDeg);
  const result: CurrentStreamline[] = [];
  for (const basin of basins) {
    // 赤道反流
    result.push(generateEquatorialCountercurrent(basin, rotationSign, samplesPerEdge));
    // 北半球亜熱帯ジャイヤ
    result.push(
      ...generateSubtropicalGyre(
        basin,
        1,
        rotationSign,
        equatorialLatDeg,
        midLatitudeDeg,
        samplesPerEdge,
      ),
    );
    // 南半球亜熱帯ジャイヤ
    result.push(
      ...generateSubtropicalGyre(
        basin,
        -1,
        rotationSign,
        equatorialLatDeg,
        midLatitudeDeg,
        samplesPerEdge,
      ),
    );
  }
  return result;
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

  // ストリームライン: 赤道反流 + 北半球/南半球の亜熱帯ジャイヤを盆ごとに生成（[§4.1〜§4.5]）。
  // §4.6 極域反転（≈ 80° 緯度の極東風による西向き反転）は最小実装ではスキップ。
  // 月別差はないため 12 ヶ月で同一値を共有する（季節依存は将来 Step 5 気温フィードバック後で対応）。
  const streamlines = buildAllStreamlines(
    grid,
    rotationSign,
    params.streamlineBasinMinWidthDeg,
    params.streamlineEquatorialLatDeg,
    params.streamlineMidLatitudeDeg,
    params.streamlineSamplesPerEdge,
  );
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
    monthlyStreamlines: month12(streamlines as ReadonlyArray<CurrentStreamline>),
    monthlySeaIceMask: month12(seaIce as GridMap<boolean>),
    monthlyCoastalTemperatureCorrectionCelsius: month12(coastalCorrection as GridMap<number>),
    monthlyCollisionPoints: month12(emptyCollisions),
    ensoDipoleCandidateMask: ensoMask,
  };
}

/**
 * 内部ヘルパの公開（テスト用）。
 * 戻り値のクランプ・分岐の境界を直接検証するためのみ使う（[要件定義書.md §3.2] 決定性の保証）。
 */
export const __internals = {
  findOceanBasinsAtLatitudeIndex,
  generateSubtropicalGyre,
  generateEquatorialCountercurrent,
  buildAllStreamlines,
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
