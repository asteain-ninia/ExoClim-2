"""K-means で抽出した代表色で画像をパレット量子化し、各クラスタの位置を可視化する。
さらに各クラスタの bbox 中心を画像上に番号付きで描画する。
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont
import numpy as np


CENTROIDS_HARDCODED = np.array([
    (40, 128, 249),    # k=2  bright blue
    (10, 52, 44),      # k=17 very dark green
    (54, 19, 189),     # k=7  dark purple-blue
    (250, 148, 158),   # k=8  pink
    (249, 31, 67),     # k=13 red
    (253, 145, 12),    # k=10 orange
    (171, 59, 236),    # k=3  magenta
    (136, 214, 94),    # k=5  light green
    (253, 211, 35),    # k=4  yellow
    (217, 233, 241),   # k=1  light edge
    (164, 182, 208),   # k=0  edge
    (91, 113, 132),    # k=11 gray
    (6, 75, 225),      # k=15 deep blue
    (159, 77, 99),     # k=16 reddish brown
    (52, 164, 47),     # k=14 dark green
    (168, 209, 45),    # k=12 yellow-green
    (250, 205, 17),    # k=6  yellow2
    (166, 107, 20),    # k=9  brown
], dtype=np.float32)


def main() -> None:
    src_path = os.path.join("docs", "reference", "仮想大陸清書版.png")
    img = Image.open(src_path).convert("RGB")
    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape
    flat = arr.reshape(-1, 3)

    # 各画素を最も近い centroid に割り当て
    K = len(CENTROIDS_HARDCODED)
    d2 = ((flat[:, None, :] - CENTROIDS_HARDCODED[None, :, :]) ** 2).sum(axis=2)
    assign = np.argmin(d2, axis=1)

    # パレット量子化画像
    quantized = CENTROIDS_HARDCODED[assign].reshape(h, w, 3).astype(np.uint8)

    # 各クラスタに固有のラベル色を持たせた可視化（番号で塗り分け）
    # わかりやすさ重視で原色 18 色を割り当て
    label_palette = np.array([
        (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255),
        (0, 255, 255), (255, 128, 0), (128, 0, 255), (0, 128, 255), (255, 0, 128),
        (128, 255, 0), (0, 255, 128), (255, 128, 128), (128, 255, 128), (128, 128, 255),
        (200, 100, 50), (50, 100, 200), (100, 50, 200),
    ], dtype=np.uint8)
    label_img = label_palette[assign].reshape(h, w, 3)

    # 番号オーバレイ
    out = Image.fromarray(quantized, "RGB").copy()
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\YuGothB.ttc", 28)
    except Exception:
        font = ImageFont.load_default()

    for k in range(K):
        ys, xs = np.where(assign.reshape(h, w) == k)
        if len(ys) < 100:
            continue
        # 重心
        cy = int(ys.mean())
        cx = int(xs.mean())
        # 数字を白縁取りで
        text = str(k)
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                draw.text((cx + dx, cy + dy), text, fill=(255, 255, 255), font=font)
        draw.text((cx, cy), text, fill=(0, 0, 0), font=font)

    out.save(os.path.join("docs", "reference", "_pasta_clusters_labeled.png"), "PNG")
    Image.fromarray(label_img, "RGB").save(os.path.join("docs", "reference", "_pasta_clusters_idmap.png"), "PNG")
    print("Saved: _pasta_clusters_labeled.png and _pasta_clusters_idmap.png")

    # 凡例
    print("\nCluster legend:")
    for k, c in enumerate(CENTROIDS_HARDCODED):
        n = (assign == k).sum()
        print(f"  k={k:>2}  rgb({int(c[0]):>3},{int(c[1]):>3},{int(c[2]):>3})  {n:>7} px")


if __name__ == "__main__":
    main()
