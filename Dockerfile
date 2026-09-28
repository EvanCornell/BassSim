# SpeakerSpice full-stack server: web app + simulation API + MCP endpoint in one
# container. The engine runs only server-side; the browser bundle has no
# solver code.
#
#   docker build -t speakerspice .
#   docker run -e SPEAKERSPICE_TOKEN=secret -p 8788:8788 speakerspice

# ---- stage 1: build the web app ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- stage 2: runtime ----
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# build tools cover better-sqlite3 when no prebuilt binary matches
RUN apk add --no-cache --virtual .build python3 make g++ \
 && npm ci --omit=dev \
 && apk del .build
COPY src/engine ./src/engine
COPY src/data ./src/data
COPY mcp ./mcp
COPY server ./server
COPY --from=build /app/dist ./dist

ENV PORT=8788
# accounts DB lives here — mount a volume to persist users across upgrades
ENV SPEAKERSPICE_DATA_DIR=/data
VOLUME /data
EXPOSE 8788

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
