"""Deterministic anatomical pilot skeletons; dimensions are artistic estimates.

Every child begins on its parent's centreline. Foliage placement downstream
uses these actual terminal axes, never a volume/crown rejection scatter.
"""
import math, random
import numpy as np

def unit(v):
    a=np.asarray(v,dtype=float);n=np.linalg.norm(a)
    return a/n if n>1e-12 else np.array([0.,0.,1.])

def sample(branch,t):
    points=np.asarray(branch['points']);radii=np.asarray(branch['radii'])
    u=max(0.,min(1.,t))*(len(points)-1);i=min(int(u),len(points)-2);f=u-i
    return points[i]*(1-f)+points[i+1]*f, unit(points[i+1]-points[i]),float(radii[i]*(1-f)+radii[i+1]*f)

def own_skeleton(kind,seed=62025):
    rng=random.Random(seed);branches=[]
    def add(parent,attach,start,direction,length,radius,depth,up=.12,droop=0.,steps=8):
        p=np.asarray(start,dtype=float);d=unit(direction);pts=[p.copy()]
        phase=rng.uniform(0,math.tau)
        for i in range(steps):
            f=(i+.5)/steps
            wave=.32 if depth<3 else .18
            bend=np.array([wave*math.sin(phase+f*math.tau)+rng.uniform(-.12,.12),wave*math.cos(phase+f*4)+rng.uniform(-.12,.12),up-droop*f])
            d=unit(d+bend/steps*2.5);p=p+d*length/steps;pts.append(p.copy())
        radii=[max(.0012,radius*(1-i/steps)**.65) for i in range(steps+1)]
        b={'id':len(branches),'parent':parent,'attachmentT':attach,'depth':depth,'points':[p.tolist()for p in pts],'radii':radii}
        branches.append(b);return b
    if kind=='broadleaf':
        trunk=add(None,0,[0,0,0],[.02,-.025,1],7.8,.38,0,steps=18)
        leaders=[]
        for i,t in enumerate([.30,.39,.48,.58,.67,.76,.85,.96]):
            start,d,r=sample(trunk,t);a=i*2.39996+rng.uniform(-.3,.3)
            # Lower limbs extend sideways; upper leaders fill the rounded top.
            # Fine growth is attached along each limb, not only at its summit.
            elevation=.22+.85*t+rng.uniform(-.16,.16)
            length=rng.uniform(4.6,5.8)*(1-.28*t)
            leaders.append(add(0,t,start,[math.cos(a),math.sin(a),elevation],length,r*.63,1,up=.20,steps=12))
        for leader in leaders:
            for i in range(12):
                t=.08+.076*i;start,d,r=sample(leader,t);a=i*2.39996+rng.uniform(-.3,.3)
                outward=unit([math.cos(a),math.sin(a),rng.uniform(-.35,.7)])
                shoot_length=rng.uniform(.65,1.6) if i<5 else rng.uniform(1.2,3.0)
                second=add(leader['id'],t,start,unit(d*.25+outward*.8),shoot_length*(1-.15*t),r*.48,2,up=rng.uniform(-.1,.3),steps=8)
                for j in range(6):
                    u=.30+.12*j;p,sd,sr=sample(second,u);a+=2.39996
                    third=add(second['id'],u,p,unit(sd*.35+np.array([math.cos(a),math.sin(a),rng.uniform(-.3,.7)])*.7),rng.uniform(.7,1.2),sr*.48,3,up=rng.uniform(-.1,.2),steps=5)
                    for k in range(3):
                        v=.42+.25*k;q,td,tr=sample(third,v);angle=a+k*2.39996
                        twig=add(third['id'],v,q,unit(td*.6+np.array([math.cos(angle)*.5,math.sin(angle)*.5,rng.uniform(-.2,.4)])),rng.uniform(.24,.42),tr*.50,4,up=.05,steps=3)
                        for fork in [-1,1]:
                            q,td,tr=sample(twig,.55+.27*(fork+1)/2)
                            add(twig['id'],.55+.27*(fork+1)/2,q,unit(td*.5+np.array([math.cos(angle+fork*.8)*.5,math.sin(angle+fork*.8)*.5,rng.uniform(-.2,.3)])),rng.uniform(.15,.25),tr*.58,5,up=.05,steps=3)
    elif kind=='conifer':
        trunk=add(None,0,[0,0,0],[.012,-.008,1],12.,.24,0,steps=32)
        for tier in range(18):
            t=.18+tier*.044+rng.uniform(-.012,.012);count=rng.randint(4,7) if tier<11 else rng.randint(4,6)
            for j in range(count):
                if rng.random()<.15:continue
                u=t+rng.uniform(-.008,.008);p,d,r=sample(trunk,u);a=tier*1.31+j*math.tau/count+rng.uniform(-.14,.14)
                length=(3.4*(1-u)**.75)*rng.uniform(.72,1.13)
                first=add(0,u,p,[math.cos(a),math.sin(a),rng.uniform(-.35,.2)+.15*u],length,r*.36,1,up=.10,droop=rng.uniform(.35,.9),steps=8)
                for s in range(7):
                    v=.16+s*.12;q,fd,fr=sample(first,v)
                    for sign in [-1,1]:
                        angle=a+sign*rng.uniform(.50,.9)
                        second=add(first['id'],v,q,[math.cos(angle),math.sin(angle),rng.uniform(-1.,.2)],length*.43*(1-.55*v)*rng.uniform(.8,1.2),fr*.45,2,up=.15,droop=rng.uniform(.25,.8),steps=5)
                        for twig_i in range(3):
                            tt=.3+.3*twig_i;p,sd,sr=sample(second,tt)
                            aa=angle+(-.65 if twig_i%2 else .65)
                            add(second['id'],tt,p,[math.cos(aa),math.sin(aa),rng.uniform(-.8,.3)],rng.uniform(.18,.30),sr*.48,3,up=.12,droop=.35,steps=3)
    else: raise ValueError(kind)
    # Comparable pilot height, not a resurvey of the named reference tree.
    target=13.5 if kind=='broadleaf' else 12.
    height=max(p[2]for b in branches for p in b['points']);scale=target/height
    for b in branches:
        b['points']=(np.asarray(b['points'])*scale).tolist();b['radii']=[r*scale for r in b['radii']]
    return {'generator':'anatomical-own-v1','kind':kind,'seed':seed,'branches':branches,'heightTarget':target}

def skeleton_audit(skeleton):
    bs=skeleton['branches'];max_gap=0
    for b in bs:
        assert len(b['points'])==len(b['radii'])>=2
        assert all(math.isfinite(x)for p in b['points']for x in p)
        assert all(r>0 for r in b['radii'])
        assert all(a>=b for a,b in zip(b['radii'],b['radii'][1:]))
        if b['parent'] is not None:
            assert b['parent']<b['id'];p,_,_=sample(bs[b['parent']],b['attachmentT'])
            max_gap=max(max_gap,float(np.linalg.norm(p-np.asarray(b['points'][0]))))
    assert max_gap<1e-8
    children={b['parent']for b in bs if b['parent'] is not None}
    return {'branches':len(bs),'terminalBranches':sum(b['id']not in children for b in bs),'maxAttachmentGap':max_gap,'maxDepth':max(b['depth']for b in bs)}
