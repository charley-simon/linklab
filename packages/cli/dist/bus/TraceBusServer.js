/**
 * TraceBusServer.ts — Serveur WebSocket pour diffuser les spans
 *
 * Démarre dans le même process que linklab studio.
 * Diffuse tous les événements du traceBus aux clients connectés.
 *
 * Protocole (JSON over WebSocket) :
 *   → { type: 'framework:span', payload: FrameworkSpan }
 *   → { type: 'span:end',       payload: Span           }
 *   → { type: 'metrics:update', payload: SystemMetrics  }
 *   ← { type: 'command',        payload: Command        }  // client → serveur
 *
 * Usage :
 *   const server = new TraceBusServer(traceBus, commandBus)
 *   await server.start(7337)
 *   // ...
 *   await server.stop()
 */
import { createServer } from 'node:http';
// WebSocket via ws — dépendance légère déjà présente dans le monorepo
let WebSocketServer;
let WebSocket;
async function loadWS() {
    if (WebSocketServer)
        return;
    try {
        const ws = await import('ws');
        WebSocketServer = ws.WebSocketServer ?? ws.WebSocketServer;
        WebSocket = ws.WebSocket ?? ws.default;
    }
    catch {
        throw new Error('Package "ws" requis : pnpm add ws -w');
    }
}
// ── TraceBusServer ────────────────────────────────────────────────────────────
export class TraceBusServer {
    traceBus;
    commandBus;
    wss = null;
    http = null;
    clients = new Set();
    handlers = [];
    port;
    host;
    constructor(traceBus, commandBus, opts = {}) {
        this.traceBus = traceBus;
        this.commandBus = commandBus;
        this.port = opts.port ?? 7337;
        this.host = opts.host ?? '127.0.0.1';
    }
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    async start() {
        await loadWS();
        this.http = createServer();
        this.wss = new WebSocketServer({ server: this.http });
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            // Recevoir des commandes depuis les clients (observe → studio)
            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    if (msg.type === 'command') {
                        this.commandBus.send(msg.payload.command, msg.payload.params ?? {});
                    }
                }
                catch {
                    /* message invalide — ignorer */
                }
            });
            ws.on('close', () => this.clients.delete(ws));
            ws.on('error', () => this.clients.delete(ws));
            // Envoyer un message de bienvenue avec l'état courant
            this._send(ws, { type: 'connected', payload: { timestamp: Date.now() } });
        });
        // Abonner aux événements du traceBus et les diffuser
        const events = [
            'framework:span',
            'span:end',
            'span:error',
            'metrics:update',
            'calibration:done',
            'yoyo:detected'
        ];
        for (const event of events) {
            const handler = (payload) => this.broadcast({ type: event, payload });
            this.traceBus.on(event, handler);
            this.handlers.push(() => this.traceBus.off(event, handler));
        }
        // Diffuser aussi les réponses du commandBus
        const cmdReplyHandler = (payload) => {
            this.broadcast({ type: 'command:reply', payload });
        };
        this.traceBus.on('command:reply', cmdReplyHandler);
        this.handlers.push(() => this.traceBus.off('command:reply', cmdReplyHandler));
        await new Promise((resolve, reject) => {
            this.http.listen(this.port, this.host, () => resolve());
            this.http.on('error', reject);
        });
    }
    async stop() {
        // Désabonner les handlers
        for (const cleanup of this.handlers)
            cleanup();
        this.handlers = [];
        // Fermer les clients
        for (const client of this.clients) {
            try {
                client.close();
            }
            catch { }
        }
        this.clients.clear();
        // Fermer le serveur
        await new Promise(resolve => {
            this.wss?.close(() => resolve());
        });
        await new Promise(resolve => {
            this.http?.close(() => resolve());
        });
    }
    get url() {
        return `ws://${this.host}:${this.port}`;
    }
    get clientCount() {
        return this.clients.size;
    }
    // ── Diffusion ─────────────────────────────────────────────────────────────
    broadcast(msg) {
        const json = JSON.stringify(msg);
        for (const client of this.clients) {
            try {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(json);
                }
            }
            catch {
                /* client déconnecté */
            }
        }
    }
    _send(ws, msg) {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(msg));
            }
        }
        catch { }
    }
}
//# sourceMappingURL=TraceBusServer.js.map