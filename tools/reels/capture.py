# 영상 재료 찍기: 앱 화면(540x960 → 2배 = 1080x1920 꽉 찬 화면), 학습지 A4, 쑥쑥이 그림
# 사용: python3 tools/reels/capture.py
import os, subprocess, json, re, html as H, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'reels', 'assets')
TMP = os.environ.get('REELS_TMP', '/tmp/reels-cap')
CH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
BASE = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read().replace('<head>', f'<head><base href="file://{ROOT}/">', 1)
PRE = "settings.tips=false;settings.sound=false;"

def page(name, js):
    p = os.path.join(TMP, f'{name}.html')
    open(p, 'w', encoding='utf-8').write(BASE.replace('</body>', f'<script>addEventListener("load",()=>setTimeout(()=>{{{PRE}{js}}},400));</script></body>'))
    return 'file://' + p

def shot(name, js, budget=2000, size='540,960', scale=2):
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                    f'--user-data-dir={TMP}/ud_{name}', f'--window-size={size}', f'--force-device-scale-factor={scale}',
                    f'--virtual-time-budget={budget}', f'--screenshot={OUT}/{name}.png', page(name, js)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

def sheet(name, ws, level=1):
    pdf = f'{TMP}/{name}.pdf'
    js = f"settings.level={level};showWorksheets('{ws}');document.documentElement.classList.add('print-ws');document.querySelector('.ws-page').style.zoom='1';"
    subprocess.run([CH, '--headless=new', '--disable-gpu', '--allow-file-access-from-files', f'--user-data-dir={TMP}/ud_{name}',
                    '--virtual-time-budget=2000', '--no-pdf-header-footer', f'--print-to-pdf={pdf}', page(name, js)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    png = f'{OUT}/{name}.png'
    subprocess.run(['sips', '-s', 'format', 'png', '-Z', '1600', pdf, '--out', png], stdout=subprocess.DEVNULL, check=True)
    from PIL import Image
    im = Image.open(png).convert('RGBA'); bg = Image.new('RGBA', im.size, 'white'); bg.alpha_composite(im); im = bg.convert('RGB')
    w, h = im.size
    l, t, r, b = im.convert('L').crop((10, 10, w - 10, h - 10)).point(lambda x: 255 if x < 235 else 0).getbbox()
    im.crop((max(0, l - 30), max(0, t - 20), min(w, r + 50), min(h, b + 60))).save(png)

def svgs():
    p = page('svg', "document.body.innerHTML='<pre id=o></pre>';document.getElementById('o').textContent=JSON.stringify({happy:mascotSvg('happy'),smile:mascotSvg('smile'),logo:LOGO_SVG});")
    out = subprocess.run([CH, '--headless=new', '--allow-file-access-from-files', f'--user-data-dir={TMP}/ud_svg', '--virtual-time-budget=1500', '--dump-dom', p],
                         capture_output=True, text=True).stdout
    d = json.loads(H.unescape(re.search(r'<pre id="o">(.*?)</pre>', out, re.S).group(1)))
    json.dump(d, open(f'{OUT}/svg.json', 'w'))

if __name__ == '__main__':
    svgs()
    # 네? 아니요?: 질문 → (기다리면 정답이 반짝) → 정답 누름
    yes = "playGame(GAMES.find(g=>g.id==='yesno'),{level:0});"
    shot('yesno_q', "settings.autoHint=false;" + yes)
    shot('yesno_hint', "settings.autoHint=true;" + yes, budget=14000)
    shot('yesno_ok', "settings.autoHint=true;" + yes + "setTimeout(()=>document.querySelector('.stage .hint')?.click(),11000);", budget=11500)
    sheet('ws_count', 'count')
    print('ok', sorted(os.listdir(OUT)))

def brag(name='brag_card', stars=3, stickers=7, date=(2026, 11, 2, 19, 30)):
    # 실제 자랑 카드(bragImage)를 그 날짜로 그려 PNG로 저장
    y, mo, d, h, mi = date
    js = (f"const RD=Date;window.Date=class extends RD{{constructor(...a){{super(...(a.length?a:[{y},{mo},{d},{h},{mi}]))}}static now(){{return new RD({y},{mo},{d},{h},{mi}).getTime()}}}};"
          f"bragImage({stars},{stickers}).then(b=>{{const r=new FileReader();r.onload=()=>{{document.body.innerHTML='<pre id=o></pre>';document.getElementById('o').textContent=r.result}};r.readAsDataURL(b)}});")
    out = subprocess.run([CH, '--headless=new', '--allow-file-access-from-files', f'--user-data-dir={TMP}/ud_{name}', '--virtual-time-budget=4000', '--dump-dom', page(name, js)],
                         capture_output=True, text=True).stdout
    import base64
    b64 = re.search(r'<pre id="o">data:image/png;base64,(.*?)</pre>', out, re.S).group(1)
    open(f'{OUT}/{name}.png', 'wb').write(base64.b64decode(b64))
