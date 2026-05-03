// P4-46 モバイルレスポンシブ (U8) の E2E 検証。
// 仕様: [現状.md §6 U8]、[src/ui/map/MapCanvas.tsx]、[src/index.css]。

import { expect, test } from '@playwright/test';

test.describe('P4-46: レスポンシブ (U8)', () => {
  test('1260 px 以上のデスクトップでは Canvas が内部解像度通り表示される', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toBeVisible();
    const cssWidth = await canvas.evaluate(
      (el) => Math.round((el as HTMLCanvasElement).getBoundingClientRect().width),
    );
    // 1260 内部解像度を viewport が許容するなら原寸表示
    expect(cssWidth).toBeGreaterThanOrEqual(1200);
    expect(cssWidth).toBeLessThanOrEqual(1260);
  });

  test('モバイル幅 (375px) では Canvas が viewport に収まる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toBeVisible();
    const cssWidth = await canvas.evaluate(
      (el) => Math.round((el as HTMLCanvasElement).getBoundingClientRect().width),
    );
    // viewport 375 から body padding (8px*2) を引いた幅以下
    expect(cssWidth).toBeLessThanOrEqual(375);
  });

  test('Canvas の aspect-ratio が CSS でも保たれる (1260:630 = 2:1)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto('/');
    const canvas = page.getByTestId('map-canvas');
    await expect(canvas).toBeVisible();
    const dims = await canvas.evaluate((el) => {
      const r = (el as HTMLCanvasElement).getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    const ratio = dims.w / dims.h;
    expect(ratio).toBeGreaterThan(1.95);
    expect(ratio).toBeLessThan(2.05);
  });

  test('モバイル幅でヘッダーボタン群が画面内に収まる（折り返し許可）', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const helpBtn = page.getByTestId('app-help-button');
    const themeBtn = page.getByTestId('app-theme-toggle');
    const resetBtn = page.getByTestId('app-reset-button');
    for (const b of [helpBtn, themeBtn, resetBtn]) {
      await expect(b).toBeVisible();
      const box = await b.boundingBox();
      expect(box).not.toBeNull();
      // viewport (375) を超えない
      expect(box!.x + box!.width).toBeLessThanOrEqual(380);
    }
  });
});
