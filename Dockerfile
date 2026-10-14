# RIMA Supply on Railway — oven/bun image with poppler for PDF extraction.
FROM oven/bun:1.4
WORKDIR /app

# poppler-utils provides `pdftotext` for warehouse receiving PDF parsing.
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*

# Install server dependencies.
COPY package.json ./
COPY bun.lock ./
RUN bun install --production

# Copy server source + migrations + client build + seed data.
COPY server ./server
COPY data ./data
COPY client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["bun", "run", "server/src/index.ts"]
