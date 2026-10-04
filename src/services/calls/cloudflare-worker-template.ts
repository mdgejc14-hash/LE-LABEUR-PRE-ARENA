/**
 * Cloudflare Worker + Durable Object WebSocket Signaling Template
 * Authentifie chaque socket par jeton signé. Le userId n'est jamais accepté
 * depuis la query string comme identité de confiance.
 */

type DurableObjectNamespace = any;
type DurableObjectState = any;
declare const WebSocketPair: any;
declare const WebSocket: any;

type SessionPayload = { userId: string; exp: number };

export interface Env {
  SIGNALING_DO: DurableObjectNamespace;
  SIGNALING_AUTH_SECRET: string;
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function verifySignedSession(token: string, secret: string): Promise<SessionPayload> {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) throw new Error('Token invalide.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signaturePart) as unknown as BufferSource, new TextEncoder().encode(payloadPart));
  if (!valid) throw new Error('Signature de session invalide.');
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as SessionPayload;
  if (!payload.userId || !payload.exp || payload.exp * 1000 <= Date.now()) throw new Error('Session expirée.');
  return payload;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') return new Response('Expected Upgrade: websocket', { status: 426 });
      if (!env.SIGNALING_AUTH_SECRET) return new Response('Signaling auth secret not configured.', { status: 503 });

      const token = url.searchParams.get('token');
      if (!token) return new Response('Unauthorized', { status: 401 });
      let session: SessionPayload;
      try {
        session = await verifySignedSession(token, env.SIGNALING_AUTH_SECRET);
      } catch {
        return new Response('Unauthorized', { status: 401 });
      }

      const roomId = url.searchParams.get('roomId') || 'global-signaling-hub';
      const id = env.SIGNALING_DO.idFromName(roomId);
      const stub = env.SIGNALING_DO.get(id);
      const headers = new Headers(request.headers);
      headers.set('X-Authenticated-User', session.userId);
      return stub.fetch(new Request(request, { headers }));
    }
    return new Response('LE LABEUR Signaling Worker is active.', { status: 200 });
  },
};

export class SignalingDurableObject {
  private state: DurableObjectState;
  private sessions: Map<WebSocket, { userId: string }> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const authenticatedUser = request.headers.get('X-Authenticated-User');
    if (!authenticatedUser) return new Response('Unauthorized', { status: 401 });

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair) as [any, any];
    server.accept();
    this.sessions.set(server, { userId: authenticatedUser });

    server.addEventListener('message', (event: any) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.senderId !== authenticatedUser) return;
        const targetUserId = data.receiverId;
        for (const [ws, info] of this.sessions.entries()) {
          if (info.userId === targetUserId && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ...data, senderId: authenticatedUser }));
          }
        }
      } catch (err) {
        console.error('Signaling error:', err);
      }
    });

    server.addEventListener('close', () => this.sessions.delete(server));
    return new Response(null, { status: 101, webSocket: client } as any);
  }
}

// Helper for tests/tools that need to produce the exact token format expected by the worker.
export async function createSignedSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded)));
  return `${encoded}.${bytesToBase64Url(signature)}`;
}
