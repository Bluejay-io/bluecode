import math, random
S=1024; r=236; a=r*1.18; c=a*(1-0.62)
TILE=(f"M{a:.1f} 0H{S-a:.1f}C{S-c:.1f} 0 {S} {c:.1f} {S} {a:.1f}V{S-a:.1f}C{S} {S-c:.1f} {S-c:.1f} {S} {S-a:.1f} {S}"
      f"H{a:.1f}C{c:.1f} {S} 0 {S-c:.1f} 0 {S-a:.1f}V{a:.1f}C0 {c:.1f} {c:.1f} 0 {a:.1f} 0Z")
BAYER=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21]
CELL=16; N=S//CELL
def thr(r,c): return (BAYER[(r%8)*8+c%8]+.5)/64
def cellpath(r,c,inset=2): return f'M{c*CELL+inset} {r*CELL+inset}h{CELL-2*inset}v{CELL-2*inset}h-{CELL-2*inset}z'
def norm(v): l=math.sqrt(sum(x*x for x in v)); return tuple(x/l for x in v)

def shade(cx,cy,R,L,earth):
    """Per-cell intensity on the disc; earth is the faint fill on the unlit side."""
    out={}
    for r in range(N):
        for c in range(N):
            x=c*CELL+CELL/2; y=r*CELL+CELL/2
            dx=(x-cx)/R; dy=(y-cy)/R; d2=dx*dx+dy*dy
            if d2>1: continue
            nz=math.sqrt(1-d2); I=max(0.0,dx*L[0]+dy*L[1]+nz*L[2])
            out[(r,c)]=max(I, earth*(0.55+0.45*nz))
    return out

def centered(R,L,earth):
    """Place the disc so its brightness centroid sits at the tile centre."""
    cx=cy=512.0
    for _ in range(4):
        cells=shade(cx,cy,R,L,earth); w=sx=sy=0
        for (r,c),I in cells.items():
            w+=I; sx+=I*(c*CELL+CELL/2); sy+=I*(r*CELL+CELL/2)
        cx+=512-sx/w; cy+=512-sy/w
    # snap to the cell grid so the dither stays symmetric
    return round(cx/CELL*2)/2*CELL, round(cy/CELL*2)/2*CELL

def dither_layers(cells, tones):
    """tones: list of (min_intensity_scale, colour, opacity) from dim to bright."""
    layers=[[] for _ in tones]
    for (r,c),I in cells.items():
        t=thr(r,c); pick=-1
        for i,(lo,scale,_col,_op) in enumerate(tones):
            if (I-lo)*scale>t: pick=i
        if pick>=0: layers[pick].append(cellpath(r,c))
    return ''.join(f'<path fill="{col}" fill-opacity="{op}" d="{"".join(l)}"/>' for l,(_,_,col,op) in zip(layers,tones) if l)

def rim_defs(p):
    return (f'<clipPath id="{p}c"><path d="{TILE}"/></clipPath>'
            f'<linearGradient id="{p}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".2" stop-color="#fff" stop-opacity="0"/><stop offset=".86" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>')
def rim(p): return f'<path d="{TILE}" fill="none" stroke="url(#{p}rim)" stroke-width="10" clip-path="url(#{p}c)"/>'
def svg(defs,body): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>{defs}</defs>{body}</svg>'

R=318
# ---- PROD: midnight, near-full moon
L=norm((0.42,-0.5,0.76)); cx,cy=centered(R,L,0.10)
cells=shade(cx,cy,R,L,0.10)
STAR_CELLS=[(9,12),(6,30),(15,8),(4,52),(13,44),(22,57),(3,20),(10,58),(27,6),(40,4),(50,59),(44,61),(57,10),(34,2),(19,62)]
SPARKLES=[(8,47),(31,58)]
def starfield(cx,cy,R):
    clear=lambda r,c: math.hypot(c*CELL+8-cx,r*CELL+8-cy)>R+40
    dim=''.join(cellpath(r,c,4) for r,c in STAR_CELLS[::2] if clear(r,c))
    bright=''.join(cellpath(r,c,3) for r,c in STAR_CELLS[1::2] if clear(r,c))
    spark=''.join(cellpath(r+dr,c+dc,3) for r,c in SPARKLES if clear(r,c) for dr,dc in [(0,0),(-1,0),(1,0),(0,-1),(0,1)])
    return (f'<path fill="#9DB8FF" fill-opacity=".45" d="{dim}"/><path fill="#CFDDFF" fill-opacity=".8" d="{bright}"/>'
            f'<path fill="#E6EEFF" fill-opacity=".9" d="{spark}"/>')
