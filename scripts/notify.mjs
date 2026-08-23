/* 打工做完了就推一則通知。
   一班 2～8 小時，結束的時候使用者的 app 一定是關著的，
   瀏覽器裡的計時器跟 service worker 都活不到那時候，所以由這支排程負責發。

   要的環境變數：
     FIREBASE_SA    service account 的整份 JSON
     VAPID_PRIVATE  VAPID 私鑰
     VAPID_SUBJECT  mailto:你的信箱
*/
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

const VAPID_PUB = 'BKFS7yvLGaX9BfG5_8-VB8bD_qXlYisTUHKhXl51h1JElO1aaoij9jr4uLIFkNq1J8Nd6Ql-SiaRnZeGl2OiIgc';
const DB_ID = 'default';          /* 這個專案的 Firestore 資料庫叫 default，不是 (default) */
const GRACE_MS = 6 * 60 * 60 * 1000;   /* 超過六小時沒發成功就別再補發了，太晚了沒意義 */

for (const k of ['FIREBASE_SA', 'VAPID_PRIVATE']) {
  if (!process.env[k]) {
    console.error(`少了 ${k}。到 GitHub repo 的 Settings → Secrets and variables → Actions 把它加上去。`);
    process.exit(1);
  }
}
let sa;
try { sa = JSON.parse(process.env.FIREBASE_SA); }
catch { console.error('FIREBASE_SA 不是合法的 JSON，要貼整份 service account 檔案的內容'); process.exit(1); }
initializeApp({ cert: cert(sa), projectId: sa.project_id });
const db = getFirestore(DB_ID);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:noreply@example.com',
  VAPID_PUB,
  process.env.VAPID_PRIVATE
);

const ms = v => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v._seconds) return v._seconds * 1000;
  return 0;
};

const now = Date.now();
let checked = 0, due = 0, sent = 0, dropped = 0;

const users = await db.collection('users').listDocuments();
for (const u of users) {
  checked++;
  const w = await db.doc(`users/${u.id}/wallet/main`).get();
  if (!w.exists) continue;
  const d = w.data();
  const h = Number(d.shiftH) || 0;
  const at = ms(d.shiftAt);
  if (h <= 0 || at <= 0) continue;

  const end = at + h * 3600000;
  if (end > now) continue;                 /* 還在上班 */
  if (now - end > GRACE_MS) continue;      /* 太久以前的就算了 */
  due++;

  /* 同一班只推一次。這份寫在自己的集合，不要動錢包那份，
     錢包的規則有鎖死欄位清單，多寫一個欄位客戶端就寫不進去了 */
  const mark = db.doc(`pushSent/${u.id}`);
  const prev = await mark.get();
  if (prev.exists && Number(prev.data().shiftAt) === at) continue;

  const subs = await db.collection(`users/${u.id}/push`).get();
  if (subs.empty) { await mark.set({ shiftAt: at, at: now, subs: 0 }); continue; }

  const payload = JSON.stringify({
    title: '打工做完了',
    body: (d.shiftJob ? d.shiftJob + '　' : '') +
          '做滿 ' + h + ' 小時，' + (Number(d.shiftPay) || 0) + ' 枚 Bo士幣等你領',
    tag: 'shift-' + at,
    url: './'
  });

  let okAny = false;
  for (const doc of subs.docs) {
    const s = doc.data();
    if (!s.endpoint || !s.p256dh || !s.auth) { await doc.ref.delete(); dropped++; continue; }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 3600 }
      );
      okAny = true; sent++;
    } catch (e) {
      const code = e.statusCode;
      /* 404／410 = 這個訂閱死了（換裝置、清資料、關通知），清掉免得每次都重試 */
      if (code === 404 || code === 410) { await doc.ref.delete(); dropped++; }
      else console.error(u.id, 'push 失敗', code || e.message);
    }
  }
  if (okAny) { await mark.set({ shiftAt: at, at: now, subs: subs.size }); }
}

console.log(`看了 ${checked} 個人，${due} 班到點，推出 ${sent} 則，清掉 ${dropped} 個失效訂閱`);
