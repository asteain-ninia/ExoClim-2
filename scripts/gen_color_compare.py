"""Köppen 色対応比較画像を生成。
Pasta 清書版と ExoClim-2 アプリ実装の Köppen 区分色を 1 枚の表として可視化する。
出力: docs/reference/color_compare.png
"""
from PIL import Image, ImageDraw, ImageFont
import os


# Pasta 清書版（仮想大陸清書版.png 凡例から目視推定した RGB）
# 1 文字記号（Pasta 凡例は粗い分類）
PASTA = [
    ("Af",  (50, 30, 160),   "熱帯雨林"),
    ("Am",  (40, 90, 230),   "熱帯モンスーン"),
    ("Aw",  (100, 190, 250), "熱帯サバナ"),
    ("BW",  (220, 40, 40),   "砂漠"),
    ("BS",  (240, 140, 40),  "ステップ"),
    ("Cs",  (255, 230, 80),  "地中海性"),
    ("Cw",  (180, 220, 100), "温暖冬季少雨"),
    ("Cfa", (80, 200, 80),   "温暖湿潤"),
    ("Cfb", (60, 180, 180),  "西岸海洋性"),
    ("Df",  (180, 170, 255), "冷帯湿潤"),
    ("Dw",  (140, 120, 220), "冷帯冬季少雨"),
    ("Dfc", (100, 80, 180),  "亜寒帯湿潤"),
    ("Dwc", (80, 60, 160),   "亜寒帯冬季少雨"),
    ("ET",  (190, 190, 195), "ツンドラ"),
    ("EF",  (110, 110, 115), "氷雪"),
]

# アプリ実装 (src/ui/map/ColorLegend.tsx より)
APP = {
    "Af":  (0, 0, 254),
    "Am":  (0, 119, 255),
    "Aw":  (70, 169, 250),
    "BWh": (255, 0, 0),
    "BWk": (255, 150, 150),
    "BSh": (245, 165, 0),
    "BSk": (255, 220, 100),
    "Csa": (255, 255, 0),
    "Csb": (198, 199, 0),
    "Cwa": (150, 255, 150),
    "Cwb": (100, 200, 100),
    "Cfa": (200, 255, 80),
    "Cfb": (100, 255, 80),
    "Dwa": (170, 175, 255),
    "Dwb": (90, 120, 220),
    "Dwc": (75, 80, 180),
    "Dfa": (0, 255, 255),
    "Dfb": (56, 200, 200),
    "Dfc": (0, 125, 125),
    "ET":  (178, 178, 178),
    "EF":  (102, 102, 102),
}

# 各 Pasta 区分にどのアプリコードが対応するか
APP_MAP = {
    "Af":  ["Af"],
    "Am":  ["Am"],
    "Aw":  ["Aw"],
    "BW":  ["BWh", "BWk"],
    "BS":  ["BSh", "BSk"],
    "Cs":  ["Csa", "Csb"],
    "Cw":  ["Cwa", "Cwb"],
    "Cfa": ["Cfa"],
    "Cfb": ["Cfb"],
    "Df":  ["Dfa", "Dfb"],
    "Dw":  ["Dwa", "Dwb"],
    "Dfc": ["Dfc"],
    "Dwc": ["Dwc"],
    "ET":  ["ET"],
    "EF":  ["EF"],
}

# 「色相が大きく違うか」の所感
EVAL = {
    "Af":  ("ほぼ一致",      "OK"),
    "Am":  ("ほぼ一致",      "OK"),
    "Aw":  ("ほぼ一致",      "OK"),
    "BW":  ("BWk(ピンク)が分離", "△"),
    "BS":  ("BSk(薄黄)はCs寄り", "△"),
    "Cs":  ("Csb(暗黄)はCwとも紛らわしい", "△"),
    "Cw":  ("ほぼ一致",      "OK"),
    "Cfa": ("Pasta=純緑 vs アプリ=黄緑(より黄)", "△"),
    "Cfb": ("【決定的に違う】Pasta=ティール vs アプリ=ライム緑", "✗"),
    "Df":  ("Pasta=薄紫 vs アプリ=シアン(Dfa/Dfb)", "✗"),
    "Dw":  ("ほぼ一致(紫系)", "OK"),
    "Dfc": ("Pasta=濃紫青 vs アプリ=暗ティール", "✗"),
    "Dwc": ("ほぼ一致(暗紫)", "OK"),
    "ET":  ("ほぼ一致",      "OK"),
    "EF":  ("ほぼ一致",      "OK"),
}


