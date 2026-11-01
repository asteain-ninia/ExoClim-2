# 提案 — 系統2「Pasta Bioclimate System」実装計画（2026-07-08）

> **公開時の注記（2026-11-01）**: ExoClim-2 の開発は終了し、後継の ExoClim-3 に移っています。本書は当時の未採用案の記録です。本文が参照する一次資料の書き起こし（`docs/Worldbuilder's Log *.txt`、`docs/Pasta Part VIb Step 7 Climate Zone/`、その中の `transcript.md`）とお手本画像（`geographico_*.png`）は、第三者資料とその関連物のため公開していません。旧 ExoClim（`_archive/ExoClim-/`、旧現状.md など）も本リポジトリにはありません。
>
> **位置づけ**: 本書は**未確定の提案文書**であり、仕様ではない。作成: Claude Fable 5（subagent）、2026-07-08。調査は **READ-ONLY**、実装は行っていない（本ファイル新規作成以外に既存ファイルの変更・削除なし）。採用時は各項目を [docs/spec/07_気候帯.md §4.2 / §7](spec/07_気候帯.md) の未確定論点から本文へ昇格させ、[現状.md §5](../現状.md) の 5 番目タスクに紐付けること。
>
> **一次資料の取り扱い**: GDD/HDD/Ar/Evr の算出式は Worldbuilding Pasta の一次記事（下記 §0）から WebFetch/WebSearch で取得した。取得できた値は【確認済】、取得できなかった／要約モデルの読みが記事間で揺れた値は【要一次再読】と明記する。**推測で数式・係数を埋めていない。** 数式・係数・URL は改変していない。

---

## 0. 一次参照（系統2の出典）

- **Beyond the Köppen-Geiger, Part II: A New Bioclimate Classification System**（2025-03）
  <https://worldbuildingpasta.blogspot.com/2025/03/beyond-koppen-geiger-climate.html>
    - 系統2の中核定義（GDD/HDD/Ar/Evr/GAr/GrS の一次出典）。技術詳細はこの Part II に集約されている旨を後続記事が明言。
- **Beyond the Köppen-Geiger, Part III: Assessing the Pasta Bioclimate Classification System**（2025-05）
  <https://worldbuildingpasta.blogspot.com/2025/05/beyond-koppen-geiger-climate.html>
    - kalike 係数の調整（*"from 4.5 to 7 mm/month/°C"*）、地球データでの検証。
- **Beyond the Köppen-Geiger, Part I: Extensions and Alternatives**（2024-12）
  <https://worldbuildingpasta.blogspot.com/2024/12/beyond-koppen-geiger-climate.html>
- **Public Climate Data Re-Explorations with the Pasta Bioclimate System**（2025-09）
  <https://worldbuildingpasta.blogspot.com/2025/09/public-climate-data-re-explorations.html>
    - 冬しきい値 *"cool, cold, and frigid winters tuned to 12, -6, and -25 °C"*、GDD 境界、HDD（*"degrees Fahrenheit below 65 °F"*、CT/CD ≈ 400 °F-days）、Mediterranean *"threshold for Mediterranean zones tuned to 0.9 GrS"*（場合により 0.8）、半乾燥 *"0.5 Ar"*。
- 参考実装: `koppenpasta`（hersfeldtn）。系統1と共通。

> **注意（Fable 所見）**: 上記 4 記事は WebFetch の要約モデルが同一ページから記事ごとに異なる数値（例: 冬しきい値を 12/-6/-25°C とも -10/-40°C とも読んだ。後者は "ExoPlaSim data" 側の別チューニング）を返した。**実装着手時に実装者が Part II/III を直接精読し、本書の【要一次再読】箇所を確定させること。** 本書は「どの式・係数を、どの記事の、どの表現から取ったか」の索引として使う。

---

## 1. 系統1 と 系統2 の対照表

