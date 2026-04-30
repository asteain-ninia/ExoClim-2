// UI 層 マップ表示 サブモジュール。
// [要件定義書.md §2.3.1] / [§2.3.2] / [§2.3.3] を実装する。

export { CANVAS_HEIGHT_PX, CANVAS_WIDTH_PX, MapCanvas } from './MapCanvas';
export { CellInspector } from './CellInspector';
export { Legend } from './Legend';
export { SeasonSelector } from './SeasonSelector';
export type { CanvasViewport } from './projections';
export {
  normalizePanOffsetPx,
  projectRaw,
  unprojectRaw,
} from './projections';
