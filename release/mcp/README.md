# SpeakerSpice MCP server

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants
search drivers, build and simulate loudspeaker enclosures, and compare
designs, with the same engine as the SpeakerSpice app.

Requires Node 22 or later.

## Run

```bash
npm install
npm start            # stdio, for Claude Desktop, Claude Code and other local clients
npm run start:http   # Streamable HTTP on port 8787, at /mcp
```

For a local client, point it at `node mcp/server.js` in this directory.

Over HTTP, set `SPEAKERSPICE_TOKEN` to require `Authorization: Bearer <token>`,
and put the server behind TLS before exposing it. `PORT` changes the port.

## Licence

MIT — see [LICENSE](LICENSE). Third-party software, including ngspice, is
credited in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
