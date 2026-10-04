import { SignalingMessage } from './types';

export interface SignalingTransport {
  connect(userId: string): Promise<void>;
  disconnect(): void;
  send(message: SignalingMessage): void;
  onMessage(handler: (message: SignalingMessage) => void): () => void;
  isConnected(): boolean;
  getSignalingUrl(): string;
}

export class CloudflareWebSocketSignalingTransport implements SignalingTransport {
  private socket: WebSocket | null = null;
  private handlers: Set<(message: SignalingMessage) => void> = new Set();
  private userId = '';
  private readonly openTimeoutMs = 10_000;

  getSignalingUrl(): string {
    const envUrl = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SIGNALING_URL : null;
    return envUrl || '';
  }

  private getAuthToken(): string {
    const token = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SIGNALING_TOKEN : '';
    return token || '';
  }

  async connect(userId: string): Promise<void> {
    this.userId = userId;
    const baseUrl = this.getSignalingUrl();
    if (!baseUrl) throw new Error('Endpoint signaling non configuré.');
    const token = this.getAuthToken();
    if (!token) throw new Error('Token de signaling indisponible.');

    this.disconnect();
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url.toString());
      this.socket = socket;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { socket.close(); } catch { /* noop */ }
        this.socket = null;
        reject(new Error('Connexion signaling expirée après 10 secondes.'));
      }, this.openTimeoutMs);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      socket.onmessage = (event) => {
        try {
          const parsed: SignalingMessage = JSON.parse(event.data);
          this.handlers.forEach(h => h(parsed));
        } catch { /* ignore malformed signaling frames */ }
      };
      socket.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.socket = null;
        reject(new Error('Connexion signaling impossible.'));
      };
      socket.onclose = () => {
        this.socket = null;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Connexion signaling fermée avant ouverture.'));
        }
      };
    });
  }

  disconnect(): void {
    if (this.socket) {
      try { this.socket.close(); } catch { /* noop */ }
      this.socket = null;
    }
  }

  send(message: SignalingMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling non connecté.');
    }
    if (message.senderId !== this.userId) {
      throw new Error('Identité signaling incohérente avec la session locale.');
    }
    this.socket.send(JSON.stringify(message));
  }

  onMessage(handler: (message: SignalingMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}