prod=svg(rim_defs('p')+
  '<linearGradient id="pbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111D44"/><stop offset="1" stop-color="#040714"/></linearGradient>'
  f'<radialGradient id="phalo" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{R*1.5}"><stop offset=".62" stop-color="#2F6BFF" stop-opacity=".22"/><stop offset="1" stop-color="#2F6BFF" stop-opacity="0"/></radialGradient>',
  f'<path d="{TILE}" fill="url(#pbg)"/><rect width="1024" height="1024" fill="url(#phalo)" clip-path="url(#pc)"/>' + f'<g clip-path="url(#pc)">{starfield(cx,cy,R)}</g>'
  + dither_layers(cells,[(0,1.0,'#1E3F9A',1),(0.18,1.25,'#3E78FF',1),(0.62,2.6,'#DCE8FF',1)]) + rim('p'))

# ---- DEV: blueprint drafting of the moon
L=norm((0.42,-0.5,0.76)); dcx,dcy=512.0,512.0  # the guides show the whole circle, so centre it geometrically
cells=shade(dcx,dcy,R,L,0.10)
grid=''.join(f'M{x} 0V1024' for x in range(64,1024,64))+''.join(f'M0 {y}H1024' for y in range(64,1024,64))
W='stroke="#EAF2FF" fill="none"'
ann=(f'<path d="{grid}" stroke="#D6E6FF" stroke-width="2" opacity=".14" clip-path="url(#dc)"/>'
  f'<g {W} stroke-width="3" opacity=".5">'
  f'<circle cx="{dcx}" cy="{dcy}" r="{R+46}" stroke-dasharray="8 14"/>'
  f'<path d="M{dcx} {dcy-R-90}V{dcy+R+90}M{dcx-R-90} {dcy}H{dcx+R+90}" stroke-dasharray="2 10"/>'
  f'<path d="M{dcx-R} {dcy+R+92}H{dcx+R}M{dcx-R} {dcy+R+78}v28M{dcx+R} {dcy+R+78}v28"/>'
  f'<path d="M{dcx-R-92} {dcy-R}V{dcy+R}M{dcx-R-106} {dcy-R}h28M{dcx-R-106} {dcy+R}h28"/>'
  '</g>'
  f'<g {W} stroke-width="4" opacity=".7"><path d="M120 104v32M104 120h32M904 104v32M888 120h32M120 888v32M104 904h32M904 888v32M888 904h32"/></g>')
dev=svg(rim_defs('d')+
  '<linearGradient id="dbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A6BF2"/><stop offset=".6" stop-color="#1B4FCC"/><stop offset="1" stop-color="#123A9E"/></linearGradient>'
  '<radialGradient id="dlift" cx=".28" cy=".2" r=".85"><stop offset="0" stop-color="#8FB4FF" stop-opacity=".30"/><stop offset="1" stop-color="#8FB4FF" stop-opacity="0"/></radialGradient>',
  f'<path d="{TILE}" fill="url(#dbg)"/><path d="{TILE}" fill="url(#dlift)"/>{ann}'
  + dither_layers(cells,[(0,1.0,'#FFFFFF',.22),(0.18,1.25,'#CFE0FF',.85),(0.62,2.6,'#FFFFFF',1)]) + rim('d'))

for name,s in [('prod',prod),('dev',dev)]:
    open(f'bluecode-{name}.svg','w').write(s)
print('prod center',(cx,cy),'dev',(dcx,dcy))
