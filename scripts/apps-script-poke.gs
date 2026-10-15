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

/* ── 收盤價 ──
 * 同樣的理由：GitHub 自己的 cron 常常整段漏跑（2026-10-14 排六次只跑四次、
 * 10-15 整天零次），收盤價就卡在前一天，台股美股都一樣。
 * 本機的工作排程 TW_Prices_Poke 也會戳，但那要電腦開著；這支跑在 Google 那邊，
 * 電腦關機照樣會動。兩邊都戳不會有問題 —— 價格沒變動那支排程就不會 commit。
 *
 * 時段（Apps Script 的時區要設成台北）：
 *   07 點那次 = 美股收盤後（台北已是隔天早上）
 *   14、17 點那兩次 = 台股收盤後
 * 時間觸發器是「那個鐘頭內」跑，不是整點準時，但抓價不差那幾十分鐘。
 */
const PRICE_WORKFLOW = 'prices.yml';

function pokePrices() {
  const token = PropertiesService.getScriptProperties().getProperty('GH_TOKEN');
  if (!token) { console.error('還沒設 GH_TOKEN'); return; }
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + REPO + '/actions/workflows/' + PRICE_WORKFLOW + '/dispatches',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      payload: JSON.stringify({ ref: BRANCH }),
      muteHttpExceptions: true
    }
  );
  const code = res.getResponseCode();
  if (code === 204) return;
  console.error('收盤價觸發失敗 ' + code + '：' + res.getContentText().slice(0, 300));
}

/* 只要手動跑一次。會先清掉舊的，重複執行不會長出一堆觸發器 */
function setupPriceTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pokePrices') ScriptApp.deleteTrigger(t);
  });
  [7, 14, 17].forEach(function (h) {
    ScriptApp.newTrigger('pokePrices').timeBased().everyDays(1).atHour(h).create();
  });
  console.log('好了，每天 7、14、17 點那幾個鐘頭各會戳一次收盤價');
}
