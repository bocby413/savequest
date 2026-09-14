# -*- coding: utf-8 -*-
"""每天盤後抓上市＋上櫃＋美股收盤價與美金匯率，寫成 prices.json 給網頁讀。
證交所與櫃買的 API 都沒開放跨網域，網頁不能直接抓，所以在這裡先抓好放進 repo。

美股跟台股一樣是「整個市場一次抓下來」——  使用者隨便打一個代號都要查得到，
不能只抓他現在持有的那幾檔（prices.json 是所有人共用的靜態檔）。"""
import json, re, ssl, sys, time, urllib.request
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

# ── 連線用的憑證 ──
# 櫃買中心 2026-09-07 換了新憑證，但伺服器只送出自己那張、沒附上中間那張
# 「TWCA SSL Certification Authority」。瀏覽器會自己去補抓所以看起來正常，
# Python 不會，於是整個上櫃抓不到、整支程式停在那裡。
# 這裡把那張中繼憑證放進信任清單讓鏈接得起來 —— 驗證照樣做（最上面還是要接到
# 系統內建的 TWCA CYBER Root CA），不是把驗證關掉。
# 來源：憑證裡 AIA 寫的 http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt
# SHA-256 01:AF:23:24:D0:98:09:8F:5E:0C:DF:6F:AA:BA:DA:43:0B:21:CC:E7:77:F4:7E:AC:B2:62:48:B2:FD:A3:E5:31
# 有效到 2033-02-23
TWCA_SSL_CA = """
-----BEGIN CERTIFICATE-----
MIIG1DCCBLygAwIBAgIQQAE0sE8AAAAAAAAAA+MkrDANBgkqhkiG9w0BAQwFADBQ
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRswGQYDVQQDExJUV0NBIENZQkVSIFJvb3QgQ0EwHhcNMjMwMjIzMDcyMjI0
WhcNMzMwMjIzMTU1OTU5WjBhMQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FO
LUNBMRMwEQYDVQQLEwpTU0wgU3ViLUNBMSkwJwYDVQQDEyBUV0NBIFNTTCBDZXJ0
aWZpY2F0aW9uIEF1dGhvcml0eTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoC
ggIBAMquxiSlMrxfOO29yqxCo/BIYBswnE7snZnuZDPcx8N9WhOdNGDsF024VjXK
nXoVaZBcv56eFsU+w9Mcq+uIVYzjVrBoe5u8ZLE0hPSkluH8URhcxtSQJ+gXcB0L
JHsseAeXVcgqoxTSJ6/n0xTCeXEnGwSRAzrqTvjS2gbd3TILxsfIHwRgwwPjBDgm
tjzbHHOFTJB3GCtH65T9A0viM2B/IW9Wz73jkz02AVMrZBHQ67IJ2W9CoIjd5mdG
eIV36U9NXl+wZa/D90pLRsFVbItKgLXgF71CQ92vS/biTx8fA6UUCU2ToNczP5Ur
A/mDXCBCLakwa1I3ylRkgFwluJw9DqiYh56MRgsEABa+ZPrm1Qb9njQZK4Y4V+ML
IvGM3xVoHIlvaSN29ubTueLpTeuAwN2VTiRzfOyCRKTcMBCtlMw1WCJNAMiNWDWS
BMnY9SlKv1oujmjS/ti0ptcipMymIoeWpVuQt3Mj8lYlKRpd6Zg8MbljMwQRSClK
6O6MSwpM3Xy5uJGh2cY5oYmKtxfyHSuKtKsk+daAPV1lpWYp9bNrbsLUPwmSY+zk
VgkZdiWBF//RP/72/esANONINy5hkWjkVd0NLjA5TAgk+DVVmnPtQIj1vBgtk8ak
Y9CczIbEgKBonkHWn+GX2ycR6jadg2P+xrBFg4MGjomkb2gtAgMBAAGjggGXMIIB
kzAfBgNVHSMEGDAWgBSdhWEUfMFib5do5E83QOGt4A1WNzAdBgNVHQ4EFgQU8ijU
+dQcfhprFoLl75Mpae3KFSAwDgYDVR0PAQH/BAQDAgEGMBMGA1UdJQQMMAoGCCsG
AQUFBwMBMEoGA1UdIARDMEEwNQYLKwYBBAGCvyUBARUwJjAkBggrBgEFBQcCARYY
aHR0cHM6Ly93d3cudHdjYS5jb20udHcvMAgGBmeBDAECAjBNBgNVHR8ERjBEMEKg
QKA+hjxodHRwOi8vUm9vdENBLnR3Y2EuY29tLnR3L1RXQ0FSQ0EvY3liZXJfcm9v
dF9yZXZva2VfMjAyMi5jcmwwEgYDVR0TAQH/BAgwBgEB/wIBADB9BggrBgEFBQcB
AQRxMG8wQwYIKwYBBQUHMAKGN2h0dHA6Ly9zc2xzZXJ2ZXIudHdjYS5jb20udHcv
Y2FjZXJ0L2N5YmVyX3Jvb3RfMjAyMi5jcnQwKAYIKwYBBQUHMAGGHGh0dHA6Ly9y
b290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcNAQEMBQADggIBAIFF/6Gnvu8L
3xQDIampB8QVgoKS2bcjte0uJBbCrQHpzcGTuVTkZaiA86LwVz6SAU7TVgVYRXmt
x8l29WzfKI6wOAzmvlGZxSYAdN0I6YBkJK1nmDs0+TSw5lCzb+UOpajNOaMdJ5SN
YTN87yRwl82AFrwUmSLaMV4tN7W49N0SsELWs/d4uNHSMM0mBjd0hLDIWJFwOkuD
yOWahnCVfPlCwSVWpUntOGgOHOA02IUE+JNX+spIV1SwAMYaEVyHe316YUgiGA5y
k3liTa3vuv06eE1J2yiWrs9booW2VTHD+amzucFFNN1KvSLjSbYxG1t/FclHEN/y
6hGM3bkjRC31A0jzpv93D3MUQTdJascicPa0H4i8hviRriyetaC6HC4q8FQUTo2A
cEpxicNGgyHhDV+YdbnS6GZL+f3bsmMM8ZFYZ77mDTS9mRO1VnIwkjiN4vpzh67a
KTpoD9TQzZcGQiJy6Pi+PCSFiqjK7UD/63L/Pt0hpoNKvZLrz4ngrlpyzpx8KjeS
A5cjKcc6vlHm0Kk07k5djhJsaqQELso5r+UXi9qC+nwqPuR/w5kJZv4fz0ND4UhY
5y3qd+iCikkF3WzOzey7jUH9URKb3iZnRAHZvmyLK57UI0FwP+5xZEByvwXDtxbe
914Hj3cSUrmKT3g/ZlOQQ1THeu48MA79
-----END CERTIFICATE-----
"""
CTX = ssl.create_default_context()
try:
    import certifi                          # 有裝就多載一份 Mozilla 的根憑證，沒裝就用系統的
    CTX.load_verify_locations(cafile=certifi.where())