| 観点 | 系統1: Köppen-Geiger（実装済） | 系統2: Pasta Bioclimate（未実装） |
|---|---|---|
| 一次入力 | 月別気温(mean)、季節極値 winterMin/summerMax、降水ラベル→mm | 同左 ＋ 月別 PET(kalike)、（月別 MaxT: 現行未供給） |
| 中間量 | 乾燥限界 Pth=20·MAT+{280,140,0}、季節雨型 f/s/w/m、暑い6ヶ月降水比 | GDD/GDM(base 5°C)、HDD(base 65°F)、冬最低カテゴリ(12/−6/−25°C)、Ar=AET/PET、GAr、GrS、Evr |
| 判定原理 | 5群 A/B/C/D/E の離散しきい値 → 第2/3文字 | 連続量の多軸判定（温度系列 × 成長カテゴリ × 乾燥度 × 常緑性）→ 階層コード |
| 判定粒度 | 群→サブ→2/3文字。しきい値ジャンプ | 度日・比率の連続量。境界が滑らか |
| 出力コード例 | `Af` `BWh` `Cfb` `Dfc` `ET` `EF` | `CTf` `Cxa` 等の階層コード【要一次再読: 完全な taxonomy 未確定】 |
| 現行入力の供給 | Step5(mean/極値) ＋ Step7 内 label→mm 変換 | 同左 ＋ Step5 `monthlyEvapotranspirationMmPerMonth`（現状 stub） ＋ Step7 内 AET 計算 |
| 現行実装 | [src/sim/07_climate_zone.ts](../src/sim/07_climate_zone.ts) 全実装（後処理含む） | 未実装。`system='pasta_bioclimate'` 選択時も**系統1で判定**され、出力 `system` フィールドだけが追従（07_climate_zone.ts 冒頭コメント / §4.2.5） |
| 型 | `ClimateZoneResult`（[src/domain/stepResults.ts](../src/domain/stepResults.ts)）。`ClimateZoneCode=string` で系統2コードも表現可 | 同型を流用可。`rationale` に GDD/Ar 等の追加が必要 |

**現状.md §5 の「Step 5/6 拡張要（大規模実装）」への精査結果**:

- **Step 6 拡張は必須ではない**。系統2 が要する連続降水量(mm)は、系統1 が既に使う label→mm 変換表（`precipitationMmByLabel`、[T05](提案-定量係数リサーチ-2026-07-07.md)）をそのまま再利用できる。Step6 出力（4階調ラベル）自体は変更不要。
- **Step 5 拡張は小規模**。PET マップは既に出力されており（後述 §3、現 stub がそのまま kalike 形）、追加は「PET 係数の kalike 範囲パラメータ化（軽微・必須）」と「月別 MaxT 出力（GDD プロキシ用・任意）」のみ。
- **新 Step は不要**。系統2 は Step7 内の並置分類器として実装できる（§3.3）。
- 従って「大規模実装」の実体は **Step7 内の新分類ロジック＋UI 配色/凡例の系統2 対応** に集約され、Step5/6 パイプラインの骨格改修は要らない。

---

## 2. 中核指標 4 種の算出式と ExoClim への落とし込み

記法: 月 m の月平均気温を `T_m`(°C)、月降水量を `P_m`(mm/月)、成長基準温度を `Tbase`。ExoClim は緯度経度セル×12ヶ月。各セルで以下を計算する。

### 2.1 GDD（Growing Degree-Days / Growing Degree-Months）

- 【確認済 Part II】基準温度 `Tbase = 5°C`（一部の砂漠・ツンドラ低木は 0°C）。*"every degree Celsius of the daily average temperature above a certain base temperature is counted as one GDD"*。月次換算は *"1 GDM corresponds to 30 GDD"*（GDM = Growing Degree-Month）。
- 【確認済 2025-09】高温期の成長ピーク補正（プロキシ）: 月次 GDM に *"multiplying it by MaxT/20 °C ... seems to give a decent proxy for GDD"*。
- 【要一次再読 Part III】高温減衰: 旧版で *"GDD accumulation began declining above 35 °C and stopped at 45 °C"*、後に *"increased all these thresholds by 5 °C"*（→ 40/50°C）。

ExoClim 落とし込み（月別 mean 気温から直接）:

```
GDM_m = max(0, T_m − 5)                       // 月ごとの度・月
（成長期プロキシ採用時） GDM_m *= (MaxT_m / 20)   // MaxT_m は月別最高気温（現行未供給、§3.1(b)）
GDM_year = Σ_m GDM_m                          // 年間成長度月
```

- 【要一次再読】成長カテゴリ境界（spec §4.2.3 転記）: `CD/CE = 100`、`CE/CF = 6`、`CF/CG = 成長期なし`。**単位が GDM か GDD か不明**。`1 GDM=30 GDD` を踏まえると、CD/CE=100 は GDM 単位（≒3000 GDD、温帯/亜寒帯境界として尤もらしい）、CE/CF=6 GDM（極寒側）と解するのが自然だが、記事の直接確認が必要。実装者は Part II の表を精読し確定すること。

