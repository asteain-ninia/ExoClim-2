// P4-11 Step 7 気候帯（Köppen-Geiger）の E2E 検証。
// 仕様: [docs/spec/07_気候帯.md §4.1 / §5]。
//
// 注: Step 7 が pipeline に追加されたことで初回計算時間がさらに伸びるため、
//   `beforeEach` の待機時間を 1300ms に増やしている（[開発ガイド.md §6.2.1]）。

import { expect, test, type Page } from '@playwright/test';
import { openAllCollapsibleSections } from './helpers';

async function setRangeValue(page: Page, testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, v);
    } else {
      input.value = v;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function canvasFingerprint(page: Page): Promise<number> {
  return await page.locator('[data-testid="map-canvas"]').evaluate((canvas) => {
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
}

test.describe('P4-11: Step 7 気候帯（Köppen-Geiger）', () => {
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
      { timeout: 25_000 },
    );
    // Step 7 を pipeline 追加後、初回パイプライン完了を吸収するため 1300ms 待機
    // [開発ガイド.md §6.2.1] Step 増加時の経験的目安
    await page.waitForTimeout(1300);
    await openAllCollapsibleSections(page);
  });

  test('Step 7 気候帯パネル（4 スライダー + 2 ボタン）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-climate-zone')).toBeVisible();
    await expect(page.getByTestId('slider-climate-zone-precip-dry')).toBeVisible();
    await expect(page.getByTestId('slider-climate-zone-precip-normal')).toBeVisible();
    await expect(page.getByTestId('slider-climate-zone-precip-wet')).toBeVisible();
    await expect(page.getByTestId('slider-climate-zone-precip-verywet')).toBeVisible();
    await expect(page.getByTestId('climate-zone-criterion-monthly')).toBeVisible();
    await expect(page.getByTestId('climate-zone-criterion-annual')).toBeVisible();
  });

  test('凡例に「気候帯」トグルが表示され、既定 OFF', async ({ page }) => {
    await expect(page.getByTestId('legend-climate-zones')).toBeVisible();
    await expect(page.getByTestId('legend-climate-zones')).not.toBeChecked();
  });

  test('気候帯トグルを ON にすると Canvas 描画が変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-climate-zones').check();
    await page.waitForTimeout(500);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('ラベル『dry』降水量を増やすと Canvas 描画が変わる（B 群が減る）', async ({ page }) => {
    await page.getByTestId('legend-climate-zones').check();
    await page.waitForTimeout(500);
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-climate-zone-precip-dry', '50');
    await page.waitForTimeout(1300);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Hot/Cold 判定を annual に切替えると Canvas 描画が変わる', async ({ page }) => {
    await page.getByTestId('legend-climate-zones').check();
    await page.waitForTimeout(500);
    const before = await canvasFingerprint(page);
    await page.getByTestId('climate-zone-criterion-annual').click();
    await page.waitForTimeout(1300);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Step 7 気候帯既定値が表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-climate-zone-precip-dry')).toHaveValue('10');
    await expect(page.getByTestId('slider-climate-zone-precip-normal')).toHaveValue('60');
    await expect(page.getByTestId('slider-climate-zone-precip-wet')).toHaveValue('120');
    await expect(page.getByTestId('slider-climate-zone-precip-verywet')).toHaveValue('240');
    // 既定の判定方式は 'monthly'（active クラスを持つ）
    const monthlyBtn = page.getByTestId('climate-zone-criterion-monthly');
    await expect(monthlyBtn).toHaveClass(/param-toggle__btn--active/);
  });
});
