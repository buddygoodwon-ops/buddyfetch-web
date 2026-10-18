"""Remove the manual remote-audio attach from avatar pages.
LiveKit's JS client already auto-attaches and auto-plays remote audio tracks.
Attaching a second time = the avatar's voice plays twice = double/triple echo.
Keeps video attach and startAudio() intact.
"""
import io, re, glob, os

TARGETS = ["ginger.html", "ginger-v2.html", "gingerv3.html", "ilendgirl.html",
           "ilendgirl2.html", "ilendgirlv3.html", "ilendgirlv4.html", "ilendgirlv5.html",
           "ilendgirlv8.html", "index.html", "pami.html", "slamdunk2.html"]

def find_block(s, start_idx):
    """start_idx points at the '{' ; return index just past matching '}'."""
    depth = 0
    i = start_idx
    while i < len(s):
        c = s[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1

changed = []
for fn in TARGETS:
    if not os.path.exists(fn):
        print("skip missing", fn); continue
    with io.open(fn, encoding='utf-8') as f:
        s = f.read()
    orig = s
    # Pattern 1: else if(track.kind==='audio'){ ... }
    for m in list(re.finditer(r"else if\(track\.kind\s*===?\s*'audio'\)\s*\{", s)):
        brace = s.index('{', m.start())
        end = find_block(s, brace)
        if end == -1:
            continue
        s = s[:m.start()] + "/* audio: LiveKit autoplay handles remote audio (no manual attach - echo fix) */" + s[end:]
        break  # positions shift; re-scan
    # re-scan loop for any remaining
    guard = 0
    while "kind==='audio'" in s and guard < 6:
        guard += 1
        # Pattern 2: if(track.kind==='audio'){attachAudio(track);}
        m = re.search(r"else if\(track\.kind\s*===?\s*'audio'\)\s*\{", s)
        if not m:
            m2 = re.search(r"if\(track\.kind\s*===?\s*'audio'\)\s*\{", s)
            if not m2:
                break
            brace = s.index('{', m2.start())
            end = find_block(s, brace)
            if end == -1:
                break
            s = s[:m2.start()] + "/* audio: LiveKit autoplay (echo fix) */" + s[end:]
            continue
        brace = s.index('{', m.start())
        end = find_block(s, brace)
        if end == -1:
            break
        s = s[:m.start()] + "/* audio: LiveKit autoplay handles remote audio (no manual attach - echo fix) */" + s[end:]

    if s != orig:
        with io.open(fn, 'w', encoding='utf-8', newline='') as f:
            f.write(s)
        changed.append(fn)

print("changed:", changed)
PAT = r"attachAudio\(|kind===.audio."
for fn in TARGETS:
    if os.path.exists(fn):
        with io.open(fn, encoding='utf-8') as f:
            s = f.read()
        remaining = len(re.findall(PAT, s))
        has_start = 'startAudio' in s
        print(fn, 'remaining_audio_attach=', remaining, 'startAudio=', has_start)
