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
export interface TraceBusServerOptions {
    port?: number;
    host?: string;
    verbose?: boolean;
}
export interface BusMessage {
    type: string;
    payload: any;
}
export declare class TraceBusServer {
    private readonly traceBus;
    private readonly commandBus;
    private wss;
    private http;
    private clients;
    private handlers;
    readonly port: number;
    readonly host: string;
    constructor(traceBus: any, commandBus: any, opts?: TraceBusServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    get url(): string;
    get clientCount(): number;
    broadcast(msg: BusMessage): void;
    private _send;
}
//# sourceMappingURL=TraceBusServer.d.ts.map