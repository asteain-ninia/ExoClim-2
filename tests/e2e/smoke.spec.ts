// Playwright smoke test。dev サーバが立ち上がり、トップページが描画されることだけ確認する。
// 仕様: [開発ガイド.md §3.4] E2E 最小セット。詳細な UI 検証は P4-5a 以降のテストで追加。

import { expect, test } from '@playwright/test';

test('dev サーバのトップページが描画される', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/ExoClim/);
});
