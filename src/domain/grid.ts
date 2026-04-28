// 惑星表面の緯度経度規則格子と単一セルの型定義、ならびに既定生成器。
// 仕様: [要件定義書.md §4.1] グリッド・セル
//   - 解像度: 0.5° / 1° / 2° の三段階。既定 1°（180×360）。
//   - セル属性: 緯度・経度・標高・陸海フラグ・大陸所属識別子（Cell 型として固定）。
// 規約: [技術方針.md §2.1.1] ドメイン層は副作用を持たず計算ロジックを含めない。
// 命名: [開発ガイド.md §2.2.3] 物理量の識別子には単位を含める。

/**
 * グリッド解像度（度）。
 * 三段階に固定する（要件定義書 §4.1）。
 */
export type GridResolutionDeg = 0.5 | 1 | 2;

/** 既定解像度（要件定義書 §4.1）。 */
export const DEFAULT_GRID_RESOLUTION_DEG: GridResolutionDeg = 1;

/**
 * 緯度経度格子の単一セル。
 * 中心点の緯度・経度を持ち、地形に由来する量（標高・陸海・大陸所属）を併せ持つ。
 * 海洋深度・大陸棚距離はここに持たない（要件定義書 §4.1）。
 */
export interface Cell {
  /** セル中心緯度（度、南緯を負・北緯を正、範囲 [-90, +90]）。 */
  readonly latitudeDeg: number;
  /** セル中心経度（度、西経を負・東経を正、範囲 [-180, +180)）。 */
  readonly longitudeDeg: number;
  /** 標高（メートル、海洋セルでは 0、海面下を負）。 */
  readonly elevationMeters: number;
  /** 陸地なら true、海洋なら false。 */
  readonly isLand: boolean;
  /** 所属する大陸の識別子。海洋セルでは null。 */
  readonly continentId: string | null;
}

/**
 * 緯度経度規則格子。
 * cells は南→北、西→東の順に並ぶ二次元配列で、cells[lat][lon] の形を取る。
 */
export interface Grid {
  /** グリッド解像度（度）。 */
  readonly resolutionDeg: GridResolutionDeg;
  /** 緯度方向のセル数（= 180 / resolutionDeg）。 */
  readonly latitudeCount: number;
  /** 経度方向のセル数（= 360 / resolutionDeg）。 */
  readonly longitudeCount: number;
  /** 全セル。cells[i][j] が緯度インデックス i・経度インデックス j のセルを指す。 */
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>;
}

/**
 * 指定解像度で空（地形なし）のグリッドを生成する。
 * 生成されるセルは「全海洋・標高 0・大陸所属 null」で初期化される。
 * 地形ソースの適用は後段レイヤーの責務（要件定義書 §2.1.4 / §4.2 TerrainSource）。
 *
 * 緯度・経度の中心点は決定論的に計算される（同入力 → 同出力、要件定義書 §3.2）。
 *
 * @param resolutionDeg 解像度（度）。既定値は {@link DEFAULT_GRID_RESOLUTION_DEG}。
 * @returns 空のグリッド。
 */
export function createGrid(resolutionDeg: GridResolutionDeg = DEFAULT_GRID_RESOLUTION_DEG): Grid {
  const latitudeCount = 180 / resolutionDeg;
  const longitudeCount = 360 / resolutionDeg;

  const cells: Cell[][] = new Array(latitudeCount);
  for (let i = 0; i < latitudeCount; i++) {
    const latitudeDeg = -90 + (i + 0.5) * resolutionDeg;
    const row: Cell[] = new Array(longitudeCount);
    for (let j = 0; j < longitudeCount; j++) {
      const longitudeDeg = -180 + (j + 0.5) * resolutionDeg;
      row[j] = {
        latitudeDeg,
        longitudeDeg,
        elevationMeters: 0,
        isLand: false,
        continentId: null,
      };
    }
    cells[i] = row;
  }

  return {
    resolutionDeg,
    latitudeCount,
    longitudeCount,
    cells,
  };
}
