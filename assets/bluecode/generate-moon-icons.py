"""BlueCode's striped moon, as SVG sources for every icon size.

Writes, next to this file:
  bluecode-prod.svg / bluecode-dev.svg              the full icon: prod on midnight, dev on blueprint
  bluecode-prod-small.svg / bluecode-dev-small.svg  32px and under: a larger moon, three thick bands,
                                                    no stars, since five thin bands blur together there

Then run generate-desktop-icons.py to render the PNG and ICO files.
"""
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
S = 1024; r = 236; a = r * 1.18; c = a * (1 - 0.62)
TILE = (f"M{a:.1f} 0H{S-a:.1f}C{S-c:.1f} 0 {S} {c:.1f} {S} {a:.1f}V{S-a:.1f}C{S} {S-c:.1f} {S-c:.1f} {S} {S-a:.1f} {S}"
        f"H{a:.1f}C{c:.1f} {S} 0 {S-c:.1f} 0 {S-a:.1f}V{a:.1f}C0 {c:.1f} {c:.1f} 0 {a:.1f} 0Z")


def stops(items):
    return "".join(f'<stop offset="{o}" stop-color="{col}" stop-opacity="{op}"/>' for o, col, op in items)


def bands(top, bottom, count, first, last):
    """Gaps cut across the moon's lower half, thickening and spreading toward the bottom."""
    out = []
    for i in range(count):
        t = i / max(1, count - 1)
        out.append((top + (bottom - top) * t ** 0.85, first + (last - first) * t))
    return out


def moon(cx, cy, R, gaps, colours):
    cuts = "".join(f'<rect y="{y:.1f}" width="1024" height="{h:.1f}"/>' for y, h in gaps)
    return (f'<linearGradient id="moon" gradientUnits="userSpaceOnUse" x1="0" y1="{cy-R}" x2="0" y2="{cy+R}">{stops(colours)}</linearGradient>'
            f'<mask id="cuts" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><g fill="#000">{cuts}</g></mask>',
            f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#moon)" mask="url(#cuts)"/>')


def glow(cx, cy, R, colour, opacity):
    return (f'<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{R*1.7}">{stops([(.55, colour, opacity), (1, colour, 0)])}</radialGradient>',
            '<rect width="1024" height="1024" fill="url(#glow)"/>')


def svg(background, parts, rim=True):
    defs = "".join(d for d, _ in parts)
    body = "".join(b for _, b in parts)
    rim_defs = rim_body = ""
    if rim:
        rim_defs = f'<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">{stops([(0, "#fff", .35), (.2, "#fff", 0), (.86, "#fff", 0), (1, "#fff", .08)])}</linearGradient>'
        rim_body = '<path d="{TILE}" fill="none" stroke="url(#rim)" stroke-width="10" clip-path="url(#tile)"/>'.replace("{TILE}", TILE)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><clipPath id="tile"><path d="{TILE}"/></clipPath>'
            f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">{stops(background)}</linearGradient>{rim_defs}{defs}</defs>'
            f'<path d="{TILE}" fill="url(#bg)"/><g clip-path="url(#tile)">{body}</g>{rim_body}</svg>')


def stars(points, colour):
    return ("", "".join(f'<circle cx="{x}" cy="{y}" r="{s}" fill="{colour}" fill-opacity=".8"/>' for x, y, s in points))


NIGHT = [(0, "#040A22", 1), (.65, "#0C1B5A", 1), (1, "#1B2F8A", 1)]
NIGHT_MOON = [(0, "#FFFFFF", 1), (.45, "#BFD4FF", 1), (1, "#3D6BFF", 1)]
BLUEPRINT = [(0, "#2A6BF2", 1), (.6, "#1B4FCC", 1), (1, "#123A9E", 1)]
BLUEPRINT_MOON = [(0, "#FFFFFF", 1), (.55, "#E4EEFF", 1), (1, "#9DBBFF", 1)]
STARS = [(180, 180, 5), (300, 110, 3), (860, 160, 4), (900, 300, 3), (140, 380, 3), (760, 90, 3)]

CX, CY, R = 512, 540, 330
FULL_BANDS = bands(CY + 10, CY + 270, 5, 12, 40)
SMALL = (512, 530, 400)
SMALL_BANDS = bands(530 + 40, 530 + 290, 3, 34, 64)


def drafting():
    """Dev's blueprint marks: a grid, the moon's construction circle, centre lines and dimensions."""
    grid = "".join(f"M{x} 0V1024" for x in range(64, 1024, 64)) + "".join(f"M0 {y}H1024" for y in range(64, 1024, 64))
    w = 'stroke="#EAF2FF" fill="none"'
    return ("", f'<path d="{grid}" stroke="#D6E6FF" stroke-width="2" opacity=".14"/>'
            f'<g {w} stroke-width="3" opacity=".5">'
            f'<circle cx="{CX}" cy="{CY}" r="{R+46}" stroke-dasharray="8 14"/>'
            f'<path d="M{CX} {CY-R-90}V{CY+R+90}M{CX-R-90} {CY}H{CX+R+90}" stroke-dasharray="2 10"/>'
            f'<path d="M{CX-R-92} {CY-R}V{CY+R}M{CX-R-106} {CY-R}h28M{CX-R-106} {CY+R}h28"/></g>'
            f'<g {w} stroke-width="4" opacity=".7"><path d="M120 104v32M104 120h32M904 104v32M888 120h32"/></g>')


ICONS = {
    "prod": svg(NIGHT, [glow(CX, CY, R, "#5B8CFF", .35), stars(STARS, "#CFE0FF"), moon(CX, CY, R, FULL_BANDS, NIGHT_MOON)]),
    "dev": svg(BLUEPRINT, [glow(CX, CY, R, "#8FB4FF", .3), drafting(), moon(CX, CY, R, FULL_BANDS, BLUEPRINT_MOON)]),
    "prod-small": svg(NIGHT, [moon(*SMALL, SMALL_BANDS, NIGHT_MOON)], rim=False),
    "dev-small": svg(BLUEPRINT, [moon(*SMALL, SMALL_BANDS, BLUEPRINT_MOON)], rim=False),
}

if __name__ == "__main__":
    for name, markup in ICONS.items():
        (HERE / f"bluecode-{name}.svg").write_text(markup)
