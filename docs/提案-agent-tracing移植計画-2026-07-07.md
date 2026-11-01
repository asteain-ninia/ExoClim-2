# 提案 — 海流 agent-based tracing 完全移植計画（2026-07-07）

> **公開時の注記（2026-11-01）**: ExoClim-2 の開発は終了し、後継の ExoClim-3 に移っています。本書は当時の未採用案の記録です。本文が参照する一次資料の書き起こし（`docs/Worldbuilder's Log *.txt`、`docs/Pasta Part VIb Step 7 Climate Zone/`、その中の `transcript.md`）とお手本画像（`geographico_*.png`）は、第三者資料とその関連物のため公開していません。旧 ExoClim（`_archive/ExoClim-/`、旧現状.md など）も本リポジトリにはありません。
>
> **位置づけ**: これは**未確定の提案文書**です。仕様ではありません。採用する場合は、各Phaseを `現状.md` §2.3 にタスク登録し、確定した設計判断のみを `docs/spec/03_海流.md` へ反映してください（指示.md「永続文書に一時情報を書かない」原則に従い、本書は docs/ 直下の提案として置きます）。
> **作成経緯**: 分析はOpus調査エージェント（旧新両実装の突き合わせ、READ-ONLY）、計画判断はFable 5。実装は行っていません。
> **参照記法**: OLD = `_archive/ExoClim-/services/physics/ocean.ts`（1040行）/ NEW = `src/sim/03_ocean_current.ts`（1898行）

---

## 0. 最重要の前提認識（計画全体を規定する）

**ExoClim-2 の streamline は「視覚＋衝突点」専用であり、気候出力に影響しない。**
暖寒流の気温補正は per-cell の `classifyOceanCell` / `coastalTemperatureCorrection`（NEW:1765-1774）で完結しており、streamline が static でも agent でも Köppen 出力は変わらない。旧版では streamline の impact が EC→MLC 全カスケードを駆動する主産物だったが、新版では**流線幾何の忠実度（＝陸沿い這行の見た目）を上げるプロジェクト**である。

この帰結:
- **気候の正しさを人質に取らない**。各Phaseはいつでも中断可能で、中断してもシミュレーション品質は劣化しない。
- **per-cell 分類の維持を推奨**。streamline 由来の分類への切替（後述 D12）は「やらない」を既定とし、視覚と分類の食い違いが目立った時だけ再検討する。
- 逆に言えば急ぐ理由もない。**1 Phase = 1セッション**で区切り、毎回動く状態で終えること。

---

## 1. ゴールと非ゴール

**ゴール**: 現状.md §5#1「海流の本格的陸沿い這行」の実現。ECC/EC/MLC の3段カスケードを agent 化し、海流線が大陸縁を這い、衝突点から次の流系が生まれる旧版の視覚品質を、新版の資産（複数basin検出・曲線化・Worker実行）と合流させる。

**非ゴール（明示的にやらない）**:
- streamline 由来の暖寒分類への切替（D12）— per-cell 分類を維持
- 旧版の死蔵パラメータの移植 — `oceanShelfAngle` / `oceanDeflectLat` / `oceanSplitOffset` / `oceanCoastDist` / `oceanWestwardAttractionFactor` / `oceanImpactThreshold` は旧版でも計算未使用（旧現状.md:20）。**UIごと持ち込まないこと**
- 乱数の導入 — 旧の月別RNGは形骸（全pass未使用）。決定論を維持する

---

## 2. アーキテクチャ方針: ハイブリッド（旧ロジック × 新資産）

旧をそのまま写経しない。以下の対応表で「どちらの資産を正とするか」を先に固定する。

| 関心事 | 正とする側 | 根拠 |
|---|---|---|
| agent 状態機械・crawl/slide/impact | **旧**（OLD:384-484 ほか） | 新skeletonは陸侵入で即停止（NEW:1108-1111）であり這行できない |
| spawn の空間構造 | **新**の複数basin検出（`findOceanBasinsAtLatitudeDeg` NEW:1195） | 旧は経度走査spawnのみで島嶼・多basin構造を持たない |
| 距離場 | **新**の collision-field（NEW:859-990、セル単位） | Worker共有済み・テスト済み（TEST:674-745）。ただし**単位問題**に注意（§5 罠1） |
| 実行環境 | **新**（Worker） | 旧のUIフリーズ問題（旧現状:31-32）は解消済み |
| 出力型 | **新**（`CurrentStreamline[]` に統一、`buildSplitStreamlines` 経由 NEW:1424） | 下流（描画・分類・衝突点）が無改修で受けられる。この型統一が段階置換を可能にしている |
| 曲線化・deflection（P4-21/25） | **共存**のまま | agent化されていないpassの見栄え維持に必要。agent path には適用しない（二重補正防止） |

