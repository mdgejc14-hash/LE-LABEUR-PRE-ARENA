import { CallRecord, CallStatus, UserProfile, UserRole } from '../../types';
import { CloudflareWebSocketSignalingTransport, SignalingTransport } from './SignalingTransport';
import { WebRTCCallService } from './WebRTCCallService';
import { CallPeerInfo, SignalingMessage } from './types';

export type CallEventListener = (call: CallRecord | null, remoteStream?: MediaStream | null) => void;

export class CallService {
  private static instance: CallService;
  private signaling: SignalingTransport;
  private webrtc: WebRTCCallService;
  private activeCall: CallRecord | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Set<CallEventListener> = new Set();
  private callStartTimestamp: number = 0;
  private durationInterval: any = null;
  private signalingUserId = '';
  private signalingUserRole: UserRole = 'CANDIDATE';
  private pendingOffer: {
    callId: string;
    offerSdp: RTCSessionDescriptionInit;
    callerId: string;
    receiverId: string;
    metadata?: any;
  } | null = null;

  private constructor() {
    this.signaling = new CloudflareWebSocketSignalingTransport();
    this.webrtc = new WebRTCCallService(this.signaling);
    this.webrtc.setCallbacks({
      onStateChange: (status: CallStatus) => {
        this.updateCallStatus(status);
      },
      onRemoteStream: (stream: MediaStream) => {
        this.remoteStream = stream;
        this.notifyListeners();
      },
      onError: (err: string) => {
        console.warn('[LE LABEUR Call Error]:', err);
        this.updateCallStatus('FAILED');
      }
    });

    this.signaling.onMessage((msg: SignalingMessage) => {
      // Un frame entrant est accepté uniquement pour la session locale.
      // Le receiverId fourni par le réseau ne doit jamais être interprété comme
      // une autorisation permettant de réveiller un autre utilisateur.
      if (!this.signalingUserId || msg.receiverId !== this.signalingUserId || msg.senderId === this.signalingUserId) {
        return;
      }

      if (msg.type === 'CALL_OFFER' && (!this.activeCall || this.activeCall.status === 'ENDED')) {
        this.handleIncomingOffer(msg);
      } else if (msg.type === 'CALL_REJECT' && this.activeCall && this.activeCall.id === msg.callId) {
        this.updateCallStatus('REJECTED');
        this.webrtc.cleanup();
      } else if (msg.type === 'CALL_END' && this.activeCall && this.activeCall.id === msg.callId) {
        const finalStatus = this.activeCall.durationSeconds > 0 ? 'ENDED' : 'MISSED';
        this.updateCallStatus(finalStatus);
        this.webrtc.cleanup();
      }
    });
  }

  public static getInstance(): CallService {
    if (!CallService.instance) {
      CallService.instance = new CallService();
    }
    return CallService.instance;
  }

  async connectSignaling(userId: string, userRole: UserRole = 'CANDIDATE'): Promise<void> {
    if (!userId || !userId.trim()) throw new Error('Utilisateur signaling obligatoire.');
    await this.signaling.connect(userId);
    this.signalingUserId = userId;
    this.signalingUserRole = userRole;
  }

  disconnectSignaling(): void {
    this.signaling.disconnect();
    this.signalingUserId = '';
    this.signalingUserRole = 'CANDIDATE';
    this.pendingOffer = null;
  }

  getSignalingTransport(): SignalingTransport {
    return this.signaling;
  }

