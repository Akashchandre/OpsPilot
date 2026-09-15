# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM docker.io/library/python:3.13.15-slim-bookworm@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e AS dependencies

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

COPY apps/ai/pylock.linux-amd64.toml /tmp/pylock.toml

RUN python -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --requirement /tmp/pylock.toml \
    && /opt/venv/bin/python -m pip check

FROM dependencies AS embedding-model

ARG AI_RAG_EMBEDDING_MODEL_REVISION=5f1b8cd78bc4fb444dd171e59b18f3a3af89a079

COPY docker/ai-model.sha256 /tmp/ai-model.sha256

RUN install -d -m 0755 /var/lib/opspilot-ai/models \
    && /opt/venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2', cache_dir='/var/lib/opspilot-ai/models', threads=1, revision='${AI_RAG_EMBEDDING_MODEL_REVISION}')" \
    && cd /var/lib/opspilot-ai/models \
    && sha256sum --check /tmp/ai-model.sha256

FROM docker.io/library/python:3.13.15-slim-bookworm@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e AS runtime

LABEL org.opencontainers.image.title="OpsPilot AI service" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.description="Internal non-root OpsPilot FastAPI runtime"

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app/apps/ai/src \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp \
    AI_ENVIRONMENT=production \
    AI_HOST=127.0.0.1 \
    AI_PORT=8000

RUN groupadd --gid 10002 opspilot-ai \
    && useradd --uid 10002 --gid 10002 --no-create-home --shell /usr/sbin/nologin opspilot-ai \
    && install -d -o 10002 -g 10002 -m 0700 \
      /var/lib/opspilot-ai \
      /var/lib/opspilot-ai/models \
      /var/lib/opspilot-ai/qdrant \
      /var/lib/opspilot-ai/checkpoints \
    && apt-get update \
    && apt-get install -y --no-install-recommends libpcre2-8-0=10.42-1+deb12u1 \
    && rm -rf /var/lib/apt/lists/* \
    && chmod u-s /usr/bin/mount \
    && rm -f /usr/bin/nsenter

WORKDIR /app/apps/ai

COPY --from=dependencies --chown=10002:10002 /opt/venv /opt/venv
COPY --from=embedding-model --chown=10002:10002 /var/lib/opspilot-ai/models /var/lib/opspilot-ai/models
COPY --chown=10002:10002 apps/ai/src ./src

RUN rm -rf \
      /usr/local/lib/python3.13/site-packages/pip \
      /usr/local/lib/python3.13/site-packages/pip-*.dist-info \
      /usr/local/bin/pip \
      /usr/local/bin/pip3 \
      /usr/local/bin/pip3.13 \
      /opt/venv/lib/python3.13/site-packages/pip \
      /opt/venv/lib/python3.13/site-packages/pip-*.dist-info \
      /opt/venv/bin/pip \
      /opt/venv/bin/pip3 \
      /opt/venv/bin/pip3.13

USER 10002:10002

EXPOSE 8000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["python", "-c", "import socket; connection=socket.create_connection(('127.0.0.1',8000),2); connection.close()"]

CMD ["python", "-m", "uvicorn", "opspilot_ai.main:app", "--host", "127.0.0.1", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
