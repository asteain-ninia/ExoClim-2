// 地形前処理層。`TerrainSource` から実体地形（陸海・標高マップ）を解決し、Grid に流し込む。
// 仕様:
//   - [要件定義書.md §2.1.4] 地形マップ（プリセット / 手続き生成 / カスタム）
//   - [要件定義書.md §4.1] グリッド・セル属性
//   - [要件定義書.md §4.2] TerrainSource → 実体地形の解決責務
// 規約:
//   - 純粋関数。同 `TerrainSource` + 同 resolutionDeg で同 Grid を返す。
//   - 旧 ExoClim `services/geography.ts` の手続き生成方式（fBm + ridge + 地球統計拘束）を移植。
//   - 出力は `Grid`（[src/domain/grid.ts]）の readonly 構造に整形する。

import {
  EARTH_GLOBAL_LAND_FRACTION,
  ELEVATION_BINS_METERS,
  getEarthStatisticsAt,
} from './earthStatistics';
import {
  createGrid,
  DEFAULT_GRID_RESOLUTION_DEG,
  type Cell,
  type Grid,
  type GridResolutionDeg,
} from './grid';
import { fbmSphere, ridgeSphere } from './noise';
import type { TerrainSource } from './planetParams';

const DEG_TO_RAD = Math.PI / 180;

interface TerrainData {
  readonly isLand: ReadonlyArray<boolean>;
  readonly elevationMeters: ReadonlyArray<number>;
}

/** 全海洋（深さ 0 m）の地形データ。`createGrid` の既定と同じ。 */
function generateAllOceanTerrain(rows: number, cols: number): TerrainData {
  const total = rows * cols;
  return {
    isLand: new Array<boolean>(total).fill(false),
    elevationMeters: new Array<number>(total).fill(0),
  };
}

/**
 * 地球統計拘束付き手続き生成。
 *
 * 手順（旧 ExoClim `generateProceduralMap` の移植）:
 * 1. 球面 fBm で大陸ベース、ridge で山脈、warp 用ノイズで境界を歪ませた raw 高度を全セルで生成。
 * 2. 各緯度帯（行）ごとに raw 高度をソート。
 * 3. その緯度帯における地球の陸地割合（{@link getEarthStatisticsAt}）を実現する数だけ、
 *    最も低い側を海洋セルとし、深さは `seaLevelThreshold − raw` に比例した負値を割り当てる。
 * 4. 残りの陸地セルを 5 標高ビンに、地球の hypsometric 分布に従って割り当てる。
 *
 * 効果: 形状は `seed` で変わるが、緯度別陸地割合と標高ヒストグラムは地球と同等に保たれる
 * （「地球らしさだけ」を保ったランダム惑星）。
 *
 * @param landFractionScale 地球比のスケール（1.0 で地球同等、0 で全海、`landFraction / 0.29` で利用者指定）
 */
function generateEarthStatisticConstrainedTerrain(
  rows: number,
  cols: number,
  seed: number,
  landFractionScale: number,
): TerrainData {
  const total = rows * cols;
  const isLand = new Array<boolean>(total).fill(false);
  const elevationMeters = new Array<number>(total).fill(0);
  const rawHeight = new Float32Array(total);
  const baseSeed = Number.isFinite(seed) ? seed : 0;

  // Step 1: 球面ノイズで raw 高度を生成
  for (let r = 0; r < rows; r++) {
    const latDeg = -90 + (r + 0.5) * (180 / rows);
    const latRad = latDeg * DEG_TO_RAD;
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    for (let c = 0; c < cols; c++) {
      const lonDeg = -180 + (c + 0.5) * (360 / cols);
      const lonRad = lonDeg * DEG_TO_RAD;
      const nx = cosLat * Math.cos(lonRad);
      const ny = sinLat;
      const nz = cosLat * Math.sin(lonRad);
      const continents = fbmSphere(nx, ny, nz, 6, baseSeed + 11);
      const mountains = ridgeSphere(nx, ny, nz, 6, baseSeed + 311);
      const qx = fbmSphere(nx, ny, nz, 2, baseSeed + 911);
      const qy = fbmSphere(ny, nz, nx, 2, baseSeed + 912);
      const warp = fbmSphere(nx + qx, ny + qy, nz, 4, baseSeed + 913);
      rawHeight[r * cols + c] = continents * 0.6 + mountains * 0.3 + warp * 0.1;
    }
  }

  // Step 2-4: 緯度帯ごとにソート → 海陸分離 → ビン配分
  const clampedScale = Math.max(0, landFractionScale);
  for (let r = 0; r < rows; r++) {
    const latDeg = -90 + (r + 0.5) * (180 / rows);
    const stats = getEarthStatisticsAt(latDeg);
    const targetLandFraction = Math.min(1, stats.landFraction * clampedScale);

    const rowIndices: { idx: number; val: number }[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      rowIndices[c] = { idx, val: rawHeight[idx]! };
    }
    rowIndices.sort((a, b) => a.val - b.val);

    const landCount = Math.floor(targetLandFraction * cols);
    const seaCount = cols - landCount;

    // 海洋セル: 深さは raw との差を冪乗で増幅した負値
    const seaLevelThreshold =
      seaCount < cols ? rowIndices[seaCount]!.val : rowIndices[cols - 1]!.val + 0.05;
    for (let i = 0; i < seaCount; i++) {
      const item = rowIndices[i]!;
      isLand[item.idx] = false;
      const d = seaLevelThreshold - item.val;
      const depthDelta = Math.pow(Math.max(0, d) * 4.0, 1.2) * 6000;
      elevationMeters[item.idx] = -10 - depthDelta;
    }

    // 陸地セル: 5 ビンに地球の hypsometric 分布で配分
    if (landCount > 0) {
      let currentBinStartRank = 0;
      for (let b = 0; b < ELEVATION_BINS_METERS.length; b++) {
        const binFracTotal = stats.bins[b]!;
        const binFracOfLand = stats.landFraction > 0.0001 ? binFracTotal / stats.landFraction : 0;
        const countInBin = Math.floor(binFracOfLand * landCount);
        const isLastBin = b === ELEVATION_BINS_METERS.length - 1;
        const actualCount = isLastBin ? landCount - currentBinStartRank : countInBin;
        const { minMeters: hMin, maxMeters: hMax } = ELEVATION_BINS_METERS[b]!;
        for (let k = 0; k < actualCount; k++) {
          const rankInLand = currentBinStartRank + k;
          if (rankInLand >= landCount) break;
          const item = rowIndices[seaCount + rankInLand]!;
          isLand[item.idx] = true;
          const t = k / Math.max(1, actualCount);
          elevationMeters[item.idx] = hMin + t * (hMax - hMin);
        }
        currentBinStartRank += actualCount;
      }
    }
  }

  return { isLand, elevationMeters };
}

