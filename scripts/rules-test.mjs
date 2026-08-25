/* 直接呼叫 Firebase 的規則測試 API，模擬「好友扣我薪水」那個寫入，
   讓它告訴我到底是哪一行運算式擋下來的。
   從 app 那邊只看得到一句 permission-denied，猜不出是哪個條件。 */
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';

const sa = JSON.parse(process.env.FIREBASE_SA);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
const client = await auth.getClient();
const proj = sa.project_id;

/* 用線上真正生效的那份規則來測，不是用 repo 裡的檔案 */
const rels = await client.request({
  url: `https://firebaserules.googleapis.com/v1/projects/${proj}/releases`
});
const rel = (rels.data.releases || []).find(r => /cloud\.firestore/.test(r.name));
const rs = await client.request({
  url: `https://firebaserules.googleapis.com/v1/${rel.rulesetName}`
});
const content = rs.data.source.files[0].content;
console.log('用的是線上這份：', rel.rulesetName, '更新於', rel.updateTime);

const VICTIM = 'ffYVSGvictimuid000000000000';
const RAIDER = 'bq8xBQraideruid000000000000';
const N = 12;

/* 被偷者現在的錢包（照真實資料捏） */
const before = {
  coins: 300, owned: [], spunOn: '', workOn: '2026-08-25', workN: 1,
  shiftAt: { $date: '2026-08-25T00:00:00Z' },
  shiftH: 8, shiftPay: 104, shiftJob: '倉庫換高處的燈泡', shiftSay: '不用梯子', raidTook: 0
};
const after = { ...before, shiftPay: 104 - N, raidTook: N };

const req = {
  auth: { uid: RAIDER, token: { firebase: { sign_in_provider: 'google.com' } } },
  path: `/databases/default/documents/users/${VICTIM}/wallet/main`,
  method: 'update',
  time: '2026-08-25T09:00:00Z',
  resource: { data: after }
};

const body = {
  source: { files: [{ name: 'firestore.rules', content, fingerprint: '' }] },
  testSuite: {
    testCases: [{
      expectation: 'ALLOW',
      request: req,
      resource: { data: before },
      functionMocks: [
        { function: 'exists',
          args: [{ exactValue: `/databases/default/documents/users/${VICTIM}/friends/${RAIDER}` }],
          result: { value: true } },
        { function: 'exists',
          args: [{ exactValue: `/databases/default/documents/users/${RAIDER}/friends/${VICTIM}` }],
          result: { value: true } }
      ],
      pathEncoding: 'PLAIN',
      expressionReportLevel: 'FULL'
    }]
  }
};

const r = await client.request({
  url: `https://firebaserules.googleapis.com/v1/projects/${proj}:test`,
  method: 'POST',
  data: body
});

for (const res of (r.data.testResults || [])) {
  console.log('\n結果：', res.state);
  (res.debugMessages || []).forEach(m => console.log('  訊息：', m));
  (res.errorPosition ? [res.errorPosition] : []).forEach(p =>
    console.log('  錯在第', p.line, '行第', p.column, '欄'));
  /* 把每個 false 的運算式印出來，第一個 false 的就是元兇 */
  const walk = (e, depth = 0) => {
    if (!e) return;
    const v = e.value;
    const line = e.sourcePosition?.line;
    const got = v && Object.keys(v)[0] ? v[Object.keys(v)[0]] : undefined;
    if (line && got === false) console.log(`  第 ${line} 行 -> false`);
    (e.children || []).forEach(c => walk(c, depth + 1));
  };
  walk(res.expressionReports?.[0] || res.expressionReports);
  if (res.expressionReports) {
    const flat = [];
    const rec = e => { if (!e) return; flat.push(e); (e.children || []).forEach(rec); };
    (Array.isArray(res.expressionReports) ? res.expressionReports : [res.expressionReports]).forEach(rec);
    const falses = flat.filter(e => e.value && e.value.boolValue === false && e.sourcePosition?.line);
    console.log('\n  ── 判成 false 的行號 ──');
    [...new Set(falses.map(e => e.sourcePosition.line))].sort((a, b) => a - b)
      .forEach(l => console.log('   第', l, '行：', (content.split('\n')[l - 1] || '').trim().slice(0, 90)));
  }
}
