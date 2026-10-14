import { createMockSignalingCredential } from './signalingCredentialClient';
import { createMockTurnIceServers } from './iceCredentialClient';
import { getRTCConfiguration } from './types';

export interface CallBoundaryTestResult {
  name: string;
  success: boolean;
  detail: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function runCallBoundaryTests(): CallBoundaryTestResult[] {
  const now = 1_800_000_000_000;
  const makeToken = (userId: string, exp: number) => `${encodeBase64Url(JSON.stringify({ userId, exp }))}.signature`;
  const results: CallBoundaryTestResult[] = [];
  const check = (name: string, test: () => void) => {
    try {
      test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  check('Mock signaling accepts the current actor and a short-lived WSS token', () => {
    const expires = Math.floor((now + 180_000) / 1000);
    const credential = createMockSignalingCredential(makeToken('mock-user-1', expires), 'wss://signal.example/ws', 'mock-user-1', now);
    assert(credential.endpoint === 'wss://signal.example/ws', 'WSS endpoint not retained');
    assert(new Date(credential.expiresAt).getTime() === expires * 1000, 'token expiry not preserved');
  });
  check('Mock signaling rejects a credential issued to a different actor', () => {
    assert(expectThrow(() => createMockSignalingCredential(makeToken('mock-user-2', Math.floor((now + 60_000) / 1000)), 'wss://signal.example/ws', 'mock-user-1', now)), 'actor mismatch should be rejected');
  });
  check('Mock signaling rejects expired and permanent credentials', () => {
    const expired = makeToken('mock-user-1', Math.floor((now - 1_000) / 1000));
    const longLived = makeToken('mock-user-1', Math.floor((now + 301_000) / 1000));
    assert(expectThrow(() => createMockSignalingCredential(expired, 'wss://signal.example/ws', 'mock-user-1', now)), 'expired token should be rejected');
    assert(expectThrow(() => createMockSignalingCredential(longLived, 'wss://signal.example/ws', 'mock-user-1', now)), 'long-lived token should be rejected');
  });
  check('Mock signaling rejects insecure or invalid endpoints', () => {
    const token = makeToken('mock-user-1', Math.floor((now + 60_000) / 1000));
    assert(expectThrow(() => createMockSignalingCredential(token, 'ws://signal.example/ws', 'mock-user-1', now)), 'non-TLS websocket should be rejected');
    assert(expectThrow(() => createMockSignalingCredential(token, 'not-an-url', 'mock-user-1', now)), 'invalid endpoint should be rejected');
  });
  check('Mock WebRTC accepts temporary TURN credentials', () => {
    const servers = createMockTurnIceServers({
      server: 'turns:turn.example:5349',
      username: 'temporary-user',
      credential: 'temporary-credential',
      expiresAt: new Date(now + 120_000).toISOString(),
    }, now);
    const [server] = servers;
    assert(server?.username === 'temporary-user', 'temporary TURN settings were not applied');
  });
  check('Mock WebRTC rejects long-lived TURN credentials but keeps public STUN fallback', () => {
    assert(expectThrow(() => createMockTurnIceServers({
      server: 'turn:turn.example:3478',
      username: 'user',
      credential: 'permanent',
      expiresAt: new Date(now + 301_000).toISOString(),
    }, now)), 'long-lived TURN credential should be rejected');
    assert(createMockTurnIceServers({}, now).length === 0, 'mock fallback should not require TURN credentials');
    assert((getRTCConfiguration([]).iceServers?.length ?? 0) >= 1, 'public STUN fallback is missing');
  });

  return results;
}
