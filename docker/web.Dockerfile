# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --workspace @opspilot/web --include-workspace-root

COPY apps/web/index.html apps/web/index.html
COPY apps/web/vite.config.js apps/web/vite.config.js
COPY apps/web/public apps/web/public
COPY apps/web/src apps/web/src

ARG VITE_API_BASE_URL
ARG VITE_CSRF_COOKIE_NAME=opspilot_csrf

RUN test -n "$VITE_API_BASE_URL" \
    && VITE_API_BASE_URL="$VITE_API_BASE_URL" \
       VITE_CSRF_COOKIE_NAME="$VITE_CSRF_COOKIE_NAME" \
       npm run build --workspace @opspilot/web

FROM docker.io/nginxinc/nginx-unprivileged:1.30.4-alpine3.24@sha256:442753882674b49ae2c1de83ed67896131c0777f56df5005e356e62bc3f7e7ce AS runtime

LABEL org.opencontainers.image.title="OpsPilot demo web edge" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.description="Unprivileged Nginx static web and same-origin API proxy"

COPY --chown=101:101 docker/nginx.demo.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /app/apps/web/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["wget", "-q", "-T", "3", "-O", "/dev/null", "http://127.0.0.1:8080/demo-health"]
