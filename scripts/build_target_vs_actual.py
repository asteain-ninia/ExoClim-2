"""目標状態（Pasta お手本をアプリ配色に変換した画像）と
現状（アプリの実出力）を並べて比較する画像を生成する。
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont


def find_font(size: int):
    for p in [r"C:\Windows\Fonts\YuGothB.ttc", r"C:\Windows\Fonts\meiryob.ttc",
              r"C:\Windows\Fonts\msgothic.ttc"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def main() -> None:
    target = Image.open(os.path.join("docs", "reference", "仮想大陸_アプリ配色.png")).convert("RGB")
    actual = Image.open(os.path.join("docs", "reference", "app_actual_climate.png")).convert("RGB")

    # 高さを揃える (短い方に合わせる)
    H = min(target.height, actual.height)
    target_r = target.resize((int(target.width * H / target.height), H), Image.LANCZOS)
    actual_r = actual.resize((int(actual.width * H / actual.height), H), Image.LANCZOS)

    title_h = 70
    out_w = target_r.width + actual_r.width + 30
    out_h = H + title_h
    out = Image.new("RGB", (out_w, out_h), (245, 246, 250))
    out.paste(target_r, (10, title_h))
    out.paste(actual_r, (target_r.width + 20, title_h))

    draw = ImageDraw.Draw(out)
    f_title = find_font(28)
    f_sub = find_font(18)

    draw.text((10, 8), "目標 (Pasta お手本 → アプリ配色変換)", fill=(20, 30, 60), font=f_title)
    draw.text((10, 42), "= こうあるべき姿", fill=(80, 80, 100), font=f_sub)

    actual_x = target_r.width + 20
    draw.text((actual_x, 8), "現状 (アプリ実出力)", fill=(120, 30, 30), font=f_title)
    draw.text((actual_x, 42), "= 5th eval 51/70 時点", fill=(80, 80, 100), font=f_sub)

    out_path = os.path.join("docs", "reference", "目標vs現状.png")
    out.save(out_path, "PNG")
    print(f"Saved: {out_path}  size={out.size}")


if __name__ == "__main__":
    main()
