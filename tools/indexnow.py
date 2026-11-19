# 빙 · 네이버 등에 바뀐 주소를 바로 알림 (IndexNow). 사이트에 올린 뒤 실행: python3 tools/indexnow.py
import json, pathlib, re, urllib.request
ROOT = pathlib.Path(__file__).resolve().parent.parent
KEY = '9ea944da846945569c69ae40181401c4'  # 사이트 맨 위의 9ea944da846945569c69ae40181401c4.txt 파일과 같아야 함
urls = re.findall(r'<loc>(.*?)</loc>', (ROOT / 'sitemap.xml').read_text()) + ['https://ssukssuknori.app/llms.txt']
body = json.dumps({'host': 'ssukssuknori.app', 'key': KEY, 'keyLocation': f'https://ssukssuknori.app/{KEY}.txt', 'urlList': urls}).encode()
for api in ('https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'):
    req = urllib.request.Request(api, data=body, headers={'Content-Type': 'application/json; charset=utf-8'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: print(api, r.status, len(urls), '개 주소')
    except urllib.error.HTTPError as e: print(api, e.code, e.read()[:200])