except Exception:
    pass
CTX.load_verify_locations(cadata=TWCA_SSL_CA)

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
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

# 先把舊檔讀進來。美股或匯率某天抓不到的話沿用上一份，
# 總比清成空的好（清空的話使用者的美股市值會整個不見）
old = {}
try:
    with open('prices.json', encoding='utf-8') as f:
        old = json.load(f)
except Exception:
    pass

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

# 少了任一邊就不要覆蓋台股收盤價。之前只擋總數，結果上市掛掉時
# 一份「只有上櫃」的檔案照樣蓋掉好的那份，2330 就查不到了。
# 但也不要整支停掉：匯率、美股跟台股沒關係，記帳換算幣別天天要用，
# 台股那邊掛了就沿用舊的收盤價，其他照常更新，排程上標黃色警告
tw_ok = n_twse >= 800 and n_tpex >= 400
if not tw_ok:
    print('::warning::台股資料不完整（上市 %d 檔、上櫃 %d 檔），沿用舊的收盤價，匯率跟美股照常更新'
          % (n_twse, n_tpex), flush=True)
    quotes = old.get('quotes') or quotes

# ── 美股 ──
# Nasdaq 的清單端點一次回全美上市（NYSE/Nasdaq/AMEX）約七千檔，一支請求就夠。
print('抓美股…', flush=True)
us = {}
raw = get('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25000&download=true', tries=2)
rows = ((raw or {}).get('data') or {}).get('rows') or []
for r in rows:
    sym = str(r.get('symbol') or '').strip().upper()
    # Nasdaq 用斜線分股別（BRK/B），但大家打的是 BRK.B，轉成點
    sym = sym.replace('/', '.')
    # 帶 ^ 的是權證那類，網頁上也打不出來
    if not sym or '^' in sym:
        continue
    close = num(str(r.get('lastsale') or '').replace('$', ''))
    if not close:
        continue
    us[sym] = {'n': (r.get('name') or '').strip(), 'c': close,
               'ch': num(r.get('netchange')) or 0}
