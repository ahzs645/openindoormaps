"""Recover only saved drawing registrations, never an inferred campus placement."""
import math


def fit_similarity(samples):
    if len(samples) < 3:
        return None
    raw = [sum(s[0][i] for s in samples) / len(samples) for i in (0, 1)]
    model = [sum(s[1][i] for s in samples) / len(samples) for i in (0, 1)]
    den = re = im = 0.0
    for p, q in samples:
        x, y = p[0] - raw[0], p[1] - raw[1]
        u, v = q[0] - model[0], q[1] - model[1]
        den += x*x + y*y
        re += x*u + y*v
        im += x*v - y*u
    if den <= 1e-12:
        return None
    re, im = re / den, im / den
    return dict(raw=raw, model=model, re=re, im=im, scale=math.hypot(re, im))


def transform(p, fit, inverse=False):
    x, y = p[0], p[1]
    re, im = fit['re'], fit['im']
    if inverse:
        x, y = x - fit['model'][0], y - fit['model'][1]
        den = re*re + im*im
        return [fit['raw'][0] + (re*x + im*y)/den,
                fit['raw'][1] + (-im*x + re*y)/den]
    x, y = x - fit['raw'][0], y - fit['raw'][1]
    return [fit['model'][0] + re*x - im*y, fit['model'][1] + im*x + re*y]


def recover_registration(rooms, source_sha):
    samples = [(r['dwg']['anchorDwg'], r['labelPointFeet']) for r in rooms
               if r.get('dwg', {}).get('sha256') == source_sha
               and len(r.get('dwg', {}).get('anchorDwg', [])) == 2]
    if len({r['levelId'] for r in rooms}) != 1:
        return None
    fit = fit_similarity(samples)
    if fit is None:
        return None
    def residual(s, f):
        return math.dist(transform(s[0], f), s[1])
    median = sorted(residual(s, fit) for s in samples)[len(samples)//2]
    inliers = [s for s in samples if residual(s, fit) <= max(.1, median * 3)]
    fit = fit_similarity(inliers)
    if fit is None:
        return None
    error = max(residual(s, fit) for s in inliers)
    # A small residual alone is not enough if most saved anchors were dropped.
    if not math.isfinite(error) or error > .1 or fit['scale'] <= 0 or len(inliers) < .8*len(samples):
        return None
    return dict(**fit, maxErrorFeet=error, anchorCount=len(inliers),
                rejectedAnchorCount=len(samples)-len(inliers), levelId=rooms[0]['levelId'])
