'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageSquare, Phone } from 'lucide-react';
import { smsApiClient, storeApiClient, Message } from '@/lib/api';
import { subscribeToSmsStatus } from '@/lib/socket-io-client';
import { format } from 'date-fns';
import ConversationList from './ConversationList';
import NewConversationDialog from './NewConversationDialog';

export default function MessagingInterface() {
  const [conversations, setConversations] = useState<string[]>([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ [phoneNumber: string]: Message[] }>({});
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeRefs = useRef<{ [phoneNumber: string]: () => void }>({});
  const retryTimersRef = useRef<{ [phoneNumber: string]: NodeJS.Timeout[] }>({});

  // Load conversations and messages on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Load conversations first
        const phoneNumbers = await storeApiClient.getConversations();
        setConversations(phoneNumbers);
        
        // Load messages for all conversations in parallel
        const messagesMap: { [phoneNumber: string]: Message[] } = {};
        const loadPromises = phoneNumbers.map(async (phoneNumber) => {
          try {
            const msgs = await storeApiClient.getUserMessages(phoneNumber);
            messagesMap[phoneNumber] = msgs;
          } catch (error: any) {
            console.error(`Failed to load messages for ${phoneNumber}:`, error);
            // If it's a network error, set the error state
            if (error.message?.includes('Network Error')) {
              setError(error.message);
            }
            messagesMap[phoneNumber] = [];
          }
        });
        
        await Promise.all(loadPromises);
        setMessages(messagesMap);
        
        // Auto-select first conversation if available
        if (phoneNumbers.length > 0 && !selectedPhoneNumber) {
          setSelectedPhoneNumber(phoneNumbers[0]);
        }
      } catch (error: any) {
        console.error('Failed to initialize data:', error);
        setError(error.message || 'Failed to load conversations. Please check if the backend services are running.');
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
    
    // Cleanup retry timers on unmount
    return () => {
      Object.values(retryTimersRef.current).forEach(timers => {
        timers.forEach(timer => clearTimeout(timer));
      });
    };
  }, []);

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedPhoneNumber) {
      // Reload messages for selected conversation to ensure we have latest
      loadMessages(selectedPhoneNumber, true); // Preserve any optimistic messages
      setupWebSocket(selectedPhoneNumber);
    }
  }, [selectedPhoneNumber]);

  // Periodic check for status updates (every 2 seconds) as fallback
  // This ensures PENDING messages eventually update to SUCCESS even if polling misses them
  useEffect(() => {
    if (!selectedPhoneNumber) return;
    
    const statusCheckInterval = setInterval(() => {
      // Check if there are any PENDING messages that need status updates
      const currentMessages = messages[selectedPhoneNumber] || [];
      const hasPendingMessages = currentMessages.some(m => m.status === 'PENDING');
      
      if (hasPendingMessages) {
        loadMessages(selectedPhoneNumber, true);
      }
    }, 1000); // Check every 2 seconds instead of 3
    
    return () => clearInterval(statusCheckInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhoneNumber]); // Only depend on selectedPhoneNumber, messages checked inside

  useEffect(() => {
    if (selectedPhoneNumber && messages[selectedPhoneNumber]?.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [messages, selectedPhoneNumber]);

  // This function is kept for backward compatibility but simplified
  const loadConversations = async () => {
    try {
      const phoneNumbers = await storeApiClient.getConversations();
      
      // Preserve existing conversations that might have optimistic messages
      setConversations((prev) => {
        const seen: { [key: string]: boolean } = {};
        const merged: string[] = [];
        [...prev, ...phoneNumbers].forEach((num) => {
          if (!seen[num]) {
            merged.push(num);
            seen[num] = true;
          }
        });
        return merged;
      });

      // Load messages for all conversations in parallel
      const messagesMap: { [phoneNumber: string]: Message[] } = {};
      const loadPromises = phoneNumbers.map(async (phoneNumber) => {
        try {
          const msgs = await storeApiClient.getUserMessages(phoneNumber);
          messagesMap[phoneNumber] = msgs;
        } catch (error) {
          console.error(`Failed to load messages for ${phoneNumber}:`, error);
          messagesMap[phoneNumber] = [];
        }
      });
      
      await Promise.all(loadPromises);
      setMessages((prev) => ({ ...prev, ...messagesMap }));
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadMessages = useCallback(async (phoneNumber: string, preserveOptimistic: boolean = false) => {
    try {
      console.log(`Loading messages for ${phoneNumber}, preserveOptimistic: ${preserveOptimistic}`);
      const data = await storeApiClient.getUserMessages(phoneNumber);
      console.log(`Loaded ${data.length} messages from API for ${phoneNumber}`);
      
      setMessages((prev) => {
        const currentMessages = prev[phoneNumber] || [];
        
        if (preserveOptimistic && currentMessages.length > 0) {
          // Merge persisted messages with optimistic ones
          // Match by correlationId (which is the requestId) to avoid duplicates
          const persistedIds = new Set(data.map(m => m.id));
          const persistedCorrelationIds = new Set(
            data.map(m => m.correlationId || m.id).filter(Boolean)
          );
          
          // Filter optimistic messages: keep those not yet persisted
          const optimisticMessages = currentMessages.filter(m => {
            const correlationId = m.correlationId || m.id;
            
            // Check by correlationId first (primary matching method)
            if (correlationId && persistedCorrelationIds.has(correlationId)) {
              return false; // Already persisted (matched by correlationId)
            }
            
            // Check by ID as fallback
            if (persistedIds.has(m.id)) {
              return false; // Already persisted
            }
            
            // Check if message is too old (more than 5 seconds) - likely persisted
            const messageAge = Date.now() - new Date(m.createdAt).getTime();
            if (messageAge > 2500) {
              return false; // Too old, should be persisted by now
            }
            
            return true; // Keep this optimistic message
          });
          
          // Optimized merge: Use Map to prevent duplicates and ensure status updates
          // When a persisted message matches an optimistic one, use the persisted version (has correct status)
          const mergedMap = new Map<string, Message>();
          
          // First, add all persisted messages (they have the latest status from backend)
          data.forEach(msg => {
            const key = msg.correlationId || msg.id;
            mergedMap.set(key, msg);
          });
          
          // Then, add optimistic messages that aren't persisted yet
          // If a persisted message exists with same correlationId, it will overwrite the optimistic one
          optimisticMessages.forEach(msg => {
            const key = msg.correlationId || msg.id;
            if (!mergedMap.has(key)) {
              mergedMap.set(key, msg);
            } else {
              // This shouldn't happen due to filtering above, but log if it does
              console.log(`Found persisted message for optimistic: ${key}, using persisted status: ${mergedMap.get(key)?.status}`);
            }
          });
          
          // Convert to array and sort by createdAt
          const merged = Array.from(mergedMap.values()).sort((a, b) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          
          // Check if any optimistic messages were replaced with persisted ones
          const statusUpdates = merged.filter(m => {
            const key = m.correlationId || m.id;
            const wasOptimistic = currentMessages.some(opt => (opt.correlationId || opt.id) === key && opt.status === 'PENDING');
            const isPersisted = data.some(p => (p.correlationId || p.id) === key);
            return wasOptimistic && isPersisted && m.status !== 'PENDING';
          });
          
          if (statusUpdates.length > 0) {
            console.log(`Status updated for ${statusUpdates.length} message(s):`, statusUpdates.map(m => `${m.status} (${m.correlationId || m.id})`));
          }
          
          console.log(`Merged ${merged.length} messages (${data.length} persisted + ${optimisticMessages.length} optimistic) for ${phoneNumber}`);
          
          return {
            ...prev,
            [phoneNumber]: merged,
          };
        }
        
        // Sort by createdAt
        const sorted = [...data].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        return {
          ...prev,
          [phoneNumber]: sorted,
        };
      });
    } catch (error) {
      console.error('Failed to load messages:', error);
      // Don't clear messages on error if we're preserving optimistic
      if (!preserveOptimistic) {
        setMessages((prev) => ({
          ...prev,
          [phoneNumber]: prev[phoneNumber] || [],
        }));
      }
    }
  }, []);

  const setupWebSocket = async (phoneNumber: string) => {
    // Clean up previous subscription
    if (unsubscribeRefs.current[phoneNumber]) {
      unsubscribeRefs.current[phoneNumber]();
    }

    try {
      const unsubscribe = await subscribeToSmsStatus(phoneNumber, (data) => {
        setMessages((prev) => {
          const currentMessages = prev[phoneNumber] || [];
          
          // Try to match by correlationId/requestId (for both optimistic and persisted messages)
          let found = false;
          const updated = currentMessages.map((msg) => {
            const correlationId = msg.correlationId || msg.id;
            // Match by correlationId or id
            if (correlationId === data.requestId || msg.id === data.requestId) {
              found = true;
              return { ...msg, status: data.status };
            }
            return msg;
          });
          
          // If not found, reload messages to get persisted version
          // This handles edge cases where message hasn't been matched yet
          if (!found && currentMessages.length > 0) {
            // Reload messages after a short delay to get the persisted version
            setTimeout(() => loadMessages(phoneNumber, true), 1000);
          }
          
          return {
            ...prev,
            [phoneNumber]: updated,
          };
        });
      });
      unsubscribeRefs.current[phoneNumber] = unsubscribe;
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending || !selectedPhoneNumber) return;

    const messageText = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX
    setSending(true);

    try {
      const response = await smsApiClient.sendSms({
        phoneNumber: selectedPhoneNumber,
        message: messageText,
      });

      // Optimistically add message with correlationId for matching
      const optimisticMessage: Message = {
        id: response.requestId,
        correlationId: response.requestId, // Store for matching with persisted messages
        phoneNumber: selectedPhoneNumber,
        text: messageText,
        status: response.status,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => ({
        ...prev,
        [selectedPhoneNumber]: [...(prev[selectedPhoneNumber] || []), optimisticMessage],
      }));

      // Update conversations if this is a new conversation
      if (!conversations.includes(selectedPhoneNumber)) {
        setConversations((prev) => [...prev, selectedPhoneNumber]);
      }

      // Fast polling - message is usually persisted within 1-2 seconds
      const correlationId = response.requestId;
      const pollDelays = [300, 600, 800, 1200]; // Faster, more frequent checks
      
      // Clear any existing retry timers for this conversation
      if (retryTimersRef.current[selectedPhoneNumber]) {
        retryTimersRef.current[selectedPhoneNumber].forEach(timer => clearTimeout(timer));
        retryTimersRef.current[selectedPhoneNumber] = [];
      }
      
      // Track if message was found to stop polling
      let messageFound = false;
      
      // Optimized polling function that stops when message is found
      const pollForMessage = async (attempt: number) => {
        if (messageFound) return; // Stop if already found
        
        try {
          const data = await storeApiClient.getUserMessages(selectedPhoneNumber);
          
          // Check if our message is now persisted (match by correlationId)
          const persistedMessage = data.find(
            m => (m.correlationId || m.id) === correlationId
          );
          
          if (persistedMessage) {
            messageFound = true;
            console.log(`✓ Message found in poll attempt ${attempt + 1}, status: ${persistedMessage.status}`);
            
            // Message found! Update in-place immediately
            setMessages((prev) => {
              const currentMessages = prev[selectedPhoneNumber] || [];
              const updated = currentMessages.map((msg) => {
                const msgCorrelationId = msg.correlationId || msg.id;
                if (msgCorrelationId === correlationId) {
                  // Replace optimistic with persisted message (has updated status)
                  return persistedMessage;
                }
                return msg;
              });
              
              return {
                ...prev,
                [selectedPhoneNumber]: updated,
              };
            });
            
            // Stop all polling timers
            if (retryTimersRef.current[selectedPhoneNumber]) {
              retryTimersRef.current[selectedPhoneNumber].forEach(timer => clearTimeout(timer));
              retryTimersRef.current[selectedPhoneNumber] = [];
            }
            return;
          }
          
          // Message not found yet, continue polling if we have attempts left
          if (attempt < pollDelays.length - 1 && !messageFound) {
            const nextAttempt = attempt + 1;
            const timer = setTimeout(() => pollForMessage(nextAttempt), pollDelays[nextAttempt]);
            if (!retryTimersRef.current[selectedPhoneNumber]) {
              retryTimersRef.current[selectedPhoneNumber] = [];
            }
            retryTimersRef.current[selectedPhoneNumber].push(timer);
          } else if (!messageFound) {
            // If polling exhausted, try one more time with loadMessages
            loadMessages(selectedPhoneNumber, true);
          }
        } catch (error) {
          console.error('Error polling for message:', error);
          // Continue polling on error if we have attempts left (don't show error to user)
          if (attempt < pollDelays.length - 1 && !messageFound) {
            const nextAttempt = attempt + 1;
            const timer = setTimeout(() => pollForMessage(nextAttempt), pollDelays[nextAttempt]);
            if (!retryTimersRef.current[selectedPhoneNumber]) {
              retryTimersRef.current[selectedPhoneNumber] = [];
            }
            retryTimersRef.current[selectedPhoneNumber].push(timer);
          }
        }
      };
      
      // Start polling after first delay
      const firstTimer = setTimeout(() => pollForMessage(0), pollDelays[0]);
      if (!retryTimersRef.current[selectedPhoneNumber]) {
        retryTimersRef.current[selectedPhoneNumber] = [];
      }
      retryTimersRef.current[selectedPhoneNumber].push(firstTimer);
      
    } catch (error: any) {
      console.error('Failed to send message:', error);
      
      // Restore message text on error so user can retry
      setNewMessage(messageText);
      
      // Only show error for actual failures, not network timeouts that might recover
      const isNetworkError = !error.response;
      const isServerError = error.response?.status >= 500;
      const isClientError = error.response?.status >= 400 && error.response?.status < 500;
      
      // Show error only for real failures (4xx client errors or network errors)
      // Don't show for 5xx server errors as they might be temporary
      if (isNetworkError || isClientError) {
        const errorMessage = error.message || error.response?.data?.message || 'Failed to send message';
        alert(`Error: ${errorMessage}\n\nPlease check:\n1. Java service is running on port 8081\n2. Backend services are accessible\n3. Check browser console for details`);
      } else {
        // For server errors, just log and let polling handle it
        console.warn('Server error during send, but message may still be processed:', error);
      }
    } finally {
      setSending(false);
    }
  };

  const handleNewConversation = (phoneNumber: string) => {
    if (!conversations.includes(phoneNumber)) {
      setConversations((prev) => [...prev, phoneNumber]);
      setMessages((prev) => ({
        ...prev,
        [phoneNumber]: [],
      }));
    }
    setSelectedPhoneNumber(phoneNumber);
  };

  const currentMessages = selectedPhoneNumber ? messages[selectedPhoneNumber] || [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-gray-500">Loading conversations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full">
          <h3 className="text-red-800 font-semibold mb-2">Connection Error</h3>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              window.location.reload();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-white">
      <NewConversationDialog
        isOpen={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onStartConversation={handleNewConversation}
      />

      {/* Conversation List */}
      <ConversationList
        conversations={conversations}
        selectedPhoneNumber={selectedPhoneNumber}
        onSelectConversation={setSelectedPhoneNumber}
        onNewConversation={() => setShowNewDialog(true)}
        messages={messages}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedPhoneNumber ? (
          <>
            {/* Header */}
            <div className="border-b p-4 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold">{selectedPhoneNumber}</span>
                </div>
                <button
                  onClick={() => loadMessages(selectedPhoneNumber, false)}
                  className="text-sm text-blue-600 hover:text-blue-700 px-3 py-1 rounded hover:bg-blue-50 transition-colors"
                  title="Refresh messages"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <MessageSquare className="w-12 h-12 mb-2" />
                  <p>No messages yet. Start a conversation!</p>
                </div>
              ) : (
                currentMessages.map((message, index) => (
                  <div
                    key={`${message.id}-${index}-${message.createdAt}`}
                    className={`flex ${
                      message.phoneNumber === selectedPhoneNumber
                        ? 'justify-end'
                        : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.phoneNumber === selectedPhoneNumber
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{message.text}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span
                          className={`text-xs ${
                            message.phoneNumber === selectedPhoneNumber
                              ? 'text-blue-100'
                              : 'text-gray-500'
                          }`}
                        >
                          {message.createdAt ? format(new Date(message.createdAt), 'HH:mm') : '--:--'}
                        </span>
                        <span
                          className={`text-xs ml-2 ${
                            message.status === 'SUCCESS'
                              ? 'text-green-300'
                              : 'text-red-300'
                          }`}
                        >
                          {message.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-4 bg-gray-50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Select a conversation or start a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
