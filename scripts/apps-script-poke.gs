/* 存錢Bo士 — 打工完成通知的觸發器（貼到 Google Apps Script）
 *
 * 為什麼需要這支：
 *   GitHub 自己的 cron 實測 100 分鐘只觸發了一次，等於不能用。
 *   但用 API 手動觸發是好的，所以改由這支每 5 分鐘去按一次那顆按鈕。
 *   真正在發推播的還是 GitHub Actions 裡的 scripts/notify.mjs，
 *   這裡只負責「按下去」，沒有任何 Firebase 或推播的邏輯。
 *
 * 設定步驟看 README 或問 Claude，重點是：
 *   權杖不要寫在這份程式碼裡，放「專案設定 → 指令碼屬性」的 GH_TOKEN。
 */

const REPO = 'bocby413/savequest';
const WORKFLOW = 'work-notify.yml';
const BRANCH = 'main';

/* 幾分鐘觸發一次。想改就改這個數字，改完存檔即可，不用重跑 setupTrigger。
   Apps Script 的分鐘觸發器只有 1／5／10／15／30 可以選，沒有 3、7 這種，
   所以固定掛「每分鐘」，真正的間隔在下面自己擋。
   被擋掉的那幾次幾乎不花時間，一天的執行時間反而比每分鐘都去打 API 少很多。 */
const EVERY_MIN = 3;

function poke() {
  const props = PropertiesService.getScriptProperties();

  /* 用「距離上次多久」來擋，不要用 分鐘 % 3 —— 觸發器不會準時在整分觸發，
     會飄個幾秒，用取餘數的話飄過頭那一輪就整個被跳掉。
     留 20 秒容差，免得早到一點點就白等一輪 */
  const last = Number(props.getProperty('LAST_POKE') || 0);
  const now = Date.now();
  if (now - last < (EVERY_MIN * 60 - 20) * 1000) return;
  props.setProperty('LAST_POKE', String(now));

  const token = props.getProperty('GH_TOKEN');
  if (!token) {
    console.error('還沒設 GH_TOKEN。左邊齒輪「專案設定」→ 指令碼屬性 → 新增指令碼屬性');
    return;
  }

  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      payload: JSON.stringify({ ref: BRANCH }),
      /* 失敗不要丟例外。連續失敗太多次 Google 會把觸發器整個停掉，
         那就變成沒通知還不知道為什麼 */
      muteHttpExceptions: true
    }
  );

  const code = res.getResponseCode();
  if (code === 204) return;                 /* 204 = 成功，GitHub 這支 API 不回內容 */
  console.error('觸發失敗 ' + code + '：' + res.getContentText().slice(0, 300));
}

/* 只要手動跑一次。會先清掉舊的，重複執行不會長出一堆觸發器 */
function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poke') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('poke').timeBased().everyMinutes(1).create();
  console.log('好了，觸發器每分鐘叫一次 poke，實際打 API 的間隔是 ' + EVERY_MIN + ' 分鐘');
}

/* 想確認現在掛了哪些觸發器的時候跑這支 */
function listTriggers() {
  const ts = ScriptApp.getProjectTriggers();
  if (!ts.length) { console.log('目前沒有任何觸發器'); return; }
  ts.forEach(function (t) { console.log(t.getHandlerFunction() + ' / ' + t.getEventType()); });
}
