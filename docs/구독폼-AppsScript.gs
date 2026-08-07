/**
 * 말그미극단 홈페이지 소식 구독 폼 → 구글 시트 기록
 *
 * 붙여넣는 곳: 「말그미극단 소식 구독자 명단」 시트 → 확장 프로그램 → Apps Script
 * 시트: https://docs.google.com/spreadsheets/d/1S8vb0Thx2P7-Wh1CQxV8TrU1zntcjrbitF27YJrczEw/edit
 *
 * ⚠ 이 파일만 고치면 반영되지 않습니다. Apps Script 편집기에서 고친 뒤
 *   배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포
 *   해야 합니다. ("새 배포"를 누르면 주소가 바뀌어 index.html도 고쳐야 합니다.)
 *   자세한 내용은 docs/인수인계.md 6절.
 *
 * 이 스크립트는 시트에 붙어 있으므로 SpreadsheetApp.getActive()로 바로 접근합니다.
 * (시트를 복사하면 사본에도 스크립트가 따라오고, 사본의 시트에 기록됩니다.)
 */

/*
 * 참고: Apps Script는 요청 헤더를 읽을 수 없어 "우리 홈페이지에서 온 요청인지"를
 * 확인할 방법이 없습니다. 주소를 아는 사람은 누구나 여기에 값을 넣을 수 있습니다.
 * 이름·휴대전화·동의 여부만 받고 다른 건 저장하지 않으며, 길이도 잘라둡니다.
 * 장난 데이터가 쌓이면 시트에서 지우고 웹앱을 재배포해 주소를 바꾸면 됩니다.
 */

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    // 이름과 휴대전화는 필수. 동의 없이 들어온 요청은 기록하지 않습니다.
    if (!p.name || !p.phone) return json({ ok: false, error: '이름과 휴대전화는 필수입니다.' });
    if (p.consent !== 'y')   return json({ ok: false, error: '개인정보 수집·이용 동의가 없습니다.' });

    var sheet = SpreadsheetApp.getActive().getSheets()[0];
    sheet.appendRow([
      new Date(),
      String(p.name).slice(0, 100),
      String(p.phone).slice(0, 40),
      String(p.email || '').slice(0, 200),
      String(p.message || '').slice(0, 2000),
      '동의함'
    ]);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 브라우저가 주소를 직접 열었을 때 (동작 확인용)
function doGet() {
  return json({ ok: true, message: '말그미극단 구독 폼 수신기가 살아 있습니다.' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
