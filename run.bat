@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ===========================================
echo Slide Reconstructor 시작 중...
echo 서버 구동을 기다리고 있습니다...
echo (약 2초 후 브라우저가 자동으로 열립니다)
echo ===========================================

:: 2초 대기 후 브라우저를 여는 명령을 별도 창에서 실행 (백그라운드)
start cmd /c "timeout /t 2 /nobreak > nul & start http://127.0.0.1:8000"

:: 메인 창에서 서버 실행
python app.py
pause
