// P4-39 Canvas → PNG エクスポートボタンの E2E 検証。
// 仕様: [現状.md §6 U17]、[src/ui/ExportPngButton.tsx]。

import { expect, test } from '@playwright/test';
import { openAllCollapsibleSections } from './helpers';

test.describe('P4-39: Canvas → PNG エクスポート (U17)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const c = document.querySelector('[data-testid="map-canvas"]') as HTMLCanvasElement | null;
        if (!c) return false;
        const ctx = c.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < data.length; i += 4 * 64) {
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          if (r > 70 && r > g + 25) return true;
        }
        return false;
      },
      { timeout: 10_000 },
    );
    await page.waitForTimeout(900);
    await openAllCollapsibleSections(page);
  });

  test('エクスポートボタンが header に表示される', async ({ page }) => {
    const btn = page.getByTestId('app-export-png-button');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/PNG/);
  });

  test('クリックで PNG ファイル ダウンロードが開始される', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('app-export-png-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^exoclim-\d{8}-\d{6}\.png$/);
  });
});
