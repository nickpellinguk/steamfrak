"""
Minimal reader for the Flash (SWF) vector sprites in the GameMaker project.

GameMaker imported some sprites (e.g. the big "FRAK!" speech bubble on the title screen) as SWF
vector shapes so they stay sharp however large they are drawn. This extracts the solid fills and
lines of each placed shape as SVG-style path data (in sprite pixels), which the web version
draws with canvas Path2D. Only what Frak!'s sprites use is supported: DefineShape 1-3 with solid
fills, straight and curved edges, and PlaceObject2.
"""
import zlib, struct, sys

class Bits:
    def __init__(s, b, pos=0): s.b=b; s.pos=pos*8
    def align(s): s.pos=(s.pos+7)//8*8
    def ub(s,n):
        v=0
        for _ in range(n):
            v=(v<<1)|((s.b[s.pos>>3]>>(7-(s.pos&7)))&1); s.pos+=1
        return v
    def sb(s,n):
        v=s.ub(n)
        if n and v&(1<<(n-1)): v-=1<<n
        return v
    def byte(s): s.align(); v=s.b[s.pos>>3]; s.pos+=8; return v
    def u16(s): s.align(); v=struct.unpack('<H',s.b[s.pos//8:s.pos//8+2])[0]; s.pos+=16; return v
    def rect(s):
        s.align(); n=s.ub(5); return [s.sb(n) for _ in range(4)]
    def matrix(s):
        s.align(); sx=sy=1.0; r0=r1=0.0
        if s.ub(1): n=s.ub(5); sx=s.sb(n)/65536; sy=s.sb(n)/65536
        if s.ub(1): n=s.ub(5); r0=s.sb(n)/65536; r1=s.sb(n)/65536
        n=s.ub(5); tx=s.sb(n); ty=s.sb(n)
        return (sx,r0,r1,sy,tx,ty)
    def rgba(s): return tuple(s.byte() for _ in range(4))

def fillstyles(bs):
    n=bs.byte()
    if n==0xff: n=bs.u16()
    out=[]
    for _ in range(n):
        t=bs.byte()
        if t!=0: raise ValueError('non-solid fill %d'%t)
        out.append(bs.rgba())
    return out

def linestyles(bs):
    n=bs.byte()
    if n==0xff: n=bs.u16()
    return [(bs.u16(), bs.rgba()) for _ in range(n)]

def parse_shape(body):
    bs=Bits(body)
    sid=bs.u16(); bounds=bs.rect()
    fills=fillstyles(bs); lines=linestyles(bs)
    bs.align(); nf=bs.ub(4); nl=bs.ub(4)
    x=y=0; f0=f1=ln=0
    edges=[]  # (fillset_index, f0, f1, line, x0,y0,cx,cy,x1,y1)
    styleset=0; sets=[(fills,lines)]
    while True:
        if bs.ub(1)==0:
            flags=bs.ub(5)
            if flags==0: break
            if flags&1: n=bs.ub(5); x=bs.sb(n); y=bs.sb(n)
            if flags&2: f0=bs.ub(nf)
            if flags&4: f1=bs.ub(nf)
            if flags&8: ln=bs.ub(nl)
            if flags&16:
                sets.append((fillstyles(bs),linestyles(bs))); styleset+=1
                bs.align(); nf=bs.ub(4); nl=bs.ub(4); f0=f1=ln=0
        else:
            straight=bs.ub(1); n=bs.ub(4)+2
            if straight:
                if bs.ub(1): dx=bs.sb(n); dy=bs.sb(n)
                elif bs.ub(1): dx=0; dy=bs.sb(n)
                else: dx=bs.sb(n); dy=0
                edges.append((styleset,f0,f1,ln,x,y,None,None,x+dx,y+dy)); x+=dx; y+=dy
            else:
                cdx=bs.sb(n); cdy=bs.sb(n); adx=bs.sb(n); ady=bs.sb(n)
                cx=x+cdx; cy=y+cdy
                edges.append((styleset,f0,f1,ln,x,y,cx,cy,cx+adx,cy+ady)); x=cx+adx; y=cy+ady
    return sid,bounds,sets,edges

def to_paths(sets, edges, M):
    """Return list of (css_colour, svg_path_d) in pixel units, transformed by matrix M."""
    sx,r0,r1,sy,tx,ty=M
    def T(px,py): return ((px*sx+py*r1+tx)/20.0, (px*r0+py*sy+ty)/20.0)
    out=[]
    # fills
    for si,(fills,lines) in enumerate(sets):
        for fi,col in enumerate(fills, start=1):
            segs=[]
            for (s,f0,f1,ln,x0,y0,cx,cy,x1,y1) in edges:
                if s!=si: continue
                if f1==fi: segs.append(((x0,y0),(cx,cy) if cx is not None else None,(x1,y1)))
                if f0==fi: segs.append(((x1,y1),(cx,cy) if cx is not None else None,(x0,y0)))
            d=chain(segs,T)
            if d: out.append((col,d,'fill'))
        for li,(w,col) in enumerate(lines, start=1):
            segs=[((x0,y0),(cx,cy) if cx is not None else None,(x1,y1)) for (s,f0,f1,ln,x0,y0,cx,cy,x1,y1) in edges if s==si and ln==li]
            d=chain(segs,T,close=False)
            if d: out.append((col,d,'stroke:%g'%(w/20.0)))
    return out

def chain(segs,T,close=True):
    parts=[]; segs=list(segs)
    while segs:
        a,c,b=segs.pop(0)
        p=T(*a); cmd=['M%.3f %.3f'%p]
        def add(c,b):
            if c is None: cmd.append('L%.3f %.3f'%T(*b))
            else: cmd.append('Q%.3f %.3f %.3f %.3f'%(T(*c)+T(*b)))
        add(c,b); cur=b; start=a
        while cur!=start:
            for i,(a2,c2,b2) in enumerate(segs):
                if a2==cur:
                    segs.pop(i); add(c2,b2); cur=b2; break
            else: break
        if cur==start: cmd.append('Z')
        parts.append(''.join(cmd))
    return ''.join(parts)

def compose(A,B):
    # apply B then A (both flash matrices)
    a=(A[0],A[1],A[2],A[3]); b=(B[0],B[1],B[2],B[3])
    sx=b[0]*a[0]+b[1]*a[2]; r0=b[0]*a[1]+b[1]*a[3]
    r1=b[2]*a[0]+b[3]*a[2]; sy=b[2]*a[1]+b[3]*a[3]
    tx=B[4]*a[0]+B[5]*a[2]+A[4]; ty=B[4]*a[1]+B[5]*a[3]+A[5]
    return (sx,r0,r1,sy,tx,ty)

def swf_to_paths(path):
    d=open(path,'rb').read()
    body=zlib.decompress(d[8:]) if d[:1]==b'C' else d[8:]
    bs=Bits(body); stage=bs.rect(); bs.align(); pos=bs.pos//8+4
    shapes={}; display={}
    while pos<len(body):
        hdr=struct.unpack('<H',body[pos:pos+2])[0]; pos+=2
        code,ln=hdr>>6,hdr&63
        if ln==63: ln=struct.unpack('<I',body[pos:pos+4])[0]; pos+=4
        t=body[pos:pos+ln]; pos+=ln
        if code in (2,22,32):
            sid,bounds,sets,edges=parse_shape(t); shapes[sid]=(sets,edges)
        elif code==26:
            b=Bits(t); fl=b.byte(); depth=b.u16()
            cid=b.u16() if fl&2 else display.get(depth,(None,))[0]
            m=b.matrix() if fl&4 else (1,0,0,1,0,0)
            display[depth]=(cid,m)
        elif code==1 or code==0:
            break
    out=[]
    for depth in sorted(display):
        cid,m=display[depth]
        if cid in shapes:
            out+=to_paths(*shapes[cid],m)
    return stage,out


def swf_vector_paths(path):
    """Return [[css_colour, path_d, line_width_or_0], ...] in drawing order.

    Two clean-ups are applied to undo artifacts of how the shapes were traced:
    * a solid fill covering the whole stage (an opaque background box) is dropped;
    * where a fill is followed by a closed outline stroke, the fill is replaced by the
      (smoothly curved) outline, rather than the jagged straight-line trace.
    """
    stage, paths = swf_to_paths(path)
    sx0, sx1, sy0, sy1 = [v / 20.0 for v in stage]
    box = "M%.3f %.3fL%.3f %.3fL%.3f %.3fL%.3f %.3fL%.3f %.3fZ" % (sx1, sy0, sx0, sy0, sx0, sy1, sx1, sy1, sx1, sy0)
    paths = [p for p in paths if not (p[2] == "fill" and p[1] == box)]
    for i in range(len(paths) - 1):
        if paths[i][2] == "fill" and paths[i + 1][2] != "fill" and paths[i + 1][1].endswith("Z"):
            paths[i] = (paths[i][0], paths[i + 1][1], "fill")
    out = []
    for col, d, kind in paths:
        css = "rgba(%d,%d,%d,%g)" % (col[0], col[1], col[2], round(col[3] / 255, 3))
        width = 0 if kind == "fill" else float(kind.split(":")[1])
        out.append([css, d, width])
    return out
