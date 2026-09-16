#!/usr/bin/env bash
# Полный deploy приложения Dokploy (clone + build) с повтором, если clone с
# GitHub оборвался («early EOF» — бывает на сервере). Готовность — по смене
# build в version.json (web) или по маркеру нового кода (api: MARKER_URL +
# MARKER_TEXT), а НЕ по статусу Dokploy: после оборванного clone он висит в
# running, а /health отвечает старый контейнер.
#
#   DOKPLOY_TOKEN=... APP_ID=... APP_LOG_DIR=hulk-web-uw7ph7 \
#     CHECK_URL=https://crm.hulkbike.ru/version.json [OLD_TEXT=build.xxx] \
#     bash scripts/dokploy_deploy_retry.sh
#
# Готово, когда ответ CHECK_URL перестал содержать OLD_TEXT (если задан)
# или стал содержать NEW_TEXT (если задан). CHECK_METHOD=POST — для маркера
# api по новому маршруту (старый код отвечает «Route … not found»).
set -u
DOK="http://104.128.128.96:3000"
SSH="ssh -i $HOME/.ssh/hulk_deploy -o BatchMode=yes root@104.128.128.96"

check_body() {
  if [ "${CHECK_METHOD:-GET}" = "GET" ]; then curl -s --max-time 15 "$CHECK_URL" || true
  else curl -s --max-time 15 -X "$CHECK_METHOD" -H "Content-Type: application/json" -d '{}' "$CHECK_URL" || true; fi
}

ready() {
  local body; body=$(check_body)
  if [ -n "${NEW_TEXT:-}" ]; then echo "$body" | grep -q "$NEW_TEXT" && return 0; return 1; fi
  if [ -n "${OLD_TEXT:-}" ]; then [ -n "$body" ] && ! echo "$body" | grep -q "$OLD_TEXT" && return 0; fi
  return 1
}

for attempt in 1 2 3 4; do
  curl -s --max-time 60 -X POST -H "x-api-key: $DOKPLOY_TOKEN" -H "Content-Type: application/json" \
    -d "{\"applicationId\":\"$APP_ID\"}" "$DOK/api/application.deploy" -o /dev/null -w "attempt $attempt: trigger %{http_code}\n"
  sleep 15
  LOG=$($SSH "ls -t /etc/dokploy/logs/$APP_LOG_DIR/*.log | head -1")
  for i in $(seq 1 75); do
    if ready; then echo "READY (attempt $attempt): $(check_body | head -c 200)"; exit 0; fi
    if $SSH "grep -a -q 'Error occurred' '$LOG'" 2>/dev/null; then
      echo "attempt $attempt failed:"
      $SSH "grep -a -v 'Counting objects\|Compressing objects\|Receiving objects\|Resolving deltas' '$LOG' | grep -a -E 'ERROR|error|fatal' | tail -4" | cut -c1-200
      break
    fi
    sleep 20
  done
done
echo "NOT READY"; exit 1
