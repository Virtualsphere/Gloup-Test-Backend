# --- install production dependencies ---
FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml ./

ENV PUPPETEER_SKIP_DOWNLOAD=true

RUN pnpm install --no-frozen-lockfile --prod

# --- runtime ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    dumb-init \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

USER node

EXPOSE 5678

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]