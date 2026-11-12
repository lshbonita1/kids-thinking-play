# 놀이별 소개 페이지(games/*.html)와 모아 보기(games/index.html), 선생님 안내(teacher.html), sitemap.xml 만들기
# 놀이 정보는 tools/gamedata.json (사이트의 GAMES · CATEGORIES에서 뽑은 것), 설명 글은 아래 GUIDE
# 실행: python3 tools/build-game-pages.py
import json, html, pathlib, datetime, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / 'tools' / 'gamedata.json').read_text())
SITE = 'https://ssukssuknori.app'
TODAY = datetime.date.today().isoformat()

# 놀이마다: 이렇게 놀아요 / 단계별로 달라져요
GUIDE = {
  'gaze': ('쑥쑥이가 먼저 아이를 바라본 뒤, 고개와 눈을 한 물건 쪽으로 돌려요. 쑥쑥이가 보는 것을 찾아 눌러요. 다른 사람이 보는 곳을 함께 보는 힘(공동주의)을 길러요.', '쉬움은 손가락으로 가리키며 바라보고(보기 2개), 보통은 몸과 눈을 돌리고(3개), 어려움은 눈길만 움직여요(4개).'),
  'yesno': ('사진을 보고 "이건 사과예요?" 하는 질문에 👍 네, 👎 아니요로 대답해요. 네 · 아니요 단추는 늘 같은 자리에 있어요.', '쉬움은 아주 다른 이름으로 묻고, 보통은 비슷한 것끼리도 묻고, 어려움은 "동물이에요?"처럼 종류도 물어요.'),
  'fill': ('"멍멍…", "가위, 바위…"처럼 말을 하다 멈추면, 이어질 말을 그림에서 골라요. 주고받는 말(이어 말하기)의 첫걸음이에요.', '쉬움은 동물 · 탈것 소리, 보통은 짝말(신발이랑 양말), 어려움은 "비가 오면 쓰는…" 같은 긴 말이에요.'),
  'two': ('"빨간 공"처럼 색과 이름 두 가지를 듣고 찾아요. 보기에는 색만 같거나 이름만 같은 것이 섞여 있어 끝까지 들어야 해요.', '보기가 2개에서 4개까지 늘고, 어려움에서는 색 · 이름이 모두 비슷한 보기가 함께 나와요.'),
  'real': ('진짜 사진을 보고 같은 것을 그림에서 찾아요. 그림책에서 배운 것을 실제 모습과 이어 주는 연습(일반화)이에요.', '보기가 2개에서 4개까지 늘고, 어려움 뒤쪽에서는 거꾸로 그림을 보고 사진을 찾아요.'),
  'share': ('접시마다 간식을 하나씩 놓아요. 놓을 때마다 "하나, 둘, 셋" 함께 세요. 이미 놓은 접시를 누르면 빈 접시를 알려 줘요.', '접시가 2개에서 4개로 늘고, 어려움에서는 동물 친구마다 하나씩 나눠 줘요.'),
  'calm': ('속상한 상황과 마음 크기(조금 · 많이 · 아주 많이)를 보고, 숨 쉬기 · 쉬는 곳 가기처럼 도움이 되는 방법을 골라요.', '쉬움은 작은 속상함에서 2개 중 고르고, 단계가 올라가면 큰 속상함과 보기 3개가 나와요.'),
  'hidden': ('여러 그림 사이에 숨은 그림을 찾아요. 그림이 살짝 기울어져 흩어져 있어요.', '쉬움은 6칸에서 1개, 보통은 9칸에서 1개, 어려움은 12칸에서 2개를 찾아요.'),
  'wh': ('"어디에서 자요?", "누가 불을 꺼요?" 같은 질문을 듣고 그림으로 대답해요. 그림 아래 이름도 함께 보여요.', '쉬움은 어디 · 무엇 질문, 보통은 동물 질문까지, 어려움은 누가 · 언제 질문까지 나와요.'),
  'letter': ('한글과 처음 만나는 놀이예요. 보기 글자는 모양이 많이 다른 것만 골라 헷갈리지 않아요.', '쉬움은 똑같은 글자 찾기, 보통은 소리를 듣고 글자 찾기("나비의 나"), 어려움은 그림을 보고 첫 글자 찾기예요.'),
  'copy': ('왼쪽 3×3 칸에 칠해진 모양을 보고, 오른쪽 빈 칸을 똑같이 눌러 칠해요.', '쉬움은 2~3칸, 어려움은 4~5칸을 칠해요.'),
  'lines': ('점과 점 사이에 그어진 선을 보고, 손가락으로 똑같이 선을 그어요.', '쉬움은 곧은 선 1~2개, 어려움은 대각선을 포함해 3~4개예요.'),
  'listen': ('"사과를 찾아요"처럼 이름을 듣고 알맞은 실제 사진을 골라요.', '보기 그림이 2개에서 4개까지 늘어나요.'),
  'feel': ('웃는 얼굴, 우는 얼굴 같은 표정과 "선물을 받았어요" 같은 상황을 보고 기분을 골라요.', '쉬움은 기뻐요 · 슬퍼요, 어려움은 화나요 · 무서워요까지 나와요.'),
  'match': ('강아지와 뼈다귀, 비와 우산처럼 함께 쓰이는 짝을 골라요.', '보기가 2개에서 3개로 늘어나요.'),
  'routine': ('손 씻기, 밥 먹기 같은 생활 순서를 그림으로 차례대로 놓아요.', '단계가 늘어날수록 놓아야 할 그림이 많아져요.'),
  'space': ('"위에 뭐 있어?", "아래에 뭐 있어?"를 듣고 물건의 위치를 찾아요.', '위 · 아래에서 시작해 앞 · 뒤 · 옆까지 넓어져요.'),
  'memory': ('잠깐 보여 준 칸 모양을 기억했다가 똑같이 칠해요.', '기억할 칸이 2개에서 4개까지 늘어나요.'),
  'pattern': ('사과, 바나나, 사과…처럼 반복되는 규칙을 보고 빈칸에 들어갈 그림을 골라요.', 'AB 규칙에서 시작해 AAB, ABC 규칙까지 나와요.'),
  'count': ('흩어진 그림을 하나, 둘, 셋 세어 맞는 숫자를 골라요.', '쉬움은 1~4개, 어려움은 8개까지 세어요.'),
  'odd': ('같은 그림 사이에 섞인 다른 하나를 찾아요.', '4칸에서 6칸으로 늘고, 어려움에서는 같은 종류(과일끼리 · 동물끼리) 중에서 모양이 다른 것을 찾아요.'),
  'flip': ('카드를 잠깐 보여 준 뒤 뒤집으면, 같은 그림 두 장을 찾아 맞춰요.', '짝이 2쌍에서 5쌍까지 늘어나요.'),
  'shadow': ('그림과 꼭 맞는 검은 그림자를 골라요.', '보기가 2개에서 3개로 늘어나요.'),
  'order': ('작은 것부터, 작은 수부터, 자라는 순서대로 차례를 맞춰요.', '놓을 그림이 2개에서 4개까지 늘어나요.'),
  'trace': ('애벌레 같은 친구를 손가락으로 끌어 길을 따라 도착점까지 데려다줘요.', '직선 → 곡선 → 지그재그 → ㄷ자로 길이 어려워지고, 길 폭이 좁아져요.'),
  'sort': ('그림을 끌어서(또는 톡 눌러서) 같은 그림이 붙은 바구니에 넣어요.', '바구니가 2개에서 3개로, 옮길 그림이 3개에서 6개로 늘어나요.'),
  'balloon': ('풍선을 톡톡 눌러 터뜨려요. 보통부터는 "빨간 풍선을 터뜨려요"처럼 정한 색만 터뜨려요.', '쉬움은 모두 터뜨리기, 어려움은 세 가지 색 중에서 골라요.'),
  'mole': ('구멍에서 쏙 나온 친구를 톡 잡아요.', '쉬움은 잡을 때까지 기다려 주고, 어려움은 다른 친구가 섞여 나와 정한 친구만 잡아요.'),
  'body': ('"코는 어디 있어요?"를 듣고 그림에서 그곳을 눌러요.', '쉬움은 눈 · 코 · 입, 어려움은 온몸 그림에서 손 · 발 · 배까지 찾아요.'),
  'size': ('같은 그림 중에서 큰 것, 작은 것을 골라요.', '2개 중에서 시작해 3개 중 가장 큰 것 · 가장 작은 것을 골라요.'),
  'puzzle': ('실제 사진 조각을 끌어서 맞는 자리에 놓아 그림을 완성해요.', '2조각에서 6조각까지 늘고, 쉬움 · 보통은 흐린 밑그림이 깔려 있어요.'),
  'use': ('"먹는 것을 골라요", "타는 것을 골라요"처럼 쓰임을 듣고 알맞은 그림을 골라요.', '먹는 것 · 타는 것 · 입는 것에서 하늘을 나는 것 · 씻을 때 쓰는 것까지 넓어져요.'),
  'imitate': ('쑥쑥이가 보여 주는 박수, 손 흔들기, 만세 같은 동작을 몸으로 따라 해요. 보호자가 "했어요"를 눌러 줘요.', '어려움에서는 동작 두 개를 이어서 따라 해요.'),
  'steps': ('"공을 누르고, 별을 눌러요"를 듣고 순서대로 눌러요.', '그림 4개 중 2개에서, 6개 중 3개를 차례로 누르기까지 늘어나요.'),
  'sound': ('"멍멍" 같은 소리를 듣고 누구의 소리인지 골라요.', '동물 소리에서 시작해 빵빵 · 따르릉 같은 탈것 · 물건 소리까지 나와요.'),
  'verb': ('"자는 친구", "달리는 친구"처럼 동작을 듣고 알맞은 그림을 골라요.', '보기가 2개에서 4개까지 늘어나요.'),
  'color': ('"빨간색", "동그라미"를 듣고 골라요.', '색깔 → 모양 → "초록 하트"처럼 색과 모양을 함께 듣고 골라요.'),
  'number': ('큰 숫자를 보고 그만큼 있는 그림을 골라요.', '쉬움은 1~3, 어려움은 1~5까지예요.'),
  'opposite': ('많다 · 적다, 뜨겁다 · 차갑다, 안 · 밖처럼 반대되는 그림 중 하나를 골라요.', '단계가 오를수록 길다 · 짧다, 가득 · 텅 빈 같은 개념이 더해져요.'),
  'need': ('"비가 와요. 무엇이 필요할까요?"처럼 상황을 보고 필요한 물건을 골라요.', '단계가 오를수록 상황이 다양해지고 보기가 늘어나요.'),
  'turn': ('쑥쑥이와 블록을 하나씩 번갈아 쌓아요. 쑥쑥이 차례에는 기다려요.', '쌓을 블록이 4개에서 8개로 늘고, 쑥쑥이 차례가 길어져요.'),
  'wait': ('모래시계가 다 내려갈 때까지 기다리면 선물 상자가 열려요.', '3초에서 시작해 12초까지 기다리는 시간이 늘어나요.'),
  'social': ('"선물을 받았어요"처럼 상황을 보고 "고마워요", "미안해요" 같은 알맞은 말을 골라요.', '상황이 4가지에서 8가지로 늘고 보기도 많아져요.'),
  'missing': ('그림 몇 개를 잘 보고 기억하면, 하나가 사라져요. 무엇이 없어졌는지 골라요.', '기억할 그림이 3개에서 5개까지 늘어나요.'),
  'half': ('반쪽만 보이는 그림을 보고 무엇인지 맞혀요.', '보기가 늘어나고, 어려움에서는 오른쪽 반쪽도 나와요.'),
  'safety': ('불, 칼, 콘센트처럼 만지면 위험한 것을 골라요.', '어려움에서는 거꾸로 안전하게 갖고 놀 수 있는 것도 골라요.'),
  'group': ('과일은 과일끼리, 동물은 동물끼리 바구니에 끌어 넣어요.', '바구니가 2개에서 3개로, 나눌 그림이 3개에서 6개로 늘어나요.'),
  'weather': ('더운 날 입는 옷, 비 오는 날 필요한 것처럼 날씨와 하루에 맞는 그림을 골라요.', '날씨에서 시작해 밤 · 아침에 하는 일까지 넓어져요.'),
  'rhythm': ('쑥쑥이가 친 북소리를 잘 듣고, 똑같은 만큼 북을 쳐요.', '"쿵쿵"에서 시작해 "쿵쿵 — 쿵"처럼 쉬었다 치는 리듬까지 나와요.'),
  'why': ('슬픈 얼굴을 보고 "아이스크림을 떨어뜨렸어요"처럼 그 기분이 된 이유를 골라요.', '기뻐요 · 슬퍼요에서 화나요 · 무서워요까지 넓어져요.'),
  'fish': ('바닷속을 헤엄치는 물고기 중에서 "빨간 물고기를 잡아요"처럼 말한 색의 물고기를 톡 잡아요.', '물고기가 2마리에서 4마리로 늘고, 헤엄치는 속도가 조금씩 빨라져요.'),
  'tower': ('좌우로 움직이는 블록을 톡 눌러 떨어뜨려 탑을 쌓아요. 많이 비켜 나도 탑 위에 걸쳐져서 실패 없이 쌓여요.', '쌓을 블록이 3개에서 5개로 늘고, 블록이 조금 더 빨리 움직여요.'),
  'catch': ('위에서 천천히 떨어지는 과일을 바구니를 끌어서(또는 ◀ ▶ 버튼으로) 받아요. 놓치면 다시 떨어져요.', '받을 과일이 3개에서 5개로 늘고, 떨어지는 속도가 조금 빨라져요.'),
  'dots': ('1번부터 순서대로 점을 누르면 선이 이어지고, 다 이으면 연 · 집 · 별 같은 그림이 나타나요.', '점이 4개에서 시작해 5개, 7~10개까지 늘어나요.'),
  'egg': ('알을 톡톡 두드리면 금이 가고 병아리 · 펭귄 · 공룡 같은 동물이 나와요. 나온 동물은 도감에 모여요.', '두드리는 횟수가 늘고, 보통부터는 "누가 나왔어요?"를 듣고 이름을 골라요.'),
  'say': ('그림을 보고 이름을 말해요. 아이가 말하면 보호자가 [말했어요]를 눌러 줘요. 비슷하게 말해도 괜찮아요.', '쉬움은 듣고 따라 말하기, 보통은 첫소리 힌트를 보고 말하기, 어려움은 혼자 이름 말하기예요.'),
  'family': ('보호자가 넣은 가족 · 선생님 사진으로 "엄마는 어디 있어요?" 놀이를 해요. 사진은 휴대폰 안에만 저장돼요.', '보기 사진이 2장에서 4장까지 늘어나요.'),
}
# 놀이와 이어지는 종이 학습지
WORKSHEET_FOR = {'copy': 'copy', 'lines': 'lines', 'trace': 'trace', 'shadow': 'shadow', 'odd': 'odd', 'count': 'count',
                 'pattern': 'pattern', 'size': 'size', 'number': 'number', 'flip': 'match', 'match': 'match'}

