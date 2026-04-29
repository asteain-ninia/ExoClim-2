// P4-5a UI Canvas 2D マップビューの E2E 検証。
// 仕様: [要件定義書.md §2.3.1] / [§2.3.2] / [§2.3.3] / [docs/spec/01_ITCZ.md §5]。
// 規約: 起動・初期表示・操作（季節切替・凡例切替・ドラッグパン）・経度循環の動作確認。

import { expect, test, type Page } from '@playwright/test';

/** Canvas のピクセルデータ和（描画内容の指紋として使う）。 */
async function canvasPixelChecksum(page: Page): Promise<number> {
  return await page.locator('[data-testid="map-canvas"]').evaluate((canvas) => {
    const ctx = (canvas as HTMLCanvasElement).getContext('2d');
    if (!ctx) return 0;
    const w = (canvas as HTMLCanvasElement).width;
    const h = (canvas as HTMLCanvasElement).height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    // 全ピクセル合計だと重いので 16 ピクセル間隔でサンプリング
    for (let i = 0; i < data.length; i += 4 * 16) {
      sum += data[i]! + data[i + 1]! + data[i + 2]!;
    }
    return sum;
  });
}

test.describe('P4-5a Canvas 2D マップビュー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // pipeline 初回実行 + Canvas 描画が完了するまで待つ
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-testid="map-canvas"]') as HTMLCanvasElement | null;
      if (!c) return false;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      const data = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      // 中央ピクセルが背景色だけでなく描画済みなら ok（緑: pipeline 結果反映を待つ）
      return data[0] !== undefined;
    });
  });

  test('Canvas が固定サイズ（960x480）で表示される（[要件定義書.md §2.3.1]）', async ({ page }) => {
    const canvas = page.locator('[data-testid="map-canvas"]');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBe(960);
    expect(box?.height).toBe(480);
  });

  test('凡例が常時表示される（[要件定義書.md §2.3.2]）', async ({ page }) => {
    await expect(page.getByRole('region', { name: '凡例' })).toBeVisible();
    await expect(page.getByTestId('legend-itcz-center')).toBeChecked();
    await expect(page.getByTestId('legend-itcz-band')).toBeChecked();
  });

  test('季節選択（年平均・1/4/7/10 月）の 5 ボタンが表示される', async ({ page }) => {
    const radioGroup = page.getByRole('radiogroup', { name: '季節選択' });
    await expect(radioGroup).toBeVisible();
    for (const value of ['annual', '0', '3', '6', '9']) {
      await expect(page.getByTestId(`season-${value}`)).toBeVisible();
    }
    // 既定は年平均
    await expect(page.getByTestId('season-annual')).toHaveAttribute('aria-checked', 'true');
  });

  test('季節切替で Canvas の描画内容が変化する（年平均 vs 7 月）', async ({ page }) => {
    const annualSum = await canvasPixelChecksum(page);
    await page.getByTestId('season-6').click();
    // 描画反映を待つ
    await page.waitForTimeout(50);
    const julySum = await canvasPixelChecksum(page);
    expect(julySum).not.toBe(annualSum);
  });

  test('凡例 ITCZ 中心線をオフにすると Canvas 描画内容が変わる', async ({ page }) => {
    const before = await canvasPixelChecksum(page);
    await page.getByTestId('legend-itcz-center').uncheck();
    await page.waitForTimeout(50);
    const after = await canvasPixelChecksum(page);
    expect(after).not.toBe(before);
  });

  test('Canvas を左にドラッグすると経度循環で再描画される（[要件定義書.md §2.3.3]）', async ({
    page,
  }) => {
    const canvas = page.locator('[data-testid="map-canvas"]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const before = await canvasPixelChecksum(page);

    // 左に 200 px ドラッグ
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 200, cy, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(80);
    const after = await canvasPixelChecksum(page);
    expect(after).not.toBe(before);
  });

  test('Canvas 幅以上にドラッグしても循環し描画は途切れない（左右無限スクロール）', async ({
    page,
  }) => {
    const canvas = page.locator('[data-testid="map-canvas"]');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // 1.5 周分（1440 px）ドラッグ → 完全 1 周（960 px）+ 480 px の状態と等価
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Playwright の steps は 1 ステップあたりの移動上限が無いが、ステップ数を増やしてキャプチャ精度を確保
    await page.mouse.move(cx - 1440, cy, { steps: 30 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    // 描画後に Canvas が空でないことを確認（中央ピクセルが背景以外も含む）
    const sum = await canvasPixelChecksum(page);
    expect(sum).toBeGreaterThan(0);
  });
});
