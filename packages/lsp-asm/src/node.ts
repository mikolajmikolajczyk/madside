#!/usr/bin/env node
// Node stdio entry — `asm-lsp --dialect z80asm --stdio` for Neovim / VS Code /
// any LSP client. Shares the exact server the browser worker runs. Explicit
// `.js`: vscode-languageserver ships no exports map. The dialect id comes from
// `--dialect <id>` (defaults to mads). `process` is read via globalThis so this
// typechecks without @types/node on the path.
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js'
import { startServer } from '@madside/lsp-core'
import { createAsmProvider } from './provider'
import { getAsmDialect, madsDialect } from './dialects'

const argv = (globalThis as { process?: { argv: string[] } }).process?.argv ?? []
const i = argv.indexOf('--dialect')
const dialect = (i >= 0 ? getAsmDialect(argv[i + 1]) : undefined) ?? madsDialect

startServer(createConnection(ProposedFeatures.all), createAsmProvider(dialect))