print('  美股 %d 檔' % len(us), flush=True)
if len(us) < 1000:
    # 抓失敗或只抓到零星幾檔，沿用舊的那份
    us = old.get('us') or us
    print('  美股沿用舊檔 %d 檔' % len(us), flush=True)

# ── 美金對台幣 ──
# 美股的價格是美金，網頁要把它換成台幣併進總資產，沒有匯率就換不了
print('抓匯率…', flush=True)
fx = None
d0 = get('https://open.er-api.com/v6/latest/USD', tries=2)
if d0 and isinstance(d0.get('rates'), dict):
    fx = num(d0['rates'].get('TWD'))
if not fx:
    # 備援：台灣銀行的牌告匯率 CSV，第一欄是幣別、第 13 欄是即期賣出
    try:
        req = urllib.request.Request('https://rate.bot.com.tw/xrt/flcsv/0/day', headers=UA)
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            for line in r.read().decode('utf-8', 'replace').splitlines():
                col = line.split(',')
                if col and col[0].strip().upper().startswith('USD'):
                    fx = num(col[12]) or num(col[3])
                    break
    except Exception as e:
        print('  台銀也失敗：%s' % e, flush=True)
if fx:
    print('  1 美金 = %.3f 台幣' % fx, flush=True)
else:
    fx = ((old.get('fx') or {}).get('USDTWD'))
    print('  匯率沿用舊檔：%s' % fx, flush=True)

# ── 各國幣別對台幣 ──
# 記帳、揪團可以選幣別記，存的時候照當天匯率換成台幣；統計也可以換成別的幣別看。
# 存的是「1 單位外幣 = 幾台幣」。er-api 給的是「1 美金 = 幾單位」，兩個相除就是了
CURS = ['USD', 'JPY', 'KRW', 'CNY', 'HKD', 'MOP', 'EUR', 'GBP', 'THB',
        'SGD', 'MYR', 'VND', 'PHP', 'IDR', 'AUD', 'NZD', 'CAD', 'CHF']
rates = {}
if d0 and isinstance(d0.get('rates'), dict):
    twd = num(d0['rates'].get('TWD'))
    for c in CURS:
        v = num(d0['rates'].get(c))
        if twd and v:
            rates[c] = round(twd / v, 6)
if fx:
    rates['USD'] = round(fx, 6)          # 美金以上面那個（可能是台銀備援）為準，兩邊才一致
if len(rates) < len(CURS) // 2:
    # 抓失敗就整份沿用舊的，不要只剩美金一個
    prev = (old.get('fx') or {}).get('rates') or {}
    rates = dict(prev, **rates)
    print('  各幣匯率沿用舊檔 %d 種' % len(rates), flush=True)
else:
    print('  各幣匯率 %d 種（1 日圓 = %s 台幣）' % (len(rates), rates.get('JPY')), flush=True)

# 交易日期以資料裡的民國日期為準
d = ''
for src, key in ((twse, 'Date'), (tpex, 'Date')):
    if src and src[0].get(key):
        raw = str(src[0][key])
        if re.fullmatch(r'\d{7}', raw):
            d = '%04d-%s-%s' % (int(raw[:3]) + 1911, raw[3:5], raw[5:7])
            break

if not tw_ok:
    d = old.get('date') or d                 # 收盤價是舊的，日期也要是舊的，不然網頁會以為是今天的價
out = {'date': d or datetime.now(TPE).strftime('%Y-%m-%d'),
       'updated': datetime.now(TPE).strftime('%Y-%m-%d %H:%M'),
       'count': len(quotes), 'quotes': quotes,
       'usCount': len(us), 'us': us,
       'fx': {'USDTWD': fx, 'rates': rates,
              'date': datetime.now(TPE).strftime('%Y-%m-%d')} if fx else (old.get('fx') or {})}
with open('prices.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print('寫入 prices.json：上市 %d ＋上櫃 %d ＝ %d 檔，美股 %d 檔，1 美金 %s 台幣，交易日 %s'
      % (n_twse, n_tpex, len(quotes), len(us), fx, out['date']))
