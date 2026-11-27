# 움직이는 릴스 3가지 스타일 (A 화면 녹화형 · B 퀴즈형 · C 숫자 카운트형)
# 사용: python3 tools/reels/styles.py <게시물id ...>  → tools/reels/out/<id>.mp4
# 장면은 CSS 애니메이션(시간 = animation-delay)으로 만들고, render.mjs가 30fps로 찍어 ffmpeg로 묶음
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'assets')
OUT = os.path.join(HERE, 'out')
TMP = os.environ.get('REELS_TMP', '/tmp/reels-frames')
SVG = json.load(open(os.path.join(ASSETS, 'svg.json')))
os.makedirs(OUT, exist_ok=True)
A = lambda n: 'file://' + os.path.join(ASSETS, n)

BASE_CSS = """
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1920px;overflow:hidden}
body{font-family:'Jua',sans-serif;position:relative}
.abs{position:absolute}
.m svg{width:100%;height:100%}
@keyframes in-up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes in-down{from{opacity:0;transform:translateY(-60px)}to{opacity:1;transform:none}}
@keyframes in-left{from{opacity:0;transform:translateX(-120px)}to{opacity:1;transform:none}}
@keyframes in-right{from{opacity:0;transform:translateX(120px)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.3)}70%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:scale(1)}}
@keyframes fade-in{from{opacity:0}to{opacity:1}}
@keyframes fade-out{from{opacity:1}to{opacity:0}}
@keyframes out-up{to{opacity:0;transform:translateY(-80px)}}
@keyframes dim{to{opacity:.28;filter:grayscale(1)}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
"""

def anim(name, delay, dur=.5, ease='cubic-bezier(.2,.8,.2,1)', extra=''):
    return f'animation:{name} {dur}s {ease} {delay}s both{extra};'

def doc(css, body):
    return f'''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Noto+Sans+KR:wght@500;700&display=swap">
<style>{BASE_CSS}{css}</style></head><body>{body}</body></html>'''

# ---------- A. 화면 녹화형: 실제 앱 화면 + 손가락 + 아래 자막 ----------
def style_a(p):
    css = """
body{background:#faf8f2}
.screen{position:absolute;inset:0;background-size:1080px 1920px;background-position:top center;transform-origin:50% 6%;transform:scale(1.32)}
.cap{position:absolute;left:60px;right:60px;bottom:250px;padding:34px 40px;border-radius:40px;background:#2f2a23;color:#fff;font-size:58px;line-height:1.35;text-align:center;word-break:keep-all;box-shadow:0 20px 40px rgba(0,0,0,.18)}
.hook{position:absolute;left:0;right:0;top:0;padding:120px 70px 60px;background:linear-gradient(#2f2a23,rgba(47,42,35,.0));color:#fff;font-size:76px;line-height:1.25;text-align:center;word-break:keep-all}
.hook small{display:block;font-size:40px;color:#ffd25c;margin-bottom:16px}
.finger{position:absolute;font-size:170px;filter:drop-shadow(0 10px 14px rgba(0,0,0,.25))}
.ripple{position:absolute;width:220px;height:220px;border-radius:50%;border:12px solid #ffd25c}
@keyframes ripple{0%{opacity:0;transform:scale(.2)}20%{opacity:1}100%{opacity:0;transform:scale(1.6)}}
.end{position:absolute;inset:0;background:#3f8a55;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;text-align:center}
.end h2{font-weight:400;font-size:130px}
.end p{font-size:52px;opacity:.92}
.url{display:inline-block;padding:26px 64px;border-radius:44px;background:#ffd25c;color:#3b3226;font-size:64px;box-shadow:0 10px 0 #e2b23c}
.next{position:absolute;left:60px;right:60px;bottom:140px;padding:24px 30px;border-radius:28px;background:rgba(255,255,255,.14);font-size:40px;color:#fff;text-align:center}
"""
    s = p['shots']  # [(그림, 시작초)]
    body = ''
    for i, (img, t0) in enumerate(s):
        t1 = s[i + 1][1] if i + 1 < len(s) else p['end_at']
        body += f'<div class="screen" style="background-image:url({A(img)});{anim("fade-in", t0, .25)}"></div>'
    # 손가락 · 누르는 동그라미
    for (x, y, t) in p['taps']:
        body += f'<div class="finger" style="left:{x}px;top:{y + 40}px;animation:fade-in .3s {t - 1.0}s both, fing-{int(t*10)} 1.0s cubic-bezier(.3,.7,.3,1) {t - 1.0}s both, fade-out .3s {t + .7}s forwards">👆</div>'
        body += f'<style>@keyframes fing-{int(t*10)}{{from{{transform:translate(260px,420px)}}to{{transform:translate(0,0)}}}}</style>'
        body += f'<div class="ripple" style="left:{x - 50}px;top:{y - 60}px;animation:ripple .7s ease-out {t}s both"></div>'
    # 첫 장면 문구 (위)
    body += f'<div class="hook" style="{anim("in-down", .1)};animation:in-down .5s cubic-bezier(.2,.8,.2,1) .1s both, out-up .4s ease-in {p["hook_until"]}s forwards"><small>{p["hook_label"]}</small>{p["hook"]}</div>'
    # 아래 자막 (차례로 바뀜)
    caps = p['captions']
    for i, (text, t0) in enumerate(caps):
        t1 = caps[i + 1][1] if i + 1 < len(caps) else p['end_at']
        body += f'<div class="cap" style="animation:in-up .45s cubic-bezier(.2,.8,.2,1) {t0}s both, fade-out .2s {t1 - .2}s forwards">{text}</div>'
    e = p['end_at']
    body += f'''<div class="end" style="animation:in-up .6s cubic-bezier(.2,.8,.2,1) {e}s both">
<div class="m" style="width:220px;height:220px;{anim("pop", e + .3, .6)}">{SVG["happy"]}</div>
<h2 style="{anim("in-up", e + .4)}">{p["end_title"]}</h2><p style="{anim("in-up", e + .6)}">{p["end_sub"]}</p>
<span class="url" style="{anim("pop", e + .9, .5)}">ssukssuknori.app</span>
<div class="next" style="{anim("fade-in", e + 1.4)}">다음 편 · {p["next"]}</div></div>'''
    return doc(css, body), e + 4.0

