"""仮想大陸清書版.png から実際のクライメート色パレットを抽出する。
背景・テキスト・矢印を除外し、K-means で色クラスタリング。
"""
from __future__ import annotations
import os
from PIL import Image
import numpy as np


def main() -> None:
    src_path = os.path.join("docs", "reference", "仮想大陸清書版.png")
    img = Image.open(src_path).convert("RGB")
    arr = np.array(img).astype(np.float32)
    h, w, _ = arr.shape

    # 背景 (light sky-blue) と白・黒系・グレー (テキスト/凡例背景) を除外
    flat = arr.reshape(-1, 3)
    bg = np.array([181, 220, 243], dtype=np.float32)

    # 除外マスク
    bg_d = np.linalg.norm(flat - bg, axis=1)
    is_bg = bg_d < 18
    is_white = np.all(flat > 240, axis=1)
    is_black = np.all(flat < 30, axis=1)
    is_paper = np.all(np.abs(flat - 224) < 16, axis=1)  # 凡例背景の薄灰
    is_outside = is_bg | is_white | is_black | is_paper
    candidates = flat[~is_outside]
    print(f"Candidates after exclusion: {len(candidates)} / {len(flat)}")

    # 簡易 K-means (numpy)
    K = 18
    rng = np.random.default_rng(42)
    idx = rng.choice(len(candidates), K, replace=False)
    centroids = candidates[idx].copy()
    for it in range(40):
        # assign
        d2 = ((candidates[:, None, :] - centroids[None, :, :]) ** 2).sum(axis=2)
        assign = np.argmin(d2, axis=1)
        # update
        new_cent = np.zeros_like(centroids)
        for k in range(K):
            sel = candidates[assign == k]
            if len(sel) > 0:
                new_cent[k] = sel.mean(axis=0)
            else:
                new_cent[k] = centroids[k]
        if np.allclose(new_cent, centroids, atol=0.5):
            print(f"Converged at iter {it}")
            break
        centroids = new_cent

    # 各クラスタのサイズと色を出力
    counts = np.array([(assign == k).sum() for k in range(K)])
    order = np.argsort(-counts)
    print(f"\nTop K cluster centroids (sorted by size):")
    for k in order:
        c = centroids[k].round().astype(int)
        print(f"  k={k:>2}  rgb({c[0]:>3},{c[1]:>3},{c[2]:>3})  {counts[k]:>7} px  {counts[k]/len(candidates)*100:5.2f}%")


if __name__ == "__main__":
    main()
