# プロジェクトの目的とリファレンス

## 目的

ExoClim は、**Worldbuilding Pasta** の Worldbuilder's Log シリーズ（YouTube）および
"An Apple Pie from Scratch" ブログ連載で解説される惑星気候設計手法を、
インタラクティブなアプリとしてなぞって実装することが第一目的です。

ユーザーが惑星パラメータ（半径・自転・軌道・大気・海洋など）を入力すると、
動画/ブログで提示される手順に従って ITCZ → 風帯 → 海流 → 気流 → 気温 → 降水 → 気候帯
の順で導出し、最終的に Köppen-Geiger ベースの気候区分図を生成します。

各ステップの詳細な物理仕様は [docs/spec/](spec/) に集約します。要件定義書（§2.2）はその索引です。

## 一次リファレンス

### YouTube: Worldbuilder's Log シリーズ (Worldbuilding Pasta)

実装の中心となる手順動画。番号は本人付与のエピソード番号。

- **#28 Ocean Currents** — <https://www.youtube.com/watch?v=UgJ67AswrEs>
  （海流・風帯・海氷・ENSO のマッピング）
- **#31 Precipitation** — <https://www.youtube.com/watch?v=lHV-jZUB5WU>
- **#32 Precipitation & Pressure Redo** — <https://www.youtube.com/watch?v=2RMyd9vo2Qk>
- **#37 Tropical Climates** — <https://www.youtube.com/watch?v=vi66amwP2g0>
- **#40 Continental Climates** — <https://www.youtube.com/watch?v=CYaHD9IKb2g>

### YouTube: 補助動画 (Worldbuilding Pasta)

- **Worldbuilding: How To Design Realistic Climates 1**
  <https://www.youtube.com/watch?v=5lCbxMZJ4zA>
- **Worldbuilding: How To Design Realistic Climates 2**
  <https://www.youtube.com/watch?v=fag48Nh8PXE>
- **Worldbuilding: Hot & Cold Planet Climates**
  <https://www.youtube.com/watch?v=cnKUbcVrZVg>
- **Worldbuilding: Climate Zones Of RETROGRADE Planets**
  <https://www.youtube.com/watch?v=RNfrYrIl9o8>

### Blog: Worldbuilding Pasta — "An Apple Pie from Scratch" シリーズ

動画と同じ内容をテキスト＋図で網羅。テキストなので AI エージェントから直接参照できる。

- **Part VIb: Climate — Biomes and Climate Zones**
  <https://worldbuildingpasta.blogspot.com/2020/05/an-apple-pie-from-scratch-part-vib.html>
- **Part VIc: Climate — Climate Zones of Exotic Worlds**
  <https://worldbuildingpasta.blogspot.com/2020/10/an-apple-pie-from-scratch-part-vic.html>
- **Climate Explorations: Temperature** (2022-05)
  <https://worldbuildingpasta.blogspot.com/2022/05/climate-explorations-temperature.html>
- **Public Climate Data Re-Explorations with the Pasta Bioclimate System** (2025-09)
  <https://worldbuildingpasta.blogspot.com/2025/09/public-climate-data-re-explorations.html>

## エージェント運用上の注意

- 物理モデルや判定ロジックを実装・修正するときは、まず該当パートのブログ記事
  または動画の要点を参照すること。動画自体は AI エージェントは視聴できないので、
  ブログ記事 (text) を一次情報として優先する。
- 既存実装が動画/ブログと食い違っているのを見つけたら、原則として動画/ブログ側に
  合わせる。独自最小実装で済ませるのは「動画指定が曖昧な箇所」と「動画のスコープ外」
  に限る。
- 各ステップの物理仕様を `docs/spec/0X_*.md` に書くときは、Pasta 該当節からの
  引用元（URL + 節タイトル）を明示する。
- リファレンス追加・更新時はこのファイルを更新する。
