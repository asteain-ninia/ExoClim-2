"""仮想大陸清書版.png のクライメートゾーン色を、ExoClim-2 アプリ配色に機械変換する。

事前に K-means で抽出した代表色（_pasta_clusters_labeled.png で目視確認）と
凡例ラベルの対応関係をハードコードし、各画素を最近傍クラスタへ割り当てて
対応するアプリ色へ置換する。背景・テキスト・矢印に該当するクラスタは保持する。

出力:
- docs/reference/仮想大陸_アプリ配色.png       (recolored only)
- docs/reference/仮想大陸_対比.png              (original | recolored 並列)
"""
from __future__ import annotations
import os
from PIL import Image
import numpy as np


# K-means で抽出した代表色 (_pasta_clusters_labeled.png で目視確認)
# (cluster_id, RGB, role, replacement)
#   role: 'zone' = 気候帯 / 'meta' = 背景・矢印・テキスト等 (置換せず)
#   replacement: zone の場合のみアプリ配色 RGB
CLUSTER_MAP: list[tuple[int, tuple[int, int, int], str, tuple[int, int, int] | None]] = [
    (0,  (40, 128, 249),  'Df',  (56, 200, 200)),    # Pasta Df (light blue) -> app Dfb
    (1,  (10, 52, 44),    'Cfb', (100, 255, 80)),    # Pasta Cfb (dark teal) -> app Cfb
    (2,  (54, 19, 189),   'Dw',  (90, 120, 220)),    # Pasta Dw (purple-blue) -> app Dwb
    (3,  (250, 148, 158), 'Aw',  (70, 169, 250)),    # Pasta Aw (pink) -> app Aw
    (4,  (249, 31, 67),   'Af',  (0, 0, 254)),       # Pasta Af (red) -> app Af
    (5,  (253, 145, 12),  'BW',  (255, 0, 0)),       # Pasta BW (orange) -> app BWh
    (6,  (171, 59, 236),  'ET',  (178, 178, 178)),   # Pasta ET (magenta) -> app ET
    (7,  (136, 214, 94),  'Cfa', (200, 255, 80)),    # Pasta Cfa (light green) -> app Cfa
    (8,  (253, 211, 35),  'BS',  (245, 165, 0)),     # Pasta BS (yellow) -> app BSh
    (9,  (217, 233, 241), '_bg_edge', None),         # 背景アンチエイリアス
    (10, (164, 182, 208), '_bg_edge', None),         # 背景アンチエイリアス2
    (11, (91, 113, 132),  '_text_edge', None),       # テキスト/枠縁
    (12, (6, 75, 225),    'EF',  (102, 102, 102)),   # Pasta EF (deep blue) -> app EF
    (13, (159, 77, 99),   'Cs',  (255, 255, 0)),     # Pasta Cs (burgundy) -> app Csa
    (14, (52, 164, 47),   'Cw',  (150, 255, 150)),   # Pasta Cw (mid green) -> app Cwa
    (15, (168, 209, 45),  'Cw',  (150, 255, 150)),   # Pasta Cw (yellow-green) -> app Cwa
    (16, (250, 205, 17),  'BS',  (245, 165, 0)),     # Pasta BS (yellow2 sub) -> app BSh
    (17, (166, 107, 20),  '_text_edge', None),       # 縁の褐色
]


def main() -> None:
    src_path = os.path.join("docs", "reference", "仮想大陸清書版.png")
    dst_recolor = os.path.join("docs", "reference", "仮想大陸_アプリ配色.png")
    dst_compare = os.path.join("docs", "reference", "仮想大陸_対比.png")

    img = Image.open(src_path).convert("RGB")
    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape
    flat = arr.reshape(-1, 3)

    cents = np.array([c[1] for c in CLUSTER_MAP], dtype=np.float32)  # (K, 3)
    K = len(cents)

    # 各画素の最近傍クラスタ
    d2 = ((flat[:, None, :] - cents[None, :, :]) ** 2).sum(axis=2)
    assign = np.argmin(d2, axis=1)

    # 置換テーブル
    replace_rgb = np.zeros((K, 3), dtype=np.float32)
    is_zone = np.zeros(K, dtype=bool)
    for k, (_, _, role, repl) in enumerate(CLUSTER_MAP):
        if repl is not None:
            is_zone[k] = True
            replace_rgb[k] = repl

    out_flat = flat.copy()
    zone_mask = is_zone[assign]
    out_flat[zone_mask] = replace_rgb[assign[zone_mask]]

    out_arr = out_flat.reshape(h, w, 3).astype(np.uint8)
    Image.fromarray(out_arr, "RGB").save(dst_recolor, "PNG")

    # 対比画像 (左: 原画像、右: アプリ配色)
    compare = np.concatenate([np.array(img), out_arr], axis=1)
    Image.fromarray(compare, "RGB").save(dst_compare, "PNG")

    # ログ
    print(f"Saved: {dst_recolor}")
    print(f"Saved: {dst_compare}  size={compare.shape[1]}x{compare.shape[0]}")
    print("\nZone replacement summary:")
    for k, (_, rgb, role, repl) in enumerate(CLUSTER_MAP):
        if repl is None:
            continue
        n = int((assign == k).sum())
        print(f"  {role:>4}  Pasta rgb({rgb[0]:>3},{rgb[1]:>3},{rgb[2]:>3}) -> "
              f"app rgb({repl[0]:>3},{repl[1]:>3},{repl[2]:>3})  {n:>7} px")


if __name__ == "__main__":
    main()
