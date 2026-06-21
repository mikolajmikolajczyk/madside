#!/usr/bin/env node
// Node stdio entry — `cc65-lsp --stdio` for Neovim / VS Code / any LSP client.
// Shares the exact server the browser worker runs (no node-only logic on the
// request path). Explicit `.js`: vscode-languageserver ships no exports map.
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js'
import { startServer } from '@madside/lsp-core'
import { createCProvider } from '@madside/lsp-c'
import { cc65Dialect } from './dialect'

startServer(createConnection(ProposedFeatures.all), createCProvider(cc65Dialect))
