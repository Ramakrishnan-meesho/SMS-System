'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Plus, Phone, Trash2, User, Ban } from 'lucide-react';
import { Message, Profile, storeApiClient } from '@/lib/api';
import { format, formatDistanceToNow } from 'date-fns';

interface ConversationListProps {
  conversations: string[];
  selectedPhoneNumber: string | null;
  onSelectConversation: (phoneNumber: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (phoneNumber: string) => void;
  onDeleteAllConversations: () => void;
  onEditProfile?: (phoneNumber: string) => void;
  messages: { [phoneNumber: string]: Message[] };
  blockedNumbers?: { [phoneNumber: string]: boolean };
}

export default function ConversationList({
  conversations,
  selectedPhoneNumber,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onDeleteAllConversations,
  onEditProfile,
  messages,
  blockedNumbers = {},
}: ConversationListProps) {
  const [profiles, setProfiles] = useState<{ [phoneNumber: string]: Profile }>({});
  const [hoveredConversation, setHoveredConversation] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);

  // Load profiles for all conversations
  const loadProfiles = async () => {
    const profilesMap: { [phoneNumber: string]: Profile } = {};
    const loadPromises = conversations.map(async (phoneNumber) => {
      try {
        const profile = await storeApiClient.getProfile(phoneNumber);
        profilesMap[phoneNumber] = profile;
      } catch (error) {
        // Profile doesn't exist, which is fine - we'll just show phone number
      }
    });
    await Promise.all(loadPromises);
    setProfiles(profilesMap);
  };

  useEffect(() => {
    if (conversations.length > 0) {
      loadProfiles();
    } else {
      // Clear profiles if no conversations
      setProfiles({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  const handleDeleteClick = (e: React.MouseEvent, phoneNumber: string) => {
    e.stopPropagation();
    setShowDeleteConfirm(phoneNumber);
  };

  const handleConfirmDelete = (e: React.MouseEvent, phoneNumber: string) => {
    e.stopPropagation();
    onDeleteConversation(phoneNumber);
    setShowDeleteConfirm(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(null);
  };
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
          <div className="flex items-center gap-2">
            {conversations.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                title="Delete all conversations"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onNewConversation}
              className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="New conversation"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete All Confirmation Dialog */}
      {showDeleteAllConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Delete All Conversations?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete all conversations and messages. This action cannot be undone.
            </p>
            <p className="text-xs text-gray-500 mb-6">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} will be deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteAllConversations();
                  setShowDeleteAllConfirm(false);
                }}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

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
              const profile = profiles[phoneNumber];
              const displayName = profile?.name || phoneNumber;
              const showPhoneNumber = profile?.name ? true : false;

              return (
                <div
                  key={phoneNumber}
                  className={`relative group ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                    }`}
                  onMouseEnter={() => setHoveredConversation(phoneNumber)}
                  onMouseLeave={() => setHoveredConversation(null)}
                >
                  <button
                    onClick={() => onSelectConversation(phoneNumber)}
                    className="w-full p-4 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar/Icon */}
                      <div className="flex-shrink-0 relative">
                        <div className={`w-12 h-12 rounded-full ${blockedNumbers[phoneNumber] ? 'bg-red-100' : 'bg-blue-100'} flex items-center justify-center overflow-hidden`}>
                          {profile?.avatar && (profile.avatar.startsWith('data:') || profile.avatar.startsWith('http')) ? (
                            <img
                              src={profile.avatar}
                              alt={displayName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Phone className={`w-6 h-6 ${blockedNumbers[phoneNumber] ? 'text-red-600' : 'text-blue-600'}`} />
                          )}
                        </div>
                        {blockedNumbers[phoneNumber] && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full border-2 border-white flex items-center justify-center">
                            <Ban className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-sm truncate ${blockedNumbers[phoneNumber] ? 'text-red-600' : isSelected ? 'text-blue-900' : 'text-gray-900'
                                }`}>
                                {displayName}
                              </span>
                              {blockedNumbers[phoneNumber] && (
                                <Ban className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                              )}
                            </div>
                            {showPhoneNumber && (
                              <span className={`text-xs truncate ${blockedNumbers[phoneNumber] ? 'text-red-500' : isSelected ? 'text-blue-600' : 'text-gray-500'
                                }`}>
                                {phoneNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {lastMessage && (
                              <span className="text-xs text-gray-500">
                                {getLastMessageTime(phoneNumber)}
                              </span>
                            )}
                            {hoveredConversation === phoneNumber && onEditProfile && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditProfile(phoneNumber);
                                }}
                                className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors"
                                title="Edit Profile / Assign Name"
                              >
                                <User className="w-4 h-4" />
                              </button>
                            )}
                            {(hoveredConversation === phoneNumber || showDeleteConfirm === phoneNumber) && (
                              <button
                                onClick={(e) => handleDeleteClick(e, phoneNumber)}
                                className="p-1 rounded hover:bg-red-100 text-red-600 transition-colors"
                                title="Delete conversation"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${isSelected ? 'text-blue-700' : 'text-gray-600'
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

                  {/* Delete Confirmation Popup */}
                  {showDeleteConfirm === phoneNumber && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4">
                        <p className="text-sm text-gray-800 mb-2 font-medium">
                          Delete this conversation?
                        </p>
                        <p className="text-xs text-gray-600 mb-4">
                          All messages in this conversation will be permanently deleted. This action cannot be undone.
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={(e) => handleCancelDelete(e)}
                            className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => handleConfirmDelete(e, phoneNumber)}
                            className="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