esc = html.escape
# 결과 화면의 '오늘 집에서 해 보기' 글을 app.js에서 그대로 가져옴 (한 곳만 고치면 되게)
_app = (ROOT / 'app.js').read_text(encoding='utf-8')
_block = _app[_app.index('const HOME_TRY = {'):]
_block = _block[:_block.index('\n};')]
HOME_TRY = dict(re.findall(r"^  (\w+): '(.+)',?$", _block, re.M))
games = {g['id']: g for g in DATA['games']}
cat_of = {gid: c for c in DATA['cats'] for gid in c['games']}
ws_title = {w['id']: w['title'] for w in DATA['worksheets']}
missing = [g for g in games if g not in GUIDE or g not in HOME_TRY]
assert not missing, f'GUIDE에 설명이 없는 놀이: {missing}'

STYLE = """
:root { --bg: #fbf8f2; --card: #fff; --line: #ebe4d6; --ink: #4a3f31; --muted: #8a7a62; --green: #3f8a55; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: 'Gowun Dodum', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 16px; line-height: 1.75; }
.wrap { max-width: 720px; margin: 0 auto; padding-block: 22px 56px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 18px; }
.brand { display: flex; align-items: center; gap: 8px; color: var(--ink); text-decoration: none; font-family: 'Jua', sans-serif; font-size: 20px; }
.brand img { width: 34px; height: 34px; }
.crumb { color: var(--muted); font-size: 14px; }
.crumb a { color: var(--muted); }
.hero { display: flex; align-items: center; gap: 16px; margin: 6px 0 10px; }
.hero .icon { display: grid; place-items: center; flex: none; width: 76px; height: 76px; border-radius: 22px; font-size: 44px; }
h1 { margin: 0; font-family: 'Jua', sans-serif; font-weight: 400; font-size: 30px; line-height: 1.3; }
.lead { margin: 4px 0 0; color: var(--muted); font-size: 17px; }
.cta { display: block; margin: 18px 0 8px; padding: 16px; border-radius: 20px; background: #ffd76e; box-shadow: 0 5px 0 #e9b44c; color: #5b4320; font-family: 'Jua', sans-serif; font-size: 22px; text-align: center; text-decoration: none; }
.free { margin: 0 0 22px; color: var(--muted); font-size: 14px; text-align: center; }
section { margin: 0 0 14px; padding: 16px 18px; border: 2px solid var(--line); border-radius: 20px; background: var(--card); }
h2 { margin: 0 0 6px; font-family: 'Jua', sans-serif; font-weight: 400; font-size: 20px; }
section p { margin: 0; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tags span { padding: 2px 10px; border-radius: 999px; background: #e3f3e6; color: var(--green); font-size: 14px; }
.tip { background: #f4effc; border-color: #d9cbf0; }
.home { background: #eef7ee; border-color: #cfe7d3; }
.home .note { margin-top: 6px; color: var(--muted); font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.g { display: flex; align-items: center; gap: 10px; padding: 12px; border: 2px solid var(--line); border-radius: 16px; background: #fff; color: var(--ink); text-decoration: none; }
.g .i { display: grid; place-items: center; flex: none; width: 42px; height: 42px; border-radius: 12px; font-size: 24px; }
.g b { font-weight: 400; font-family: 'Jua', sans-serif; font-size: 16px; line-height: 1.3; }
.g small { display: block; color: var(--muted); font-size: 13px; line-height: 1.4; }
.cat { margin: 26px 0 10px; }
.cat h2 { margin: 0; }
.cat p { margin: 0; color: var(--muted); font-size: 15px; }
footer { margin-top: 30px; color: var(--muted); font-size: 14px; text-align: center; }
footer a { color: var(--muted); }
@media (max-width: 420px) { .grid { grid-template-columns: 1fr; } h1 { font-size: 26px; } }
"""

