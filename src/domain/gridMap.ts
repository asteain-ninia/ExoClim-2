// 各 Step 結果型で再利用する共通の primitive 型。
// 仕様: [要件定義書.md §4.3] シミュレーション結果の構造は GridMap / Months12 / LongitudeProfile / WindVector 等の primitive を組み合わせる。
// 規約: [技術方針.md §2.1.1] ドメイン層は副作用を持たず計算ロジックを含めない。
// 命名: [開発ガイド.md §2.2.3] 物理量の識別子には単位を含める。

/**
 * 緯度経度規則格子上の量を保持する二次元配列。
 * インデックス順は `map[latIndex][lonIndex]` で、形は {@link Grid.latitudeCount} × {@link Grid.longitudeCount} と一致する。
 * セル中心座標は {@link createGrid} と同じ並び（南→北、西→東）に従う。
 */
export type GridMap<T> = ReadonlyArray<ReadonlyArray<T>>;

/**
 * 経度方向にだけ並ぶ値の配列（長さ = `Grid.longitudeCount`）。
 * ITCZ 中心線のように「緯度方向に 1 値・経度方向に分布」を持つ量で使う。
 */
export type LongitudeProfile<T> = ReadonlyArray<T>;

/**
 * 月別の値（インデックス 0 = 1 月、インデックス 11 = 12 月）を保持する固定長タプル。
 * [要件定義書.md §2.3.1] 季節切替の単位を「12 ヶ月」に固定するため、長さ 12 を型レベルで担保する。
 * 半球反転は値生成側の責務。
 */
export type Months12<T> = readonly [T, T, T, T, T, T, T, T, T, T, T, T];

/**
 * 二次元の地表風ベクトル。
 * [docs/spec/02_風帯.md §5] / [docs/spec/04_気流.md §5] が出力する卓越風・最終地表風で使う。
 */
export interface WindVector {
  /** 東西成分（m/s、東向き正）。 */
  readonly uMps: number;
  /** 南北成分（m/s、北向き正）。 */
  readonly vMps: number;
}

/**
 * 緯度経度の地理座標点。流線・気圧中心・衝突点などの離散位置情報で使う。
 */
export interface GeoPoint {
  /** 緯度（度、南緯を負・北緯を正、範囲 [-90, +90]）。 */
  readonly latitudeDeg: number;
  /** 経度（度、西経を負・東経を正、範囲 [-180, +180)）。 */
  readonly longitudeDeg: number;
}
