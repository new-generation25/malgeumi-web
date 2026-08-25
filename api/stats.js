/**
 * GET /api/stats?days=28
 *
 * 등록된 모든 사이트의 GA4 지표를 한 번에 내려준다. 대시보드가 사이트를
 * 바꿀 때마다 다시 부르지 않도록, 개요와 상세를 함께 담는다.
 *
 * 인증: x-dash-key 헤더가 DASH_PASSWORD와 같아야 한다.
 */

const { callGa, metric, dim } = require('../lib/ga');
const { SITES } = require('../lib/sites');

const ALLOWED_DAYS = [7, 28, 90];

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return require('crypto').timingSafeEqual(bufA, bufB);
}

// GA가 돌려주는 영문 오류를 알아볼 수 있게 바꾼다. 모르는 것은 그대로 둔다.
function friendlyError(msg) {
  if (/concurrent requests/i.test(msg)) {
    return 'GA 동시 요청 한도에 걸렸습니다. 잠시 뒤 새로고침해 주세요.';
  }
  if (/sufficient permissions|does not have/i.test(msg)) {
    return '이 속성을 볼 권한이 없습니다. 서비스 계정을 뷰어로 추가했는지 확인해 주세요.';
  }
  if (/quota/i.test(msg)) {
    return 'GA 조회 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요.';
  }
  return msg;
}

