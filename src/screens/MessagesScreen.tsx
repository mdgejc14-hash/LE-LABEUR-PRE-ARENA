import React, { useState } from 'react';
import { FileText, AlertCircle, MessageSquare, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const MessagesScreen: React.FC = () => {
  const { conversations, openConversation, currentUser, currentRole } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const myConversations = conversations.filter(conv => {
    if (currentRole === 'ADMIN') return true;
    return conv.participantIds.includes(currentUser?.id || '');
  });

  const filteredConversations = myConversations.filter(conv => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      conv.otherParticipant.name.toLowerCase().includes(q) ||
      conv.contextTitle.toLowerCase().includes(q) ||
      conv.lastMessageText.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#F3F3EC] select-none pb-20 font-operational text-xs text-[#17233B]">
      <div className="mb-4">
        <span className="editorial-kicker">
          Échanges Directs
        </span>
        <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight mt-0.5">
          Messages
        </h1>
        <p className="font-operational text-xs text-[#17233B]/70 mt-1">
          Discussions, messages vocaux et propositions de contrat.
        </p>

        <div className="relative mt-3">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
          <input
            type="text"
            placeholder="Rechercher une discussion..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {filteredConversations.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-[4px] border border-[#17233B]/10">
            <MessageSquare className="w-8 h-8 text-[#17233B]/30 mx-auto mb-2" />
            <p className="font-editorial text-lg text-[#17233B] font-bold">
              {searchQuery ? 'Aucune conversation trouvée' : 'Aucun message pour le moment'}
            </p>
            <p className="text-xs text-[#17233B]/60 mt-1">
              Les discussions s activent lorsqu une candidature est retenue ou qu un contrat est préparé.
            </p>
          </div>
        ) : (
          filteredConversations.map(conv => {
            let contextIcon = <FileText className="w-3 h-3 text-[#17233B]/50 mr-1" />;
            if (conv.contextType === 'INCIDENT') {
              contextIcon = <AlertCircle className="w-3 h-3 text-[#E23D3D] mr-1" />;
            }

            return (
              <div
                key={conv.id}
                onClick={() => openConversation(conv)}
                className="p-4 bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/10 hover:border-[#17233B]/30 transition-all cursor-pointer tap-feedback shadow-xs"
              >
                <div className="flex items-start gap-3.5">
                  <div className="relative">
                    <img
                      src={conv.otherParticipant.avatarUrl}
                      alt={conv.otherParticipant.name}
                      className="w-12 h-12 rounded-[4px] object-cover border border-[#17233B]/10"
                      referrerPolicy="no-referrer"
                    />
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#340C24] text-[#F8BBCB] text-[9px] font-bold rounded-full flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-editorial text-base font-bold text-[#17233B] truncate">
                        {conv.otherParticipant.name}
                      </h3>
                      <span className="text-[11px] font-operational text-[#17233B]/50 shrink-0">
                        {conv.lastMessageTime}
                      </span>
                    </div>
                    <div className="flex items-center text-[11px] font-operational text-[#17233B]/60 mt-0.5 truncate">
                      {contextIcon}
                      <span className="truncate">{conv.contextTitle}</span>
                    </div>
                    <p className="text-xs font-operational text-[#17233B]/80 mt-1.5 truncate">
                      {conv.lastMessageText}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
