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

    var name = String(p.name).slice(0, 100);
    var email = String(p.email || '').slice(0, 200);

    var sheet = SpreadsheetApp.getActive().getSheets()[0];
    sheet.appendRow([
      new Date(),
      name,
      String(p.phone).slice(0, 40),
      email,
      String(p.message || '').slice(0, 2000),
      '동의함'
    ]);

    // 이메일을 남긴 구독자에게만 확인 메일을 보낸다. 시트 기록이 이미 끝난 뒤라,
    // 메일 발송이 실패해도(할당량 초과 등) 구독 자체는 정상 처리된다.
    if (email) {
      try {
        sendConfirmEmail(name, email);
      } catch (mailErr) {
        // 메일 실패를 구독 실패로 취급하지 않는다. 필요하면 로그만 남긴다.
        console.error('confirm mail failed: ' + mailErr);
      }
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 구독 확인 메일. hoehyeon.theater@gmail.com을 이 계정의 "다른 주소에서 메일 보내기"에
// 별칭으로 등록·인증해 두었으므로, GmailApp.sendEmail의 from 옵션으로 그 주소를 발신자로 쓴다.
// (MailApp은 발신자를 못 바꾼다. 별칭 인증이 없으면 이 호출은 실패한다.)
// 하루 발송 한도가 있다(일반 Gmail 계정 100통/일) — 소규모 구독 알림으로는 충분하다.
function sendConfirmEmail(name, email) {
  var subject = '[회현동 소극장] 소식 구독이 완료되었습니다';
  var body =
    name + '님, 안녕하세요.\n\n' +
    '회현동 소극장 소식 구독이 완료되었습니다.\n' +
    '새 공연이 확정되면 문자로 가장 먼저 안내해 드립니다.\n\n' +
    '카카오채널이나 인스타그램도 함께 구독하시면 조금 더 빠른 소식을 받아보실 수 있습니다.\n' +
    '카카오채널: http://pf.kakao.com/_PxknSX\n' +
    '인스타그램: https://www.instagram.com/hoehyeon.theater/\n\n' +
    '문의: 055-339-9110 / hoehyeon.theater@gmail.com\n\n' +
    '회현동 소극장';
  GmailApp.sendEmail(email, subject, body, {
    from: 'hoehyeon.theater@gmail.com',
    name: '회현동 소극장'
  });
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
