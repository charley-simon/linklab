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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TraceBusClientOptions {
  /** Délai entre tentatives de reconnexion en ms — défaut: 2000 */
  reconnectMs?:   number
  /** Nombre max de tentatives — défaut: 10 */
  maxRetries?:    number
  /** Verbose — défaut: false */
  verbose?:       boolean
}

export type ClientStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

// ── TraceBusClient ────────────────────────────────────────────────────────────

export class TraceBusClient {
  private ws:        any    = null
  private retries    = 0
  private _status:   ClientStatus = 'disconnected'
  private _url:      string = ''
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  readonly reconnectMs: number
  readonly maxRetries:  number

  constructor(
    private readonly traceBus:   any,
    private readonly commandBus: any,
    opts: TraceBusClientOptions = {}
  ) {
    this.reconnectMs = opts.reconnectMs ?? 2000
    this.maxRetries  = opts.maxRetries  ?? 10
  }

  // ── Connexion ─────────────────────────────────────────────────────────────

  async connect(url: string): Promise<void> {
    this._url    = url
    this._status = 'connecting'

    return new Promise((resolve, reject) => {
      this._tryConnect(resolve, reject)
    })
  }

  private async _tryConnect(
    onConnected: () => void,
    onFailed:    (e: Error) => void
  ): Promise<void> {
    let WS: any
    try {
      const ws = await import('ws')
      WS = ws.WebSocket ?? ws.default
    } catch {
      onFailed(new Error('Package "ws" requis : pnpm add ws -w'))
      return
    }

    try {
      this.ws = new WS(this._url)
    } catch (e) {
      this._handleRetry(onConnected, onFailed)
      return
    }

    this.ws.on('open', () => {
      this._status  = 'connected'
      this.retries  = 0
      onConnected()
    })

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        this._dispatch(msg)
      } catch { /* message invalide */ }
    })

    this.ws.on('close', () => {
      if (this._status === 'connected') {
        this._status = 'reconnecting'
        this._handleRetry(onConnected, onFailed)
      }
    })

    this.ws.on('error', () => {
      if (this._status === 'connecting' || this._status === 'reconnecting') {
        this._handleRetry(onConnected, onFailed)
      }
    })
  }

  private _handleRetry(
    onConnected: () => void,
    onFailed:    (e: Error) => void
  ): void {
    if (this.retries >= this.maxRetries) {
      this._status = 'failed'
      onFailed(new Error(`TraceBusClient: impossible de se connecter après ${this.maxRetries} tentatives`))
      return
    }

    this.retries++
    this._status = 'reconnecting'
    this.reconnectTimer = setTimeout(() => {
      this._tryConnect(onConnected, onFailed)
    }, this.reconnectMs)
  }

  // ── Dispatch des messages reçus ───────────────────────────────────────────

  private _dispatch(msg: { type: string; payload: any }): void {
    switch (msg.type) {
      // Spans framework — injecter dans le traceBus local
      case 'framework:span':
      case 'span:end':
      case 'span:error':
      case 'metrics:update':
      case 'calibration:done':
      case 'yoyo:detected':
        try {
          this.traceBus.emit(msg.type, msg.payload)
        } catch {}
        break

      // Réponse à une commande
      case 'command:reply':
        try {
          this.commandBus.reply(
            msg.payload.command,
            { success: msg.payload.success, payload: msg.payload.payload }
          )
        } catch {}
        break

      case 'connected':
        // Message de bienvenue — rien à faire
        break
    }
  }

  // ── Envoi de commandes vers studio ────────────────────────────────────────

  send(command: string, params: Record<string, any> = {}): void {
    if (!this.ws || this._status !== 'connected') return
    try {
      this.ws.send(JSON.stringify({
        type:    'command',
        payload: { command, params }
      }))
    } catch {}
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this._status = 'disconnected'
    try { this.ws?.close() } catch {}
    this.ws = null
  }

  get status(): ClientStatus { return this._status }
  get isConnected(): boolean { return this._status === 'connected' }
  get url(): string          { return this._url }
}
