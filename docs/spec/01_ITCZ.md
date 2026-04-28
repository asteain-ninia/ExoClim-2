# Step 1: ITCZ（熱帯収束帯）

> **状態**: 骨格のみ。本文は Phase 2 で Pasta 一次資料から起こす。

## 1. 目的

夏半球における熱帯収束帯（ITCZ）の緯度線を、惑星パラメータと地形から導出する。

## 2. 一次参照

> Phase 2 で WebFetch して該当節を抽出する。

- Worldbuilding Pasta — "An Apple Pie from Scratch, Part VIb"
  <https://worldbuildingpasta.blogspot.com/2020/05/an-apple-pie-from-scratch-part-vib.html>
- Worldbuilder's Log シリーズの該当エピソード（[docs/INTENT.md](../INTENT.md) 参照）
- 補助: Climate Explorations: Temperature

## 3. 入力

> Phase 2 で確定。暫定列挙:

- 惑星パラメータ（地軸傾斜角・自転周期・公転周期・表面気圧）
- 地形（陸海分布・標高・海岸距離）

## 4. アルゴリズム概要

> Phase 2 で Pasta 該当節を抜粋して再構成する。

## 5. 出力

> Phase 2 で確定。

- 月別の ITCZ 緯度線（経度方向の配列）

## 6. パラメータ

> Phase 2 で確定。Pasta が指定する定数と、独自に追加する調整項を分けて列挙する。

## 7. 未確定論点

> Phase 2 で議論する論点をここに集約。

## 8. 旧 ExoClim での扱い（参考）

旧版では `docs/itcz_spec.md` に独自の数式（C_SATURATION_DIST / K_SEA / K_LAND 等）で実装していたが、Pasta との対応関係が明示されていなかった。本仕様では Pasta 該当節からの直接の写像として書き直す。
