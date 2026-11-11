# SQLD Sprint

SQLD 벼락치기를 위한 인터랙티브 문제 풀이·SQL 실습 화면입니다.

**[학습 화면 열기](https://jejudogam.github.io/)**

- 10문제 벼락치기: 답을 고른 뒤 바로 채점·해설 확인
- 50문제·90분 모의고사: 모델링 10문제 + SQL 40문제, 과목별 과락 판정
- SQL 미션 12개: 실제 SQLite 실행, 원본·추가 데이터에서 결과 비교
- 오답 노트, 북마크, 핵심 요약 검색, 브라우저 자동 저장
- 단일 `index.html` 파일을 내려받으면 인터넷 없이도 사용 가능

문제는 자체 제작한 연습문제로 공식 기출·복원 문제가 아닙니다. 학습 기록과 쿼리 초안은 현재 브라우저에만 저장되며 다른 기기와 동기화되지 않습니다. 모의고사 제한 시간은 브라우저를 닫아도 계속 흐릅니다.

## 실행과 수정

`index.html`을 최신 Chrome 또는 Edge에서 열면 됩니다. 외부 CDN이나 별도 서버는 필요하지 않습니다.

Node.js가 설치된 환경에서:

```sh
node build.mjs
node check.mjs
```

`src/`의 화면·문제·동작과 `vendor/`의 엔진을 합쳐 `index.html`과 검사용 `dist/index.html`을 생성합니다. 변경 후 루트 `index.html`을 함께 커밋하면 GitHub Pages에 반영됩니다. `.nojekyll`은 정적 파일을 그대로 배포하도록 합니다.

## 실습 범위

sql.js 1.14.1의 실제 SQLite 엔진을 Web Worker에서 실행합니다. 조회는 읽기 전용이며 매 실행마다 원본 데이터로 시작합니다. 최대 500행, 초기화를 포함해 8초까지 실행합니다. 채점은 결과의 값·열 순서·중복·NULL과 문제에서 지정한 행 정렬을 비교하며 특정 SQL 구문 자체를 강제하지는 않습니다.

Oracle의 NVL·ROLLUP·CONNECT BY·PIVOT·GRANT 등은 SQLite에서 직접 지원하지 않으므로 개념 문제로 학습합니다. DBMS별 NULL·정렬·스칼라 서브쿼리 차이는 화면에서 안내합니다.

## 확인 사항과 자료

- 기능 검사 22개 통과: SQL 실행·채점, 과락, 시간 만료, 오답 복습, 저장 복원, 단일 HTML 조립 및 Worker 초기화.
- 브라우저 자동화 환경의 연결 제한으로 시각·모바일 실기 검증은 수행하지 못했습니다.
- [DataQ SQL 자격 안내](https://www.dataq.or.kr/www/sub/a_04.do)
- [SQLite SELECT 문서](https://www.sqlite.org/lang_select.html)
- [Oracle SQL 문서](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/)
- [sql.js](https://github.com/sql-js/sql.js), MIT. 라이선스는 `LICENSE.sql.js`, `vendor/LICENSE.sql.js` 및 HTML 내부에 포함됩니다.