フラグは `agentTracingEnabled` **1本を維持**し、Phase進行とともにフラグ配下のカバレッジが広がる方式を推奨する。pass別フラグの乱立は UI・E2E・組合せテストを爆発させる。static 実装は全Phase完了まで削除しない（フォールバック兼リグレッション比較対象）。

---

## 3. Phase 計画（依存関係順・各Phaseで完結）

差分番号 D1〜D14 は調査ブリーフの差分リストに対応。

### Phase A — 基盤の地固め（難度低〜中、まずここから）
1. **D7 sub-stepping**: 旧は SUB_STEPS=10, DT=0.05（OLD:236-238）。新の1step/iterは衝突判定が粗く、以降の crawl 実装が安定しない。**最初に入れる**。
2. **D13 単位の一元化**: 旧はkm基準、新はセル数基準の距離場。閾値換算（陸接近判定 dist<-20km / dist<-30km ↔ 新の4セル NEW:1102 等）を**換算関数1箇所に集約**してから他を進める（§5 罠1）。
3. **D1 ITCZアトラクタ配線**: `_itczResult`（NEW:1714-1717、現在underscore＝未消費）から `monthlyBands` を取り、ECC agent に吸引項（旧 `oceanPatternForce` 相当、OLD:370-371,422）を追加。**入力は契約に既存（stepResults.ts:35）、新規計算不要、配線のみ**。
4. **D8 findSafeSpawnX**: 西方バックトラックspawn（OLD:146-169）。Phase C の前提だが小さいのでここで。

**完了ゲート**: agent ECC が ITCZ に沿って蛇行し、idealized_continent フィクスチャで回帰なし。

### Phase B — 衝突挙動の本丸（難度高、このプロジェクトの心臓）
5. **D3 slide + push-out**: 斜め衝突で法線成分を除去して滑らせ0.9減衰（OLD:445-484）。現状の「即停止」を置換。
6. **D2 coastal crawl**: 勾配のtangent方向へ這行、target緯度寄りのtangent選択（OLD:384-414）。**移植の主目的**。
7. **D4 impact検出**: 正面衝突（nvx>0.05 && nx>0.1、緩和済み閾値の方を採用 — §5 罠2）で impact 化し座標記録。Phase C の生命線。

**完了ゲート**: ECC が大陸西岸で止まらず海岸線を這い、正面衝突点が impact として取れる。

### Phase C — EC カスケード（難度高）
8. **D5 EC pass**: ECC impact から N/S 2体 spawn、西進＋`itcz ± oceanEcLatGap` へのばね吸引＋減衰、西岸トラップ時 crawl、到達で EC impact（OLD:513-768）。
9. **D10 複数spawn**: basin あたり ECC 複数体（旧 gapFillInterval=cols/128、OLD:256-279）。ただし**新の basin 検出単位で spawn 密度を決める**こと（ハイブリッド設計の要）。
10. **D9 pruning格子**: 流向類似 cos>0.98 × セルcount≥4 で間引き（OLD:189-232）。D10 とセットでないと線が乱立する。

**完了ゲート**: 赤道流の「ECCで東進→西端で分裂→西進→西岸で impact」ループが1つの basin で閉じる。

### Phase D — MLC/極ジャイヤ（難度高、最後の大物）
11. **D6 MLC pass**: cellBoundariesDeg 駆動の pass ループ（cellIdx偶奇で東西反転、inOwnCell 判定で lateral/poleward 転回、OLD:770-1007）。`monthlyCellBoundariesDeg`（stepResults.ts:50）と `monthlyPrevailingWind`（:46）の配線が必要 — **これも入力は既存、配線のみ**。
12. static ジャイヤ生成器（NEW:1431-1475）を basin 単位で agent 産 path に置換。P4-22/23 の縦線・横線補完はagentが十分な線を出すようになった時点で退役検討。

