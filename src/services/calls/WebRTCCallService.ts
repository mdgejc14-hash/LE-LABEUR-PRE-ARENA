import { CallStatus } from '../../types';
import { getRTCConfiguration, SignalingMessage } from './types';
import { SignalingTransport } from './SignalingTransport';

export interface WebRTCStateCallback {
  onStateChange: (status: CallStatus) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onError: (error: string) => void;
}

export class WebRTCCallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private signalingTransport: SignalingTransport;
  private unsubscribeSignaling: (() => void) | null = null;
  private callbacks: WebRTCStateCallback | null = null;
  private currentCallId: string | null = null;
  private callerId: string = '';
  private receiverId: string = '';
  private localUserId: string = '';

  constructor(signalingTransport: SignalingTransport) {
    this.signalingTransport = signalingTransport;
  }

  setCallbacks(callbacks: WebRTCStateCallback) {
    this.callbacks = callbacks;
  }

  async acquireMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Votre navigateur ne supporte pas l'accès audio microphone.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error("L'autorisation d'accès au microphone a été refusée.");
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error("Aucun microphone n'a été détecté sur cet appareil.");
      }
      throw new Error(`Erreur d'accès au microphone : ${err.message || err.name}`);
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    const config = getRTCConfiguration();
    const pc = new RTCPeerConnection(config);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        this.signalingTransport.send({
          type: 'ICE_CANDIDATE',
          callId: this.currentCallId,
          senderId: this.callerId,
          receiverId: this.receiverId,
          payload: event.candidate.toJSON(),
          timestamp: new Date().toISOString(),
        });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        if (this.callbacks?.onRemoteStream) {
          this.callbacks.onRemoteStream(remoteStream);
        }
        this.playRemoteAudio(remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connecting':
          this.callbacks?.onStateChange('CONNECTING');
          break;
        case 'connected':
          this.callbacks?.onStateChange('CONNECTED');
          break;
        case 'disconnected':
        case 'closed':
          this.callbacks?.onStateChange('ENDED');
          break;
        case 'failed':
          this.callbacks?.onStateChange('FAILED');
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.callbacks?.onStateChange('CONNECTED');
      } else if (pc.iceConnectionState === 'failed') {
        this.callbacks?.onStateChange('FAILED');
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private playRemoteAudio(stream: MediaStream) {
    if (!this.remoteAudioElement) {
      this.remoteAudioElement = new Audio();
      this.remoteAudioElement.autoplay = true;
    }
    this.remoteAudioElement.srcObject = stream;
    this.remoteAudioElement.play().catch(() => {});
  }

  async startCallAsCaller(callId: string, callerId: string, receiverId: string): Promise<void> {
    this.currentCallId = callId;
    this.callerId = callerId;
    this.receiverId = receiverId;
    this.localUserId = callerId;

    await this.acquireMicrophone();
    const pc = this.createPeerConnection();
    this.setupSignalingListener();

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    this.signalingTransport.send({
      type: 'CALL_OFFER',
      callId,
      senderId: callerId,
      receiverId,
      payload: offer,
      timestamp: new Date().toISOString(),
    });
    this.callbacks?.onStateChange('CALLING');
  }

  async answerCall(callId: string, offerSdp: RTCSessionDescriptionInit, callerId: string, receiverId: string): Promise<void> {
    this.currentCallId = callId;
    this.callerId = callerId;
    this.receiverId = receiverId;
    this.localUserId = receiverId;
    this.callbacks?.onStateChange('ACCEPTING');

    await this.acquireMicrophone();
    const pc = this.createPeerConnection();
    this.setupSignalingListener();

    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.signalingTransport.send({
      type: 'CALL_ANSWER',
      callId,
      senderId: receiverId,
      receiverId: callerId,
      payload: answer,
      timestamp: new Date().toISOString(),
    });
    this.callbacks?.onStateChange('CONNECTING');
  }

  private setupSignalingListener() {
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
    }
    this.unsubscribeSignaling = this.signalingTransport.onMessage(async (msg: SignalingMessage) => {
      if (msg.callId !== this.currentCallId) return;
      const peerId = this.localUserId === this.callerId ? this.receiverId : this.callerId;
      if (!this.localUserId || msg.receiverId !== this.localUserId || msg.senderId !== peerId) return;
      try {
        if (msg.type === 'CALL_ANSWER' && this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload));
        } else if (msg.type === 'ICE_CANDIDATE' && this.peerConnection) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.payload));
        } else if (msg.type === 'CALL_REJECT') {
          this.callbacks?.onStateChange('REJECTED');
          this.cleanup();
        } else if (msg.type === 'CALL_END') {
          this.callbacks?.onStateChange('ENDED');
          this.cleanup();
        }
      } catch (err: any) {
        console.warn('[LE LABEUR WebRTC Signaling error]', err);
      }
    });
  }

  toggleMute(isMuted: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
  }

  cleanup(): void {
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement = null;
    }
    this.currentCallId = null;
    this.localUserId = '';
  }
}