/**
 * 理想化大陸（赤道横断・経度中央寄せの単一矩形大陸）の地形データ。
 * 旧 ExoClim `generateVirtualContinentMap` の移植。検証用フィクスチャとして
 * [docs/spec/](../../docs/spec/) の単一矩形大陸ケースに使う。
 */
function generateIdealizedContinentTerrain(rows: number, cols: number): TerrainData {
  const total = rows * cols;
  const isLand = new Array<boolean>(total).fill(false);
  const elevationMeters = new Array<number>(total).fill(-4000);
  const centerCol = Math.floor(cols / 2);

  for (let r = 0; r < rows; r++) {
    const latDeg = -90 + (r + 0.5) * (180 / rows);
    const stats = getEarthStatisticsAt(latDeg);
    const landCount = Math.floor(stats.landFraction * cols);

    const colDistances: { c: number; dist: number }[] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const dist = Math.abs(c - centerCol);
      const distWrapped = Math.min(dist, cols - dist);
      colDistances[c] = { c, dist: distWrapped };
    }
    colDistances.sort((a, b) => a.dist - b.dist);

    for (let k = 0; k < landCount; k++) {
      const idx = r * cols + colDistances[k]!.c;
      isLand[idx] = true;
      elevationMeters[idx] = 0;
    }
  }

  return { isLand, elevationMeters };
}

/**
 * `TerrainSource` から地形データを解決し、`Grid` に流し込む。
 *
 * - `preset` / `presetId === 'earth'`: 地球統計拘束付き手続き生成（seed = 0、scale = 1.0）。
 * - `preset` / `presetId === 'idealized_continent'` または `idealized_continent_2`: 理想化大陸。
 * - `preset` / `presetId === 'no_land'`: 全海洋。
 * - `procedural`: 利用者指定 seed と landFraction で手続き生成。
 *   landFraction は地球比 ({@link EARTH_GLOBAL_LAND_FRACTION}) でスケーリング。
 * - `custom`: 未実装（将来 §2.4.1 マップインポートで実装）。
 *
 * 未知の preset は地球扱いにフォールバックする（[要件定義書.md §3.2] 数値安定性）。
 */
export function buildTerrainGrid(
  source: TerrainSource,
  resolutionDeg: GridResolutionDeg = DEFAULT_GRID_RESOLUTION_DEG,
): Grid {
  const baseGrid = createGrid(resolutionDeg);
  const rows = baseGrid.latitudeCount;
  const cols = baseGrid.longitudeCount;

  let terrain: TerrainData;
  switch (source.kind) {
    case 'preset': {
      switch (source.presetId) {
        case 'earth':
          terrain = generateEarthStatisticConstrainedTerrain(rows, cols, 0, 1.0);
          break;
        case 'idealized_continent':
        case 'idealized_continent_2':
          terrain = generateIdealizedContinentTerrain(rows, cols);
          break;
        case 'no_land':
          terrain = generateAllOceanTerrain(rows, cols);
          break;
        default:
          terrain = generateEarthStatisticConstrainedTerrain(rows, cols, 0, 1.0);
      }
      break;
    }
    case 'procedural': {
      const scale = source.landFraction / EARTH_GLOBAL_LAND_FRACTION;
      terrain = generateEarthStatisticConstrainedTerrain(rows, cols, source.seed, scale);
      break;
    }
    case 'custom':
      throw new Error(
        `Custom terrain (resourceId='${source.resourceId}') is not yet implemented (P4-terrain).`,
      );
  }

  // 地形を Grid セルに流し込む（baseGrid の lat/lon は維持し、isLand / elevationMeters のみ上書き）
  const newCells: Cell[][] = new Array(rows);
  for (let r = 0; r < rows; r++) {
    const row: Cell[] = new Array(cols);
    const baseRow = baseGrid.cells[r]!;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const baseCell = baseRow[c]!;
      row[c] = {
        latitudeDeg: baseCell.latitudeDeg,
        longitudeDeg: baseCell.longitudeDeg,
        elevationMeters: terrain.elevationMeters[idx]!,
        isLand: terrain.isLand[idx]!,
        continentId: baseCell.continentId,
      };
    }
    newCells[r] = row;
  }

  return {
    resolutionDeg: baseGrid.resolutionDeg,
    latitudeCount: rows,
    longitudeCount: cols,
    cells: newCells,
  };
}
