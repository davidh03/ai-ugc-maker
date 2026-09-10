# Production image for ai-ugc-maker: Node API/web + hyperframes render
# pipeline (headless Chrome + FFmpeg) in a single container.
#
# NOT YET BUILD-VALIDATED — no Docker daemon was available in the session
# that wrote this (see docs/deploy/README.md, "What has and hasn't been
# validated"). Building and rendering a real test video through this image
# is Phase 2 of the AWS plan (docs/plans/aws-production-hosting-cicd.md);
# treat this file as a best-effort starting point for that step, not a
# verified artifact.
#
# hyperframes downloads its own headless Chrome (chrome-headless-shell) via
# Puppeteer rather than using a system Chromium package — see the `hyperframes
# browser ensure` step below — so this installs Chrome's runtime shared
# libraries (the standard Debian Puppeteer dependency list) rather than a
# `chromium` package.

FROM node:22-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    unzip \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm ci --omit=dev \
    && npm --prefix server ci --omit=dev \
    && npm --prefix web ci

# --- build web ---
FROM deps AS build
COPY . .
RUN npm run build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
ENV DATA_DIR=/app/server/data
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY package*.json ./
COPY --from=build /app/web/dist ./web/dist

# Pre-download the headless Chrome build at image-build time, not on the
# first production render — see docs/deploy/README.md for why this must be
# re-verified once Docker is actually available (Phase 2).
RUN npx --prefix server hyperframes browser ensure || true

RUN mkdir -p /app/server/data && useradd --system --create-home --uid 10001 app \
    && chown -R app:app /app
USER app

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/src/index.js"]
