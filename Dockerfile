# --- install production dependencies ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml ./

# Use system Chromium in the runtime image; skip Puppeteer's bundled download (~300MB+).
ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN pnpm install --no-frozen-lockfile --prod

# --- runtime ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium for PDF generation; dumb-init for correct signal forwarding (PID 1).
# Shared memory defaults are small in Docker; Puppeteer benefits from --disable-dev-shm-usage (set in code).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
        dumb-init \
        curl \
        ca-certificates \
        fonts-liberation \
        libasound2
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

EXPOSE 3010

# Match app.js: port from APP_PORT, else 5678.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD node -e "const p=process.env.APP_PORT||'5678';fetch('http://127.0.0.1:'+p+'/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