# ---------- B. 퀴즈형: 문제 → 보기 3개 → 3초 → 정답 → 방법 ----------
def style_b(p):
    css = """
body{background:#16443f;color:#fff}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 3px,transparent 4px);background-size:54px 54px}
.q{position:absolute;left:80px;right:80px;top:230px;text-align:center}
.q .tag{display:inline-block;padding:12px 30px;border-radius:999px;background:#ffd25c;color:#16443f;font-size:44px}
.q h1{font-weight:400;font-size:84px;line-height:1.3;margin-top:36px;word-break:keep-all}
.ch{position:absolute;left:80px;right:80px;height:190px;border-radius:40px;background:#fff;color:#2f2a23;display:flex;align-items:center;gap:30px;padding:0 44px;font-size:54px;word-break:keep-all;line-height:1.25}
.ch b{flex:none;width:96px;height:96px;border-radius:50%;background:#e8f1ee;color:#16443f;display:grid;place-items:center;font-weight:400;font-size:56px}
.ok{position:absolute;right:120px;font-size:120px}
.timer{position:absolute;left:80px;right:80px;top:1650px;height:26px;border-radius:13px;background:rgba(255,255,255,.18);overflow:hidden}
.timer i{display:block;height:100%;background:#ffd25c;transform-origin:left}
@keyframes shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.count{position:absolute;left:0;right:0;top:1500px;text-align:center;font-size:110px;color:#ffd25c}
@keyframes hl{to{background:#ffd25c;transform:scale(1.04)}}
.panel{position:absolute;inset:0;background:#16443f;padding:180px 80px 0}
.panel h2{font-weight:400;font-size:80px;text-align:center;margin-bottom:60px}
.tip{background:#fff;color:#2f2a23;border-radius:36px;padding:34px 40px;margin-bottom:30px;font-size:46px;line-height:1.35;word-break:keep-all}
.tip .x{color:#b65a48;font-size:38px}.tip .o{color:#2f7a55}
.end{position:absolute;inset:0;background:#ffd25c;color:#2f2a23;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;text-align:center}
.end h2{font-weight:400;font-size:92px;line-height:1.3}
.end p{font-size:50px}
.next{position:absolute;left:60px;right:60px;bottom:150px;padding:24px 30px;border-radius:28px;background:rgba(47,42,35,.1);font-size:40px;text-align:center}
"""
    body = '<div class="dots"></div>'
    body += f'<div class="q"><span class="tag" style="{anim("pop", .1)}">{p["tag"]}</span><h1 style="{anim("in-up", .4, .6)}">{p["question"]}</h1></div>'
    tops = [760, 990, 1220]
    for i, (txt, top) in enumerate(zip(p['choices'], tops)):
        t = 1.8 + i * .6
        right = i == p['answer']
        extra = f', hl .4s ease {p["reveal"]}s forwards' if right else f', dim .4s ease {p["reveal"]}s forwards'
        body += f'<div class="ch" style="top:{top}px;animation:in-right .5s cubic-bezier(.2,.8,.2,1) {t}s both{extra}"><b>{"①②③"[i]}</b><span>{txt}</span></div>'
        if right:
            body += f'<div class="ok" style="top:{top + 30}px;{anim("pop", p["reveal"] + .2, .5)}">✅</div>'
    t0 = 3.8
    for k, n in enumerate(['3', '2', '1']):
        body += f'<div class="count" style="animation:pop .35s ease {t0 + k}s both, fade-out .2s {t0 + k + .8}s forwards">{n}</div>'
    body += f'<div class="timer" style="{anim("fade-in", t0 - .2, .2)}"><i style="animation:shrink 3s linear {t0}s both"></i></div>'
    pt = p['reveal'] + 2.2
    body += f'<div class="panel" style="{anim("in-up", pt, .6)}"><h2 style="{anim("in-up", pt + .2)}">{p["panel_title"]}</h2>'
    for i, (x, o) in enumerate(p['tips']):
        body += f'<div class="tip" style="{anim("in-left", pt + .6 + i * .9)}"><div class="x">✗ {x}</div><div class="o">○ {o}</div></div>'
    body += '</div>'
    e = pt + .6 + len(p['tips']) * .9 + 2.6
    body += f'''<div class="end" style="{anim("in-up", e, .6)}"><div class="m" style="width:200px;height:200px;{anim("pop", e + .3, .6)}">{SVG["happy"]}</div>
<h2 style="{anim("in-up", e + .4)}">{p["end_title"]}</h2><p style="{anim("in-up", e + .6)}">🌱 쑥쑥 생각놀이 · 무료 · 가입 없음</p>
<div class="next" style="{anim("fade-in", e + 1.2)}">다음 편 · {p["next"]}</div></div>'''
    return doc(css, body), e + 3.6