  getActiveCall(): CallRecord | null {
    return this.activeCall;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  subscribe(listener: CallEventListener): () => void {
    this.listeners.add(listener);
    listener(this.activeCall, this.remoteStream);
    return () => {
      this.listeners.delete(listener);
    };
  }

  addCallEventListener(listener: CallEventListener): () => void {
    return this.subscribe(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(fn => fn(this.activeCall, this.remoteStream));
  }

  private updateCallStatus(status: CallStatus) {
    if (!this.activeCall) return;
    this.activeCall.status = status;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR');

    if (status === 'CONNECTED' && !this.activeCall.connectedAt) {
      this.activeCall.connectedAt = `${dateStr} ${timeStr}`;
      this.callStartTimestamp = Date.now();
      if (this.durationInterval) clearInterval(this.durationInterval);
      this.durationInterval = setInterval(() => {
        if (this.activeCall && this.activeCall.status === 'CONNECTED') {
          this.activeCall.durationSeconds = Math.floor((Date.now() - this.callStartTimestamp) / 1000);
          this.notifyListeners();
        }
      }, 1000);
    } else if (status === 'ENDED' || status === 'REJECTED' || status === 'MISSED' || status === 'FAILED') {
      if (this.durationInterval) {
        clearInterval(this.durationInterval);
        this.durationInterval = null;
      }
      this.activeCall.endedAt = `${dateStr} ${timeStr}`;
      if (this.callStartTimestamp > 0) {
        this.activeCall.durationSeconds = Math.floor((Date.now() - this.callStartTimestamp) / 1000);
      }
    }
    this.notifyListeners();
  }

  async startCall(
    currentUser: UserProfile,
    receiver: CallPeerInfo,
    conversationId?: string,
    callId?: string
  ): Promise<CallRecord> {
    const canonicalCallId = callId || `CALL-${Date.now()}`;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('fr-FR');

    const record: CallRecord = {
      id: canonicalCallId,
      conversationId,
      callerId: currentUser.id,
      callerName: currentUser.fullName,
      callerRole: currentUser.role,
      callerAvatar: currentUser.avatarUrl,
      callerHeadline: currentUser.headline,
      receiverId: receiver.id,
      receiverName: receiver.fullName,
      receiverRole: receiver.role,
      receiverAvatar: receiver.avatarUrl || '',
      receiverHeadline: receiver.headline || '',
      status: 'CALLING',
      direction: 'OUTGOING',
      startedAt: `${dateStr} ${timeStr}`,
      durationSeconds: 0,
      isMuted: false,
      isSpeakerOn: false,
      networkQuality: 'EXCELLENT',
      webrtcSessionId: `webrtc-${canonicalCallId}`
    };

    // A call UI must never be created when real signaling is unavailable.
    // The caller receives an actionable error instead of a fake CALLING/FAILED state.
    if (!this.signaling.isConnected()) {
      throw new Error("Impossible de démarrer l'appel pour le moment.");
    }

    this.activeCall = record;
    this.remoteStream = null;
    this.callStartTimestamp = 0;
    this.notifyListeners();

    try {
      await this.webrtc.startCallAsCaller(canonicalCallId, currentUser.id, receiver.id);
      this.updateCallStatus('CALLING');
    } catch (err: any) {
      console.warn('[WebRTC startCall failed]:', err);
      this.updateCallStatus('FAILED');
      throw err;
    }
    return record;
  }

  async acceptCall(callRecord?: CallRecord, offerSdp?: RTCSessionDescriptionInit): Promise<void> {
    const record = callRecord || this.activeCall;
    if (!record) return;

    this.activeCall = { ...record, status: 'ACCEPTING' };
    this.notifyListeners();

    try {
      const sdpToUse = offerSdp || (this.pendingOffer && this.pendingOffer.callId === record.id ? this.pendingOffer.offerSdp : undefined);
      if (sdpToUse) {
        await this.webrtc.answerCall(record.id, sdpToUse, record.callerId, record.receiverId);
        this.pendingOffer = null;
      } else {
        throw new Error('Offre WebRTC absente : impossible d’accepter l’appel.');
      }
    } catch (err: any) {
      console.warn('[WebRTC acceptCall failed]:', err);
      this.updateCallStatus('FAILED');
    }
  }

  async rejectCall(callId: string, callerId: string, receiverId: string): Promise<void> {
    if (!this.signalingUserId || this.signalingUserId !== receiverId) {
      throw new Error('Action non autorisée : la session signaling locale ne correspond pas au destinataire de l’appel.');
    }
    this.signaling.send({
      type: 'CALL_REJECT',
      callId,
      senderId: this.signalingUserId,
      receiverId: callerId,
      timestamp: new Date().toISOString(),
    });
    this.updateCallStatus('REJECTED');
    this.webrtc.cleanup();
  }

  async endCall(): Promise<void> {
    if (this.activeCall) {
      if (!this.signalingUserId) {
        this.updateCallStatus('FAILED');
        this.webrtc.cleanup();
        this.remoteStream = null;
        return;
      }
      const peerId = this.signalingUserId === this.activeCall.callerId
        ? this.activeCall.receiverId
        : this.signalingUserId === this.activeCall.receiverId
          ? this.activeCall.callerId
          : '';
      if (!peerId) {
        this.updateCallStatus('FAILED');
        this.webrtc.cleanup();
        this.remoteStream = null;
        throw new Error('Action non autorisée : la session signaling locale n’appartient pas à cet appel.');
      }
      this.signaling.send({
        type: 'CALL_END',
        callId: this.activeCall.id,
        senderId: this.signalingUserId,
        receiverId: peerId,
        timestamp: new Date().toISOString(),
      });
      const finalStatus = this.activeCall.durationSeconds > 0 ? 'ENDED' : 'MISSED';
      this.updateCallStatus(finalStatus);
    }
    this.webrtc.cleanup();
    this.remoteStream = null;
  }

  toggleMute(): void {
    if (this.activeCall) {
      this.activeCall.isMuted = !this.activeCall.isMuted;
      this.webrtc.toggleMute(this.activeCall.isMuted);
      this.notifyListeners();
    }
  }

  toggleSpeaker(): void {
    if (this.activeCall) {
      this.activeCall.isSpeakerOn = !this.activeCall.isSpeakerOn;
      this.notifyListeners();
    }
  }

  private handleIncomingOffer(msg: SignalingMessage) {
    this.pendingOffer = {
      callId: msg.callId,
      offerSdp: msg.payload,
      callerId: msg.senderId,
      receiverId: msg.receiverId,
      metadata: msg
    };

    const callRecord: CallRecord = {
      id: msg.callId,
      callerId: msg.senderId,
      callerName: msg.senderName || 'Correspondant LE LABEUR',
      callerRole: msg.senderRole || 'CANDIDATE',
      callerAvatar: '',
      callerHeadline: 'Appel audio entrant',
      receiverId: msg.receiverId,
      receiverName: '',
      receiverRole: this.signalingUserRole,
      receiverAvatar: '',
      receiverHeadline: '',
      status: 'RINGING',
      direction: 'INCOMING',
      startedAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      durationSeconds: 0,
      isMuted: false,
      isSpeakerOn: false,
      networkQuality: 'EXCELLENT',
      webrtcSessionId: `webrtc-${msg.callId}`
    };

    this.activeCall = callRecord;
    this.notifyListeners();
  }
}

export const callService = CallService.getInstance();
