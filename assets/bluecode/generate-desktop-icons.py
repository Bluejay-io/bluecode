"""Desktop and web icon sets for BlueCode, rendered from the SVGs generate-moon-icons.py writes.

Writes, next to this file:
  macos-1024.png / dev-macos-1024.png          824px tile in the macOS icon safe area on a 1024 canvas
  universal-1024.png / dev-universal-1024.png  full-bleed tile (Linux)
  windows.ico / dev-windows.ico                16-256px; 16-32px use the -small SVG
And the web icons scripts/lib/brand-assets.ts points at: prod art in assets/prod and
assets/nightly (BlueCode ships one channel), dev art in assets/dev and apps/web/public.

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


def ico(images, path, sizes=ICO_SIZES):
    # PNG-compressed entries, the layout Windows Vista+ reads for every size.
    entries = []
    for size in sizes:
        buf = io.BytesIO(); images[size].save(buf, "PNG"); entries.append((size, buf.getvalue()))
    header = bytearray(b"\0\0\1\0" + len(entries).to_bytes(2, "little"))
    offset = 6 + 16 * len(entries)
    for size, data in entries:
        dim = 0 if size >= 256 else size
        header += bytes([dim, dim, 0, 0]) + (1).to_bytes(2, "little") + (32).to_bytes(2, "little")
        header += len(data).to_bytes(4, "little") + offset.to_bytes(4, "little")
        offset += len(data)
    path.write_bytes(bytes(header) + b"".join(data for _, data in entries))


WEB_TARGETS = {
    "prod": [(HERE.parent / "prod", "t3-black-web-", "apple-touch-180"), (HERE.parent / "nightly", "nightly-web-", "apple-touch-180")],
    "dev": [(HERE.parent / "dev", "blueprint-web-", "apple-touch-180"), (HERE.parents[1] / "apps/web/public", "", "apple-touch-icon")],
}
FAVICON_SIZES = [16, 32, 48]


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
            small_markup = (HERE / f"bluecode-{variant}-small.svg").read_text()
            simple = render(page(small_markup, 512, 0, 512), 512, work)
            images = {
                size: (simple if size in SMALL_SIZES else universal).resize((size, size), Image.LANCZOS)
                for size in sorted(set(ICO_SIZES + FAVICON_SIZES + [180, 192, 512]))
            }
            ico(images, HERE / f"{prefix}windows.ico")
            for directory, stem, apple_touch in WEB_TARGETS[variant]:
                ico(images, directory / f"{stem}favicon.ico", FAVICON_SIZES)
                for size in (16, 32):
                    images[size].save(directory / f"{stem}favicon-{size}x{size}.png", optimize=True)
                images[180].save(directory / f"{stem}{apple_touch}.png", optimize=True)
                for size in (192, 512):
                    images[size].save(directory / f"{stem}icon-{size}x{size}.png", optimize=True)


if __name__ == "__main__":
    main()
