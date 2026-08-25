/* 印出 Firebase 上「現在真正生效」的 Firestore 規則。
   貼規則這件事沒有回饋，貼了沒、貼到哪個資料庫、有沒有按發布，
   從 app 那邊看到的都只是同一句 permission-denied。直接問 Firebase 最快。 */
import { GoogleAuth } from 'google-auth-library';

if (!process.env.FIREBASE_SA) {
  console.error('少了 FIREBASE_SA');
  process.exit(1);
}
const sa = JSON.parse(process.env.FIREBASE_SA);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/firebase.readonly',
           'https://www.googleapis.com/auth/cloud-platform']
});
const client = await auth.getClient();
const proj = sa.project_id;

const get = async url => {
  const r = await client.request({ url });
  return r.data;
};

const rels = await get(`https://firebaserules.googleapis.com/v1/projects/${proj}/releases`);
console.log('=== 這個專案有幾份發布中的規則 ===');
for (const rel of (rels.releases || [])) {
  console.log(`\n● ${rel.name}`);
  console.log(`  指向 ${rel.rulesetName}`);
  console.log(`  更新於 ${rel.updateTime}`);
}

/* Firestore 的規則發布名稱是 projects/x/releases/cloud.firestore
   多資料庫的話會是 cloud.firestore/<資料庫名> */
for (const rel of (rels.releases || [])) {
  if (!/cloud\.firestore/.test(rel.name)) continue;
  const rs = await get(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`);
  const files = rs.source?.files || [];
  for (const f of files) {
    const src = f.content || '';
    console.log(`\n=== ${rel.name} 的內容摘要 ===`);
    console.log(`  行數 ${src.split('\n').length}`);
    /* 只印我們關心的幾個特徵，不把整份倒出來 */
    const marks = ['raids', 'raidTook', 'raidOf', 'bothFriends', 'raidShapeOk',
                   'shiftSay', 'raidMax', 'vwal'];
    marks.forEach(m => console.log(`  含有 ${m.padEnd(14)} ${src.includes(m) ? '有' : '沒有'}`));
    const k = src.indexOf('raids/{raider}');
    if (k >= 0) {
      console.log('\n  --- 偷竊那段 ---');
      console.log(src.slice(Math.max(0, k - 200), k + 700).split('\n').map(l => '  ' + l).join('\n'));
    }
  }
}


/* ── 再看一次實際資料：好友關係到底有沒有雙向 ── */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const app = initializeApp({ credential: cert(sa), projectId: proj });
const fdb = getFirestore(app, 'default');
const short = u => u.slice(0, 6);

console.log('');
console.log('=== 好友關係（規則要的是「被偷者的名單裡有偷的人」）===');
const users = await fdb.collection('users').listDocuments();
const fri = {};
for (const u of users) {
  const snap = await fdb.collection(`users/${u.id}/friends`).listDocuments();
  fri[u.id] = snap.map(d => d.id);
}
for (const [uid, list] of Object.entries(fri)) {
  if (!list.length) continue;
  console.log('');
  console.log(`${short(uid)} 的名單：${list.map(short).join(' ')}`);
  for (const f of list) {
    const back = (fri[f] || []).includes(uid);
    console.log(`  ${short(uid)} -> ${short(f)}　對方名單裡有沒有我：${back ? '有' : '沒有 ← 這個方向缺'}`);
  }
}

console.log('');
console.log('=== 誰現在偷得動 ===');
for (const u of users) {
  const w = await fdb.doc(`users/${u.id}/wallet/main`).get();
  if (!w.exists) continue;
  const d = w.data();
  const h = Number(d.shiftH) || 0;
  if (h <= 0) continue;
  const at = d.shiftAt?.toMillis?.() || Number(d.shiftAt) || 0;
  const end = at + h * 3600000;
  const mins = Math.round((Date.now() - end) / 60000);
  console.log(`${short(u.id)}　${h}小時班　薪水 ${d.shiftPay}　已被偷 ${d.raidTook || 0}　` +
    (mins >= 0 ? `下班 ${mins} 分鐘了` : `還有 ${-mins} 分鐘下班`));
}

/* 現在偷竊紀錄長怎樣（只看，不刪 —— 之前那個一次性清理已經做完，
   留著的話會把真正成功的那筆也掃掉） */
console.log('');
console.log('=== 現在的偷竊紀錄 ===');
let n = 0;
for (const u of users) {
  const rs = await fdb.collection(`users/${u.id}/raids`).get();
  for (const doc of rs.docs) {
    const r = doc.data();
    n++;
    console.log(`  ${short(u.id)} 被 ${short(r.by || '?')} 偷 ${r.amount} 枚　` +
      `班次 ${r.shiftAt}　${r.doneAt ? '已通知' : '還沒通知'}`);
  }
}
if (!n) console.log('  一筆都沒有');

/* ── 錢包裡到底有哪些欄位 ──
   「扣他薪水」那條規則有一項是 keys().hasOnly(wkeys())，
   只要錢包裡存在任何一個不在白名單上的欄位，整條就過不了。 */
const WKEYS = ['coins','owned','spunOn','workOn','workN','shiftAt','shiftH','shiftPay',
               'shiftJob','shiftSay','raidOf','raidShift','raidTook'];
console.log('');
console.log('=== 每個人錢包裡的欄位（白名單外的會標出來）===');
for (const u of users) {
  const w = await fdb.doc(`users/${u.id}/wallet/main`).get();
  if (!w.exists) continue;
  const ks = Object.keys(w.data());
  const bad = ks.filter(k => !WKEYS.includes(k));
  console.log(`${short(u.id)}　${ks.join(' ')}` + (bad.length ? `　← 白名單外：${bad.join(' ')}` : ''));
}

/* 分享快照跟真實錢包對不對得起來 —— app 是照快照算金額的 */
console.log('');
console.log('=== 分享快照 vs 真實錢包 ===');
const shares = await fdb.collection('shares').get();
for (const d of shares.docs) {
  const s2 = d.data();
  if (!s2.shiftEnd) continue;
  const w = await fdb.doc(`users/${s2.owner}/wallet/main`).get();
  if (!w.exists) continue;
  const real = w.data();
  const same = (Number(s2.shiftPay)||0) === (Number(real.shiftPay)||0)
            && (Number(s2.raidTook)||0) === (Number(real.raidTook)||0);
  console.log(`${d.id.slice(0,6)}…→${d.id.slice(-6)}　快照 pay=${s2.shiftPay} took=${s2.raidTook}　` +
    `實際 pay=${real.shiftPay} took=${real.raidTook||0}　${same ? '一致' : '← 對不上'}`);
}