### 2.2 HDD（Heating Degree-Days）

- 【確認済 2025-09】*"measured as degrees Fahrenheit below 65 °F (about 18.3 °C)"*。亜熱帯 CT と温帯 CD を分ける境界 `CT/CD ≈ 400 average °F-days`。

ExoClim 落とし込み（冬の温暖さ＝亜熱帯性の指標）:

```
HDD_m(°F·days) = max(0, 65 − T_m°F) × (その月の日数)   // T_m°F = T_m×9/5+32
HDD_year = Σ_m HDD_m
CT（亜熱帯）判定: HDD_year < 400（≈ 冬が十分温暖）
```

- 【要一次再読】HDD の基準・境界は 2025-09 記事で確認したが、Part II の要約では「HDD は採用しない」とも読めた（要約モデルの揺れ）。HDD が最終体系で使われるか、CT 判定が HDD か冬最低気温かは Part II で確定すること。

### 2.3 Ar（Aridity Ratio）と水収支

- 【確認済 Part III】*"aridity factor, defined as the ratio of actual evapotranspiration to potential transpiration"*。すなわち **Ar = AET / PET**（0=極乾〜1=十分湿潤）。
- 【確認済 2025-09/spec §4.2.4】半乾燥境界 `Ar ≤ 0.5`。
- 【確認済 Part III/2025-09】PET は「kalike」推定: 気温に比例する線形式で、係数は *"from 4.5 to 7 mm/month/°C"*（地球データで較正）。

> **重要（spec の定義ずれを訂正）**: [spec §4.2.4](spec/07_気候帯.md) は Ar を「年蒸発散と年降水の比」と記すが、一次資料（Part III）は **AET/PET** と定義しており不一致。「ET と降水の比」は後述の **Evr**（§2.4）の定義に近い。実装は一次資料の `Ar=AET/PET` を正とし、spec §4.2.4 の gloss は昇格時に修正すること。**この取り違えは系統間ドリフトの典型例**（§5 教訓）。

ExoClim 落とし込み（PET は Step5 供給、AET は Step7 で水制限）:

```
PET_m = max(0, T_m) × k_kalike        // k_kalike ∈ [4.5, 7] mm/月/°C。現行 stub と同形（§3.1）
AET_m = min(PET_m, P_m)               // 水制限バケツ近似【Fable推論・標準水文近似。Pasta 直接確認でない】
Ar = Σ_m AET_m / Σ_m PET_m            // 分母>0 のときのみ（下記ガード）
```

- **0除算ガード**: 全月 `T_m ≤ 0`（PET=0、成長期なし）のセルは Ar を計算せず、先に極カテゴリ（CF/CG 相当）へ分類する。これは撤回済 [T04](追補-needs_check再検討-2026-07-07.md) の `R=P/Pth` が起こした Pth→0 発散と**同型の罠**であり、Köppen が Pth を片側テストにしか使わないのと同じく、Ar も「成長期あり」を前置判定してから使う。

### 2.4 Evr（Evaporation Ratio）と成長期指標

- 【確認済 Part II】Evr = *"Total evapotranspiration to total precipitation — portion of precipitated water that remains in the soil"*。すなわち **Evr = Σ ET / Σ P**（降水のうち蒸発に回る割合。常緑性・土壌水分の代理）。
- 【確認済 Part III】**GAr（Growth Aridity）** = 成長期に限定した Ar（*"measuring the aridity factor during the growing season"*）。半乾燥を GAr でなく `0.5 Ar` で切る調整も 2025-09 に言及。
- 【確認済 Part II/2025-09】**GrS（Growth Supply）** = *"precipitation in the growing season"* 対 *"total evaporation for the year"*。Mediterranean 境界 `GrS = 0.9`（ExoPlaSim データでは 0.8）。

ExoClim 落とし込み:

```
Evr = Σ_m AET_m / Σ_m P_m                         // 年間
成長期集合 G = { m | GDM_m > 0 }（T_m>5°C の月）
GAr = Σ_{m∈G} AET_m / Σ_{m∈G} PET_m               // 成長期 Ar
GrS = Σ_{m∈G} P_m / Σ_m PET_m                      // 成長期降水 / 年間潜在蒸発
Mediterranean 判定: GrS < 0.9（または 0.8）
```

