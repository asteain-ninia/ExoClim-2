// P4-5b パラメータ調整 UI（OrbitalParams + PlanetBodyParams）の E2E 検証。
// 仕様: [要件定義書.md §2.3.6] パラメータ調整 UI / [§2.1.1] 主星と軌道 / [§2.1.2] 惑星本体。

import { expect, test, type Page } from '@playwright/test';

/**
 * range input の値を React 互換に設定する。
 * `Locator.fill` は range input で「Malformed value」エラーになるため、native setter 経由で
 * value を設定し input イベントを bubbles で発火する（React の onChange が反応する経路）。
 */
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

/** Canvas 全体のピクセル指紋（描画変化検出用）。 */
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

test.describe('P4-5b: パラメータ調整 UI（OrbitalParams + PlanetBodyParams）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => {
      const c = document.querySelector('[data-testid="map-canvas"]') as HTMLCanvasElement | null;
      if (!c) return false;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      const px = ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data;
      return (px[0] ?? 0) > 0 || (px[1] ?? 0) > 0 || (px[2] ?? 0) > 0;
    });
    await page.waitForTimeout(150);
  });

  test('OrbitalParams 5 スライダーがすべて表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-orbital')).toBeVisible();
    await expect(page.getByTestId('slider-orbital-luminosity')).toBeVisible();
    await expect(page.getByTestId('slider-orbital-semimajor')).toBeVisible();
    await expect(page.getByTestId('slider-orbital-period')).toBeVisible();
    await expect(page.getByTestId('slider-orbital-eccentricity')).toBeVisible();
    await expect(page.getByTestId('slider-orbital-perihelion')).toBeVisible();
  });

  test('PlanetBodyParams 4 スライダー + 自転方向トグルが表示される', async ({ page }) => {
    await expect(page.getByTestId('param-group-body')).toBeVisible();
    await expect(page.getByTestId('slider-body-radius')).toBeVisible();
    await expect(page.getByTestId('slider-body-rotation-period')).toBeVisible();
    await expect(page.getByTestId('slider-body-axial-tilt')).toBeVisible();
    await expect(page.getByTestId('slider-body-gravity')).toBeVisible();
    await expect(page.getByTestId('body-rotation-prograde')).toBeVisible();
    await expect(page.getByTestId('body-rotation-retrograde')).toBeVisible();
  });

  test('既定値（地球プリセット）が初期表示される', async ({ page }) => {
    await expect(page.getByTestId('slider-orbital-luminosity')).toHaveValue('1');
    await expect(page.getByTestId('slider-orbital-semimajor')).toHaveValue('1');
    await expect(page.getByTestId('slider-orbital-eccentricity')).toHaveValue('0.017');
    await expect(page.getByTestId('slider-body-axial-tilt')).toHaveValue('23.5');
    await expect(page.getByTestId('body-rotation-prograde')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('地軸傾斜スライダーを動かすと Canvas 描画が変わる（ITCZ への直接効果、7 月で観測）', async ({
    page,
  }) => {
    // 年平均は対称性で軸傾斜変更にほぼ影響を受けないため、7 月に切替えて差分を観測する。
    await page.getByTestId('season-6').click();
    await page.waitForTimeout(100);
    const before = await canvasFingerprint(page);
    // 23.5° → 60° に変えると δ(m=6) ≈ +22.65° から +58° に拡大、ITCZ が大きく北上する
    await setRangeValue(page, 'slider-body-axial-tilt', '60');
    await page.waitForTimeout(150);
    const after = await canvasFingerprint(page);
    expect(after).not.toBe(before);
  });

  test('離心率スライダーを動かしても Canvas は変わらない（円軌道近似のため）', async ({
    page,
  }) => {
    const before = await canvasFingerprint(page);
    await setRangeValue(page, 'slider-orbital-eccentricity', '0.3');
    await page.waitForTimeout(150);
    const after = await canvasFingerprint(page);
    // [docs/spec/01_ITCZ.md §7.2] 離心率による南北非対称は本最小実装では未対応。
    // クラッシュなく描画が維持されることを確認（描画指紋は変化しない、または許容差以内）。
    expect(after).toBe(before);
  });

  test('地軸傾斜を変更後にリセットボタンで地球プリセット (23.5°) に戻る', async ({ page }) => {
    await setRangeValue(page, 'slider-body-axial-tilt', '60');
    await page.waitForTimeout(50);
    await page.getByTestId('slider-body-axial-tilt-reset').click();
    await expect(page.getByTestId('slider-body-axial-tilt')).toHaveValue('23.5');
  });

  test('自転方向トグル（順行 ↔ 逆行）が機能する', async ({ page }) => {
    await page.getByTestId('body-rotation-retrograde').click();
    await expect(page.getByTestId('body-rotation-retrograde')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('body-rotation-prograde')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.getByTestId('body-rotation-prograde').click();
    await expect(page.getByTestId('body-rotation-prograde')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('スライダーの現在値表示が更新される', async ({ page }) => {
    const valueDisplay = page
      .getByTestId('param-group-orbital')
      .locator('label[for="orbital-eccentricity"] .slider__value');
    await expect(valueDisplay).toContainText('0.017');
    await setRangeValue(page, 'slider-orbital-eccentricity', '0.250');
    await expect(valueDisplay).toContainText('0.250');
  });
});
