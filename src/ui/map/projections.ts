// Equirectangular（正距円筒図法）投影ユーティリティ。
// 仕様: [要件定義書.md §2.3.1] マップ表示 / [§2.3.3] ズーム・パン（経度循環）。
// 規約: 純粋関数として実装し、Canvas 描画から呼び出す。
// 命名: 物理量・座標は単位を含む（[開発ガイド.md §2.2.3]）。

/** Canvas のピクセル寸法。 */
export interface CanvasViewport {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * 正距円筒図法による緯度経度 → Canvas 座標（pan offset 適用済み）。
 * 戻り値の x は modulo を **適用しない**（unwrapped）。経度循環の描画は
 * 呼び出し側が複数の drawOffset で重ね描きすることで実現する。
 *
 * - 経度: -180° → x = 0、+180° → x = widthPx
 * - 緯度: +90° → y = 0（Canvas 上端、北）、-90° → y = heightPx（下端、南）
 */
export function projectRaw(
  latitudeDeg: number,
  longitudeDeg: number,
  viewport: CanvasViewport,
  panOffsetPx: number,
): { readonly x: number; readonly y: number } {
  const x = ((longitudeDeg + 180) / 360) * viewport.widthPx + panOffsetPx;
  const y = viewport.heightPx * (1 - (latitudeDeg + 90) / 180);
  return { x, y };
}

/**
 * pan オフセットを `[0, widthPx)` の範囲に正規化する（経度循環の自然な等価変換）。
 * 利用者の累積ドラッグ量は無限に大きく/小さくなりうるが、循環性により可視結果は
 * 正規化値だけで決まる。Canvas 描画時にこの値を起点とし、
 * `[norm, norm - widthPx]` の 2 オフセットで描き重ねれば全幅をカバーできる。
 */
export function normalizePanOffsetPx(panOffsetPx: number, viewport: CanvasViewport): number {
  const w = viewport.widthPx;
  return ((panOffsetPx % w) + w) % w;
}

/**
 * Canvas 座標から緯度経度への逆変換（picking 用途）。
 * 経度は循環性を考慮して `[-180, +180)` の範囲に正規化する。
 */
export function unprojectRaw(
  xCanvasPx: number,
  yCanvasPx: number,
  viewport: CanvasViewport,
  panOffsetPx: number,
): { readonly latitudeDeg: number; readonly longitudeDeg: number } {
  const xLocal = xCanvasPx - panOffsetPx;
  const lonRaw = (xLocal / viewport.widthPx) * 360 - 180;
  const longitudeDeg = ((((lonRaw + 180) % 360) + 360) % 360) - 180;
  const latitudeDeg = 90 - (yCanvasPx / viewport.heightPx) * 180;
  return { latitudeDeg, longitudeDeg };
}
