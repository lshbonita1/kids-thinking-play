#!/bin/bash
# 사이트 점검 도구 실행 (내 컴퓨터에서만, 사이트에는 올라가지 않음)
#   tools/test/run.sh audit                 모든 화면 × 5가지 화면 크기 점검 (오류 · 넘침 · 잘림)
#   tools/test/run.sh play [놀이id,놀이id]   놀이를 정답 힌트를 눌러 끝까지 자동으로 해 보기 (기본: 새 놀이 10가지)
#   tools/test/run.sh gamedata              놀이 소개 페이지용 tools/gamedata.json 다시 만들기
# 필요: 구글 크롬, python3
set -e
cd "$(dirname "$0")/../.."
PORT=8765
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
dump() { "$CHROME" --headless=new --disable-gpu --virtual-time-budget="$2" --dump-dom "http://localhost:$PORT/tools/test/$1" 2>/dev/null \
  | python3 -c "import sys,re,html;m=re.search(r'<pre id=\"out\">(.*?)</pre>',sys.stdin.read(),re.S);print(html.unescape(m.group(1)) if m else '결과를 못 받았어요')"; }
case "$1" in
  audit) dump audit.html 600000 ;;
  play) dump "play.html?games=${2:-}" 3000000 ;;
  gamedata) dump gamedata.html 20000 | python3 -c "import json,sys;json.dump(json.load(sys.stdin),open('tools/gamedata.json','w'),ensure_ascii=False,indent=1)" && echo "tools/gamedata.json 저장" ;;
  *) echo "사용법: $0 audit | play [놀이id,...] | gamedata"; exit 1 ;;
esac
