@echo off
REM 戳 GitHub Actions 去抓收盤價。
REM
REM 為什麼要這支：GitHub 自己的 cron 不保證準時，實測常常整段被跳過
REM （2026-10-14 排六次只跑四次、前三次全漏；10-15 整天一次都沒跑），
REM 收盤價就一直停在前一天。這台電腦本來就有一排當沖的工作排程，
REM 準時得多，所以改成由這裡主動觸發，GitHub 那邊的 cron 留著當備援。
REM
REM 由工作排程 TW_Prices_Poke 呼叫。這個檔要存成 cp950，存 UTF-8 的話
REM cmd 會把中文註解讀成亂碼，連帶整支解析壞掉。

setlocal
set "LOG=%~dp0poke_prices.log"
set "GH=C:\Program Files\GitHub CLI\gh.exe"

echo [%date% %time:~0,8%] trigger >> "%LOG%"
"%GH%" workflow run prices.yml --repo bocby413/savequest >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [%date% %time:~0,8%] FAILED >> "%LOG%"
  exit /b 1
)
echo [%date% %time:~0,8%] sent >> "%LOG%"
exit /b 0
