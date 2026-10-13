@echo off
cd /d "%~dp0"
echo Open http://localhost:4317 in your browser.
echo Keep this window open while playing. No internet is required.
node server.cjs
pause
