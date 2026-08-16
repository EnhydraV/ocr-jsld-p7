@echo off
rem Raccourci de demarrage pour Windows - strictement la sequence documentee
rem dans le README, qui reste la reference. Equivalent de run.sh.
rem
rem   run.bat          demarre tout et cree les dashboards (rejouable)
rem   run.bat down     arrete les deux stacks
rem
rem Sans accents volontairement : cmd.exe n'interprete pas l'UTF-8 par defaut.
setlocal
cd /d "%~dp0"

set "ES_URL=http://localhost:9200"
set "KIBANA_URL=http://localhost:5601"
set "API_HEALTH=http://localhost:8080/api/health"
set "ELK=elk\docker-compose.yml"

if /i "%~1"=="down" goto down

echo.
echo ==^> Verifications prealables
where docker >nul 2>&1 || (echo     ERREUR: docker est introuvable & exit /b 1)
where curl >nul 2>&1 || (echo     ERREUR: curl est introuvable & exit /b 1)
if not exist "elk\.env" (
  echo     ERREUR: elk\.env absent. Le copier depuis elk\.env.example, GITHUB_TOKEN requis.
  exit /b 1
)
if not exist ".env" echo     ATTENTION: .env absent, les logs applicatifs n'iront pas dans Kibana.
echo     ok

echo.
echo ==^> Stack applicative
docker compose pull || exit /b 1
docker compose up -d --wait --wait-timeout 300 || exit /b 1

echo.
echo ==^> Stack ELK
rem La stack applicative vient de creer le reseau `orion`, que ce compose
rem declare `external` et ne sait pas creer : l'ordre n'est pas negociable.
docker compose -f "%ELK%" pull || exit /b 1
docker compose -f "%ELK%" up -d || exit /b 1

set /a TRIES=0
echo     Elasticsearch...
:wait_es
curl -fsS -o NUL "%ES_URL%/_cluster/health" >nul 2>&1
if not errorlevel 1 goto es_ready
set /a TRIES+=1
if %TRIES% GEQ 150 (echo     ERREUR: Elasticsearch n'a pas repondu en 300s & exit /b 1)
timeout /t 2 /nobreak >nul
goto wait_es
:es_ready

set /a TRIES=0
echo     Kibana...
:wait_kibana
curl -fsS -o NUL "%KIBANA_URL%/api/status" >nul 2>&1
if not errorlevel 1 goto kibana_ready
set /a TRIES+=1
if %TRIES% GEQ 150 (echo     ERREUR: Kibana n'a pas repondu en 300s & exit /b 1)
timeout /t 2 /nobreak >nul
goto wait_kibana
:kibana_ready

echo.
echo ==^> Reconnexion des logs applicatifs
rem Le transport Winston vers Logstash ne se connecte qu'au DEMARRAGE du
rem processus : quatre tentatives, puis il se tait pour ne pas gener
rem l'application. Les conteneurs applicatifs ayant demarre avant Logstash,
rem ils ont deja renonce.
docker compose restart server backup || exit /b 1

set /a TRIES=0
echo     API...
:wait_api
curl -fsS -o NUL "%API_HEALTH%" >nul 2>&1
if not errorlevel 1 goto api_ready
set /a TRIES+=1
if %TRIES% GEQ 150 (echo     ERREUR: l'API n'a pas repondu en 300s & exit /b 1)
timeout /t 2 /nobreak >nul
goto wait_api
:api_ready

rem Un peu de trafic : l'index orion-logs-* n'existe qu'a la premiere ligne
rem recue, et Kibana refuse une data view dont le motif ne correspond a rien.
curl -fsS -o NUL "%API_HEALTH%" >nul 2>&1
curl -fsS -o NUL "%API_HEALTH%" >nul 2>&1
curl -fsS -o NUL "%API_HEALTH%" >nul 2>&1

echo.
echo ==^> Metriques et dashboards
pushd tools
rem `call` est OBLIGATOIRE : npm est un .cmd, et sans call le script courant
rem s'arrete a la premiere invocation au lieu de poursuivre.
if not exist "node_modules" call npm ci --no-audit --silent
call npm run --silent dora:index -- --refresh || echo     ATTENTION: dora:index a echoue, l'indexer reessaiera dans l'heure.
call npm run --silent deps:index || echo     ATTENTION: deps:index a echoue. GITHUB_TOKEN dans tools\.env ?
popd

set /a TRIES=0
echo     Index des logs...
:wait_logs
set "LOGS_FOUND="
for /f "delims=" %%i in ('curl -fsS "%ES_URL%/_cat/indices/orion-logs-*?h=index" 2^>nul') do set "LOGS_FOUND=1"
if defined LOGS_FOUND goto logs_ready
set /a TRIES+=1
if %TRIES% GEQ 150 (echo     ATTENTION: aucun log indexe, la data view des logs manquera. & goto logs_ready)
timeout /t 2 /nobreak >nul
goto wait_logs
:logs_ready

pushd tools
call npm run --silent kibana:setup || (popd & echo     ERREUR: creation des dashboards en echec. Relancer run.bat suffit en general. & exit /b 1)
popd

echo.
echo ==^> Pret
echo     Application    http://localhost:4200
echo     API            %API_HEALTH%
echo     Kibana         %KIBANA_URL%/app/dashboards
echo.
echo     Arret : run.bat down
exit /b 0

:down
echo.
echo ==^> Arret
rem ELK d'abord : elle est raccordee au reseau cree par la stack applicative.
docker compose -f "%ELK%" down
docker compose down
echo.
echo     Volumes conserves. `down -v` detruirait la base ; .\backups y survivrait.
exit /b 0
