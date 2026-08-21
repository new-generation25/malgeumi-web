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

function normalizeKey(raw) {
  if (!raw) return '';
  // Vercel 환경변수에 붙여넣으면 줄바꿈이 \n 두 글자로 들어오는 경우가 많다.
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  return key.replace(/\\n/g, '\n');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const email = process.env.GA_SA_EMAIL;
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
    throw new Error(`토큰 발급 실패 (${res.status}): ${json.error_description || json.error || '알 수 없음'}`);
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
