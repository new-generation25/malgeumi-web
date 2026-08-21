/**
 * 대시보드에 띄울 사이트 목록.
 *
 * 사이트를 추가하려면 여기에 한 줄 넣으면 됩니다. propertyId는 비밀이 아니라
 * 그대로 커밋해도 됩니다. GA에서 왼쪽 위 속성 선택기를 열면 이름 밑에 적힌
 * 숫자가 그 값입니다.
 *
 * 중요: 새로 추가한 속성마다 서비스 계정 이메일을 '뷰어'로 넣어야 데이터가
 * 나옵니다. (GA 관리 → 속성 액세스 관리 → + → 뷰어)
 *
 * path를 주면 그 페이지만 잘라서 봅니다. 한 속성 안의 페이지를 따로 재고 싶을
 * 때 씁니다. 페이지 단위 항목에는 '지금 접속 중'이 나오지 않습니다 — GA 실시간
 * 보고서가 경로 필터를 지원하지 않기 때문입니다.
 *
 * 환경변수 GA_SITES에 JSON 배열을 넣으면 이 목록 대신 그것을 씁니다.
 */

const DEFAULT_SITES = [
  {
    id: 'malgeumi',
    label: '말그미극단 홈페이지',
    url: 'https://malgeumi-play.vercel.app',
    propertyId: '551060035',
  },
  {
    id: 'malgeumi-index',
    label: '메인',
    url: 'https://malgeumi-play.vercel.app/',
    propertyId: '551060035',
    path: '/',
  },
  {
    id: 'malgeumi-king',
    label: 'King받은 이도',
    url: 'https://malgeumi-play.vercel.app/king.html',
    propertyId: '551060035',
    path: '/king.html',
  },
  {
    id: 'malgeumi-theater',
    label: '회현동 소극장',
    url: 'https://malgeumi-play.vercel.app/theater.html',
    propertyId: '551060035',
    path: '/theater.html',
  },
];

function loadSites() {
  const raw = process.env.GA_SITES;
  if (!raw) return DEFAULT_SITES;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (e) {
    // JSON이 깨졌으면 조용히 무시하고 기본 목록을 쓴다. 대시보드가
    // 통째로 죽는 것보다 낫다.
  }
  return DEFAULT_SITES;
}

module.exports = { loadSites };
