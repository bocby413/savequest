# -*- coding: utf-8 -*-
"""每天盤後抓上市＋上櫃收盤價，寫成 prices.json 給網頁讀。
證交所與櫃買的 API 都沒開放跨網域，網頁不能直接抓，所以在這裡先抓好放進 repo。"""
import json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

TPE = timezone(timedelta(hours=8))
UA = {'User-Agent': 'Mozilla/5.0 (compatible; savequest-price-bot/1.0)'}

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8'))
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

print('抓上市…', flush=True)
twse = get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')
if twse:
    for r in twse:
        c, close = r.get('Code'), num(r.get('ClosingPrice'))
        if c and close:
            quotes[c] = {'n': r.get('Name', '').strip(), 'c': close,
                         'ch': num(r.get('Change')) or 0, 'm': 'twse'}
    print('  上市 %d 檔' % len(twse), flush=True)

print('抓上櫃…', flush=True)
tpex = get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes')
if tpex:
    n0 = 0
    for r in tpex:
        c, close = r.get('SecuritiesCompanyCode'), num(r.get('Close'))
        if c and close:
            quotes[c] = {'n': (r.get('CompanyName') or '').strip(), 'c': close,
                         'ch': num(r.get('Change')) or 0, 'm': 'tpex'}
            n0 += 1
    print('  上櫃 %d 檔' % n0, flush=True)

if len(quotes) < 500:
    print('抓到的數量太少（%d），不覆蓋舊檔' % len(quotes))
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
print('寫入 prices.json：%d 檔，交易日 %s' % (len(quotes), out['date']))