- 【要一次再読】GAr/GrS/Evr の厳密な分母（「total evaporation」が PET か AET か、成長期の定義が GDM>0 か MaxT 補正後か）は Part II の式を精読して確定。上式は一次資料の言い回しに最も忠実な解釈だが、記号の対応は未確定。

### 2.5 温度系列カテゴリ（冬最低しきい値）

- 【確認済 2025-09】*"thresholds for cool, cold, and frigid winters tuned to 12, -6, and -25 °C"*（spec §4.2.2 と一致）。冬最低気温 `winterMin`（Step5 が供給済）で切る:

```
cool:   winterMin ≥ 12°C
cold:   −6°C ≤ winterMin < 12°C
frigid: −25°C ≤ winterMin < −6°C
（さらに寒い側は極カテゴリ）
```

- 【要一次再読】温度系列の頭字（spec §4.2.1: T/S/Q/Te/B/P/C）と成長カテゴリの頭字（Part II: CT/CD/CE/CF/CG）の対応・階層順（どちらが第1文字か）は記事間で表現が揺れており未確定。最終コード合成規則（例 `CTf`=Subtropical Forest, `Cxa`=Oceanic Subtropical）は Part II の code 表を正とする。

---

## 3. パイプライン拡張計画

### 3.1 Step 5（気温）— [src/sim/05_temperature.ts](../src/sim/05_temperature.ts) / [spec/05_気温.md](spec/05_気温.md)

現行出力（[stepResults.ts](../src/domain/stepResults.ts) `TemperatureResult`）: `monthlyTemperatureCelsius`(mean)、`annualMean`、`summerMax`、`winterMin`、`monthlyEvapotranspirationMmPerMonth`。

- **(a) PET を kalike として位置づけ直す（必須・軽微）**。現行の暫定式は
  `etRow[j] = max(0, t) × evapotranspirationCoefficientMmPerCelsius`（既定 `5`、05_temperature.ts 内 §「9. 蒸発散量」）。
  これは **Pasta の kalike PET（気温×係数、線形）とまさに同形**であり、既定係数 `5` は Pasta の較正範囲 `4.5〜7 mm/月/°C` に収まる。系統2 では**式変更不要**。係数の許容域を 4.5〜7 に合わせてスライダー化するだけでよい。
- **(b) 月別 MaxT の出力（任意）**。GDD 成長期プロキシ `×MaxT/20°C`（§2.1）に月別最高気温が要る。現行は月別 mean のみ。選択肢:
    1. Step5 に `monthlyMaxTemperatureCelsius` を追加出力（`mean + DTR/2`。DTR は [T03](追補-needs_check再検討-2026-07-07.md) の自転周期スケーリングと接続）。
    2. プロキシを省き mean ベース GDM で近似（初期実装向き。精度は Phase B4 で評価）。
- **(c) AET は Step5 で計算しない**。水制限 `AET=min(PET,P)` は降水が mm 化される Step7 側で行う（§3.3）。

**既存 PET 提案との接続点（重複実装の回避）**:

- [T01](提案-定量係数リサーチ-2026-07-07.md)（Thornthwaite PET）は **系統2 では採用しない**。系統2 の Ar は kalike 線形 PET で較正された体系であり、Thornthwaite に差し替えると Pasta の 4.5〜7 較正・公開図との比較（[要件定義書 §2.5.2](../要件定義書.md)）が崩れる。
- Thornthwaite（T01）は **系統1 の Köppen B/D（[T02](提案-定量係数リサーチ-2026-07-07.md)）向けの任意高精度 backend** に留める。すなわち **PET は 2 用途で別物**: 系統2=kalike 線形（現 stub 流用）、系統1=Köppen Pth（温度比例の乾燥限界、PET マップ不要）。**同じ ET 係数を両系統で別意味に流用しない**（§5 ドリフト防止）。

### 3.2 Step 6（降水）— [spec/06_降水.md](spec/06_降水.md)

