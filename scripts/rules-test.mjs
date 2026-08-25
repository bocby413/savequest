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

const show = (needle, before, after) => {
  const k = content.indexOf(needle);
  if (k < 0) { console.log('!! 線上這份找不到：' + needle); return -1; }
  const at = content.slice(0, k).split(NL).length;
  console.log('');
  console.log('=== ' + needle + ' 附近 ===');
  for (let i = Math.max(0, at - before); i < at + after && i < lines.length; i++) {
    console.log(String(i + 1).padStart(4) + ' | ' + lines[i]);
  }
  return at;
};

const at = show('好友偷走這一班的一部分', 2, 30);

/* 它在哪個 match 裡面 —— 放錯地方的話整條永遠不會被評估 */
if (at > 0) {
  let depth = 0;
  const stack = [];
  for (let i = 0; i < at && i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('match ')) stack.push({ t, depth });
    depth += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length;
    while (stack.length && depth <= stack[stack.length - 1].depth) stack.pop();
  }
  console.log('');
  console.log('這段所在的 match：', stack.map(x => x.t).join('  >  ') || '(不在任何 match 裡！)');
}

show('function cutNow', 1, 8);
show('function bothFriends', 1, 7);
