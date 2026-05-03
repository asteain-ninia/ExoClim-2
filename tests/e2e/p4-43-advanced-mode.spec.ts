// P4-43 上級モード (U19) の E2E 検証。
// 仕様: [現状.md §6 U19]、[src/ui/AdvancedModeToggle.tsx]、[src/ui/parameters/Slider.tsx]。
// 確認ポイント:
//   - 既定 OFF で `advanced` フラグ付きスライダーが非表示
//   - トグル ON で表示される / OFF に戻すと再び消える
//   - aria-pressed が状態と同期する

import { expect, test } from '@playwright/test';
import { openAllCollapsibleSections } from './helpers';

test.describe('P4-43: 上級モード (U19)', () => {
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

  test('既定で上級モードトグルは OFF（aria-pressed=false）', async ({ page }) => {
    const toggle = page.getByTestId('app-advanced-mode-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('既定 OFF では advanced スライダーが非表示（例: 流線サンプル点数）', async ({ page }) => {
    await expect(page.getByTestId('slider-ocean-streamline-samples-per-edge')).toHaveCount(0);
    await expect(page.getByTestId('slider-ocean-streamline-curvature')).toHaveCount(0);
    await expect(page.getByTestId('slider-ocean-streamline-deflection-range')).toHaveCount(0);
    await expect(page.getByTestId('slider-ocean-agent-base-speed')).toHaveCount(0);
    await expect(page.getByTestId('slider-ocean-enso-lat-range')).toHaveCount(0);
  });

  test('既定 OFF でも基本スライダー（Pasta 経験値系）は表示されている', async ({ page }) => {
    await expect(page.getByTestId('slider-ocean-warm-rise')).toBeVisible();
    await expect(page.getByTestId('slider-ocean-cold-drop')).toBeVisible();
    await expect(page.getByTestId('slider-ocean-sea-ice-lat')).toBeVisible();
    await expect(page.getByTestId('slider-ocean-streamline-equatorial-lat')).toBeVisible();
  });

  test('トグルを ON にすると advanced スライダーが表示される', async ({ page }) => {
    await page.getByTestId('app-advanced-mode-toggle').click();
    await expect(page.getByTestId('app-advanced-mode-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('slider-ocean-streamline-samples-per-edge')).toBeVisible();
    await expect(page.getByTestId('slider-ocean-streamline-curvature')).toBeVisible();
    await expect(page.getByTestId('slider-ocean-agent-base-speed')).toBeVisible();
  });

  test('トグルをもう一度押すと OFF に戻り、advanced スライダーが消える', async ({ page }) => {
    const toggle = page.getByTestId('app-advanced-mode-toggle');
    await toggle.click();
    await expect(page.getByTestId('slider-ocean-streamline-curvature')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('slider-ocean-streamline-curvature')).toHaveCount(0);
  });
});
