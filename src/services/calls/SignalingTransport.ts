import { SignalingMessage } from './types';
import { requestSignalingCredential } from './signalingCredentialClient';

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
  private signalingUrl = '';
  private readonly openTimeoutMs = 10_000;

  getSignalingUrl(): string {
    return this.signalingUrl;
  }

  async connect(userId: string): Promise<void> {
    if (!userId || !userId.trim()) throw new Error('Utilisateur signaling obligatoire.');
    const credential = await requestSignalingCredential(userId);
    const expiresAt = new Date(credential.expiresAt).getTime();
    if (!credential.credential || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('Credential signaling expiré ou invalide.');
    }

    this.disconnect();
    const url = new URL(credential.endpoint);
    if (url.protocol !== 'wss:') throw new Error('Le signaling doit utiliser WebSocket sécurisé (wss).');
    this.signalingUrl = url.toString();
    url.searchParams.set('token', credential.credential);
    this.userId = userId;

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
    this.userId = '';
    this.signalingUrl = '';
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
