"""Deterministic gradient placeholder images (as inline SVG data URIs) for
procedurally generated cities and hotels. Curated cities/hotels keep their
real Unsplash photo URLs; only generated ones use this, so nothing here
depends on network access at request time.
"""

import base64
import hashlib

PALETTES = [
    ("#1d6fd3", "#138a62"),
    ("#7c3aed", "#db2777"),
    ("#ea580c", "#f59e0b"),
    ("#0891b2", "#1d6fd3"),
    ("#be123c", "#7c3aed"),
    ("#16a34a", "#0891b2"),
    ("#9333ea", "#ea580c"),
    ("#0d9488", "#7c3aed"),
]


def _pick_palette(seed_text: str):
    digest = hashlib.md5(seed_text.encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(PALETTES)
    return PALETTES[index]


def _initials(label: str) -> str:
    words = [word for word in label.split() if word]
    letters = "".join(word[0] for word in words[:2]).upper()
    return letters or "?"


def generate_placeholder(seed_text: str, label: str, width: int = 700, height: int = 500) -> str:
    color_a, color_b = _pick_palette(seed_text)
    initials = _initials(label)
    font_size = int(height * 0.26)

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
        f'<stop offset="0%" stop-color="{color_a}"/>'
        f'<stop offset="100%" stop-color="{color_b}"/>'
        f'</linearGradient></defs>'
        f'<rect width="{width}" height="{height}" fill="url(#g)"/>'
        f'<text x="50%" y="52%" font-family="Arial, sans-serif" font-size="{font_size}" '
        f'font-weight="700" fill="rgba(255,255,255,0.92)" text-anchor="middle" '
        f'dominant-baseline="middle">{initials}</text>'
        f'</svg>'
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"
