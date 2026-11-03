@echo off
rem MFDS 수집 이어받기 — Windows 작업 스케줄러에서 매일 실행하도록 등록해 쓰는 스크립트
rem 하루 호출 한도(개발계정 10,000회)에 걸리면 진행 상태가 저장되고, 다음 실행이 이어받는다. 이미 끝났으면 호출 없이 끝난다.
cd /d "%~dp0.."
if not exist logs mkdir logs
node --env-file=.env tools\fetch_mfds.mjs --out "%USERPROFILE%\Downloads\mfds_out" >> logs\mfds_fetch.log 2>&1
echo [%DATE% %TIME%] exit=%ERRORLEVEL% >> logs\mfds_fetch.log
