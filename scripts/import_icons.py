# -*- coding: utf-8 -*-
"""받은 아이콘 그림을 앱에 넣는다.
아이콘은 크림색 둥근 타일 위에 그려진 한 장이다.

세 종류가 섞여 온다.
  - 알파가 있는 것: 그대로 잘라 쓰면 된다
  - 검은 배경 위에 합성된 것: 글로우 안쪽에서 잘라내고 타일 색을
    가장자리로 번지게 해야 테가 지지 않는다
  - 투명 표시용 체커보드가 픽셀로 구워진 것: 회색 격자를 지워야 한다
"""
import os
import numpy as np
from scipy import ndimage
from PIL import Image

SRC = r"C:\Users\aa\Downloads"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "icons", "tools")
SIZE = 160

# 받은 파일 이름 : 앱에서 쓸 이름
MAP = {
    "윤기 나는 핑크 물감 붓 아이콘":        "brush",
    "반짝이는 파란 펜 아이콘":              "pen",
    "반짝이는 파스텔 연필 아이콘":          "pencil",
    "하트 크레용 상자 아이콘":              "crayon",
    "윤곽선이 빛나는 토끼 페인트통 아이콘":  "fill",
    "파스텔 토끼 지우개 아이콘":            "eraser",
    "유광 파란 되돌리기 화살표 버튼":        "undo",
    "윤기 나는 핑크 오른쪽 화살표 아이콘":   "redo",
    "파스텔 글로시 휴지통 아이콘":          "trash",
    "말랑한 크림빛 기어 설정 아이콘":        "gear",
    "광택 나는 황금 자물쇠 아이콘":          "lock",
    "광택 나는 황금 별 배지 아이콘":         "star",
}


def alpha_from_black(rgb):
    """검은 배경 위에 합성된 그림에서 타일만 떼어낸다."""
    lum = rgb.mean(axis=2)

    mask = lum > 170                       # 타일의 밝은 속살
    lab, n = ndimage.label(mask)
    if n > 1:
        counts = np.bincount(lab.ravel())
        counts[0] = 0
        mask = lab == counts.argmax()
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_closing(mask, np.ones((9, 9)))
    mask = ndimage.binary_fill_holes(mask)

    # 반투명 가장자리의 RGB가 검정이면 테가 진다. 안쪽 색을 밖으로 번지게 한다.
    safe = ndimage.binary_erosion(mask, iterations=3)
    _, (iy, ix) = ndimage.distance_transform_edt(~safe, return_indices=True)
    bled = rgb[iy, ix]

    alpha = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), 0.7) * 1.4, 0, 1)
    return bled, (alpha * 255).astype(np.uint8)


def alpha_from_checker(rgb):
    """투명 표시용 회색 체커보드가 그림에 구워져 들어온 경우.
    테두리에서 번져 나가며 '무채색이고 적당히 밝은' 픽셀만 지운다.
    타일은 크림색이라 무채색 판정에 걸리지 않으므로 거기서 멈춘다."""
    hi = rgb.max(axis=2).astype(np.int16)
    lo = rgb.min(axis=2).astype(np.int16)
    lum = rgb.mean(axis=2)
    grayish = (hi - lo <= 8) & (lum >= 105) & (lum <= 228)

    # 테두리와 이어진 것만 배경이다
    seeds = np.zeros(grayish.shape, bool)
    seeds[0, :] = seeds[-1, :] = seeds[:, 0] = seeds[:, -1] = True
    lab, _ = ndimage.label(grayish)
    bg_labels = set(np.unique(lab[seeds & grayish]))
    bg_labels.discard(0)
    bg = np.isin(lab, list(bg_labels))

    mask = ~bg
    mask = ndimage.binary_closing(mask, np.ones((7, 7)))
    mask = ndimage.binary_fill_holes(mask)
    mask = ndimage.binary_opening(mask, np.ones((5, 5)))

    lab2, n2 = ndimage.label(mask)
    if n2 > 1:
        counts = np.bincount(lab2.ravel())
        counts[0] = 0
        mask = lab2 == counts.argmax()
    mask = ndimage.binary_fill_holes(mask)

    safe = ndimage.binary_erosion(mask, iterations=3)
    _, (iy, ix) = ndimage.distance_transform_edt(~safe, return_indices=True)
    bled = rgb[iy, ix]

    alpha = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), 0.8) * 1.4, 0, 1)
    return bled, (alpha * 255).astype(np.uint8)


def looks_like_checker(rgb):
    """테두리가 회색 격자인가?"""
    edge = np.concatenate([rgb[:6].reshape(-1, 3), rgb[-6:].reshape(-1, 3),
                           rgb[:, :6].reshape(-1, 3), rgb[:, -6:].reshape(-1, 3)])
    hi = edge.max(axis=1).astype(np.int16)
    lo = edge.min(axis=1).astype(np.int16)
    lum = edge.mean(axis=1)
    gray = (hi - lo <= 8).mean()
    return gray > 0.9 and lum.mean() > 90 and lum.std() > 10


def square(im, size):
    a = np.asarray(im)
    ys, xs = np.where(a[..., 3] > 20)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for src_name, out_name in MAP.items():
        path = os.path.join(SRC, src_name + ".png")
        if not os.path.exists(path):
            print(f"{out_name:8s} 건너뜀 (원본 없음)")
            continue

        im = Image.open(path)
        rgba = np.asarray(im.convert("RGBA"))

        if im.mode == "RGBA" and rgba[..., 3].min() < 250:
            icon = Image.fromarray(rgba, "RGBA")          # 이미 투명하다
        else:
            rgb = np.asarray(im.convert("RGB"))
            how = alpha_from_checker if looks_like_checker(rgb) else alpha_from_black
            bled, alpha = how(rgb)
            icon = Image.fromarray(np.dstack([bled, alpha]), "RGBA")

        dst = os.path.join(OUT, out_name + ".png")
        square(icon, SIZE).save(dst, optimize=True)
        print(f"{out_name:8s} <- {src_name[:24]:26s} {os.path.getsize(dst)//1024:>3d}KB")


if __name__ == "__main__":
    main()
