// P4-terrain: 地形前処理層の E2E 検証。地球プリセットで陸地ピクセルがマップに描画されることを確認する。
// 仕様: [要件定義書.md §2.1.4] 地形マップ / [§4.2] TerrainSource → 実体地形の解決。

import { expect, test, type Page } from '@playwright/test';
import { openAllCollapsibleSections } from './helpers';

/** 地形ビットマップから陸地相当のピクセル数を概算する。 */
async function countLandLikePixels(page: Page): Promise<number> {
  return await page.locator('[data-testid="map-canvas"]').evaluate((canvas) => {
    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    if (!ctx) return 0;
    const w = (canvas as HTMLCanvasElement).width;
    const h = (canvas as HTMLCanvasElement).height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let landCount = 0;
    // cellColor() の land バリアントは G チャネルが概ね 0x55〜0xb0、R が 0x40〜0xb0 を取る。
    // 一方 ocean は R が 0x08〜0x1a と低い。R が 0x35 以上なら陸地相当と判定。
    for (let i = 0; i < data.length; i += 4 * 8) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      if (r >= 0x35 && g >= 0x35 && r <= 0xc0) landCount++;
    }
    return landCount;
  });
}

test.describe('P4-terrain: 地球プリセットで陸地が描画される', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 地形ビットマップ生成 + ITCZ 描画完了を待つ
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-testid="map-canvas"]') as HTMLCanvasElement | null;
      if (!c) return false;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      // 中央 1px が描画されていることを確認
      const px = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return (px[0] ?? 0) > 0 || (px[1] ?? 0) > 0 || (px[2] ?? 0) > 0;
    });
    // useMemo の terrain ビットマップ生成は同期的だが、初回 pipeline 実行の Promise 解決を待つため少し余裕
    await page.waitForTimeout(150);
    await openAllCollapsibleSections(page);
  });

  test('Canvas に陸地相当のピクセルが多数描画される（>1000）', async ({ page }) => {
    const landPixels = await countLandLikePixels(page);
    expect(landPixels).toBeGreaterThan(1000);
  });

  test('地形を含む Canvas は全海洋の Canvas と異なる描画になる（指紋差）', async ({ page }) => {
    // 地球プリセットで既に描画済みなので、その指紋を取る
    const earthFingerprint = await page.locator('[data-testid="map-canvas"]').evaluate((canvas) => {
      const ctx = (canvas as HTMLCanvasElement).getContext('2d');
      if (!ctx) return 0;
      const w = (canvas as HTMLCanvasElement).width;
      const h = (canvas as HTMLCanvasElement).height;
      const data = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 4 * 16) {
        sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
      }
      return sum;
    });

    // 単純な海色 (#0e2233 = 14, 34, 51) のみだった場合の理論上限
    // 1 ピクセルの RGB sum ≈ 99、1260×630 ÷ 16 サンプル ≈ 49613 → 全海ベース ≈ 4,911,687
    // 地球地形が乗ると land ピクセルで R+G+B が増えるので fingerprint > 全海ベース
    expect(earthFingerprint).toBeGreaterThan(4_911_687);
  });
});
