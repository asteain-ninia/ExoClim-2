// ドメイン層エントリポイント。
// 型定義・物理定数・地形データの読み込みを集約する（[技術方針.md §2.1.1]）。

export type { Cell, Grid, GridResolutionDeg } from './grid';
export { DEFAULT_GRID_RESOLUTION_DEG, createGrid } from './grid';
