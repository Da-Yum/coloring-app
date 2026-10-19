# -*- coding: utf-8 -*-
"""새 도안을 2048x2048 흑백으로 맞춰 앱에 넣는다 (명세서 14장 규격)."""
import os, io, json
import numpy as np
from PIL import Image

SRC = r"C:\Users\aa\.codex\generated_images\01a088cd-07af-7771-8e9f-4564f1f93274"
APP = r"C:\Users\aa\Desktop\ColoringApp"
DRAW = os.path.join(APP, "assets", "drawings")
SIZE = 2048
THUMB = 320
THRESHOLD = 160   # 이보다 어두우면 선. 회색 섞인 가장자리를 깔끔히 정리한다.

# (들어온 파일 조각, 파일이름, UI 제목, 8색 팔레트)
ITEMS = [
    ("2d6215e2", "bookping", "책 친구", [
        "#8FD0F0", "#F7D774", "#F2A6C0", "#B9E3B0", "#D6C3F0", "#F7C8A0", "#FFFFFF", "#4A3B32"]),
    ("f32bab5d", "cameraping", "사진 친구", [
        "#9BE0D8", "#F7B8A0", "#F7E08A", "#C3D9F7", "#F2A6C0", "#BFE3A8", "#FFFFFF", "#44524F"]),
    ("4457ca6e", "musicping", "노래 친구", [
        "#C9B8E8", "#F7A8C8", "#F7D774", "#A8D8F0", "#B9E3B0", "#F7C0A8", "#FFFFFF", "#453A55"]),
    ("38fc5cf4", "bear",      "곰돌이", [
        "#F7E3C8", "#E8C49A", "#C98F62", "#F2A6B8", "#A8D4E8", "#F7D774", "#FFFFFF", "#4A3B32"]),
    ("13f3286f", "kitty",     "고양이", [
        "#F2EDE6", "#C9C2BA", "#8A8078", "#F2A6B8", "#A8D4E8", "#F7D774", "#FFFFFF", "#403A36"]),
    ("cefe5f21", "bunny",     "토끼", [
        "#FFFFFF", "#F7DDE3", "#F2A6C0", "#D6C3F0", "#A8D4E8", "#F7D774", "#F7F0E6", "#453A3F"]),
]

def find(frag):
    for f in os.listdir(SRC):
        if frag in f:
            return os.path.join(SRC, f)
    raise FileNotFoundError(frag)

def convert(path):
    """2048로 올리고 순수 흑백으로 만든다. 선이 끊기지 않게 임계값만 쓴다."""
    im = Image.open(path).convert("L").resize((SIZE, SIZE), Image.LANCZOS)
    a = np.asarray(im)
    bw = np.where(a < THRESHOLD, 0, 255).astype(np.uint8)
    return Image.fromarray(bw, mode="L")

def regions(img):
    """선이 아닌 픽셀을 묶어 영역 수와 큰 영역 둘을 돌려준다 (누수 확인용)."""
    bw = (np.asarray(img) < 128).astype(np.uint8)
    H, W = bw.shape
    lab = np.zeros(H * W, np.int32)
    fl = bw.reshape(-1)
    stack = np.empty(H * W, np.int64)
    sizes = []
    nxt = 0
    for seed in range(H * W):
        if fl[seed] or lab[seed]:
            continue
        nxt += 1
        top = 0
        stack[top] = seed; top += 1; lab[seed] = nxt
        cnt = 0
        while top:
            top -= 1
            i = stack[top]; cnt += 1
            x = i % W
            for j, ok in ((i-1, x > 0), (i+1, x < W-1), (i-W, i >= W), (i+W, i < H*W-W)):
                if ok and not fl[j] and not lab[j]:
                    lab[j] = nxt; stack[top] = j; top += 1
        sizes.append(cnt)
    sizes.sort(reverse=True)
    return nxt, sizes

entries = []
for frag, name, title, palette in ITEMS:
    img = convert(find(frag))
    out = os.path.join(DRAW, name + ".png")
    img.save(out, optimize=True)
    img.resize((THUMB, THUMB), Image.LANCZOS).save(
        os.path.join(DRAW, name + "_thumb.png"), optimize=True)

    n, sizes = regions(img)
    kb = os.path.getsize(out) // 1024
    print(f"{name:12s} {title:8s} 영역 {n:3d}개  배경 {sizes[0]:>9,}  2위 {sizes[1]:>9,}  {kb:>4d}KB")

    entries.append({
        "id": name,
        "title": title,
        "lineart": f"assets/drawings/{name}.png",
        "thumbnail": f"assets/drawings/{name}_thumb.png",
        "cost": 0,
        "palette": palette,
    })

with io.open(os.path.join(APP, "data", "new_entries.json"), "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)
print("\n항목 %d개 준비" % len(entries))
