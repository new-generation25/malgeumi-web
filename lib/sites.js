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
 * 환경변수 GA_SITES에 JSON 배열을 넣으면 이 목록 대신 그것을 씁니다.
 */

const DEFAULT_SITES = [
  {
    id: 'malgeumi',
    label: '말그미극단 홈페이지',
    url: 'https://malgeumi-play.vercel.app',
    propertyId: '551060035',
  },
  // 아래는 GA 계정에 이미 있던 속성들입니다. 이름과 주소는 실제에 맞게
  // 고쳐 주세요. 서비스 계정에 권한을 주지 않으면 '권한 없음'으로 표시됩니다.
  {
    id: 'bonghwang-memories',
    label: 'bonghwang-memories',
    url: '',
    propertyId: '498652308',
  },
  {
    id: 'bonghwang-tour',
    label: 'bonghwang-tour',
    url: '',
    propertyId: '500296569',
  },
  {
    id: 'theater-manage',
    label: 'theater-manage',
    url: '',
    propertyId: '517778471',
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
