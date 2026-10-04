import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Send,
  Mic,
  Square,
  Play,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Check,
  CheckCheck,
  CheckCircle2,
  Edit3,
  Plus,
  Trash2,
  FileSignature,
  ShieldCheck,
  RotateCcw,
  FileText,
  MapPin,
  Calendar,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ChatMessage, Contract, MissionProposal } from '../types';
import { EditorialButton } from '../components/common/EditorialButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { EditorialSheet } from '../components/common/EditorialSheet';
import { ContractGenerationModal } from '../components/contracts/ContractGenerationModal';

export const ChatDetailScreen: React.FC = () => {
  const {
    selectedConversation,
    navigateBack,
    backToFeed,
    currentUser,
    currentRole,
    sendMessage,
    sendVoiceNote,
    startAudioCall,
    respondToProposal,
    signContract,
    getMessagesForConversation,
    contracts,
    setScreen
  } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');

  // 4-Step Voice Recording Workflow
  const [recordingState, setRecordingState] = useState<'IDLE' | 'RECORDING' | 'PREVIEW'>('IDLE');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimer = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // In-Chat Audio Playback state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Contract Generation Modal for Employer
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);

  // Revision Modal
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');

  // Contract View / Sign Modal from chat
  const [viewContractModal, setViewContractModal] = useState<Contract | null>(null);
  const [signingContractModal, setSigningContractModal] = useState<Contract | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    if (!selectedConversation) return;
    const msgs = await getMessagesForConversation(selectedConversation.id);
    setMessages(msgs);
  };

  useEffect(() => {
    loadMessages();
  }, [selectedConversation]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, recordingState]);

  // Audio Recording with MediaRecorder
  const handleStartRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("L'enregistrement audio n'est pas supporté par votre navigateur.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setRecordingState('RECORDING');
      setRecordingSeconds(0);
      setPreviewPlaying(false);
      recordingTimer.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 59) {
            handleStopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.warn('Microphone access denied or error', err);
      setRecordingState('RECORDING');
      setRecordingSeconds(0);
      recordingTimer.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 59) {
            clearInterval(recordingTimer.current);
            setRecordingState('PREVIEW');
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  const handleStopRecording = () => {
    clearInterval(recordingTimer.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('PREVIEW');
    setPreviewPlaying(false);
  };

  const handleCancelVoice = () => {
    clearInterval(recordingTimer.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordingState('IDLE');
    setRecordingSeconds(0);
    setRecordedAudioUrl(null);
    setPreviewPlaying(false);
  };

  const handleSendVoiceNote = async () => {
    if (!selectedConversation) return;
    const duration = Math.min(60, Math.max(1, recordingSeconds));
    const audioUrl = recordedAudioUrl;
    setRecordingState('IDLE');
    setRecordingSeconds(0);
    setRecordedAudioUrl(null);
    setPreviewPlaying(false);
    await sendVoiceNote(selectedConversation.id, duration, audioUrl || undefined);
    await loadMessages();
  };

  const handleTogglePlayMessage = (msg: ChatMessage) => {
    if (playingAudioId === msg.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingAudioId(null);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (msg.audioDataUrl) {
        const audio = new Audio(msg.audioDataUrl);
        audioPlayerRef.current = audio;
        audio.onended = () => setPlayingAudioId(null);
        audio.play().catch(() => {});
      }
      setPlayingAudioId(msg.id);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConversation) return;
    const text = inputText;
    setInputText('');
    await sendMessage(selectedConversation.id, text);
    await loadMessages();
  };

  const handleStartInAppCall = async () => {
    if (!selectedConversation) return;
    try {
      await startAudioCall({
        id: selectedConversation.otherParticipant.id,
        fullName: selectedConversation.otherParticipant.name,
        role: selectedConversation.otherParticipant.role,
        avatarUrl: selectedConversation.otherParticipant.avatarUrl,
        headline: selectedConversation.contextTitle
      }, selectedConversation.id);
      await loadMessages();
    } catch (err: any) {
      console.error('Call error', err);
    }
  };

  // Traitement de proposition
  const handleOpenContractView = (contractId?: string) => {
    if (contractId) {
      const found = contracts.find(c => c.id === contractId);
      if (found) {
        setViewContractModal(found);
        return;
      }
    }
    setScreen('CONTRACTS');
  };

  const handleOpenSignModal = (contractId?: string) => {
    if (contractId) {
      const found = contracts.find(c => c.id === contractId);
      if (found) {
        setSigningContractModal(found);
        return;
      }
    }
    setScreen('CONTRACTS');
  };

  const handleConfirmSignFromChat = async () => {
    if (!signingContractModal) return;
    setSigningLoading(true);
    try {
      await signContract(signingContractModal.id, 'EMPLOYEE');
      setSigningContractModal(null);
      await loadMessages();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la signature');
    } finally {
      setSigningLoading(false);
    }
  };

  const handleProposalAction = async (proposalId: string, action: 'ACCEPT' | 'REVISE' | 'DECLINE') => {
    if (action === 'REVISE') {
      setSelectedProposalId(proposalId);
      setRevisionModalOpen(true);
      return;
    }
    await respondToProposal(proposalId, action);
    await loadMessages();
  };

  const handleConfirmRevision = async () => {
    if (!selectedProposalId) return;
    await respondToProposal(selectedProposalId, 'REVISE', revisionNotes);
    setRevisionModalOpen(false);
    setRevisionNotes('');
    await loadMessages();
  };

  if (!selectedConversation) {
    return (
      <div className="p-8 text-center bg-[#F3F3EC]">
        <p className="font-editorial text-lg text-[#17233B]">Aucune discussion sélectionnée</p>
        <EditorialButton onClick={backToFeed} className="mt-4">
          Retour
        </EditorialButton>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F3F3EC] select-none h-full relative font-operational text-xs overflow-hidden">
      {/* Top Bar with In-App Audio Call and Return */}
      <div className="sticky top-0 z-30 bg-[#F3F3EC] border-b border-[#17233B]/10 px-4 h-15 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={navigateBack || backToFeed}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#17233B]/70 hover:text-[#17233B] tap-feedback cursor-pointer"
            aria-label="Retour"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <img
            src={selectedConversation.otherParticipant.avatarUrl}
            alt={selectedConversation.otherParticipant.name}
            className="w-9 h-9 rounded-[4px] object-cover grayscale-[15%] border border-[#17233B]/10 shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <h2 className="font-editorial text-sm font-bold text-[#17233B] leading-tight truncate">
              {selectedConversation.otherParticipant.name}
            </h2>
            <p className="text-[10px] font-operational text-[#17233B]/60 truncate font-medium">
              {selectedConversation.otherParticipant.publicId && (
                <span className="font-mono mr-1.5 text-[#340C24]">{selectedConversation.otherParticipant.publicId} ·</span>
              )}
              {selectedConversation.contextTitle}
            </p>
          </div>
        </div>

        {/* Right Slot: Appel Audio In-App Direct */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStartInAppCall}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#17233B] rounded-full hover:bg-[#17233B]/90 tap-feedback shadow-xs cursor-pointer"
            title="Démarrer un appel audio direct LE LABEUR"
          >
            <Phone className="w-3.5 h-3.5 text-[#B5CEDB]" />
            <span className="text-[11px]">Appeler</span>
          </button>
        </div>
      </div>

      {/* Employer Action Bar: Préparer un contrat (RÈGLE 12) */}
      {currentRole === 'EMPLOYER' && (
        <div className="px-4 py-2 bg-[#FFFFFF] border-b border-[#17233B]/10 flex items-center justify-between shadow-2xs shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-[#17233B]/70">
            <FileSignature className="w-4 h-4 text-[#340C24]" />
            <span>Accord et contrat de travail</span>
          </div>
          <button
            type="button"
            onClick={() => setIsContractModalOpen(true)}
            className="px-3 py-1 text-[11px] font-bold text-white bg-[#340C24] hover:bg-[#340C24]/90 rounded transition-colors tap-feedback flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3 h-3 text-[#F8BBCB]" />
            <span>Préparer un Contrat</span>
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 font-operational text-xs no-scrollbar">
        <div className="p-3 bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/10 text-center text-[11px] text-[#17233B]/70 leading-relaxed shadow-xs">
          <div className="flex items-center justify-center gap-1 text-[#17233B] font-bold mb-0.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1BA64B]" />
            <span>Échanges confidentiels LE LABEUR</span>
          </div>
          <p>Discussions, vocaux et contrats sont conservés en toute clarté.</p>
        </div>

        {messages.map(msg => {
          const isMine = msg.senderId === currentUser?.id;

          // 1. Audio Call Log Event
          if (msg.isCallEvent && msg.callRecord) {
            const call = msg.callRecord;
            const isMissed = call.status === 'MISSED' || call.status === 'REJECTED';
            return (
              <div key={msg.id} className="w-full my-2 flex justify-center">
                <div className={`px-3.5 py-2.5 rounded-lg border max-w-sm w-full flex items-center justify-between text-xs ${
                  isMissed
                    ? 'bg-[#E23D3D]/5 border-[#E23D3D]/25 text-[#17233B]'
                    : 'bg-white border-[#17233B]/10 text-[#17233B]'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isMissed ? 'bg-[#E23D3D]/10 text-[#E23D3D]' : 'bg-[#1BA64B]/10 text-[#1BA64B]'
                    }`}>
                      {isMissed ? (
                        <PhoneMissed className="w-4 h-4" />
                      ) : call.direction === 'OUTGOING' ? (
                        <PhoneOutgoing className="w-4 h-4" />
                      ) : (
                        <PhoneIncoming className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-[#17233B]">
                        {isMissed
                          ? 'Appel audio manqué'
                          : `Appel audio (${call.durationSeconds > 0 ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : 'Connecté'})`}
                      </div>
                      <span className="text-[10px] text-[#17233B]/50 font-mono">
                        {msg.sentAt}
                      </span>
                    </div>
                  </div>
                  {isMissed && (
                    <button
                      onClick={handleStartInAppCall}
                      className="px-2.5 py-1 rounded bg-[#17233B] text-white text-[11px] font-medium hover:bg-[#17233B]/90 tap-feedback flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-[#B5CEDB]" />
                      <span>Rappeler</span>
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // 2. Proposal Document Card / Contrat de Travail (RÈGLES 18 & 19)
          if (msg.proposal) {
            const prop = msg.proposal;
            const linkedContract = contracts.find(c => c.id === prop.contractId);
            const isContractActive = linkedContract?.status === 'ACTIVE';
            const isPendingEmployeeSign = linkedContract?.status === 'SIGNATURE' && !linkedContract.employeeSigned;
            const canCandidateSign = currentRole === 'CANDIDATE' && isPendingEmployeeSign;

            return (
              <div key={msg.id} className="w-full my-3">
                <div className="bg-[#FFFFFF] border border-[#340C24]/20 rounded-[4px] p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-[#17233B]/10 pb-2">
                    <div>
                      <span className="text-[10px] font-operational uppercase tracking-widest text-[#340C24] font-bold block">
                        CONTRAT DE TRAVAIL OFFICIEL
                      </span>
                      <span className="text-[10px] font-mono text-[#17233B]/50">
                        Réf. {prop.contractId || prop.id}
                      </span>
                    </div>
                    <StatusBadge status={linkedContract?.status || prop.status} />
                  </div>

                  <div>
                    <h3 className="font-editorial text-lg font-bold text-[#17233B] leading-snug">
                      {prop.missionTitle}
                    </h3>
                    <p className="text-[11px] text-[#17233B]/60 mt-0.5">
                      Employeur : <strong>{prop.employerName}</strong> · Salarié : <strong>{prop.employeeName}</strong>
                    </p>
                  </div>

                  <div className="p-3 bg-[#F3F3EC] rounded-[4px] grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#17233B]/50">Salaire convenu</span>
                      <p className="font-mono text-sm font-bold text-[#17233B]">
                        {prop.amount.toLocaleString()} {prop.currency}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#17233B]/50">Durée</span>
                      <p className="font-semibold text-[#17233B]">
                        {prop.durationMonths} mois ({prop.periodicity})
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#17233B]/50">Date de début</span>
                      <p className="text-[#17233B]">{prop.startDate}</p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#17233B]/50">Lieu</span>
                      <p className="text-[#17233B] truncate">{prop.location}</p>
                    </div>
                  </div>

                  {/* Conditions List */}
                  {prop.conditions && prop.conditions.length > 0 && (
                    <div className="space-y-1 text-xs text-[#17233B]/80 pt-0.5">
                      <p className="font-semibold text-[11px] text-[#17233B]">Conditions convenues :</p>
                      {prop.conditions.map((cond, cIdx) => (
                        <div key={cIdx} className="flex items-start gap-1.5 text-[11px]">
                          <span className="text-[#17233B]/40 font-mono">·</span>
                          <span>{cond}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Règle Déontologique LE LABEUR */}
                  <div className="p-2.5 bg-[#FFFFFF] border border-[#17233B]/10 rounded-[3px] text-[11px] text-[#17233B]/80 space-y-1">
                    <div>
                      <span className="font-semibold text-[#17233B]">Règle déontologique LE LABEUR :</span> L'employeur s'acquitte de la commission de 25%. Le salarié ne paie aucun frais.
                    </div>
                  </div>

                  {prop.revisionNotes && (
                    <div className="p-2 bg-[#FFA800]/10 border border-[#FFA800]/25 rounded text-[11px] text-[#17233B]">
                      <strong>Demande d'ajustement :</strong> {prop.revisionNotes}
                    </div>
                  )}

                  {/* RÈGLE 18 : Actions du contrat dans la conversation */}
                  <div className="pt-2 border-t border-[#17233B]/10 flex flex-wrap items-center gap-2">
                    <EditorialButton
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenContractView(prop.contractId)}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1" />
                      <span>Voir le contrat</span>
                    </EditorialButton>

                    {canCandidateSign && (
                      <>
                        <EditorialButton
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenSignModal(prop.contractId)}
                        >
                          <FileSignature className="w-3.5 h-3.5 mr-1" />
                          <span>Accepter et signer</span>
                        </EditorialButton>
                        <button
                          type="button"
                          onClick={() => handleProposalAction(prop.id, 'REVISE')}
                          className="px-2.5 py-1 text-xs text-[#17233B] border border-[#17233B]/20 rounded hover:bg-[#17233B]/5 cursor-pointer"
                        >
                          Demander une modification
                        </button>
                        <button
                          type="button"
                          onClick={() => handleProposalAction(prop.id, 'DECLINE')}
                          className="px-2.5 py-1 text-xs text-[#E23D3D] hover:bg-[#E23D3D]/5 rounded cursor-pointer"
                        >
                          Refuser
                        </button>
                      </>
                    )}

                    {isContractActive && (
                      <div className="p-1.5 bg-[#1BA64B]/10 text-[#1BA64B] rounded text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Contrat actif & validé bilatéralement</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // 3. Voice Message
          if (msg.isVoice || msg.audioDurationSeconds) {
            const isPlaying = playingAudioId === msg.id;
            const duration = msg.audioDurationSeconds || 30;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-2.5 rounded-[6px] border max-w-[85%] flex items-center gap-3 ${
                    isMine
                      ? 'bg-[#17233B] text-[#F3F3EC] border-[#17233B]'
                      : 'bg-[#FFFFFF] text-[#17233B] border-[#17233B]/10'
                  }`}
                >
                  <button
                    onClick={() => handleTogglePlayMessage(msg)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center tap-feedback transition-transform active:scale-95 cursor-pointer ${
                      isMine ? 'bg-[#FFFFFF] text-[#17233B]' : 'bg-[#17233B] text-[#F3F3EC]'
                    }`}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <div className="flex-1 min-w-[130px]">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold">Message Vocal</span>
                      <span className="font-mono text-[10px]">{duration}s</span>
                    </div>
                    <div className="flex items-center gap-1 h-5">
                      {[14, 28, 20, 32, 24, 18, 28, 22, 26, 16, 30, 20, 25, 15].map((h, barIdx) => (
                        <div
                          key={barIdx}
                          style={{ height: `${h}px` }}
                          className={`w-1 rounded-full ${
                            isMine
                              ? isPlaying ? 'bg-[#B5CEDB]' : 'bg-white/40'
                              : isPlaying ? 'bg-[#17233B]' : 'bg-[#17233B]/25'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-[#17233B]/40 mt-0.5 px-1 font-mono">
                  <span>{msg.sentAt}</span>
                  {isMine && <CheckCheck className="w-3 h-3 text-[#1BA64B]" />}
                </div>
              </div>
            );
          }

          // 4. Standard Text Message
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`p-3 rounded-[6px] border max-w-[85%] leading-relaxed ${
                  isMine
                    ? 'bg-[#17233B] text-[#F3F3EC] border-[#17233B]'
                    : 'bg-[#FFFFFF] text-[#17233B] border-[#17233B]/10'
                }`}
              >
                <p>{msg.text}</p>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#17233B]/40 mt-0.5 px-1 font-mono">
                <span>{msg.sentAt}</span>
                {isMine && <CheckCheck className="w-3 h-3 text-[#1BA64B]" />}
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Voice Recording Workflow */}
      {recordingState === 'RECORDING' && (
        <div className="p-3 bg-[#E23D3D]/10 border-t border-[#E23D3D]/20 flex items-center justify-between font-operational animate-in slide-in-from-bottom duration-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#E23D3D] animate-ping" />
            <span className="text-xs font-bold text-[#E23D3D]">
              Enregistrement en direct : {recordingSeconds}s / 60s
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancelVoice}
              className="text-xs text-[#17233B]/60 hover:text-[#17233B] px-2 py-1 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Annuler</span>
            </button>
            <button
              onClick={handleStopRecording}
              className="px-3 py-1.5 bg-[#E23D3D] text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-xs tap-feedback cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Arrêter</span>
            </button>
          </div>
        </div>
      )}

      {recordingState === 'PREVIEW' && (
        <div className="p-3.5 bg-white border-t border-[#17233B]/15 space-y-2.5 animate-in slide-in-from-bottom duration-200 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-editorial text-sm font-bold text-[#17233B]">
                Écouter avant envoi
              </span>
              <span className="text-[10px] font-mono text-[#17233B]/50 bg-[#17233B]/5 px-1.5 py-0.5 rounded">
                {recordingSeconds}s
              </span>
            </div>
            <button
              onClick={handleCancelVoice}
              className="text-xs text-[#E23D3D] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer</span>
            </button>
          </div>
          <div className="p-2.5 bg-[#F3F3EC] rounded flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (recordedAudioUrl) {
                  const audio = new Audio(recordedAudioUrl);
                  audio.play();
                }
                setPreviewPlaying(!previewPlaying);
              }}
              className="w-8 h-8 rounded-full bg-[#17233B] text-white flex items-center justify-center tap-feedback cursor-pointer"
            >
              {previewPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div className="flex-1 flex items-center gap-1 h-4">
              {[10, 20, 15, 25, 30, 18, 22, 28, 14, 26, 18, 12].map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}px` }}
                  className={`w-1 rounded-full ${previewPlaying ? 'bg-[#17233B]' : 'bg-[#17233B]/30'}`}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono font-medium text-[#17233B]">
              00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancelVoice}
              className="px-3 py-1.5 rounded text-xs text-[#17233B]/70 hover:bg-[#F3F3EC] cursor-pointer"
            >
              Annuler
            </button>
            <EditorialButton
              variant="primary"
              size="sm"
              onClick={handleSendVoiceNote}
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              <span>Envoyer le Message Vocal</span>
            </EditorialButton>
          </div>
        </div>
      )}

      {/* Bottom Composer Bar */}
      {recordingState === 'IDLE' && (
        <div className="p-3 bg-[#F3F3EC] border-t border-[#17233B]/15 shrink-0">
          <form onSubmit={handleSendText} className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartRecording}
              className="w-10 h-10 rounded-full flex items-center justify-center border bg-[#FFFFFF] text-[#17233B] border-[#17233B]/20 hover:bg-[#17233B]/5 transition-colors tap-feedback cursor-pointer"
              title="Enregistrer un message vocal (max 60 secondes)"
            >
              <Mic className="w-4 h-4" />
            </button>
            <input
              type="text"
              placeholder="Écrire un message..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="flex-1 h-11 px-3.5 bg-[#FFFFFF] border border-[#17233B]/20 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-11 h-11 rounded-full bg-[#17233B] text-[#F3F3EC] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed tap-feedback cursor-pointer"
              aria-label="Envoyer"
            >
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </form>
        </div>
      )}

      {/* Contract Generation Modal (for Employer) */}
      <ContractGenerationModal
        isOpen={isContractModalOpen}
        onClose={() => {
          setIsContractModalOpen(false);
          loadMessages();
        }}
        candidate={{
          id: selectedConversation.otherParticipant.id,
          publicId: selectedConversation.otherParticipant.publicId,
          name: selectedConversation.otherParticipant.name,
          avatarUrl: selectedConversation.otherParticipant.avatarUrl,
          headline: selectedConversation.contextTitle
        }}
        offerTitle={selectedConversation.contextTitle}
      />

      {/* View Contract Modal */}
      {viewContractModal && (
        <EditorialSheet
          isOpen={Boolean(viewContractModal)}
          onClose={() => setViewContractModal(null)}
          title="Contrat de Travail"
          subtitle={`Réf. ${viewContractModal.id}`}
        >
          <div className="space-y-4 font-operational text-xs">
            <div className="p-3 bg-white rounded border border-[#17233B]/10 space-y-1">
              <span className="editorial-kicker block">Mission</span>
              <h4 className="font-editorial text-lg font-bold text-[#17233B]">{viewContractModal.offerTitle}</h4>
              <p className="text-xs text-[#17233B]/80 leading-relaxed">{viewContractModal.missionDescription}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 bg-[#F3F3EC] rounded">
              <div>
                <span className="text-[10px] uppercase font-mono text-[#17233B]/50 block">Rémunération</span>
                <span className="font-mono font-bold text-sm text-[#17233B]">{viewContractModal.monthlySalary.toLocaleString()} {viewContractModal.currency}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-[#17233B]/50 block">Durée</span>
                <span className="font-semibold text-[#17233B]">{viewContractModal.durationMonths} mois</span>
              </div>
            </div>
            <div className="pt-2">
              <EditorialButton
                variant="outline"
                fullWidth
                onClick={() => setViewContractModal(null)}
              >
                Fermer
              </EditorialButton>
            </div>
          </div>
        </EditorialSheet>
      )}

      {/* Sign Contract Modal */}
      {signingContractModal && (
        <EditorialSheet
          isOpen={Boolean(signingContractModal)}
          onClose={() => setSigningContractModal(null)}
          title="Signer le Contrat de Travail"
          subtitle={`Réf. ${signingContractModal.id}`}
          footer={
            <div className="flex gap-2">
              <EditorialButton
                variant="outline"
                className="flex-1"
                disabled={signingLoading}
                onClick={() => setSigningContractModal(null)}
              >
                Annuler
              </EditorialButton>
              <EditorialButton
                variant="primary"
                className="flex-1"
                disabled={signingLoading}
                onClick={handleConfirmSignFromChat}
              >
                {signingLoading ? 'Signature...' : 'Confirmer et signer'}
              </EditorialButton>
            </div>
          }
        >
          <div className="space-y-3 font-operational text-xs">
            <p className="text-xs text-[#17233B]/80 leading-relaxed">
              En signant, vous validez formellement votre accord de travail pour la mission : <strong>{signingContractModal.offerTitle}</strong> avec <strong>{signingContractModal.employerName}</strong>.
            </p>
            <div className="p-3 bg-white rounded border border-[#17233B]/10">
              <span className="text-[10px] font-mono text-[#17233B]/50 uppercase block">Votre ID public</span>
              <span className="font-mono font-bold text-sm text-[#17233B]">{currentUser?.publicId}</span>
            </div>
          </div>
        </EditorialSheet>
      )}

      {/* Revision Modal */}
      <EditorialSheet
        isOpen={revisionModalOpen}
        onClose={() => setRevisionModalOpen(false)}
        title="Demander un Ajustement"
        subtitle="Précisez ce que vous souhaitez ajuster sur la proposition"
      >
        <div className="space-y-4 font-operational text-xs">
          <div>
            <label className="block text-xs font-semibold text-[#17233B] mb-1">
              Précisez les points à ajuster (horaires, lieu, détails...) :
            </label>
            <textarea
              rows={4}
              value={revisionNotes}
              onChange={e => setRevisionNotes(e.target.value)}
              placeholder="Ex : Je souhaiterais un démarrage le 20 plutôt que le 15..."
              className="w-full p-3 bg-[#FFFFFF] border border-[#17233B]/20 rounded-[4px] text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <EditorialButton
              variant="outline"
              fullWidth
              onClick={() => setRevisionModalOpen(false)}
            >
              Annuler
            </EditorialButton>
            <EditorialButton
              variant="primary"
              fullWidth
              disabled={!revisionNotes.trim()}
              onClick={handleConfirmRevision}
            >
              Transmettre
            </EditorialButton>
          </div>
        </div>
      </EditorialSheet>
    </div>
  );
};
