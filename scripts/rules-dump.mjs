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