- **拡張不要**。Ar/Evr/GrS が要する月別 mm は、系統1 と共通の `precipitationMmByLabel`（[T05](提案-定量係数リサーチ-2026-07-07.md)、既定 dry10/normal60/wet120/very_wet240）を Step7 内で流用する。
- **注意（粒度限界の伝播）**: 4階調ラベル→mm の離散化誤差（[T04/T05](提案-定量係数リサーチ-2026-07-07.md) が指摘）は、系統2 の GrS/Ar 判定にもそのまま伝播する。Mediterranean(GrS≈0.9) のような細い境界はラベル粒度で不安定化しうる。将来 Step6 が連続 mm を出せると系統2 精度が上がる（任意拡張、Phase B4 で要否判断）。

### 3.3 Step 7（気候帯）— [src/sim/07_climate_zone.ts](../src/sim/07_climate_zone.ts)

- **新 Step 不要**。系統2 は Step7 内の**並置純粋関数**（例 `classifyCellBioclimate(agg, planet, params)`）として追加し、`computeClimateZone` を `params.system` で分岐:
    - `koppen_geiger` → 既存 `classifyCell`（**一切変更しない**）。
    - `pasta_bioclimate` → 新 Bioclimate 経路（GDD/HDD/Ar/Evr/GrS → 階層コード）。
- `_planet: PlanetParams` は既に契約として受領済（07_climate_zone.ts:544-547 コメント「系統2で日射量・GDDを必要とするため契約として受け取る」）。日射量が要る場合はここで消費。
- 系統1 の後処理（BS リング/BWh 連続化/西岸 Cs 強制/ITCZ savanna 拡張など §4.1.8 群）は **系統2 に流用しない**。別体系であり、系統1 の Köppen 前提の整形を混ぜると判定ドリフトになる。系統2 独自の整形が要るかは Phase B4 で評価。
- 型: `ClimateZoneResult`/`ClimateZoneCode=string` は流用可。`ClimateZoneRationale` に系統2 の派生量（GDD_year/HDD_year/Ar/GAr/GrS/Evr）を足すか、`rationale` を系統別 union にする（Phase B0）。

---

## 4. Phase 分割案（各 Phase で完結・系統1 を壊さず並置）

- **Phase B0 — 骨組みと系統1 回帰保護**: `computeClimateZone` に `system` 分岐を入れ、`pasta_bioclimate` 経路のスタブ関数を追加。`ClimateZoneRationale` 拡張。**受け入れ条件: 系統1 の `zoneCodes`/`climateClashCount` が既存テスト（sim/07_climate_zone 21件）で完全不変**。
- **Phase B1 — 温度系列＋成長カテゴリ**: 月別 mean から GDM(base5°C, §2.1)・HDD(base65°F, §2.2)・冬最低カテゴリ(12/−6/−25°C, §2.5) を計算。成長カテゴリ CD/CE/CF/CG（境界 100/6/なし、単位確定）。この Phase の出力は温度・成長系列コードまで（乾燥度前）。
- **Phase B2 — 水収支・乾燥度**: kalike PET（Step5 ET マップ再利用）→ `AET=min(PET,P)` → Ar/GAr/Evr/GrS（§2.3-2.4）。label→mm は T05 表流用。半乾燥 Ar≤0.5、Mediterranean GrS 0.9/0.8。0除算ガード（成長期なし→極）必須。
- **Phase B3 — コード合成・UI 対応**: 階層コード組み立て（Part II の code 表に従う）。UI: `system` 選択で **凡例（[Legend.tsx](../src/ui/map/Legend.tsx)）・配色（[MapCanvas.tsx](../src/ui/map/MapCanvas.tsx) の Köppen 色表）・カラー凡例（[ColorLegend.tsx](../src/ui/map/ColorLegend.tsx)）** を系統2 コードに対応させる。CellInspector も系統2 rationale を表示。
- **Phase B4 — 較正・検証**: 地球プリセットで Pasta 公開の Bioclimate 地図と比較し、kalike 係数(4.5〜7)・GDD 境界・GrS 閾値(0.9/0.8)・label→mm をチューニング。[Phase4.1 数値検証ハーネス](../開発ガイド.md)（P4-69, phase41_validation.test.ts）に系統2 アサートを追加。月別 MaxT プロキシ(§3.1b) の要否もここで判断。

各 Phase は単独でビルド・テストが通り、`system='koppen_geiger'` の既定動作を最後まで壊さない（系統2 は詳細モードのオプトイン、§4.2.5）。

---

## 5. 罠・教訓とテスト方針

### 5.1 開発ガイド §6 からの関連教訓（[開発ガイド.md §6](../開発ガイド.md)、§5.1.2 ゲート準拠の引用）

