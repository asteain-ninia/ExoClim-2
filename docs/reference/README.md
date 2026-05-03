# 気候帯「お手本画像」(P4-44 サイクル, 2026-05-03)

ユーザ依頼により作成。`src/sim/07_climate_zone.ts` の現状出力が
- 対称性が崩れない（同緯度の東西で気候が変わらない）
- 赤道直下〜南北 25° の陸地が C 群に支配される

という不自然な状態に陥っているため、**比較用の正解参考イメージ** を
本ディレクトリに置いた。

## ファイル

| ファイル | 内容 |
|---|---|
| `terrain_only.png` | 1260×630。地形のみ（陸海分離 + 標高シェード）。比較対象 |
| `climate_reference.png` | 1260×740。地形シェード + Köppen 配色オーバレイ + 凡例。アプリの最終表示形態に対応 |
| `climate_only.png` | 1260×740。地形シェードを除いた純色 Köppen + 凡例。気候帯の塗り分けを最も読みやすい形 |

3 枚とも同じ procedural Earth-statistic 地形（seed=0）を共有する。
これは現状アプリの「地球プリセット」と同一の地形なので、`Step 7` の出力と
直接重ねて差分を取れる。

## このイメージは何を示すか

「現状アプリ実装の答え」ではなく「**もし Step 7 が Pasta #40 / 教科書的な
Köppen 推論を素直に適用していたら、こうなるはず** という Claude の手描き
推論」である。実装の差分検証用の baseline として使う。

`src/sim/07_climate_zone.ts` の計算は使っていない。地形だけを共有して、
気候帯は本ファイルに記述するハードコードルールで割り当てている。

## 推論ルール（緯度帯 × 海岸 × 標高）

座標系: `latDeg = 緯度（北 +90 〜 南 -90）`、`lonDeg = 経度（-180 〜 +180）`、
`absLat = |latDeg|`、`elevM = 標高（m）`、各陸セルは「西側 5° 以内に海」を
`westCoast`、「東側 5° 以内に海」を `eastCoast`、「東側 7° 以内」を
`eastWetReach`（trade wind / monsoon advection 内陸到達）、と判定する。

### 標高補正（最優先）

| 条件 | ゾーン |
|---|---|
| `elevM > 4500` | EF 万年氷 |
| `elevM > 3500 && absLat > 30` | ET ツンドラ |
| `elevM > 4000` | ET ツンドラ |

### E 群（極帯, |lat| ≥ 70°）

| 条件 | ゾーン |
|---|---|
| `absLat > 80 \|\| elevM > 2000` | EF |
| `latDeg < -75`（南極大陸内部） | EF |
| その他 | ET |

### D 群（亜寒帯, 50° ≤ |lat| < 70°）

| 条件 | ゾーン |
|---|---|
| `elevM > 2500` | ET |
| `veryWestCoast && absLat < 58 && NH` | Cfb（暖流 + 偏西風で海洋性）|
| `absLat ≥ 60 && distOcean > 12` | Dfd（極大陸性、内陸）|
| `absLat ≥ 55 && distOcean > 10` | Dfc |
| `absLat ≥ 58` | Dfc（海岸でも亜寒帯）|
| `distOcean > 8` | Dfb |
| `eastCoast` | Dfa |
| その他 | Dfb |

### C/B 群分岐（30° ≤ |lat| < 50°）

