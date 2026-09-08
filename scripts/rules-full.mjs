/* 把線上生效的 Firestore 規則原封不動印出來。
   要改規則的時候得先有現在那一份，不然只能憑記憶重寫，很容易把別段弄壞。

   ⚠ 這個 repo 是公開的，Actions 的 log 也是公開的。跑完請把那次執行刪掉：
     gh run delete <run-id>
   規則不是密碼，但它寫著伺服器端到底驗了什麼，沒必要一直掛在網路上。 */
import { GoogleAuth } from 'google-auth-library';

if (!process.env.FIREBASE_SA) {
  console.error('少了 FIREBASE_SA');
  process.exit(1);
}
const sa = JSON.parse(process.env.FIREBASE_SA);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
const client = await auth.getClient();
const proj = sa.project_id;

const rels = await client.request({
  url: `https://firebaserules.googleapis.com/v1/projects/${proj}/releases`
});
const rel = (rels.data.releases || []).find(r => /cloud\.firestore/.test(r.name));
if (!rel) { console.error('找不到 cloud.firestore 的發布'); process.exit(1); }

const rs = await client.request({
  url: `https://firebaserules.googleapis.com/v1/${rel.rulesetName}`
});
const file = rs.data.source.files[0];

console.log('發布：', rel.name);
console.log('規則集：', rel.rulesetName);
console.log('更新於：', rel.updateTime);
console.log('檔名：', file.name);
/* 直接印原文的話，GitHub 會把大括號當成 secret 的行遮成 ***
   （FIREBASE_SA 是多行的 JSON，第一行就是一個大括號）。
   base64 出去、本機再解回來，就不會被遮到。 */
console.log('=====BEGIN RULES B64=====');
console.log(Buffer.from(file.content, 'utf8').toString('base64'));
console.log('=====END RULES B64=====');