# ---------- C. 숫자 카운트형: 그림이 하나씩 튀어나오며 숫자 증가 → 학습지 → 받는 곳 ----------
def style_c(p):
    css = """
body{background:#f39a4b;color:#fff}
.stripe{position:absolute;inset:0;background:repeating-linear-gradient(-45deg,rgba(255,255,255,.07) 0 40px,transparent 40px 80px)}
.top{position:absolute;left:0;right:0;top:200px;text-align:center}
.top .tag{display:inline-block;padding:12px 30px;border-radius:999px;background:#fff;color:#d9692b;font-size:44px}
.top h1{font-weight:400;font-size:110px;margin-top:30px}
.items{position:absolute;left:90px;right:90px;top:700px;display:flex;flex-wrap:wrap;justify-content:center;gap:24px;font-size:150px}
.num{position:absolute;left:0;right:0;top:1180px;text-align:center;font-size:300px;line-height:1;text-shadow:0 14px 0 rgba(0,0,0,.1)}
.paper{position:absolute;left:110px;right:110px;top:560px;background:#fff;border-radius:30px;padding:30px;box-shadow:0 30px 60px rgba(0,0,0,.2)}
.paper img{width:100%;display:block}
@keyframes paper-in{from{opacity:0;transform:translateY(500px) rotate(8deg)}to{opacity:1;transform:rotate(-2deg)}}
.lbl{position:absolute;left:0;right:0;top:1690px;text-align:center;font-size:64px}
.end{position:absolute;inset:0;background:#fff7ec;color:#3b3226;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;text-align:center}
.end h2{font-weight:400;font-size:96px;line-height:1.3}
.end h2 span{color:#e0782f}
.arrow{font-size:120px;animation:bob 1s ease-in-out infinite}
.url{display:inline-block;padding:26px 64px;border-radius:44px;background:#f39a4b;color:#fff;font-size:64px;box-shadow:0 10px 0 #d27a30}
.next{position:absolute;left:60px;right:60px;bottom:150px;padding:24px 30px;border-radius:28px;background:#f6e6d2;font-size:40px;text-align:center}
"""
    body = '<div class="stripe"></div>'
    body += f'<div class="top"><span class="tag" style="{anim("pop", .1)}">{p["tag"]}</span><h1 style="{anim("in-up", .4, .6)}">{p["title"]}</h1></div>'
    n = len(p['items'])
    t_items_end = 1.4 + n * .55
    body += f'<div class="items" style="animation:fade-out .4s {t_items_end + 1.2}s forwards">'
    for i, e in enumerate(p['items']):
        body += f'<span style="{anim("pop", 1.4 + i * .55, .45)}">{e}</span>'
    body += '</div>'
    for i in range(n):
        t = 1.4 + i * .55
        last = i == n - 1
        body += f'<div class="num" style="animation:pop .35s ease {t}s both{"" if last else f", fade-out .05s {t + .5}s forwards"}{f", fade-out .4s {t_items_end + 1.2}s forwards" if last else ""}">{i + 1}</div>'
    ps = t_items_end + 1.5
    body += f'<div class="paper" style="animation:paper-in .8s cubic-bezier(.2,.8,.2,1) {ps}s both"><img src="{A(p["sheet"])}"></div>'
    body += f'<div class="lbl" style="{anim("in-up", ps + .8)}">{p["sheet_label"]}</div>'
    e = ps + 4.0
    body += f'''<div class="end" style="{anim("in-up", e, .6)}"><div class="arrow" style="{anim("fade-in", e + .3)};animation:fade-in .3s {e + .3}s both, bob 1s ease-in-out {e + .3}s infinite">🖨️</div>
<h2 style="{anim("in-up", e + .4)}">학습지는<br><span>프로필 링크</span>에서<br>받아 가세요</h2>
<span class="url" style="{anim("pop", e + .8, .5)}">ssukssuknori.app</span>
<div class="next" style="{anim("fade-in", e + 1.3)}">다음 편 · {p["next"]}</div></div>'''
    return doc(css, body), e + 4.0


