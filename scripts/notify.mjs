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
/* getFirestore(字串) 會被當成「另一個 app 的名字」，結果是開一個沒有憑證的 app，
   錯誤訊息長得像「找不到預設憑證」。要傳 app 本身再帶資料庫名稱 */
const app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore(app, DB_ID);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:noreply@example.com',
  VAPID_PUB,
  process.env.VAPID_PRIVATE
);

/* 收尾那句。每次隨機挑一句，同樣的班只會推一次，所以不會看到同一句連發。
   一律不講金額 —— 數字自己點進去看到比較有回饋感 */
const ENDINGS = [
  '薪水我收好了，快來拿。',
  '錢我放桌上了，記得來收。',
  '快來領薪水，我等你喔。',
  '薪水在我這裡，你來就給你。',
  '錢先幫你保管著，早點來拿。'
];

/* 角色的中文名字。這份要跟 index.html 的 TCHARS 對得起來 */
const CHARS = {
  'a-cat': '貓', 'a-dog': '狗', 'a-bear': '熊', 'a-fox': '狐狸',
  'a-peng': '企鵝', 'a-bot': '機器人', 'a-frog': '青蛙', 'a-owl': '貓頭鷹',
  'a-rab': '兔子', 'a-gir': '長頸鹿', 'a-shp': '綿羊', 'a-sqr': '松鼠'
};

const ms = v => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v._seconds) return v._seconds * 1000;
  return 0;
};

const now = Date.now();
let checked = 0, due = 0, sent = 0, dropped = 0, subsAll = 0;
const notes = [];

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
  if (prev.exists && Number(prev.data().shiftAt) === at) {
    notes.push(`${u.id.slice(0, 6)} 這一班之前推過了`);
    continue;
  }

  const subs = await db.collection(`users/${u.id}/push`).get();
  /* 沒有訂閱就先不要標記。標下去的話，他晚幾分鐘才開通知，
     這一班就永遠補不回來了 */
  if (subs.empty) { notes.push(`${u.id.slice(0, 6)} 有班到點但沒訂閱任何裝置`); continue; }

  /* 用哪隻角色。這個存在整包備份裡，不在錢包裡，所以要多讀一次。
     讀不到就退回「牠」，不要因為這個就不發通知 */
  let who = '牠';
  try {
    const prof = await db.doc(`users/${u.id}`).get();
    const id = prof.exists && prof.data().settings && prof.data().settings.avatar
      ? prof.data().settings.avatar.id : null;
    if (CHARS[id]) who = CHARS[id];
  } catch (e) { /* 讀不到就算了 */ }

  /* 不講金額。講了就沒有「回來看一下」的動機，而且點進去自己看比較有回饋感 */
  const job = d.shiftJob || '打工';
  const say = d.shiftSay || '';
  const end2 = ENDINGS[Math.floor(Math.random() * ENDINGS.length)];
  const payload = JSON.stringify({
    title: who + '下班了！',
    body: '「' + job + '做了 ' + h + ' 小時。' + (say ? say + '。' : '') + end2 + '」',
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
  if (okAny) {
    await mark.set({ shiftAt: at, at: now, subs: subs.size });
    /* 同一班如果每輪都出現在這裡，就是防重複那層沒生效，要查 */
    notes.push(`${u.id.slice(0, 6)} 推了 ${subs.size} 台　shiftAt=${at}　` +
               `下班於 ${Math.round((now - end) / 60000)} 分鐘前`);
  } else {
    notes.push(`${u.id.slice(0, 6)} ${subs.size} 台訂閱全部推失敗，這班不標記，下輪會再試`);
  }
}

/* 訂閱總數：一則都推不出去的時候，最先要看的就是這個數字 */
for (const u of users) {
  const c = await db.collection(`users/${u.id}/push`).count().get().catch(() => null);
  if (c) subsAll += c.data().count;
}
console.log(`看了 ${checked} 個人，全部裝置訂閱數 ${subsAll}，${due} 班到點，推出 ${sent} 則，清掉 ${dropped} 個失效訂閱`);
notes.forEach(n => console.log('  · ' + n));
