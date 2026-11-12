# 사이트 점검 도구

고친 뒤 올리기 전에 내 컴퓨터에서 돌려 보는 도구예요. `tools/` 폴더는 사이트에 올라가지 않아요(.vercelignore).

| 명령 | 하는 일 |
|---|---|
| `tools/test/run.sh audit` | 모든 화면(홈 5개 탭, 도우미, 학습지, 놀이 57가지 × 난이도 3단계)을 화면 크기 5가지로 열어 오류 · 가로 넘침 · 글자 잘림을 찾아요. 결과의 `errors`가 0이고 `issues`가 비어 있으면 통과예요. |
| `tools/test/run.sh play gaze,yesno` | 놀이를 정답 힌트를 눌러 가며 끝까지 해 봐요. `ok`면 결과 화면까지 간 것, `STUCK`이면 중간에 멈춘 거예요. 힌트를 누르는 방식이라 끌어서 하는 놀이는 맞지 않아요. |
| `tools/test/run.sh gamedata` | 놀이 목록을 `tools/gamedata.json`으로 내보내요. 그다음 `python3 tools/build-game-pages.py`로 놀이 소개 페이지를 다시 만들어요. |
| `tools/test/shot.html?g=놀이id&lv=0` | 서버를 켠 상태(`python3 -m http.server 8765`)에서 브라우저로 열면 그 놀이 화면을 바로 볼 수 있어요. |

- 오프라인 저장(sw.js)은 내 컴퓨터에서는 꺼져 있어요(고친 파일이 바로 보이게). 시험하려면 주소에 `?sw=1`을 붙여요.
- 올릴 때는 `index.html`의 `?v=`와 `app.js`의 `APP_VERSION`을 같은 숫자로 하나 올려요.
