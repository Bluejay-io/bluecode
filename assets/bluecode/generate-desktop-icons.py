"""Desktop icon set for BlueCode, rendered from bluecode-{prod,dev}.svg.

Writes, next to this file:
  macos-1024.png / dev-macos-1024.png          824px tile in the macOS icon safe area on a 1024 canvas
  universal-1024.png / dev-universal-1024.png  full-bleed tile (Linux)
  windows.ico / dev-windows.ico                16-256px; 16-32px use a simplified moon, since the
                                               dither turns to mush below 48px

Run from anywhere: python3 assets/bluecode/generate-desktop-icons.py
Chromium is the only faithful SVG renderer here; set CHROME to override its path.
"""
import io, os, pathlib, subprocess, tempfile
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
CHROME = os.environ.get(
    "CHROME",
    os.path.expanduser("~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome"),
)
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
SMALL_SIZES = {16, 24, 32}
MAC_BODY = 824

# Same tile outline as generate-moon-icons.py.
S = 1024; _r = 236; _a = _r * 1.18; _c = _a * (1 - 0.62)
TILE = (f"M{_a:.1f} 0H{S-_a:.1f}C{S-_c:.1f} 0 {S} {_c:.1f} {S} {_a:.1f}V{S-_a:.1f}C{S} {S-_c:.1f} {S-_c:.1f} {S} {S-_a:.1f} {S}"
        f"H{_a:.1f}C{_c:.1f} {S} 0 {S-_c:.1f} 0 {S-_a:.1f}V{_a:.1f}C0 {_c:.1f} {_c:.1f} 0 {_a:.1f} 0Z")

# Simplified marks for small sizes: the same tile and palette, with a smooth shaded disc
# instead of the dither, made larger so it still reads at 16px.
SMALL = {
    "prod": (
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16245A"/><stop offset="1" stop-color="#050918"/></linearGradient>'
        '<radialGradient id="moon" cx=".64" cy=".3" r=".9"><stop offset="0" stop-color="#F2F6FF"/><stop offset=".42" stop-color="#C9DAFF"/><stop offset=".78" stop-color="#3E78FF"/><stop offset="1" stop-color="#1E3F9A"/></radialGradient>',
        '<circle cx="512" cy="512" r="372" fill="url(#moon)"/>',
    ),
    "dev": (
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A6BF2"/><stop offset="1" stop-color="#123A9E"/></linearGradient>'
        '<radialGradient id="moon" cx=".64" cy=".3" r=".9"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="#E4EEFF"/><stop offset=".85" stop-color="#9DBBFF"/><stop offset="1" stop-color="#7FA3F5"/></radialGradient>',
        '<circle cx="512" cy="512" r="372" fill="url(#moon)"/>',
    ),
}


def small_svg(variant):
    defs, body = SMALL[variant]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs}</defs>'
            f'<path d="{TILE}" fill="url(#bg)"/>{body}</svg>')


def render(html, size, work):
    page = work / "page.html"
    out = work / "shot.png"
    page.write_text(html)
    subprocess.run(
        [CHROME, "--headless", "--no-sandbox", "--hide-scrollbars",
         "--default-background-color=00000000", f"--window-size={size},{size}",
         f"--screenshot={out}", page.as_uri()],
        check=True, capture_output=True,
    )
    return Image.open(out).convert("RGBA").crop((0, 0, size, size))


def page(svg_markup, box, offset, canvas, shadow=""):
    style = f"position:absolute;left:{offset}px;top:{offset}px;width:{box}px;height:{box}px;{shadow}"
    sized = svg_markup.replace("<svg ", '<svg width="100%" height="100%" ', 1)
    return (f'<!doctype html><html><body style="margin:0;background:transparent;width:{canvas}px;height:{canvas}px">'
            f'<div style="{style}">{sized}</div></body></html>')


def ico(images, path):
    # PNG-compressed entries, the layout Windows Vista+ reads for every size.
    entries = []
    for size in ICO_SIZES:
        buf = io.BytesIO(); images[size].save(buf, "PNG"); entries.append((size, buf.getvalue()))
    header = bytearray(b"\0\0\1\0" + len(entries).to_bytes(2, "little"))
    offset = 6 + 16 * len(entries)
    for size, data in entries:
        dim = 0 if size >= 256 else size
        header += bytes([dim, dim, 0, 0]) + (1).to_bytes(2, "little") + (32).to_bytes(2, "little")
        header += len(data).to_bytes(4, "little") + offset.to_bytes(4, "little")
        offset += len(data)
    path.write_bytes(bytes(header) + b"".join(data for _, data in entries))


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        for variant, prefix in [("prod", ""), ("dev", "dev-")]:
            svg_markup = (HERE / f"bluecode-{variant}.svg").read_text()
            universal = render(page(svg_markup, 1024, 0, 1024), 1024, work)
            universal.save(HERE / f"{prefix}universal-1024.png", optimize=True)
            inset = (1024 - MAC_BODY) // 2
            shadow = "filter:drop-shadow(0 10px 14px rgba(0,0,0,.28));"
            render(page(svg_markup, MAC_BODY, inset, 1024, shadow), 1024, work).save(
                HERE / f"{prefix}macos-1024.png", optimize=True)
            simple = render(page(small_svg(variant), 512, 0, 512), 512, work)
            images = {
                size: (simple if size in SMALL_SIZES else universal).resize((size, size), Image.LANCZOS)
                for size in ICO_SIZES
            }
            ico(images, HERE / f"{prefix}windows.ico")


if __name__ == "__main__":
    main()
