#!/usr/bin/env node
/**
 * index.ts — @linklab/cli entry point
 *
 * Usage :
 *   linklab init cinema
 *   linklab build cinema
 *   linklab repl cinema
 *   linklab status cinema
 */

import { init }     from './commands/init.js'
import { build }    from './commands/build.js'
import { repl }     from './commands/repl.js'
import { generate } from './commands/generate.js'
import { test }     from './commands/test.js'
import { train }    from './commands/train.js'
import { refresh }  from './commands/refresh.js'
import { stress }   from './commands/stress.js'
import { status }   from './commands/status.js'
import { docs }     from './commands/docs.js'
import { diff }     from './commands/diff.js'
import { doctor }   from './commands/doctor.js'
import { server }   from './commands/server.js'

// ── Parser d'args ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  command: string
  alias: string | undefined
  flags: Record<string, string | boolean>
} {
  const [, , command = '', ...rest] = argv

  const flags: Record<string, string | boolean> = {}
  let alias: string | undefined

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else if (!alias) {
      alias = arg // premier arg non-flag = alias
    }
  }

  return { command, alias, flags }
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  linklab — LinkLab CLI

  Usage:
    linklab <command> [alias] [options]

  Commands:
    init <alias>      Create {alias}.linklab.ts + linklab/{alias}/ structure
    build <alias>     Run the full pipeline (extract → analyze → compile)
    generate <alias>  Generate use-cases.gen.json (physical + semantic + composed)
    test <alias>      Test all use cases against real data
    train <alias>     Calibrate weights from test results + recompile (physical + semantic + composed)
    refresh <alias>   Macro: build + generate + test + train in one command
    stress <alias>    Performance & load testing (--runs N, --load, --concurrent, --watch)
    doctor [alias]    Diagnose config, source, generated files
    repl <alias>      Open the interactive REPL for a graph
    server <alias>    Start REST + HATEOAS server (--port N, --host, --prefix)
    status            Show all projects status
    diff <alias>      Show schema changes vs current source
    docs <alias>      Generate Markdown documentation
    observe <alias>   Observabilité temps réel (--record, --replay <id>, --duckdb)

  Examples:
    linklab init cinema
    linklab build cinema
    linklab repl cinema
    linklab server dvdrental --port 4000
    linklab build dvdrental --dry-run
    linklab build           ← auto-detect if single *.linklab.ts found
`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { command, alias, flags } = parseArgs(process.argv)

  switch (command) {
    case 'init':
      await init({
        alias:  alias ?? (flags['alias']  as string | undefined),
        source: flags['source'] as string | undefined,
        type:   flags['type']   as 'postgres' | 'json' | undefined,
        force:  Boolean(flags['force'])
      })
      break

    case 'build':
      await build({
        alias:  alias ?? (flags['alias']  as string | undefined),
        config: flags['config'] as string | undefined,
        dryRun: Boolean(flags['dry-run'])
      })
      break

    case 'generate':
      await generate({
        alias: alias ?? (flags['alias'] as string | undefined)
      })
      break

    case 'test':
      await test({
        alias:    alias ?? (flags['alias'] as string | undefined),
        failFast: Boolean(flags['fail-fast']),
        filter:   flags['filter'] as 'physical' | 'semantic' | 'composed' | undefined
      })
      break

    case 'train':
      await train({
        alias: alias ?? (flags['alias'] as string | undefined)
      })
      break

    case 'refresh':
      await refresh({
        alias: alias ?? (flags['alias'] as string | undefined)
      })
      break

    case 'stress':
      await stress({
        alias:      alias ?? (flags['alias'] as string | undefined),
        runs:       flags['runs']        ? parseInt(flags['runs']        as string) : undefined,
        load:       flags['load']        as boolean | undefined,
        concurrent: flags['concurrent']  as boolean | undefined,
        vu:         flags['vu']          ? parseInt(flags['vu']          as string) : undefined,
        think:      flags['think']       ? parseInt(flags['think']       as string) : undefined,
        watch:      flags['watch']       as boolean | undefined,
        slowMs:     flags['slow-ms']     ? parseInt(flags['slow-ms']     as string) : undefined,
        criticalMs: flags['critical-ms'] ? parseInt(flags['critical-ms'] as string) : undefined
      })
      break

    case 'repl':
      await repl({
        alias: alias ?? (flags['alias'] as string | undefined)
      })
      break

    case 'server':
      await server({
        alias:  alias  ?? (flags['alias']  as string | undefined),
        port:   flags['port']   ? parseInt(flags['port'] as string) : undefined,
        host:   flags['host']   as string | undefined,
        prefix: flags['prefix'] as string | undefined,
      })
      break

    case 'doctor':
      await doctor({ alias: alias ?? (flags['alias'] as string | undefined) })
      break

    case 'status':
      await status({ alias: alias ?? (flags['alias'] as string | undefined) })
      break

    case 'diff':
      await diff({ alias: alias ?? (flags['alias'] as string | undefined) })
      break

    case 'docs':
      await docs({ alias: alias ?? (flags['alias'] as string | undefined) })
      break


    case 'help':
    case '--help':
    case '-h':
    case '':
      printHelp()
      break

    default:
      console.error(`\n  Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

main().catch(err => {
  console.error('\n  ✖', err.message ?? err)
  process.exit(1)
})