function reportsFor(days, path) {
  const current = { startDate: `${days}daysAgo`, endDate: 'today' };
  const previous = { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` };

  // 경로가 주어지면 그 페이지에서 일어난 것만 센다.
  const onlyThisPage = path
    ? { dimensionFilter: { filter: { fieldName: 'pagePath',
                                     stringFilter: { matchType: 'EXACT', value: path } } } }
    : null;
  const scoped = (report) => (onlyThisPage ? { ...report, ...onlyThisPage } : report);

  return [
    // 0. 일자별 추이 + 직전 같은 기간 (dateRange 차원이 자동으로 붙는다)
    scoped({
      dateRanges: [current, previous],
      dimensions: [{ name: 'date' }],
      // 비율은 날짜별로 더할 수 없다. 더할 수 있는 원자료를 받아 나중에 나눈다.
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' },
                { name: 'engagedSessions' }, { name: 'userEngagementDuration' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 400,
    }),
    // 1. 유입 경로
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    // 2. 인기 페이지
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
    // 3. 이벤트
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 20,
    }),
    // 4. 기기
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 5,
    }),
  ];
}

// GA는 batchRunReports 하나에 리포트 5개까지만 받는다. 그래서 두 묶음으로 나눈다.
function extraReportsFor(days, path) {
  const current = { startDate: `${days}daysAgo`, endDate: 'today' };
  const onlyThisPage = path
    ? { dimensionFilter: { filter: { fieldName: 'pagePath',
                                     stringFilter: { matchType: 'EXACT', value: path } } } }
    : null;
  const scoped = (report) => (onlyThisPage ? { ...report, ...onlyThisPage } : report);

  return [
    // 0. 지역 (도시 · 나라)
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'city' }, { name: 'country' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    }),
    // 1. 운영체제
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'operatingSystem' }],
      metrics: [{ name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 8,
    }),
    // 2. 유입 첫 페이지 — '인기 페이지'는 조회수라 어디로 들어왔는지는 안 보인다
    scoped({
      dateRanges: [current],
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }),
  ];
}

function parseSite(site, batch, extraBatch, realtime) {
  const reports = batch.reports || [];
  const daily = [];
  const totals = { users: 0, sessions: 0, views: 0, engagedSessions: 0, engagementSeconds: 0 };
  const prevTotals = { users: 0, sessions: 0, views: 0, engagedSessions: 0, engagementSeconds: 0 };

  // 리포트 0: dateRange 차원이 마지막에 붙는다.
  const r0 = reports[0] || {};
  const dateRangeIndex = (r0.dimensionHeaders || []).findIndex((h) => h.name === 'dateRange');
  for (const row of r0.rows || []) {
    const isPrev = dateRangeIndex >= 0 && dim(row, dateRangeIndex) === 'date_range_1';
    const bucket = isPrev ? prevTotals : totals;
    const users = metric(row, 0);
    const sessions = metric(row, 1);
    const views = metric(row, 2);
    bucket.users += users;
    bucket.sessions += sessions;
    bucket.views += views;
    bucket.engagedSessions += metric(row, 3);
    bucket.engagementSeconds += metric(row, 4);
    if (!isPrev) {
      const d = dim(row, 0); // YYYYMMDD
      daily.push({
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        users,
        sessions,
        views,
      });
    }
  }

  const channels = ((reports[1] || {}).rows || []).map((row) => ({
    channel: dim(row, 0) || '(기타)',
    source: dim(row, 1) || '(직접)',
    sessions: metric(row, 0),
  }));

  const pages = ((reports[2] || {}).rows || []).map((row) => ({
    path: dim(row, 0),
    title: dim(row, 1),
    views: metric(row, 0),
  }));

  const events = ((reports[3] || {}).rows || []).map((row) => ({
    name: dim(row, 0),
    count: metric(row, 0),
  }));

  const devices = ((reports[4] || {}).rows || []).map((row) => ({
    name: dim(row, 0),
    users: metric(row, 0),
  }));

  const extra = (extraBatch && extraBatch.reports) || [];

  const regions = ((extra[0] || {}).rows || []).map((row) => ({
    city: dim(row, 0) || '(알 수 없음)',
    country: dim(row, 1),
    users: metric(row, 0),
  }));

  const os = ((extra[1] || {}).rows || []).map((row) => ({
    name: dim(row, 0) || '(알 수 없음)',
    users: metric(row, 0),
  }));

  const landings = ((extra[2] || {}).rows || []).map((row) => ({
    path: dim(row, 0) || '(알 수 없음)',
    sessions: metric(row, 0),
  }));

  // 경로 단위 항목은 실시간을 재지 않는다 (아래 fetchSite 주석 참고)
  let live = null;
  if (realtime) {
    live = 0;
    for (const row of realtime.rows || []) live += metric(row, 0);
  }

  return {
    id: site.id,
    label: site.label,
    url: site.url || '',
    propertyId: site.propertyId,
    path: site.path || null,
    live,
    totals,
    prevTotals,
    daily,
    channels,
    pages,
    events,
    devices,
    regions,
    os,
    landings,
  };
}

/**
 * 한 번에 limit개씩만 실행한다.
 *
 * GA4 Data API는 한 속성당 동시 요청을 10개까지만 받는다. 사이트를 전부
 * 한꺼번에 던지면 (사이트당 요청 2~3개 × 항목 수) 가 그 선을 넘어
 * 'Exhausted concurrent requests quota'로 일부가 튕긴다.
 */
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchSite(site, days) {
  // GA 실시간 보고서는 pagePath 필터를 지원하지 않는다. 페이지 단위 항목에서는
  // 속성 전체 숫자가 그 페이지 것인 양 보이는 편이 더 나쁘므로 아예 비워 둔다.
  const wantsRealtime = !site.path;

  // 한 줄로 세워 부른다. 동시에 던지면 화면을 연달아 새로고침할 때 여러 함수
  // 인스턴스의 요청이 겹쳐 GA의 동시 한도(속성당 10건)를 넘는다. 앞서 3건까지
  // 줄여 봤지만 그것으로도 부족했다. 느려지는 대신 확실히 통과시킨다.
  const batch = await callGa(site.propertyId, 'batchRunReports', {
    requests: reportsFor(days, site.path),
  });
  const extraBatch = await callGa(site.propertyId, 'batchRunReports', {
    requests: extraReportsFor(days, site.path),
  });
  const realtime = wantsRealtime
    ? await callGa(site.propertyId, 'runRealtimeReport', { metrics: [{ name: 'activeUsers' }] })
        .catch(() => ({ rows: [] })) // 실시간은 실패해도 나머지를 살린다
    : null;
  return parseSite(site, batch, extraBatch, realtime);
}

module.exports = async (req, res) => {
  const password = process.env.DASH_PASSWORD;
  if (!password) {
    res.status(500).json({ error: 'DASH_PASSWORD 환경변수가 설정되지 않았습니다.' });
    return;
  }

  const given = req.headers['x-dash-key'] || '';
  if (!given || !safeEqual(given, password)) {
    res.status(401).json({ error: '비밀번호가 맞지 않습니다.' });
    return;
  }

  let days = parseInt((req.query && req.query.days) || '28', 10);
  if (!ALLOWED_DAYS.includes(days)) days = 28;

  // 사이트를 하나씩 돌린다. 한 사이트가 최대 3개를 동시에 부르므로 동시 3개.
  // 화면을 연달아 새로고침해도 겹치지 않게 여유를 크게 뒀다.
  const results = await mapWithLimit(SITES, 1, async (site) => {
    try {
      return await fetchSite(site, days);
    } catch (e) {
      return {
        id: site.id,
        label: site.label,
        url: site.url || '',
        propertyId: site.propertyId,
        path: site.path || null,
        error: friendlyError(e.message || '알 수 없는 오류'),
      };
    }
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    days,
    sites: results,
  };

  res.setHeader('cache-control', 'no-store');
  res.status(200).json(payload);
};
