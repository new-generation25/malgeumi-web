/**
 * 〈그녀들의 이름〉 이름의 벽 — 공유형 참여 게시판 → 구글 시트 기록·조회
 *
 * 만드는 법
 * 1) 새 구글 시트를 하나 만든다 (이름은 아무거나 상관없다. 예: 「이름의 벽 응답」).
 * 2) 메뉴 확장 프로그램 → Apps Script.
 * 3) 기본으로 열려 있는 Code.gs 내용을 지우고 이 파일 전체를 붙여넣는다.
 * 4) 저장한 뒤 오른쪽 위 배포 → 새 배포.
 *    - 유형: 웹 앱
 *    - 다음으로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 *    배포를 누르면 처음 한 번은 권한 확인 화면이 뜬다. 내 계정으로 진행하면 된다.
 * 5) 배포가 끝나면 나오는 웹 앱 URL(.../exec 로 끝남)을 복사한다.
 * 6) hernames.html 에서 BOARD_API 상수 자리에 그 주소를 붙여넣는다
 *    (두 곳: <script> 안의 BOARD_API 변수 — "이름의 벽 (공유형 게시판)" 스크립트 블록).
 *
 * 시트를 고치고 다시 배포할 때는 배포 → 배포 관리 → 연필(수정) → 새 버전 → 배포를 눌러야
 * 주소가 그대로 유지된다. "새 배포"를 새로 누르면 주소가 바뀌어 hernames.html도 다시 고쳐야 한다.
 * 자세한 절차는 docs/인수인계.md 6절 (구독 폼과 같은 방식).
 *
 * ⚠ Apps Script는 요청 헤더로 "우리 홈페이지에서 온 요청인지" 확인할 방법이 없다.
 *   주소를 아는 사람은 누구나 여기에 값을 넣을 수 있다. 그래서:
 *   - 필드 길이를 짧게 자른다 (도배 방지)
 *   - 호칭 개수를 8개로 제한한다
 *   - HTML 태그는 지운다
 *   장난·욕설이 올라오면 시트에서 그 줄만 지우면 된다 (화면에는 최근 것부터 다시 보인다).
 *   더 강한 도배 방지(예: 캡차)가 필요해지면 그때 따로 붙이면 된다.
 */

var SHEET_NAME = '이름의 벽';
var MAX_LIST = 300;      // GET으로 내려줄 때 최근 몇 개까지 보여줄지
var MAX_FIELD_LEN = 40;  // 필드 하나의 최대 글자 수
var MAX_CALLS = 8;       // 호칭 개수 상한

function getSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['시각', '호칭들(|로 구분)', '이름', '내일의 이름']);
  }
  return sheet;
}

// 태그·제어문자 제거, 길이 제한. 완전히 비면 빈 문자열을 돌려준다.
function clean_(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]*>/g, '').replace(/[\r\n\t]/g, ' ').trim().slice(0, MAX_FIELD_LEN);
}

function doGet() {
  var sheet = getSheet_();
  var rows = sheet.getDataRange().getValues();
  rows.shift(); // 헤더 제거
  var entries = rows.slice(-MAX_LIST).map(function (r) {
    return {
      ts: r[0],
      calls: String(r[1] || '').split('|').filter(Boolean),
      name: r[2] || '',
      tomorrow: r[3] || ''
    };
  });
  return json({ entries: entries });
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    var calls = String(p.calls || '').split('|').map(clean_).filter(Boolean).slice(0, MAX_CALLS);
    var name = clean_(p.name);
    var tomorrow = clean_(p.tomorrow);

    if (!calls.length || !name || !tomorrow) {
      return json({ ok: false, error: '호칭·이름·내일의 이름을 모두 적어주세요.' });
    }

    getSheet_().appendRow([new Date(), calls.join('|'), name, tomorrow]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
