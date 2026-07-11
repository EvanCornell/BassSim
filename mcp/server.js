#!/usr/bin/env node
// Stdio entry point: node mcp/server.js  (Claude Desktop / Claude Code / local MCP clients)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './acousim.js'

await createServer().connect(new StdioServerTransport())
console.error('AcouSim MCP server ready (stdio)')
