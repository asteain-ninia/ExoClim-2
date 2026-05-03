# 気候帯バグ調査メモ（P4-46 サイクル, 2026-05-03）

ユーザ指摘: アプリの Step 7 出力が
1. **東西対称性が崩れない**（同緯度の東岸/西岸が同じ気候）
2. **赤道直下〜南北 25° が C 群に支配される**

「お手本」（[geographico_climate.png](geographico_climate.png)）と現状アプリ
出力の差分を、Step 7 (`src/sim/07_climate_zone.ts`) と上流 Step 5/6 を読んで
切り分けた結果を残す。**修正は次サイクル以降**で実施する。

## 結論サマリ

| 症状 | 根本原因の所在 |
|---|---|
| 東西対称性が崩れない | **上流（Step 5 気温 / Step 6 降水）** |
| 赤道帯が C 群支配 | **Step 7 のしきい値（特に line 412）** + 上流 Step 5 の winterMin |

## バグ 1: 東西対称性が崩れない

### Step 7 自体は無罪

- `classifyCell()` は per-cell の温度・降水を読み込む（[src/sim/07_climate_zone.ts:178-181]）
- 緯度のみで判定する箇所は存在しない（lat 直接参照なし、winterMin/summerMax/annualPrecipMm のみ）
- → 入力 T/P が同緯度東西で同じなら、出力も同じになる（**当然の帰結**）

### 真の犯人は Step 5/6

- アプリ画面でユーザが見た「左右対称」は、Step 5 (気温) と Step 6 (降水) が
  同緯度の東岸/西岸を同じ温度・降水にしている可能性が高い
- 確認すべき箇所:
    - **Step 5**: `coastalCorrectionCelsius` (海岸補正) は東岸/西岸を区別しているか？
      [src/sim/05_temperature.ts] の `applyCoastalCorrection` を要レビュー
    - **Step 6**: 暖流海岸湿潤帯マスクは東岸寄りに偏っているか？
      [src/sim/06_precipitation.ts] の `warmCurrentHumidBeltMask` 計算を要レビュー
    - **Step 3 海流**: 暖流/寒流が東岸/西岸で正しく振り分けられているか？
      [src/sim/03_ocean_current.ts] の per-cell 暖寒分類を要レビュー

## バグ 2: 赤道帯が C 群支配

### Step 7 のしきい値問題（[src/sim/07_climate_zone.ts:412]）

```typescript
} else if (agg.winterMinCelsius < D_C_WINTER_BOUNDARY_CELSIUS) {
  code = classifyContinental(agg);
} else if (agg.winterMinCelsius < TROPICAL_WINTER_MIN_THRESHOLD_CELSIUS) {
  code = classifyTemperate(agg);  // ← line 412-413、ここで C に流れる
} else {
  code = classifyTropical(agg);
}
```

- `TROPICAL_WINTER_MIN_THRESHOLD_CELSIUS = 18` (Köppen 標準)
- 赤道セルの winterMin（最寒月平均気温）が **0°C ≤ winterMin < 18°C** に入ると
  自動的に C 群（temperate）扱い
- 標準 Köppen でも A 群条件は「最寒月 ≥ 18°C」なので、**仕様としては正しい**
- **しかし**: アプリの Step 5 が赤道帯で winterMin < 18°C を生成している可能性大

### Step 5 の equator winter 温度の確認ポイント

- `globalMeanBaselineCelsius = 15°C` がデフォルト
- 赤道は緯度補正で +15°C 程度暖められる想定 → ≈30°C
- ただし冬季（離心率 + 軸傾斜由来の季節振幅）で月平均が 15-17°C まで下がる
  ケースがあると、winterMin < 18°C となり C 確定
- **要確認**:
    - Step 5 の季節振幅は赤道で適切に小さくなっているか？
      （赤道では年較差は数 °C 程度のはず）
    - continentality（[src/sim/05_temperature.ts:416] 周辺）が赤道内陸で振幅
      増幅しすぎていないか？

### 解決方向（次サイクル）

1. **Step 5 の equator winterMin が ≥ 18°C になる**ように軸傾斜・継続性
   パラメータを校正
2. or **Step 7 で Aw (savanna) 判定を別建て**にする:
    - 「年平均 ≥ 22°C かつ降水パターンが季節性」なら winterMin に関わらず A 群
    - これは Pasta `Worldbuilder's Log #40` の「tropical savanna は冬季も
      暖かい」前提に合わせた拡張

## 海流バグ（陸地上に紫点）について

ユーザ別件指摘: 「陸上に紫の点が生じる」

- 該当: collision points マーカー（[src/sim/03_ocean_current.ts] / 描画は
  [src/ui/map/MapCanvas.tsx]）
- 紫色は§4.6 極流衝突点（[KOPPEN_ZONE_COLORS] とは別系統）
- 想定: 海セルの基準座標で計算した点が、丸マーカー描画時に陸上ピクセルに
  かかってしまう（隣接陸セルの上に重なる）
- 修正案: マーカー描画時に「中心セルが海であること」だけでなく「マーカー
  サイズ（半径）の範囲内のセルが大半海であること」を確認

## 次サイクル方針

- 修正前に **数値検証ハーネス** を整える（仮想大陸プリセットで Step 5 の
  per-cell winterMin / Step 6 の per-cell precip を assert する unit test）
- 上流 Step 5/6 の東西非対称性が確保されているかを定量で見る
- それが OK なら Step 7 のしきい値調整、NG なら Step 5/6 を修正