# ---------- C2. 빈칸 채우기형 (C 변형, 10초 안팎): 그림이 차례로 놓이고 ❓가 정답으로 바뀜 → 학습지 → 받는 곳 ----------
def style_f(p):
    css = """
body{background:#7b5cc4;color:#fff}
.stripe{position:absolute;inset:0;background:radial-gradient(circle at 20% 15%,rgba(255,255,255,.12) 0 160px,transparent 161px),radial-gradient(circle at 85% 80%,rgba(255,255,255,.1) 0 220px,transparent 221px)}
.top{position:absolute;left:0;right:0;top:230px;text-align:center}
.top .tag{display:inline-block;padding:12px 30px;border-radius:999px;background:#ffd25c;color:#4b3590;font-size:44px}
.top h1{font-weight:400;font-size:112px;margin-top:30px}
.row{position:absolute;left:40px;right:40px;top:800px;display:flex;justify-content:center;gap:14px}
.t{width:180px;height:200px;border-radius:30px;background:#fff;display:grid;place-items:center;font-size:120px;box-shadow:0 12px 0 rgba(0,0,0,.12)}
.t.q{background:#ffd25c;color:#4b3590;font-size:130px;position:relative}
.t.q span{position:absolute}
@keyframes wob{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@keyframes flip{0%{transform:rotateY(0)}50%{transform:rotateY(90deg)}100%{transform:rotateY(0)}}
.say{position:absolute;left:60px;right:60px;top:1180px;text-align:center;font-size:76px}
.paper{position:absolute;left:150px;right:150px;top:540px;background:#fff;border-radius:30px;padding:26px;box-shadow:0 30px 60px rgba(0,0,0,.25)}
.paper img{width:100%;display:block}
@keyframes paper-in{from{opacity:0;transform:translateY(500px) rotate(-8deg)}to{opacity:1;transform:rotate(2deg)}}
.lbl{position:absolute;left:0;right:0;top:1640px;text-align:center;font-size:60px}
.end{position:absolute;inset:0;background:#fff;color:#3b3226;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;text-align:center}
.end h2{font-weight:400;font-size:92px;line-height:1.3}
.end h2 span{color:#7b5cc4}
.url{display:inline-block;padding:26px 64px;border-radius:44px;background:#7b5cc4;color:#fff;font-size:64px;box-shadow:0 10px 0 #5a3fa0}
.next{position:absolute;left:60px;right:60px;bottom:150px;padding:24px 30px;border-radius:28px;background:#efeaf9;font-size:40px;text-align:center}
"""
    body = '<div class="stripe"></div>'
    body += f'<div class="top"><span class="tag" style="{anim("pop", .1)}">{p["tag"]}</span><h1 style="{anim("in-up", .3, .5)}">{p["title"]}</h1></div>'
    seq = p['seq']; ts = p['seq_at']
    gone = p['paper_at'] - .3
    body += f'<div class="row" style="animation:fade-out .3s {gone}s forwards">'
    for e, t in zip(seq, ts):
        body += f'<div class="t" style="{anim("pop", t, .4)}">{e}</div>'
    qa = p['q_at']; ra = p['reveal']
    body += (f'<div class="t q" style="animation:pop .4s ease {qa}s both, wob .5s ease {qa + .5}s 2, flip .5s ease {ra - .25}s both">'
             f'<span style="animation:fade-out .01s {ra}s forwards">❓</span><span style="{anim("fade-in", ra, .01)}">{p["answer"]}</span></div></div>')
    for i, (text, t0) in enumerate(p['says']):
        t1 = p['says'][i + 1][1] if i + 1 < len(p['says']) else gone
        body += f'<div class="say" style="animation:in-up .35s cubic-bezier(.2,.8,.2,1) {t0}s both, fade-out .15s {t1 - .15}s forwards">{text}</div>'
    ps = p['paper_at']
    body += f'<div class="paper" style="animation:paper-in .7s cubic-bezier(.2,.8,.2,1) {ps}s both"><img src="{A(p["sheet"])}"></div>'
    body += f'<div class="lbl" style="{anim("in-up", ps + .5)}">{p["sheet_label"]}</div>'
    e = p['end_at']
    body += f'''<div class="end" style="{anim("in-up", e, .5)}"><div style="font-size:120px;{anim("pop", e + .2)}">🖨️</div>
<h2 style="{anim("in-up", e + .3)}">학습지는<br><span>프로필 링크</span>에서<br>받아 가세요</h2>
<span class="url" style="{anim("pop", e + .6, .5)}">ssukssuknori.app</span>
<div class="next" style="{anim("fade-in", e + 1.0)}">다음 편 · {p["next"]}</div></div>'''
    return doc(css, body), e + 3.0


