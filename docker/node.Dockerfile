# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS hardened-runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpcre2-8-0=10.42-1+deb12u1 \
    && rm -rf /var/lib/apt/lists/* \
    && chmod u-s /usr/bin/mount \
    && rm -f /usr/bin/nsenter

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --workspace @opspilot/api --include-workspace-root

COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.js apps/api/prisma.config.js

RUN DATABASE_URL=mysql://build:build@127.0.0.1:3306/build \
    SHADOW_DATABASE_URL=mysql://build:build@127.0.0.1:3306/build_shadow \
    npm run db:generate --workspace @opspilot/api

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS migration-dependencies

ENV NODE_ENV=production

WORKDIR /migration

COPY docker/migration/package.json docker/migration/package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

FROM hardened-runtime AS migration

ENV NODE_ENV=production \
    HOME=/tmp

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=migration-dependencies --chown=1000:1000 /migration/node_modules ./node_modules
COPY --from=migration-dependencies --chown=1000:1000 /migration/package.json ./package.json
COPY --chown=1000:1000 apps/api/prisma ./apps/api/prisma
COPY --chown=1000:1000 apps/api/prisma.config.js ./apps/api/prisma.config.js

WORKDIR /app/apps/api
USER 1000:1000

ENTRYPOINT ["../../node_modules/.bin/prisma"]
CMD ["migrate", "deploy"]

FROM docker.io/library/node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime-dependencies

ENV NODE_ENV=production \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN npm ci --omit=dev --omit=peer --workspace @opspilot/api --include-workspace-root \
    && npm uninstall --no-save --workspace @opspilot/api prisma \
    && npm cache clean --force

FROM hardened-runtime AS runtime

LABEL org.opencontainers.image.title="OpsPilot Node application" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.description="Non-root OpsPilot API and worker runtime"

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=4000 \
    HOME=/tmp

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=runtime-dependencies --chown=1000:1000 /app/node_modules ./node_modules
COPY --from=dependencies --chown=1000:1000 /app/apps/api/src/generated ./apps/api/src/generated
COPY --chown=1000:1000 package.json ./package.json
COPY --chown=1000:1000 apps/api/package.json ./apps/api/package.json
COPY --chown=1000:1000 apps/api/src ./apps/api/src

USER 1000:1000

EXPOSE 4000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "apps/api/src/server.js"]