**完了ゲート**: 全流系が agent 産になり、`agentTracingEnabled=true` で static 生成器を通らない。

### Phase E — 仕上げ（任意・独立）
13. **D11 月別計算**: 旧は [0,6] の2ヶ月のみ計算（OLD:57,176）。まず同じ2ヶ月方式で十分（現状.md:208 でも低優先扱い）。
14. **D12 速度方向着色**: per-cell 分類維持の既定を再確認した上で、視覚だけ旧方式（ITCZから離れる=暖/近づく=寒、OLD補助spec:75-85）に寄せるか判断。
15. **D14 diagnostics/DebugFrame**: チューニングが難航した場合のみ移植（OLD:171,1009-1017）。

---

## 4. パラメータ計画

- 移植する旧パラメータ: `oceanBaseSpeed` / `oceanPatternForce` / `oceanRepulseStrength` / `oceanEcLatGap` / `oceanEcPatternForce` / `oceanEcDamping` / `oceanEcPolewardDrift` / `oceanSpawnSpeedMultiplier` / `oceanMaxSpeedMultiplier` / `oceanStreamlineSteps` / `oceanSpawnOffset` / `oceanSmoothing` / `oceanCollisionBuffer`。既存の新4パラメータ（`agentMaxSteps` 等 NEW:131-146）と役割が重なるものは**新側の名前に寄せて統合**し、UIスライダーの重複を作らない。
- 既定値は旧の実戦値（コメントで緩和履歴があるものは**緩和後の値**）をセル単位へ換算して採用。
- ハードコードされていた 0.05/0.1（impact判定、OLD:453,700）は今回こそパラメータ化するか、`AgentTraceParams` の定数として明示。

---

## 5. 罠と教訓（実装者への申し送り）

1. **単位の罠（最重要）**: 旧距離場は km、新は**セル数**。閾値を直接コピーすると挙動が全て狂う。Phase A-2 の換算集約を最初にやらない限り、以降のチューニングは無意味になる。
2. **閾値は大陸配置に敏感**: 旧コードのコメント履歴（OLD:241-243, 254-256, 451-452, 699, 866-867）は全て「仮想大陸で破綻→緩和」の記録。**閾値変更のたびに idealized_continent 系フィクスチャ＋地球風マップの両方で目視回帰**（開発ガイド§4.3）。片方だけでは旧版と同じ轍を踏む。
3. **旧補助spec（ocean_current_spec.md）は信用しない**: ECC/EC の2passしか書かれておらず、MLC pass はコードにしか存在しない。**旧コードを一次情報とする**。
4. **経度wrap描画**: agent path が対子午線を跨ぐ。描画は3オフセット必須（開発ガイド§6.2.2）。cull を入れるなら margin ≥ サンプル間隔。
5. **`-0` 問題**: agent の速度・位置が 0 になるassertは `toBeCloseTo` を使う（§6.1.1）。
6. **E2E指紋テスト**: agent 化のたびに Canvas 指紋が変わる。差分の大きい操作で書く（§6.3.2）。Phase ごとに指紋更新をコミットに含めること。
7. **deflection との二重補正**: P4-25 `deflectPathByCollisionField` は static path の最終出力に適用される（NEW:1571）。agent 産 path に重ねがけしないこと（agent は自前で陸回避する）。
8. **教訓の還流**: 移植完了時、ocean-agent 固有の教訓（単位換算・閾値敏感性）を開発ガイド§6 へ追記する（現在該当節なし）。

---

## 6. 見積り（1セッション=1Phase想定）

| Phase | 内容 | 感触 |
|---|---|---|
| A | sub-step / 単位集約 / ITCZ配線 / safeSpawn | 1セッション |
| B | slide / crawl / impact | 1〜2セッション（チューニング込み） |
| C | EC pass / 複数spawn / pruning | 1〜2セッション |
| D | MLC pass / static退役 | 1〜2セッション |
| E | 月別 / 着色 / diagnostics | 任意、各0.5セッション |

---

*作成: Claude Fable 5（計画判断）＋ Opus 調査エージェント（新旧実装の突き合わせ）、2026-07-07。実装・既存ファイル変更は行っていません。*