def page(title, desc, path, body, og_title=None):
    url = f'{SITE}/{path}'
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="쑥쑥 생각놀이">
  <meta property="og:title" content="{esc(og_title or title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:image" content="{SITE}/icons/og-image.png">
  <link rel="icon" type="image/svg+xml" href="/icons/icon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap" rel="stylesheet">
  <style>{STYLE}</style>
</head>
<body>
  <main class="wrap">
    <header class="top">
      <a class="brand" href="/"><img src="/icons/icon.svg" alt="">쑥쑥 생각놀이</a>
      <span class="crumb"><a href="/games/">놀이 {len(games)}가지</a></span>
    </header>
{body}
    <footer>
      <a href="/">쑥쑥 생각놀이 홈</a> · <a href="/games/">놀이 모아 보기</a> · <a href="/faq.html">자주 묻는 질문</a> · <a href="/teacher.html">선생님 안내</a> · <a href="/privacy.html">개인정보처리방침</a><br>
      천천히 배우는 아이를 위한 무료 그림 놀이 · 회원가입 · 광고 없음
    </footer>
  </main>
</body>
</html>
"""

def card(g):
    return f'<a class="g" href="/games/{g["id"]}.html"><span class="i" style="background:{g["color"]}">{g["icon"]}</span><span><b>{esc(g["title"])}</b><small>{esc(g["desc"])}</small></span></a>'

out = ROOT / 'games'
out.mkdir(exist_ok=True)
for gid, g in games.items():
    how, levels = GUIDE[gid]
    c = cat_of.get(gid)
    friends = [games[x] for x in (c['games'] if c else []) if x != gid][:6]
    ws = WORKSHEET_FOR.get(gid)
    body = f"""    <div class="hero"><span class="icon" style="background:{g['color']}">{g['icon']}</span>
      <div><h1>{esc(g['title'])}</h1><p class="lead">{esc(g['desc'])}</p></div></div>
    <a class="cta" href="/?play={gid}">▶ 지금 무료로 해 보기</a>
    <p class="free">설치 · 회원가입 없이 바로 시작해요</p>
    <section><h2>🧩 이렇게 놀아요</h2><p>{esc(how)}</p></section>
    <section><h2>🌱 이런 힘을 키워요</h2><p>{esc(c['name'] if c else '')} 영역 놀이예요. {esc(c['desc'] if c else '')}.</p>
      <div class="tags">{''.join(f'<span>{esc(s.strip())}</span>' for s in g['skill'].split('·'))}</div></section>
    <section><h2>🎚️ 단계별로 달라져요</h2><p>쉬움 · 보통 · 어려움 세 단계가 있어요. {esc(levels)} 틀리면 정답이 반짝여서 다시 해 볼 수 있어요.</p></section>
    {f'<section class="tip"><h2>👪 보호자 도움말</h2><p>{esc(g["tip"])}</p></section>' if g.get('tip') else ''}
    {f'<section class="home"><h2>🏠 집에서 이렇게 이어 가요</h2><p>{esc(HOME_TRY[gid])}</p><p class="note">화면에서 한 것을 생활 속 실제 물건 · 상황으로 한 번 더 해 보면 더 잘 익혀요. 놀이가 끝나면 결과 화면에도 같은 안내가 나와요.</p></section>' if gid in HOME_TRY else ''}
    {f'<section><h2>🖨️ 종이 학습지로도 해요</h2><p>‘{esc(ws_title[ws])}’ 학습지를 A4로 인쇄해서 연필로 할 수 있어요. 사이트의 놀이 탭 맨 위 ‘종이 학습지’에서 인쇄해요.</p></section>' if ws else ''}
    {f'<div class="cat"><h2>함께 하면 좋은 놀이</h2></div><div class="grid">{"".join(card(f) for f in friends)}</div>' if friends else ''}"""
    desc = f"{g['title']}: {g['desc']}. {how} 천천히 배우는 아이를 위한 무료 그림 놀이, 쑥쑥 생각놀이."
    (out / f'{gid}.html').write_text(page(f"{g['title']} - 천천히 배우는 아이를 위한 무료 놀이 | 쑥쑥 생각놀이", desc[:150], f'games/{gid}.html', body, g['title']))

# 모아 보기
sections = []
for c in DATA['cats']:
    sections.append(f"""    <div class="cat"><h2>{c['icon']} {esc(c['name'])}</h2><p>{esc(c['desc'])}</p></div>
    <div class="grid">{''.join(card(games[x]) for x in c['games'])}</div>""")
index_body = f"""    <h1>쑥쑥 생각놀이 놀이 {len(games)}가지</h1>
    <p class="lead">천천히 배우는 아이가 집에서 놀이하듯 연습하는 무료 그림 놀이예요. 놀이를 누르면 자세한 설명과 바로 해 보기가 있어요.</p>
    <a class="cta" href="/">▶ 오늘의 학습 바로 시작하기</a>
    <p class="free">설치 · 회원가입 · 광고 없이 무료</p>
{chr(10).join(sections)}"""
(out / 'index.html').write_text(page(f'놀이 {len(games)}가지 모아 보기 | 쑥쑥 생각놀이', f'짝 맞추기, 소리 듣고 찾기, 말하기 카드 등 천천히 배우는 아이를 위한 무료 그림 놀이 {len(games)}가지를 영역별로 모았어요.', 'games/', index_body))

# 선생님 · 치료사 안내 (teacher.html): 기관에 보내는 메일 · 포스터 QR이 여기로 이어짐
_dom = _app[_app.index('const DOMAINS = {'):]
DOMAINS = dict(re.findall(r"(\w+): '([^']+)'", _dom[:_dom.index('};')]))
TEACHER_URL = f'{SITE}/?qr=teacher'
dom_sections = ''.join(f"""    <div class="cat"><h2>{c['icon']} {esc(DOMAINS.get(c['id'], c['name']))}</h2><p>{esc(c['name'])} · {esc(c['desc'])}</p></div>
    <div class="grid">{''.join(card(games[x]) for x in c['games'])}</div>
