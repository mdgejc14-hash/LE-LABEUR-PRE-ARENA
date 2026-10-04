import { CallStatus, CallDirection, UserRole } from '../../types';

export const getRTCConfiguration = (): RTCConfiguration => {
  const iceServers: RTCIceServer[] = [];
  const envStun = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_STUN_SERVER : null;
  if (envStun) {
    iceServers.push({ urls: envStun });
  } else {
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' });
  }

  const envTurn = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_TURN_SERVER : null;
  const envTurnUser = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_TURN_USERNAME : '';
  const envTurnCred = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_TURN_CREDENTIAL : '';

  if (envTurn) {
    iceServers.push({
      urls: envTurn,
      username: envTurnUser,
      credential: envTurnCred,
    });
  }

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
