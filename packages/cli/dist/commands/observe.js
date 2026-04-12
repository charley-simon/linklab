/**
 * observe.ts — linklab observe <alias> [--record] [--replay <sessionId>]
 *
 * Lance le TUI d'observabilité LinkLab.
 * Se connecte au traceBus et commandBus pour afficher les spans en temps réel.
 *
 * Usage :
 *   linklab observe cinema
 *   linklab observe cinema --record
 *   linklab observe cinema --replay session-abc123
 */
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import React from 'react';
import { render } from 'ink';
import { loadConfig, resolveAlias } from '../config.js';
import { commandBus, injectFrameworkTelemetry } from '@linklab/framework';
export async function observe(options = {}) {
    const cwd = process.cwd();
    let alias;
    let outDir;
    try {
        const resolved = resolveAlias(cwd, options.alias);
        if (!resolved) {
            console.error('\n  ✖  Alias requis : linklab observe <alias>\n');
            process.exit(1);
        }
        alias = resolved;
        ({ outDir } = await loadConfig(cwd, alias));
    }
    catch (e) {
        console.error(`\n  ✖  ${e.message}\n`);
        process.exit(1);
    }
    console.log();
    console.log(`  ${chalk.bold.white('linklab observe')}  ·  ${chalk.cyan(alias)}`);
    if (options.record)
        console.log(`  ${chalk.red('⏺ enregistrement activé')}`);
    if (options.replay)
        console.log(`  ${chalk.yellow(`▶ replay: ${options.replay}`)}`);
    console.log();
    // ── Initialiser la télémétrie ──────────────────────────────────────────
    const { traceBus } = await import('@linklab/telemetry');
    const { SpanBuilder } = await import('@linklab/telemetry');
    // Injecter dans @linklab/framework
    injectFrameworkTelemetry({ traceBus });
    // Injecter dans @linklab/core (si disponible)
    try {
        const { injectTelemetry } = await import('@linklab/core');
        injectTelemetry({ SpanBuilder, traceBus });
    }
    catch { /* @linklab/core sans telemetry — ok */ }
    // ── Connexion WebSocket au studio (si dispo) ───────────────────────────
    const busPort = 7337;
    let busClient = null;
    try {
        const { TraceBusClient } = await import('../bus/TraceBusClient.js');
        busClient = new TraceBusClient(traceBus, commandBus, {
            reconnectMs: 2000,
            maxRetries: 5
        });
        await busClient.connect(`ws://127.0.0.1:${busPort}`);
        console.log(`  ${chalk.dim(`bus: connecté ws://127.0.0.1:${busPort}`)}`);
        // Les commandes du commandBus sont relayées vers studio via WS
        const cmds = ['recalibrate', 'record.start', 'record.stop', 'query.status', 'replay.load'];
        for (const cmd of cmds) {
            commandBus.on(cmd, (payload) => busClient.send(cmd, payload));
        }
    }
    catch {
        console.log(`  ${chalk.dim('bus: mode local (studio non connecté)')}`);
    }
    // ── DuckDB (optionnel) ─────────────────────────────────────────────────
    let duckdb = null;
    if (options.duckdb) {
        try {
            const { DuckDBDriver } = await import('@linklab/telemetry');
            const dbPath = path.join(outDir, `${alias}.telemetry.duckdb`);
            duckdb = new DuckDBDriver({ dbPath });
            await duckdb.connect();
            console.log(`  ${chalk.dim(`DuckDB: ${dbPath}`)}`);
        }
        catch (e) {
            console.warn(`  ⚠  DuckDB non disponible : ${e.message}`);
        }
    }
    // ── SessionRecorder (si --record) ──────────────────────────────────────
    let recorder = null;
    if (options.record) {
        const { SessionRecorder } = await import('@linklab/framework');
        recorder = new SessionRecorder(traceBus, duckdb);
        // Détecter le graphHash depuis le compilé
        const compiledPath = path.join(outDir, `${alias}.json`);
        let graphHash = 'unknown';
        try {
            const compiled = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));
            graphHash = compiled.version ?? 'unknown';
        }
        catch { }
        recorder.start({
            alias,
            graphHash,
            compiledPath,
            meta: { startedFrom: 'linklab observe' }
        });
    }
    // ── Handlers CommandBus ────────────────────────────────────────────────
    commandBus.on('recalibrate', async ({ alias: a }) => {
        if (duckdb?.isConnected) {
            try {
                const { CalibrationJob, LatencyBaselineStore } = await import('@linklab/telemetry');
                const latency = new LatencyBaselineStore();
                const job = new CalibrationJob({ duckdb, latency, bus: traceBus });
                await job.runOnce();
                commandBus.reply('recalibrate', { success: true, payload: { alias: a } });
            }
            catch (e) {
                commandBus.reply('recalibrate', { success: false, error: e.message });
            }
        }
    });
    commandBus.on('record.stop', async () => {
        if (recorder?.isRecording) {
            const session = await recorder.stop();
            if (session) {
                // Sauvegarder la session JSON
                const sessionPath = path.join(outDir, `${session.id}.session.json`);
                fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
                commandBus.reply('record.stop', {
                    success: true,
                    payload: { sessionId: session.id, path: sessionPath, spans: session.spans.length }
                });
            }
        }
    });
    commandBus.on('query.status', () => {
        commandBus.reply('query.status', {
            success: true,
            payload: {
                alias,
                recording: recorder?.isRecording ?? false,
                duckdb: duckdb?.isConnected ?? false,
                activeCommands: commandBus.activeCommands()
            }
        });
    });
    // ── Rendre le TUI ─────────────────────────────────────────────────────
    const { ObserveApp } = await import('@linklab/framework');
    const { waitUntilExit } = render(React.createElement(ObserveApp, {
        alias,
        traceBus,
        commandBus,
        recorder
    }));
    // Attendre que l'utilisateur quitte puis nettoyer
    await waitUntilExit();
    busClient?.disconnect();
    process.exit(0);
}
//# sourceMappingURL=observe.js.map