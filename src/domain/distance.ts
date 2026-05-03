// 距離ユーティリティ（[現状.md ユーザ FB 2026-05-04, P4-73]）。
//
// Pasta 各章で「2000 km from coast」「数百 km」等が頻出するが、現状の
// シミュレータは度ベース or セル数ベースで記述しており、緯度や grid 解像度
// 依存の係数になりがち。本モジュールは km ベースのパラメータを記述可能に
// するための薄いラッパで、緯度別 lon-km 補正を含む。
//
// 規約:
//   - 純粋関数。グローバル状態を持たない。
//   - 球面三角法ではなく等距円柱法（簡略化）。Pasta シミュレータレベルでは十分。

const DEG_TO_RAD = Math.PI / 180;

/** 地球半径 km（Pasta 既定値）。 */
export const EARTH_RADIUS_KM = 6371;

/**
 * 1° 緯度 ≈ 111.32 km（地球周長 40075 km / 360°）。緯度方向は緯度に
 * よらず一定（球面三角法ではなく等距近似）。
 */
export const KM_PER_DEG_LAT = 111.32;

/** 緯度方向 deg → km. */
export function degLatToKm(latDeg: number): number {
  return latDeg * KM_PER_DEG_LAT;
}

/**
 * 経度方向 deg → km。緯度に応じて cos 補正（等距円柱法）。
 *
 * @param lonDeg  経度差（度）
 * @param atLatitudeDeg  どの緯度線上での距離換算か（赤道 0、極 ±90）
 */
export function degLonToKm(lonDeg: number, atLatitudeDeg: number): number {
  return lonDeg * KM_PER_DEG_LAT * Math.cos(atLatitudeDeg * DEG_TO_RAD);
}

/**
 * km → 緯度方向セル数（resolution_deg 単位の grid 上）。
 * 緯度方向は緯度依存なし。
 */
export function kmToLatCells(km: number, resolutionDeg: number): number {
  return km / (resolutionDeg * KM_PER_DEG_LAT);
}

/**
 * km → 経度方向セル数。緯度依存（cos 補正）。極で発散するため最大 cap あり。
 */
export function kmToLonCells(
  km: number,
  resolutionDeg: number,
  atLatitudeDeg: number,
  maxCellsCap = 200,
): number {
  const cosLat = Math.cos(atLatitudeDeg * DEG_TO_RAD);
  if (cosLat < 1e-3) return maxCellsCap; // 極近傍は cap
  const cells = km / (resolutionDeg * KM_PER_DEG_LAT * cosLat);
  return Math.min(cells, maxCellsCap);
}

/**
 * km → Chebyshev 距離セル数の概算（lat/lon の平均的な目安）。
 * 緯度別 lat と lon の平均（実装は min を採用 = より遠くを表現する側、
 * 安全寄り）。propagation の最大半径計算に使う。
 */
export function kmToChebCells(
  km: number,
  resolutionDeg: number,
  atLatitudeDeg: number,
): number {
  const latCells = kmToLatCells(km, resolutionDeg);
  const lonCells = kmToLonCells(km, resolutionDeg, atLatitudeDeg);
  // 等距方向の混合: 平均寄りだが lon は 1° 以上大きくなりがちなので max に
  return Math.max(latCells, lonCells);
}

/**
 * 2 セル間の Chebyshev 距離（di, dj、解像度 res 度）を km に変換。
 *
 * 厳密な球面距離ではなく等距円柱近似。緯度方向距離 = di × res × KM_PER_DEG_LAT
 * 経度方向距離 = dj × res × KM_PER_DEG_LAT × cos(lat)
 * Chebyshev 距離 km = max(latKm, lonKm)
 */
export function cellsToKm(
  di: number,
  dj: number,
  resolutionDeg: number,
  atLatitudeDeg: number,
): number {
  const latKm = Math.abs(di) * resolutionDeg * KM_PER_DEG_LAT;
  const lonKm = Math.abs(dj) * resolutionDeg * KM_PER_DEG_LAT *
    Math.cos(atLatitudeDeg * DEG_TO_RAD);
  return Math.max(latKm, lonKm);
}
