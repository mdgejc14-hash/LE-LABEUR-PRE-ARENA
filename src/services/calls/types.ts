import type { CallStatus, CallDirection, UserRole } from '../../types';

/** TURN credentials must be short-lived API responses, never VITE_* secrets. */
export const getRTCConfiguration = (dynamicIceServers: readonly RTCIceServer[] = []): RTCConfiguration => {
  const envStun = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_STUN_SERVER : null;
  const iceServers: RTCIceServer[] = [
    { urls: envStun || 'stun:stun.l.google.com:19302' },
    ...dynamicIceServers,
  ];
  return {
    iceServers,
    iceCandidatePoolSize: 2,
  };
};

export type SignalingEventType =
  | 'CALL_OFFER'
  | 'CALL_ANSWER'
  | 'ICE_CANDIDATE'
  | 'CALL_ACCEPT'
  | 'CALL_REJECT'
  | 'CALL_END'
  | 'CALL_BUSY';

export interface SignalingMessage {
  type: SignalingEventType;
  callId: string;
  senderId: string;
  receiverId: string;
  senderName?: string;
  senderRole?: UserRole;
  payload?: any;
  timestamp: string;
}

export interface CallPeerInfo {
  id: string;
  fullName: string;
  name?: string;
  role: UserRole;
  avatarUrl?: string;
  headline?: string;
}
