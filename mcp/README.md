# AcouSim MCP server

Exposes the AcouSim simulation engine to AI agents (Claude Desktop, Claude
Code, or any MCP client) over stdio. The agent can build enclosure models as
project JSON, validate them, simulate, and sweep parameters — the same
`.acousim.json` format the visual editor uses, so results round-trip both ways.

## Tools

| Tool | Purpose |
| --- | --- |
| `design_guide` | Schema, node types, units, topology semantics. Agents should call this first. |
| `validate` | Graph checks without simulating (schema errors, dangling edges, topology warnings). |
| `simulate` | Full sweep → metrics (F3, tuning, Qtc, excursion vs Xmax, port velocity, max power) + downsampled SPL/impedance curves. |
| `get_curve` | Any single quantity vs frequency (SPL per port, velocity, efficiency, group delay, …) with windowing. |
| `sweep_parameter` | Server-side grid sweep of one node param or setting, metrics tabulated per value. |
| `driver_search` | Query the built-in T/S driver library (brand/model text, Fs/Xmax/Sd filters). |
| `build_enclosure` | Generate sealed / ported / bandpass4 / bandpass6 projects. Ported and BP4 port lengths are auto-calibrated against the *simulated* tuning. |
| `optimize` | Bounded search over up to 3 parameters for `min_f3` / `max_spl` / `flat`, with Xmax and port-velocity constraints. Returns the optimized project. |
| `compare` | Metrics for 2–6 candidate designs side by side. |

The guide is also published as the resource `acousim://guide`.

## Setup

```sh
npm install          # once, from the repo root
node mcp/server.js   # runs on stdio (this is what the client launches)
```

### Claude Desktop / Claude Code

Add to `claude_desktop_config.json` (Desktop → Settings → Developer) or run
`claude mcp add acousim -- node /ABS/PATH/TO/BassSim/mcp/server.js`:

```json
{
  "mcpServers": {
    "acousim": {
      "command": "node",
      "args": ["/ABS/PATH/TO/BassSim/mcp/server.js"]
    }
  }
}
```

Then ask, e.g.: *"Design me a ported box for a 12" driver with Fs 28 Hz,
Qts 0.45, Vas 55 L that stays flat to 30 Hz at 500 W without port chuffing —
use the acousim tools."*

## Hosted (remote HTTP) — for claude.ai / ChatGPT connectors

The same tools are served over **Streamable HTTP** by `mcp/http.js`, so the
engine can run as a remote MCP connector instead of a local process.

```sh
PORT=8787 ACOUSIM_TOKEN=your-secret npm run mcp:http
# → http://0.0.0.0:8787/mcp   (health check at /healthz)
```

- **Stateless**: every tool takes the full project JSON, so no session state
  is kept. Each POST is handled by a fresh server instance — safe to run
  behind a load balancer and scale horizontally.
- **Auth**: set `ACOUSIM_TOKEN` to require `Authorization: Bearer <token>`.
  Leave it unset only on a trusted/local network.
- **CORS** is open (`*`) so browser-based MCP clients can connect.

Add it as a **custom connector** in claude.ai (Settings → Connectors → Add
custom connector) or ChatGPT, pointing at `https://your-host/mcp` with the
bearer token. Put it behind TLS (a reverse proxy or the platform's ingress) —
the server speaks plain HTTP and expects to be terminated upstream.

### Docker

```sh
docker build -t acousim-mcp .
docker run -e ACOUSIM_TOKEN=your-secret -p 8787:8787 acousim-mcp
```

The image installs only the engine + MCP SDK (no build/UI deps) and includes
a `/healthz` HEALTHCHECK.

## Smoke tests

```sh
npm run test:mcp    # stdio: every tool against a reference ported box
npm run test:http   # HTTP: boots mcp/http.js, checks auth, CORS, health,
                    # a full client round-trip, and concurrent-call isolation
```

Both check physics invariants (tuning falls with port length, excursion
scales linearly with voltage) and the calibrated builders (requested tuning
matched within 0.3 Hz).
