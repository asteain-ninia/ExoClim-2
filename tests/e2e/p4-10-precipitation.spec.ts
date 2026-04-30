// P4-10 Step 6 降水の E2E 検証。
// 仕様: [docs/spec/06_降水.md §4 / §5]。
//
// 注: Step 6 を pipeline に追加したことで初回計算時間が伸びるため、`beforeEach` の
//   待機時間を 1100ms に増やしている（[開発ガイド.md §6.2.1]）。

import { expect, test, type Page } from '@playwright/test';

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

test.describe('P4-10: Step 6 降水', () => {
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
      { timeout: 20_000 },
    );
    // Step 6 を pipeline 追加後、初回パイプライン完了を吸収するため 1100ms 待機
    // [開発ガイド.md §6.2.1] Step 増加時の経験的目安
    await page.waitForTimeout(1100);
  });

  test('Step 6 降水パネル（5 スライダー）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-precipitation')).toBeVisible();
    await expect(page.getByTestId('slider-precipitation-max-wet-extension')).toBeVisible();
    await expect(page.getByTestId('slider-precipitation-rainshadow-relief')).toBeVisible();
    await expect(page.getByTestId('slider-precipitation-high-elevation-dry')).toBeVisible();
    await expect(page.getByTestId('slider-precipitation-windward-min-relief')).toBeVisible();
    await expect(page.getByTestId('slider-precipitation-itcz-half-width')).toBeVisible();
  });

  test('凡例に「降水」トグルが表示され、既定 OFF', async ({ page }) => {
    await expect(page.getByTestId('legend-precipitation')).toBeVisible();
    await expect(page.getByTestId('legend-precipitation')).not.toBeChecked();
  });

  test('降水トグルを ON にすると Canvas 描画が変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-precipitation').check();
    await page.waitForTimeout(400);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('暖流 wet 帯 最大延伸を変更すると Canvas 描画が変わる（再計算が走る）', async ({ page }) => {
    // 降水 overlay を ON にしてから値を変える（変化を観測しやすい）
    await page.getByTestId('legend-precipitation').check();
    await page.waitForTimeout(400);
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-precipitation-max-wet-extension', '500');
    await page.waitForTimeout(1100);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('ITCZ 影響帯半幅を 0 にすると Canvas 描画が変わる（very_wet が消えて wet が減る）', async ({ page }) => {
    await page.getByTestId('legend-precipitation').check();
    await page.waitForTimeout(400);
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-precipitation-itcz-half-width', '0');
    await page.waitForTimeout(1100);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Step 6 降水既定値が表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-precipitation-max-wet-extension')).toHaveValue('2000');
    await expect(page.getByTestId('slider-precipitation-rainshadow-relief')).toHaveValue('2000');
    await expect(page.getByTestId('slider-precipitation-high-elevation-dry')).toHaveValue('4000');
    await expect(page.getByTestId('slider-precipitation-windward-min-relief')).toHaveValue('1000');
    await expect(page.getByTestId('slider-precipitation-itcz-half-width')).toHaveValue('15');
  });
});