# ---------- 소리: 목소리(맥 한국어 음성 Yuna) · 누르는 소리 ----------
def make_audio(p, secs, out_wav):
    d = os.path.join(TMP, 'audio'); os.makedirs(d, exist_ok=True)
    clips = []
    for i, (text, t) in enumerate(p.get('voice', [])):
        a = os.path.join(d, f'v{i}.aiff')
        subprocess.run(['say', '-v', p.get('voice_name', 'Yuna'), '-r', str(p.get('voice_rate', 175)), '-o', a, text], check=True)
        clips.append((a, t, 1.0))
    tap = os.path.join(d, 'tap.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=1100:duration=0.08', '-af', 'afade=t=out:st=0.01:d=0.07,volume=0.5', tap], check=True)
    for (_, _, t) in p.get('taps', []):
        clips.append((tap, t, 1.0))
    for t in p.get('pops', []):
        clips.append((tap, t, 0.6))
    if not clips:
        return None
    args = ['ffmpeg', '-v', 'error', '-y']
    for a, _, _ in clips:
        args += ['-i', a]
    fc = ''.join(f'[{i}:a]aresample=44100,aformat=channel_layouts=stereo,volume={v},adelay={int(t*1000)}|{int(t*1000)}[a{i}];' for i, (_, t, v) in enumerate(clips))
    fc += ''.join(f'[a{i}]' for i in range(len(clips))) + f'amix=inputs={len(clips)}:normalize=0,apad,atrim=duration={secs:.2f}[out]'
    args += ['-filter_complex', fc, '-map', '[out]', out_wav]
    subprocess.run(args, check=True)
    return out_wav

