/**
 * GA4 Data API 최소 클라이언트.
 *
 * 외부 패키지를 쓰지 않습니다. 이 저장소는 빌드 과정이 없고 node_modules도
 * 없는 정적 사이트라, 의존성을 하나 들이는 순간 그 성질이 깨집니다.
 * 서비스 계정 JWT 서명은 Node 기본 crypto로 충분합니다.
 *
 * 필요한 환경변수
 *   GA_SA_EMAIL        서비스 계정 이메일 (…@….iam.gserviceaccount.com)
 *   GA_SA_PRIVATE_KEY  서비스 계정 비공개 키 (-----BEGIN PRIVATE KEY----- …)
 */

const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const API = 'https://analyticsdata.googleapis.com/v1beta';

// 액세스 토큰은 1시간짜리다. 함수 인스턴스가 살아 있는 동안 재사용한다.
let cachedToken = null;

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 비공개 키를 PEM 형태로 되돌린다.
 *
 * 환경변수 입력칸을 거치면서 줄바꿈이 온갖 모양으로 망가진다. 실제로 겪은 것만
 * 해도 \n 두 글자로 바뀌거나, 공백으로 바뀌거나, 아예 사라진다. 줄바꿈이 없으면
 * Node는 'error:1E08010C:DECODER routines::unsupported'를 낸다.
 *
 * 그래서 헤더·푸터를 떼고 본문에서 공백을 모두 지운 뒤 64자마다 다시 끊어
 * 원래 모양으로 조립한다. 어떤 형태로 들어오든 같은 결과가 된다.
 */
function normalizeKey(raw) {
  if (!raw) return '';

  let key = String(raw).trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '');

  const match = key.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);

  let label, body;
  if (match) {
    label = match[1];
    body = match[2];
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(key)) {
    // BEGIN/END 줄을 지운 채 본문만 넣은 경우. 실제로 겪었다.
    label = 'PRIVATE KEY';
    body = key;
  } else {
    return key; // 알아볼 수 없으면 손대지 않는다. 오류가 그대로 드러나야 한다
  }

  const lines = (body.replace(/\s+/g, '').match(/.{1,64}/g)) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  // 입력칸을 거치며 앞뒤에 공백·줄바꿈·따옴표가 붙는 일이 잦다. 이메일에 그것이
  // 섞이면 구글은 'account not found'로 답한다. 값이 아니라 껍데기가 문제인 것이다.
  let email = (process.env.GA_SA_EMAIL || '').trim().replace(/^["']|["']$/g, '');
  const key = normalizeKey(process.env.GA_SA_PRIVATE_KEY);
  if (!email || !key) {
    throw new Error('GA_SA_EMAIL / GA_SA_PRIVATE_KEY 환경변수가 없습니다.');
  }

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(key));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const why = json.error_description || json.error || '알 수 없음';
    // 어느 값이 잘못됐는지 화면에서 바로 보이게 한다. 이메일은 비밀이 아니고,
    // 키는 길이만 알려도 잘려 들어갔는지 판단할 수 있다.
    const hint = /account not found/i.test(why)
      ? ` — GA_SA_EMAIL이 '${email}'로 들어가 있습니다. 이 주소가 맞는지 확인해 주세요.`
      : /signature/i.test(why)
        ? ` — GA_SA_PRIVATE_KEY가 ${key.length}자로 들어와 있습니다. 잘려 들어갔는지 확인해 주세요.`
        : '';
    throw new Error(`토큰 발급 실패 (${res.status}): ${why}${hint}`);
  }

  cachedToken = { value: json.access_token, expiresAt: now + (json.expires_in || 3600) };
  return cachedToken.value;
}

async function callGa(propertyId, method, body) {
  const token = await getAccessToken();
  const res = await fetch(`${API}/properties/${propertyId}:${method}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** 행 하나에서 지표를 숫자로 꺼낸다. */
function metric(row, index) {
  const raw = row.metricValues && row.metricValues[index] && row.metricValues[index].value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function dim(row, index) {
  return (row.dimensionValues && row.dimensionValues[index] && row.dimensionValues[index].value) || '';
}

module.exports = { getAccessToken, callGa, metric, dim };
