# syntax=docker/dockerfile:1.7
#
# Dockerfile для apps/landing — публичный сайт hulkbike.ru.
# Контекст сборки = корень монорепы.
#   docker build -f apps/landing/Dockerfile --build-arg API_URL=https://api.hulk-bike.ru -t hulk-landing .
#
# На Dokploy:
#   • Build Type:      Dockerfile
#   • Build Path:      /
#   • Dockerfile Path: apps/landing/Dockerfile
#   • Build Args:      API_URL = https://api.hulk-bike.ru
#   • Domains:         hulkbike.ru → port 80, HTTPS (Let's Encrypt)
#
# API_URL «впекается» в index.html на этапе сборки (sed подменяет __API_URL__).

FROM nginx:alpine

ARG API_URL=https://api.hulk-bike.ru

COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/index.html /usr/share/nginx/html/index.html

# Подменяем плейсхолдер в <meta name="api-url"> на реальный URL API.
RUN sed -i "s|__API_URL__|${API_URL}|g" /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=5s \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1
