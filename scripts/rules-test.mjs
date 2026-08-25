/* 把線上真正生效的那份規則裡「好友扣薪水」那段原文印出來，逐字對。
   從 app 只看得到一句 permission-denied，猜不出是哪個條件。 */
import { GoogleAuth } from 'google-auth-library';

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
const rs = await client.request({
  url: `https://firebaserules.googleapis.com/v1/${rel.rulesetName}`
});
const content = rs.data.source.files[0].content;
console.log('用的是線上這份：', rel.rulesetName, '更新於', rel.updateTime);

const NL = String.fromCharCode(10);
const lines = content.split(NL);
for (const key of ['cutCap', 'cutLeft', 'cutNow() >= 1', 'cutNow() >= 5 || cutNow() == cutLeft()']) {
  console.log((content.includes(key) ? '有   ' : '沒有 ') + key);
}
const k2 = content.indexOf('function cutOrig');
if (k2 >= 0) {
  const at = content.slice(0, k2).split(NL).length;
  console.log('');
  for (let i = at - 4; i < at + 8 && i < lines.length; i++) console.log(String(i+1).padStart(4)+' | '+lines[i]);
}
const k3 = content.indexOf('cutNow() >= 1');
if (k3 >= 0) {
  const at = content.slice(0, k3).split(NL).length;
  console.log('');
  for (let i = at - 3; i < at + 6 && i < lines.length; i++) console.log(String(i+1).padStart(4)+' | '+lines[i]);
}
process.exit(0);
