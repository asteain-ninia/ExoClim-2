// P4-12 セル情報パネル（マウスオーバー）の E2E 検証。
// 仕様: [要件定義書.md §2.3.5] デバッグビュー簡易版。
//   MapCanvas の pointermove ハンドラが grid index を解決し、UI store の hoveredCell に
//   反映、CellInspector がそれを購読して詳細表示する。

import { expect, test, type Page } from '@playwright/test';

test.describe('P4-12: セル情報パネル（マウスオーバー）', () => {
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
    // 全 7 Step を pipeline に含めた状態で初回計算が完了するまで待機
    // [開発ガイド.md §6.2.1]
    await page.waitForTimeout(1300);
  });

  test('セル情報パネルが表示され、初期状態は「マウスオーバーで表示」案内', async ({ page }) => {
    await expect(page.getByTestId('cell-inspector')).toBeVisible();
    await expect(page.getByTestId('cell-inspector')).toContainText(
      'マップ上にカーソルを置くと表示されます',
    );
  });

  test('Canvas 上にマウスを動かすとセル情報が表示される', async ({ page }) => {
    const canvas = page.getByTestId('map-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas bounding box not found');
    // Canvas 中央付近（赤道近傍）にマウスを移動
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    // 位置情報（lat/lon）が表示される
    await expect(page.getByTestId('cell-inspector-position')).toBeVisible();
    const positionText = await page.getByTestId('cell-inspector-position').textContent();
    expect(positionText).toMatch(/lat/);
    expect(positionText).toMatch(/lon/);
  });

  async function moveAndGetText(
    page: Page,
    testId: string,
    fractionX: number,
    fractionY: number,
  ): Promise<string> {
    const canvas = page.getByTestId('map-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas bounding box not found');
    await page.mouse.move(box.x + box.width * fractionX, box.y + box.height * fractionY);
    await page.waitForTimeout(200);
    const text = await page.getByTestId(testId).textContent();
    return text ?? '';
  }

  test('赤道付近と極付近で気温が異なる（センサー的な動作確認）', async ({ page }) => {
    // 赤道近傍
    const eqText = await moveAndGetText(page, 'cell-inspector-temperature', 0.3, 0.5);
    // 極近傍（北極側）
    const polarText = await moveAndGetText(page, 'cell-inspector-temperature', 0.3, 0.05);
    // 異なる温度値を取得できる（デバッグビューが座標に追従していることの確認）
    expect(eqText).not.toBe(polarText);
  });

  test('Canvas からマウスが離れるとセル情報が空表示に戻る', async ({ page }) => {
    const canvas = page.getByTestId('map-canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas bounding box not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    // セル情報が表示中である
    await expect(page.getByTestId('cell-inspector-position')).toBeVisible();
    // Canvas から離れる
    await page.mouse.move(box.x + box.width + 100, box.y + box.height + 100);
    await page.waitForTimeout(200);
    // 空表示に戻る
    await expect(page.getByTestId('cell-inspector')).toContainText(
      'マップ上にカーソルを置くと表示されます',
    );
  });

  test('表示トグル（旧凡例）の表題が「表示トグル」になっている', async ({ page }) => {
    await expect(page.getByTestId('legend-panel')).toContainText('表示トグル');
  });
});
