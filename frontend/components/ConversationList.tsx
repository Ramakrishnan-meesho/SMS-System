'use client';

import { MessageSquare, Plus, Phone } from 'lucide-react';
import { Message } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
  conversations: string[];
  selectedPhoneNumber: string | null;
  onSelectConversation: (phoneNumber: string) => void;
  onNewConversation: () => void;
  messages: { [phoneNumber: string]: Message[] };
}

export default function ConversationList({
  conversations,
  selectedPhoneNumber,
  onSelectConversation,
  onNewConversation,
  messages,
}: ConversationListProps) {
  const getLastMessage = (phoneNumber: string): Message | null => {
    const conversationMessages = messages[phoneNumber] || [];
    if (conversationMessages.length === 0) return null;
    
    // Sort by createdAt to get the most recent
    const sorted = [...conversationMessages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted[0];
  };

  const getLastMessagePreview = (phoneNumber: string): string => {
    const lastMessage = getLastMessage(phoneNumber);
    if (!lastMessage) return 'No messages yet';
    
    const preview = lastMessage.text.length > 40 
      ? lastMessage.text.substring(0, 40) + '...'
      : lastMessage.text;
    return preview;
  };

  const getLastMessageTime = (phoneNumber: string): string => {
    const lastMessage = getLastMessage(phoneNumber);
    if (!lastMessage) return '';
    
    try {
      const messageDate = new Date(lastMessage.createdAt);
      const now = new Date();
      const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);
      
      if (diffInHours < 24) {
        return format(messageDate, 'HH:mm');
      } else if (diffInHours < 168) { // Less than a week
        return format(messageDate, 'EEE');
      } else {
        return formatDistanceToNow(messageDate, { addSuffix: true });
      }
    } catch {
      return '';
    }
  };

  const getUnreadCount = (phoneNumber: string): number => {
    // For now, we don't track read/unread status, so return 0
    // This can be enhanced later with read receipts
    return 0;
  };

  return (
    <div className="w-80 border-r bg-gray-50 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Conversations</h2>
          <button
            onClick={onNewConversation}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            title="New conversation"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm text-center">No conversations yet</p>
            <p className="text-xs text-center mt-1">Start a new conversation to begin</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {conversations.map((phoneNumber) => {
              const isSelected = selectedPhoneNumber === phoneNumber;
              const lastMessage = getLastMessage(phoneNumber);
              const unreadCount = getUnreadCount(phoneNumber);

              return (
                <button
                  key={phoneNumber}
                  onClick={() => onSelectConversation(phoneNumber)}
                  className={`w-full p-4 text-left hover:bg-gray-100 transition-colors ${
                    isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar/Icon */}
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Phone className="w-6 h-6 text-blue-600" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold text-sm truncate ${
                          isSelected ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {phoneNumber}
                        </span>
                        {lastMessage && (
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {getLastMessageTime(phoneNumber)}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${
                          isSelected ? 'text-blue-700' : 'text-gray-600'
                        }`}>
                          {getLastMessagePreview(phoneNumber)}
                        </p>
                        {unreadCount > 0 && (
                          <span className="flex-shrink-0 bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
