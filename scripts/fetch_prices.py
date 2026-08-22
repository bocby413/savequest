# -*- coding: utf-8 -*-
"""每天盤後抓上市＋上櫃收盤價，寫成 prices.json 給網頁讀。
證交所與櫃買的 API 都沒開放跨網域，網頁不能直接抓，所以在這裡先抓好放進 repo。"""
import json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

TPE = timezone(timedelta(hours=8))
# 用一般瀏覽器的標頭。證交所會擋掉看起來像機器人的請求
UA = {
    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Referer': 'https://www.twse.com.tw/',
}

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode('utf-8', 'replace')
            try:
                return json.loads(raw)
            except Exception:
                # 拿到的不是 JSON（多半是擋人的頁面），印出來才知道被擋在哪
                print('  第 %d 次不是 JSON，前 160 字：%s'
                      % (i + 1, raw[:160].replace('\n', ' ')), flush=True)
                if i == tries - 1:
                    return None
        except Exception as e:
            print('  第 %d 次失敗：%s' % (i + 1, e), flush=True)
            if i == tries - 1:
                return None
        time.sleep(5 * (i + 1))

def num(x):
    try:
        v = float(str(x).replace(',', '').replace('+', '').strip())
        return v
    except Exception:
        return None

quotes = {}

# 上市有好幾個來源，GitHub 的機器不一定每個都連得到，逐一試到有為止
TWSE_URLS = [
    'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
    'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY_ALL?response=json',
    'https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json',
]

def rows_of(x):
    """有的端點直接回陣列，有的包在 data／fields 裡"""
    if isinstance(x, list):
        return x
    if isinstance(x, dict):
        if isinstance(x.get('data'), list) and isinstance(x.get('fields'), list):
            return [dict(zip(x['fields'], row)) for row in x['data']]
        for k in ('data', 'aaData', 'tables'):
            v = x.get(k)
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []

print('抓上市…', flush=True)
twse = None
for u in TWSE_URLS:
    print('  試 %s' % u, flush=True)
    got = rows_of(get(u, tries=2))
    if got:
        twse = got
        break
n_twse = 0
if twse:
    for r in twse:
        c = r.get('Code') or r.get('證券代號')
        close = num(r.get('ClosingPrice') or r.get('收盤價'))
        if c and close:
            quotes[str(c).strip()] = {'n': (r.get('Name') or r.get('證券名稱') or '').strip(),
                                      'c': close,
                                      'ch': num(r.get('Change') or r.get('漲跌價差')) or 0,
                                      'm': 'twse'}
            n_twse += 1
    print('  上市 %d 檔' % n_twse, flush=True)
else:
    print('  上市全部來源都失敗', flush=True)

print('抓上櫃…', flush=True)
tpex = get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes')
n_tpex = 0
if tpex:
    for r in tpex:
        c, close = r.get('SecuritiesCompanyCode'), num(r.get('Close'))
        if c and close:
            quotes[str(c).strip()] = {'n': (r.get('CompanyName') or '').strip(), 'c': close,
                                      'ch': num(r.get('Change')) or 0, 'm': 'tpex'}
            n_tpex += 1
    print('  上櫃 %d 檔' % n_tpex, flush=True)

# 少了任一邊就不要覆蓋。之前只擋總數，結果上市掛掉時
# 一份「只有上櫃」的檔案照樣蓋掉好的那份，2330 就查不到了
if n_twse < 800:
    print('上市只有 %d 檔，不覆蓋舊檔' % n_twse)
    sys.exit(1)
if n_tpex < 400:
    print('上櫃只有 %d 檔，不覆蓋舊檔' % n_tpex)
    sys.exit(1)

# 交易日期以資料裡的民國日期為準
d = ''
for src, key in ((twse, 'Date'), (tpex, 'Date')):
    if src and src[0].get(key):
        raw = str(src[0][key])
        if re.fullmatch(r'\d{7}', raw):
            d = '%04d-%s-%s' % (int(raw[:3]) + 1911, raw[3:5], raw[5:7])
            break

out = {'date': d or datetime.now(TPE).strftime('%Y-%m-%d'),
       'updated': datetime.now(TPE).strftime('%Y-%m-%d %H:%M'),
       'count': len(quotes), 'quotes': quotes}
with open('prices.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print('寫入 prices.json：上市 %d ＋上櫃 %d ＝ %d 檔，交易日 %s'
      % (n_twse, n_tpex, len(quotes), out['date']))