""" for c in DATA['cats'])
ws_names = ' · '.join(w['title'] for w in DATA['worksheets'])
teacher_body = f"""    <h1>선생님 · 치료사께</h1>
    <p class="lead">센터 수업에서 한 연습을 집에서도 이어 가도록 만든 무료 그림 놀이예요. 보호자에게 주소 하나만 알려 주시면 돼요. 설치 · 회원가입 · 광고가 없어요.</p>
    <a class="cta" href="{TEACHER_URL}">▶ 사이트 열어 보기</a>
    <p class="free">ssukssuknori.app</p>
    <section class="home"><h2>🏠 가정 연계 과제로 이렇게 써요</h2>
      <p>수업 목표와 비슷한 놀이를 아래 영역별 목록에서 골라 보호자에게 알려 주세요. 놀이 이름을 누르면 나오는 소개 페이지 주소를 보내면, 보호자가 ‘지금 무료로 해 보기’를 눌러 그 놀이를 바로 열 수 있어요.</p>
      <p class="note">모든 놀이에 쉬움 · 보통 · 어려움이 있고, 틀리면 정답이 반짝여 아이가 직접 눌러 끝내요. ‘오늘의 학습’은 하루 10문제로 놀이가 날마다 골고루 바뀌어요.</p></section>
    <section><h2>📋 집에서 한 연습을 한 장으로</h2>
      <p>기록 탭의 ‘선생님께 보여 드릴 기록 한 장’에서 최근 30일 동안 집에서 한 놀이의 정답률을 발달 영역별로 볼 수 있어요. 보호자가 화면을 캡처하거나 인쇄 · PDF로 저장해 가져올 수 있어요.</p>
      <p class="note">진단이나 평가 결과가 아니라, 집에서 한 연습의 참고 자료예요.</p></section>
    <section><h2>🖨️ 종이 학습지 {len(DATA['worksheets'])}가지</h2>
      <p>{esc(ws_names)}. A4로 바로 인쇄하고, 누를 때마다 새 문제가 나와요. 수업 · 과제용으로 자유롭게 나눠 주셔도 돼요. (사이트 놀이 탭 맨 위 ‘종이 학습지’)</p></section>
    <section><h2>🗣️ 생활 속에서 쓰는 도구</h2>
      <p>말하기 카드(그림을 누르면 대신 말해 줌, 아이가 좋아하는 물건 사진으로 카드 만들기), 그림 이야기 18가지(병원 · 미용실 · 어린이집 미리 보기), 먼저 · 다음 보드, 숨 쉬기 도구가 있어요.</p></section>
    <section class="tip"><h2>🔒 아이 기록과 사진</h2>
      <p>아이의 놀이 기록, 가족 사진, 직접 만든 카드 사진은 보호자 기기 안에만 저장되고 서버로 보내지 않아요.</p></section>
    <section><h2>✉️ 보호자께 보낼 안내 문구</h2>
      <p>아래 글을 그대로 복사해 알림장 · 문자로 보내셔도 돼요.</p>
      <p class="note" style="padding:12px 14px;border-radius:12px;background:#f6f3ee;color:var(--ink)">집에서 아이와 하루 10분, 그림 놀이로 연습해 보세요. ‘쑥쑥 생각놀이’는 설치 · 회원가입 없이 무료로 쓸 수 있어요. 👉 {TEACHER_URL}</p></section>
    <h2 style="margin-top:30px">🧩 발달 영역별 놀이 {len(games)}가지</h2>
{dom_sections}"""
(ROOT / 'teacher.html').write_text(page('선생님 · 치료사 안내 - 가정 연계 무료 그림 놀이 | 쑥쑥 생각놀이', f'센터 수업을 집에서 이어 가는 무료 그림 놀이. 발달 영역별 놀이 {len(games)}가지, 기록 한 장, 종이 학습지, 말하기 카드. 설치 · 회원가입 · 광고 없음.', 'teacher.html', teacher_body))

# 사이트맵
urls = [('', '1.0', 'weekly'), ('games/', '0.8', 'weekly'), ('faq.html', '0.6', 'monthly'), ('teacher.html', '0.7', 'monthly')] + [(f'games/{g}.html', '0.7', 'monthly') for g in games] + [('privacy.html', '0.3', 'yearly')]
(ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  ''.join(f'  <url><loc>{SITE}/{u}</loc><lastmod>{TODAY}</lastmod><changefreq>{f}</changefreq><priority>{p}</priority></url>\n' for u, p, f in urls) + '</urlset>\n')
print(f'놀이 페이지 {len(games)}개 · 모아 보기 · 사이트맵 {len(urls)}개 주소')
