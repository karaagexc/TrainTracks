@echo off
title TrainTracks Git Auto-Save
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\git-autosave.ps1"
pause