# ---------- 카루셀: 1080x1350 사진 여러 장 (JPEG) ----------
def carousel(pid, slides):
    d = os.path.join(OUT, pid); os.makedirs(d, exist_ok=True)
    css = """
html,body{width:1080px;height:1350px}
body{background:var(--bg,#fff7ec);color:#3b3226;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;padding:80px;text-align:center}
.tag{display:inline-block;padding:12px 30px;border-radius:999px;background:#3b3226;color:#fff;font-size:40px}
h1{font-weight:400;font-size:100px;line-height:1.25;word-break:keep-all}
h2{font-weight:400;font-size:72px;line-height:1.3;word-break:keep-all}
p{font-size:46px;line-height:1.5;color:#6b5d4b;word-break:keep-all;font-family:'Noto Sans KR',sans-serif;font-weight:500}
.big{font-size:200px;line-height:1}
.shot{width:560px;height:720px;border-radius:44px;overflow:hidden;border:14px solid #3b3226;background:#faf8f2}
.shot img{width:130%;margin-left:-15%;display:block}
.num{position:absolute;top:60px;right:70px;font-size:40px;color:#9a8c76}
.url{display:inline-block;padding:24px 60px;border-radius:44px;background:#ffd25c;font-size:60px;box-shadow:0 10px 0 #e2b23c}
.m{width:200px;height:200px}.m svg{width:100%;height:100%}
"""
    files = []
    for i, sl in enumerate(slides, 1):
        if sl['kind'] == 'cover':
            body = f'<span class="tag">{sl["tag"]}</span><div class="big">{sl["emoji"]}</div><h1>{sl["title"]}</h1><p>{sl["sub"]}</p>'
        elif sl['kind'] == 'shot':
            body = f'<span class="num">{i} / {len(slides)}</span><h2>{sl["title"]}</h2><div class="shot"><img src="{A(sl["img"])}"></div><p>{sl["sub"]}</p>'
        else:
            body = f'<div class="m">{SVG["happy"]}</div><h2>{sl["title"]}</h2><p>{sl["sub"]}</p><span class="url">ssukssuknori.app</span>'
        html = doc(css, body).replace('<body>', f'<body style="--bg:{sl.get("bg", "#fff7ec")}">')
        hp = os.path.join(d, f'{i}.html'); open(hp, 'w', encoding='utf-8').write(html)
        png = os.path.join(d, f'{i}.png')
        subprocess.run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--allow-file-access-from-files', f'--user-data-dir={TMP}/ud_car', '--window-size=1080,1350', '--virtual-time-budget=3000',
                        f'--screenshot={png}', 'file://' + hp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        from PIL import Image
        jpg = os.path.join(d, f'{i}.jpg'); Image.open(png).convert('RGB').save(jpg, quality=90)
        files.append(jpg)
    print('carousel', pid, len(files))
    return files

POSTS = {
  '42_play_yesno': ('A', dict(
    hook_label='👍 놀이 하나 소개', hook='말이 아직 어려워도<br>대답할 수 있어요', hook_until=2.6,
    shots=[('yesno_q.png', 0), ('yesno_ok.png', 4.3), ('yesno_q2.png', 6.0)],
    taps=[(242, 1312, 4.1), (718, 1312, 9.0)],
    captions=[('"이건 곰인형이에요?"', 2.8), ('👍 맞으면 <b>네</b>', 3.8), ('잘했어요! 바로 칭찬해 줘요', 4.6), ('"이건 강아지예요?"', 6.4), ('아니면 👎 <b>아니요</b>', 8.4), ('고개 젓기도 소중한 대답이에요', 9.8)],
    end_at=11.6, end_title='네? 아니요?', end_sub='놀이 탭 → 말 · 소통<br>놀이 58가지 · 무료 · 가입 없음',
    next='내일 낮 12시 · 생활 도우미 3가지',
    sound='voice', voice=[('말이 아직 어려워도, 대답할 수 있어요.', 0.3), ('이건 곰인형이에요?', 2.8), ('잘했어요!', 4.5),
                          ('이건 강아지예요?', 6.4), ('아니요!', 9.2), ('고개를 젓는 것도, 소중한 대답이에요.', 10.0), ('네? 아니요? 쑥쑥 생각놀이', 12.9)])),
  '27_tip_joint': ('B', dict(
    tag='📌 육아 퀴즈', question='아이와 함께 보기(공동주의),<br>어떻게 키울까요?',
    choices=['엄마가 고른 장난감을<br>보여 준다', '아이가 보는 곳을 같이 보며<br>"공이네!"', '"저기 봐" 말로만<br>알려 준다'],
    answer=1, reveal=7.0, panel_title='함께 보기 키우는 4가지',
    tips=[('엄마가 고른 장난감 보여 주기', '아이 시선을 따라가며 "공이네!"'), ('말로만 "저기 봐"', '손으로 가리키며 "저기 비행기!"'),
          ('장난감을 바닥에만 두기', '눈높이로 들고 웃어 주기'), ('장난감만 계속 보기', '장난감 → 아이 눈 → 장난감')],
    end_title='정답 맞혔나요?<br>댓글로 알려 주세요', next='내일 낮 12시 · 무료 학습지: 규칙 찾기')),
  '41_sheet_count': ('C', dict(
    tag='🖨️ 이번 주 무료 학습지', title='몇 개일까?', items=['🍓', '🍓', '🍓', '🍓', '🍓'],
    sheet='ws_count.png', sheet_label='세어 보기 학습지 · 숫자에 동그라미',
    next='내일 낮 12시 · 놀이 하나: 네? 아니요?',
    sound='fx', pops=[1.4 + i * .55 for i in range(5)] + [5.65, 6.15])),
  '43_sheet_pattern': ('F', dict(
    tag='🖨️ 이번 주 무료 학습지', title='다음은 뭘까?', seq=['🍎', '🍌', '🍎', '🍌'], seq_at=[.9, 1.5, 2.1, 2.7], q_at=3.3, answer='🍎', reveal=5.0,
    says=[('사과, 바나나, 사과, 바나나…', .9), ('다음은?', 3.4), ('사과! 🍎', 5.1)],
    paper_at=6.0, sheet='ws_pattern.png', sheet_label='규칙 찾기 학습지 · 빈칸에 동그라미', end_at=8.0,
    next='내일 저녁 8시 · 가족에게 자랑해요',
    sound='voice', voice_rate=170, voice=[('사과, 바나나, 사과, 바나나', .9), ('다음은 뭘까?', 3.4), ('사과!', 5.1), ('학습지는 프로필 링크에서 받아 가세요', 8.3)],
    pops=[.9, 1.5, 2.1, 2.7, 5.0])),
}