| 条件 | ゾーン |
|---|---|
| `elevM > 3000` | ET |
| `elevM > 2000 && eastCoast` | Cwb |
| `elevM > 2000` | BSk |
| **西岸 (`veryWestCoast`)** | |
| └ `absLat ≥ 40` | Cfb 西岸海洋性 |
| └ `absLat ≥ 33` | Csb 地中海性 cool summer |
| └ それ以下 | Csa 地中海性 |
| **東岸湿潤帯 (`eastWetReach`, 7° 以内)** | |
| └ `absLat ≥ 42` | Dfa 湿潤大陸性 |
| └ `absLat ≥ 30` | Cfa 湿潤亜熱帯 |
| **内陸 (`distOcean > 10`)** | |
| └ `absLat ≥ 42` | BSk |
| └ それ以下 | BWk |
| **中間距離（5-10°）** | |
| └ `absLat ≥ 42 && eastCoast` | Dfa |
| └ `absLat ≥ 42 && westDryReach` | Cfb |
| └ `absLat ≥ 42` | Dfb |
| └ `eastCoast` | Cfa |
| └ `westDryReach` | Csb |
| └ その他 | BSk |

### B/A 群分岐（15° ≤ |lat| < 30° 亜熱帯）

| 条件 | ゾーン |
|---|---|
| `elevM > 3000` | ET |
| `elevM > 2000 && veryEastCoast` | Cwb |
| `elevM > 2000` | BWk |
| `veryWestCoast` | BWh（cold current + 亜熱帯高で強い砂漠）|
| `westCoast && 20 ≤ absLat < 28` | BWh |
| `eastWetReach && absLat < 23` | Aw（trade wind onshore で湿潤、サバンナ残存）|
| `eastWetReach` | Cfa（湿潤亜熱帯）|
| `distOcean > 8` | BWh |
| `absLat < 25` | BSh |
| その他 | BWh |

### A 群（赤道〜15°）

| 条件 | ゾーン |
|---|---|
| `elevM > 3000` | ET |
| `elevM > 2500 && absLat < 8` | Cwb 高地温帯 |
| `elevM > 2500` | BSh |
| `elevM > 1500 && absLat < 5` | Cwa |
| `distOcean > 8` | Aw（内陸で乾季長め）|
| **`absLat < 5`** | |
| └ `eastCoast \|\| distOcean < 4` | Af（trade wind onshore + warm current）|
| └ `westCoast` | Am |
| └ その他 | Af |
| **`5° ≤ absLat < 10°`** | |
| └ `eastCoast` | Am 熱帯モンスーン |
| └ その他 | Aw サバンナ |
| **`10° ≤ absLat < 15°`** | |
| └ すべて | Aw |

## 現状アプリ出力との比較ポイント

ユーザ指摘との突合せ用チェックリスト:

1. **「対称性が崩れない」**
   - お手本では同じ緯度でも「東岸 = Cfa（湿潤亜熱帯, 緑）」、「西岸 = BWh（熱砂漠, 赤）」と
     **東西で別物**。仮想大陸でも同じ緯度の左右で塗りが変わるはず
   - アプリ出力で同緯度の東西が同色なら、海流 / 海岸距離 / 卓越風方向が
     Step 7 に届いていない

2. **「赤道直下〜南北 25° が C 群に支配」**
   - お手本では赤道直下〜10° は **A 群 (青系)** で支配される
   - 10〜25° は **B 群 (赤・橙) または A 群** が大半。C 群 (緑) は
     東岸の狭い帯のみ
   - アプリで赤道帯に C 群が広がっているなら、Köppen の B/A/C 分岐閾値
     （年間平均気温 18°C・乾燥指数）が機能していない可能性が高い

3. **極帯の連続性**
   - お手本では `|lat| ≥ 70°` は E 群（灰色）が一様。
   - 同緯度に C/D が点在するなら polar 判定の温度しきい値が壊れている

## 既知の制限

- 海岸距離は経度行内の最近海セルしか厳密でなく、緯度方向は粗い ±60 行スキャン
- 風帯（卓越風方向）は使っていない（ハードコード「西岸」「東岸」のみ）
- ITCZ や海流の月別動態は反映していない（年平均的な静的判定）
- Pasta `Bioclimate System` (系統 2) は出していない（系統 1 Köppen のみ）

## 再生成

```bash
npx tsx scripts/generate_climate_reference.mts
```
