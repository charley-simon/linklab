/**
 * TraceBusClient.ts — Client WebSocket pour recevoir les spans depuis studio
 *
 * Se connecte au TraceBusServer de linklab studio.
 * Reçoit les événements et les injecte dans le traceBus local.
 * Envoie les commandes de observe → studio.
 *
 * Usage :
 *   const client = new TraceBusClient(traceBus, commandBus)
 *   await client.connect('ws://localhost:7337')
 *   // les spans arrivent automatiquement dans traceBus.on('framework:span', ...)
 */
export interface TraceBusClientOptions {
    /** Délai entre tentatives de reconnexion en ms — défaut: 2000 */
    reconnectMs?: number;
    /** Nombre max de tentatives — défaut: 10 */
    maxRetries?: number;
    /** Verbose — défaut: false */
    verbose?: boolean;
}
export type ClientStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
export declare class TraceBusClient {
    private readonly traceBus;
    private readonly commandBus;
    private ws;
    private retries;
    private _status;
    private _url;
    private reconnectTimer;
    readonly reconnectMs: number;
    readonly maxRetries: number;
    constructor(traceBus: any, commandBus: any, opts?: TraceBusClientOptions);
    connect(url: string): Promise<void>;
    private _tryConnect;
    private _handleRetry;
    private _dispatch;
    send(command: string, params?: Record<string, any>): void;
    disconnect(): void;
    get status(): ClientStatus;
    get isConnected(): boolean;
    get url(): string;
}
//# sourceMappingURL=TraceBusClient.d.ts.map