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

function poke() {
  const token = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
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
  ScriptApp.newTrigger('poke').timeBased().everyMinutes(5).create();
  console.log('好了，每 5 分鐘會跑一次 poke');
}

/* 想確認現在掛了哪些觸發器的時候跑這支 */
function listTriggers() {
  const ts = ScriptApp.getProjectTriggers();
  if (!ts.length) { console.log('目前沒有任何觸發器'); return; }
  ts.forEach(function (t) { console.log(t.getHandlerFunction() + ' / ' + t.getEventType()); });
}