def find_font(size):
    candidates = [
        r"C:\Windows\Fonts\YuGothM.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\msgothic.ttc",
        r"C:\Windows\Fonts\YuGothR.ttc",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def main():
    rows = len(PASTA)
    row_h = 56
    header_h = 56
    cols = [
        ("Pasta区分", 110),
        ("Pasta色",  90),
        ("意味",     180),
        ("アプリ対応コード", 200),
        ("アプリ色（並べて）", 320),
        ("評価", 60),
        ("差異の所感", 460),
    ]
    width = sum(w for _, w in cols) + 20
    height = header_h + rows * row_h + 200

    img = Image.new("RGB", (width, height), (245, 245, 248))
    draw = ImageDraw.Draw(img)

    f_title = find_font(22)
    f_head = find_font(16)
    f_body = find_font(15)
    f_small = find_font(13)

    # タイトル
    draw.text((12, 8), "Köppen 色対応比較: Pasta 清書版 vs ExoClim-2 アプリ実装",
              fill=(20, 20, 30), font=f_title)
    draw.text((12, 36), "（凡例の RGB は Pasta=画像目視推定 / アプリ=ColorLegend.tsx 実値）",
              fill=(80, 80, 90), font=f_small)

    # ヘッダ
    y = header_h + 16
    x = 10
    for name, w in cols:
        draw.rectangle([x, y, x + w, y + 30], fill=(60, 70, 90))
        draw.text((x + 6, y + 6), name, fill=(255, 255, 255), font=f_head)
        x += w
    y += 30

    # 行
    for i, (code, rgb, jp) in enumerate(PASTA):
        bg = (255, 255, 255) if i % 2 == 0 else (235, 238, 244)
        draw.rectangle([10, y, 10 + sum(w for _, w in cols), y + row_h], fill=bg)

        x = 10
        # Col1: Pasta 記号
        draw.text((x + 8, y + 18), code, fill=(20, 20, 30), font=f_body)
        x += cols[0][1]

        # Col2: Pasta 色チップ
        draw.rectangle([x + 10, y + 8, x + cols[1][1] - 10, y + row_h - 8], fill=rgb,
                       outline=(40, 40, 40))
        x += cols[1][1]

        # Col3: 意味
        draw.text((x + 6, y + 18), jp, fill=(20, 20, 30), font=f_body)
        x += cols[2][1]

        # Col4: アプリ対応コード列
        app_codes = APP_MAP[code]
        draw.text((x + 6, y + 18), " / ".join(app_codes), fill=(20, 20, 30), font=f_body)
        x += cols[3][1]

        # Col5: アプリ色チップ（複数なら横並び）
        chip_w = (cols[4][1] - 20) // max(1, len(app_codes))
        for j, ac in enumerate(app_codes):
            cx = x + 10 + j * chip_w
            draw.rectangle([cx, y + 8, cx + chip_w - 6, y + row_h - 8], fill=APP[ac],
                           outline=(40, 40, 40))
            draw.text((cx + 4, y + row_h - 22), ac, fill=(255, 255, 255) if sum(APP[ac]) < 380 else (10, 10, 10),
                      font=f_small)
        x += cols[4][1]

        # Col6: 評価記号
        eval_text, mark = EVAL[code]
        mark_color = {"OK": (30, 120, 40), "△": (190, 130, 0), "✗": (200, 30, 30)}[mark]
        draw.text((x + 18, y + 16), mark, fill=mark_color, font=f_title)
        x += cols[5][1]

        # Col7: 差異所感
        draw.text((x + 6, y + 18), eval_text, fill=(20, 20, 30), font=f_body)

        y += row_h

    # 注記
    y += 16
    notes = [
        "★ 重要な誤読パターン：",
        "  - Pasta の Cfb（ティール / 青緑）は、アプリでは Dfb / Dfc（暗ティール / シアン）の色に近い",
        "  - したがってアプリ画像の「上部に広がるシアン〜暗ティール帯」は Cfb ではなく Dfb / Dfc（亜寒帯湿潤）",
        "  - アプリの Cfb はライム鮮緑 rgb(100,255,80) — Pasta より緑寄り。Pasta の Cfa（緑）と紛らわしい",
        "  - アプリの Df 群（Dfa / Dfb）は Pasta の Cfb と「ほぼ同じティール」になっており、混同が起きる",
    ]
    for line in notes:
        draw.text((12, y), line, fill=(40, 40, 60), font=f_body)
        y += 22

    out = os.path.join("docs", "reference", "color_compare.png")
    img.save(out, "PNG")
    print(f"Saved: {out}  size={img.size}")


if __name__ == "__main__":
    main()
