// P4-9 Step 5 気温の E2E 検証。
// 仕様: [docs/spec/05_気温.md §4 / §5]。

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

test.describe('P4-9: Step 5 気温', () => {
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
      { timeout: 15_000 },
    );
    await page.waitForTimeout(900);
    await openAllCollapsibleSections(page);
  });

  test('Step 5 気温パネル（6 スライダー）が表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-temperature')).toBeVisible();
    await expect(page.getByTestId('slider-temperature-baseline')).toBeVisible();
    await expect(page.getByTestId('slider-temperature-continentality')).toBeVisible();
    await expect(page.getByTestId('slider-temperature-wind-advection')).toBeVisible();
    await expect(page.getByTestId('slider-temperature-snow-ice-iterations')).toBeVisible();
    await expect(page.getByTestId('slider-temperature-evapotranspiration-coef')).toBeVisible();
    await expect(page.getByTestId('slider-temperature-isotherm-interval')).toBeVisible();
  });

  test('凡例に「等温線」トグルが表示され、既定 ON', async ({ page }) => {
    await expect(page.getByTestId('legend-isotherms')).toBeVisible();
    await expect(page.getByTestId('legend-isotherms')).toBeChecked();
  });

  test('等温線トグルを OFF にすると Canvas 描画が変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-isotherms').uncheck();
    await page.waitForTimeout(300);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('等温線 刻み幅を変えると Canvas 描画が変わる（10 → 5 で線数増加）', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-temperature-isotherm-interval', '5');
    // Step 7 + 海流ストリームライン追加で再計算時間が伸びたため 1300ms に延長（[開発ガイド.md §6.2.1]）
    await page.waitForTimeout(1300);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('凡例に「気温」トグルが表示され、既定 OFF', async ({ page }) => {
    await expect(page.getByTestId('legend-temperature')).toBeVisible();
    await expect(page.getByTestId('legend-temperature')).not.toBeChecked();
  });

  test('気温トグルを ON にすると Canvas 描画が変わる', async ({ page }) => {
    const before = await canvasFingerprint(page);
    await page.getByTestId('legend-temperature').check();
    await page.waitForTimeout(300);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('全球平均気温を上げると Canvas 描画が変わる（再計算が走る）', async ({ page }) => {
    // 気温オーバーレイを ON にしてから値を変える（変化を観測しやすい）
    await page.getByTestId('legend-temperature').check();
    await page.waitForTimeout(300);
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-temperature-baseline', '25');
    await page.waitForTimeout(800);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('Step 5 気温既定値が表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-temperature-baseline')).toHaveValue('15');
    await expect(page.getByTestId('slider-temperature-continentality')).toHaveValue('1');
    await expect(page.getByTestId('slider-temperature-wind-advection')).toHaveValue('0.3');
    await expect(page.getByTestId('slider-temperature-snow-ice-iterations')).toHaveValue('2');
    await expect(page.getByTestId('slider-temperature-evapotranspiration-coef')).toHaveValue('5');
    await expect(page.getByTestId('slider-temperature-isotherm-interval')).toHaveValue('10');
  });
});