def build(pid):
    kind, p = POSTS[pid]
    html, secs = {'A': style_a, 'B': style_b, 'C': style_c, 'F': style_f}[kind](p)
    hp = os.path.join(OUT, f'{pid}.html')
    open(hp, 'w', encoding='utf-8').write(html)
    fr = os.path.join(TMP, pid)
    subprocess.run(['rm', '-rf', fr])
    subprocess.run(['node', os.path.join(HERE, 'render.mjs'), hp, str(round(secs, 2)), fr], check=True)
    mp4 = os.path.join(OUT, f'{pid}.mp4')
    wav = make_audio(p, secs, os.path.join(TMP, f'{pid}.wav')) if p.get('sound', 'none') != 'none' else None
    audio_in = ['-i', wav] if wav else ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', f'{fr}/%04d.png', *audio_in,
                    '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
                    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', mp4], check=True)
    print('made', pid, round(secs, 1), 's')

CAROUSELS = {
  '37_helper': [
    dict(kind='cover', tag='🧰 생활 도우미', emoji='🧰', title='생활 속에서 쓰는<br>도우미 3가지', sub='처음 가는 곳 · 기다리기 · 속상할 때<br>옆으로 넘겨 보세요 👉', bg='#fff7ec'),
    dict(kind='shot', title='📖 그림 이야기 18가지', img='help_stories.png', sub='병원 · 미용실 · 버스처럼 처음 가는 곳을<br>가기 전에 그림으로 미리 봐요', bg='#eef5fc'),
    dict(kind='shot', title='한 장씩 읽어 줘요', img='help_story_page.png', sub='소리로 읽어 줘서<br>아이 혼자 넘겨 봐도 돼요', bg='#eef5fc'),
    dict(kind='shot', title='➡️ 먼저 · 다음', img='help_firstthen.png', sub='"먼저 양치, 다음 놀이터"<br>다음 할 일을 그림으로 보여 줘요', bg='#eaf6ee'),
    dict(kind='shot', title='🎈 숨 쉬기', img='help_breath.png', sub='속상할 때 풍선과 함께<br>천천히 숨을 쉬어요', bg='#fdeef0'),
    dict(kind='cta', title='모두 무료예요', sub='오늘 탭 → 🧰 생활 도우미<br>회원가입 · 광고 없이 바로 써요', bg='#fff7ec'),
  ],
}

if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['car']:
        for pid in args[1:] or list(CAROUSELS):
            carousel(pid, CAROUSELS[pid])
    else:
        for pid in args or list(POSTS):
            build(pid)
