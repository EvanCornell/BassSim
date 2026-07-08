# AcouSim MCP server (streamable HTTP). Deploys the simulation engine as a
# remote MCP endpoint for claude.ai / ChatGPT connectors and other clients.
FROM node:22-alpine

WORKDIR /app

# Install only what the server needs (the engine + MCP SDK; no dev/build deps).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Engine sources and the MCP server. The engine is pure JS imported directly.
COPY src/engine ./src/engine
COPY src/data ./src/data
COPY mcp ./mcp

ENV PORT=8787
EXPOSE 8787

# Set ACOUSIM_TOKEN at runtime to require a bearer token:
#   docker run -e ACOUSIM_TOKEN=secret -p 8787:8787 acousim-mcp
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "mcp/http.js"]