- **§6.1.2「線形 insolation→温度マッピングの破綻（polar day での過剰加熱）」**: 系統2 の GDD/PET は月別気温に線形依存するため、極夏の過剰加熱が残っていると極セルの GDM が誤って正になり CF/CG（極）を取りこぼす。→ **再発防止**: 系統2 実装前に極夏セルで `GDM=0`（`T_m≤5°C`）を確認。Step5 の年平均/季節2段スケール（annual≈350/seasonal≈80）が効いている前提を崩さない。
- **§6.1.3「雪氷フィードバック反復で同一セルを多重冷却」**: 直接は無関係だが、月別気温の妥当性が系統2 全指標の土台。Step5 の気温が異常だと GDD/Ar が連鎖破綻する。
- **§6.3.1「計算結果が UI 描画に反映されない（独自実装の取り残し）」**: **最重要**。[MapCanvas.tsx](../src/ui/map/MapCanvas.tsx) の配色は Köppen コード（`Af`/`BWh`/`Dfc` …:611-641）をハードコードした表で、系統2 の新コード（`CTf` 等）は表に無く**描画されない/空白になる**。→ **再発防止**: 系統2 コードを出したら `grep`（例 `grep -r CTf src/ui/`）で配色・凡例・凡例カラー・CellInspector が新コードを消費しているか確認。UI 未対応のまま「計算は通った」で完了報告しない。
- **§6.3.2「Canvas 指紋テスト（粗いサンプリング）の感度低下」**: 系統1↔系統2 の切替で塗り分けが変わる E2E は、**明確に大きな差分が出る方向**（多数セルが色替わる操作）で書く。16px サンプリングの指紋は微差を取りこぼす。specific-pixel チェック併用。
- **§6.2.1「Step 追加で E2E 待機が不足」**: 系統2 経路が重い場合、pipeline 再計算時間が伸びる。既存 E2E の `beforeEach` 待機（目安 ≥900ms）が足りるか確認。

### 5.2 系統1 との判定ドリフト防止（新規教訓候補）

- **PET/乾燥の式を系統間で共有しない**: 系統1=Köppen Pth（T02、温度比例乾燥限界）、系統2=kalike PET＋Ar=AET/PET。**同一の ET 係数・同一の「乾燥度」概念を両系統で別意味に流用しない**。`ClimateZoneStepParams` は系統別に名前空間を分ける（例 `bioclimate` 下位オブジェクト）。
- **spec の定義ずれを持ち込まない**: spec §4.2.4 の `Ar=年蒸発散/年降水` は一次資料の `Ar=AET/PET` と食い違う（§2.3）。実装は一次資料を正とし、spec は昇格時に訂正。
- **0除算/縮退の前置ガード**: 撤回済 T04 の `P/Pth` 発散と同型。成長期なし（PET=0）を先に極カテゴリへ振ってから Ar/GrS を計算。

### 5.3 テスト方針

- **(a) 系統1 回帰**: 系統2 追加後も `koppen_geiger` の全出力が不変（既存 21 ユニット＋ E2E p4-11）。
- **(b) 系統2 ユニット**: GDD/HDD/Ar/Evr/GrS の**境界値を `__internals` 経由で直接検証**（既存 07_climate_zone.ts の `__internals` パターン、T02/T05 と同手法）。cool/cold/frigid 境界、Ar=0.5、GrS=0.9/0.8、成長期なし縮退。
- **(c) 決定性**: 同入力→同出力（[要件定義書 §3.2](../要件定義書.md)）。
- **(d) 地球フィクスチャ妥当性**: 熱帯雨林→高 GDD・低 Ar・高 Evr、砂漠→低 Ar、地中海→GrS 境界近傍、極→成長期なし、を idealized_continent／地球プリセットで範囲 assert（Phase4.1 ハーネス）。
- **(e) 一次資料整合の宿題明示**: 【要一次再読】箇所（GDD 単位、HDD 採否、taxonomy、GAr/GrS の分母）は、Part II 精読で確定するまで**テストの期待値を暫定 TODO** とし、確定後に固定値化する。

---

*作成: Claude Fable 5（subagent）、2026-07-08。READ-ONLY 調査＋設計のみ。数式・係数・URL は一次資料から改変せず転記し、取得不能値は【要一次再読】と明記した。本ファイル新規作成以外、既存ファイルの変更・削除なし。*
