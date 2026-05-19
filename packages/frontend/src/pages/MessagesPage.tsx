import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/shared/Toast';
import { useSocketContext } from '@/contexts/SocketContext';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { SkeletonLoader } from '@/components/shared/SkeletonLoader';
import { EmojiPicker } from '@/components/shared/EmojiPicker';

interface ChatParticipant {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

interface Chat {
  id: string;
  type: 'private' | 'group';
  name?: string;
  participants: ChatParticipant[];
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
  };
  unreadCount: number;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  createdAt: string;
  readBy: string[];
}

interface IncomingCall {
  callId: string;
  callerId: string;
  callerName?: string;
  callerAvatar?: string;
  type: 'voice' | 'video';
}

type CallState = 'idle' | 'calling' | 'ringing' | 'connected';

function MessagesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { on, off, emit } = useSocketContext();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const participantIds = chats.flatMap((c) => c.participants.map((p) => p.id));
  const onlineMap = useOnlineStatus(participantIds);
  const { typingUsers, startTyping, stopTyping } = useTypingIndicator(selectedChat?.id || '');

  // Load chats
  useEffect(() => {
    async function loadChats() {
      try {
        const { data } = await api.get('/chats');
        setChats(data.data ?? []);
      } catch {
        addToast('Failed to load conversations', 'error');
      } finally {
        setIsLoadingChats(false);
      }
    }
    loadChats();
  }, [addToast]);

  // Load messages when chat is selected
  useEffect(() => {
    if (!selectedChat) return;
    async function loadMessages() {
      setIsLoadingMessages(true);
      try {
        const { data } = await api.get(`/chats/${selectedChat!.id}/messages`);
        setMessages(data.data ?? []);
      } catch {
        addToast('Failed to load messages', 'error');
      } finally {
        setIsLoadingMessages(false);
      }
    }
    loadMessages();
  }, [selectedChat, addToast]);

  // Real-time message delivery via Socket.IO (Requirements: 7.1)
  useEffect(() => {
    const handleNewMessage = (data: unknown) => {
      const message = data as Message;
      // Add to current thread if it matches the selected chat
      if (selectedChat && message.chatId === selectedChat.id) {
        setMessages((prev) => {
          // Avoid duplicates (from optimistic updates)
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        // Auto-mark as read if the message is from someone else
        if (message.senderId !== user?.id) {
          emit('message:read', { chatId: message.chatId, messageId: message.id });
        }
      }
      // Update chat list with latest message
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== message.chatId) return chat;
          return {
            ...chat,
            lastMessage: {
              content: message.content,
              senderId: message.senderId,
              createdAt: message.createdAt,
            },
            unreadCount:
              selectedChat?.id === message.chatId && message.senderId !== user?.id
                ? chat.unreadCount
                : message.senderId !== user?.id
                  ? chat.unreadCount + 1
                  : chat.unreadCount,
          };
        })
      );
    };

    const handleReadReceipt = (data: unknown) => {
      const event = data as { chatId: string; messageId: string; readBy: string };
      if (selectedChat && event.chatId === selectedChat.id) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== event.messageId) return msg;
            if (msg.readBy.includes(event.readBy)) return msg;
            return { ...msg, readBy: [...msg.readBy, event.readBy] };
          })
        );
      }
    };

    on('message:new', handleNewMessage);
    on('message:read', handleReadReceipt);

    return () => {
      off('message:new', handleNewMessage);
      off('message:read', handleReadReceipt);
    };
  }, [on, off, emit, selectedChat, user]);

  // Handle incoming call events (Requirements: 17.1)
  useEffect(() => {
    const handleIncomingCall = (data: unknown) => {
      const call = data as IncomingCall;
      // Find caller info from chats
      const callerParticipant = chats
        .flatMap((c) => c.participants)
        .find((p) => p.id === call.callerId);
      setIncomingCall({
        ...call,
        callerName: callerParticipant?.displayName || callerParticipant?.username,
        callerAvatar: callerParticipant?.avatarUrl,
      });
    };

    const handleCallEnded = (data: unknown) => {
      const event = data as { callId: string; reason: string };
      if (currentCallId === event.callId || incomingCall?.callId === event.callId) {
        setCallState('idle');
        setCurrentCallId(null);
        setIncomingCall(null);
        setIsMuted(false);
        setIsCameraOff(false);
        if (event.reason && event.reason !== 'ended') {
          addToast(`Call ended: ${event.reason}`, 'info');
        }
      }
    };

    const handleCallSignal = (data: unknown) => {
      const event = data as { callId: string; signal: unknown };
      // WebRTC signal handling - in a full implementation this would
      // pass the signal to the RTCPeerConnection
      if (event.callId === currentCallId && callState === 'calling') {
        setCallState('connected');
      }
    };

    on('call:incoming', handleIncomingCall);
    on('call:ended', handleCallEnded);
    on('call:signal', handleCallSignal);

    return () => {
      off('call:incoming', handleIncomingCall);
      off('call:ended', handleCallEnded);
      off('call:signal', handleCallSignal);
    };
  }, [on, off, currentCallId, callState, incomingCall, chats, addToast]);

  // Mark messages as read when viewing a chat (Requirements: 7.4)
  useEffect(() => {
    if (!selectedChat || !user || messages.length === 0) return;
    const unreadMessages = messages.filter(
      (m) => m.senderId !== user.id && !m.readBy.includes(user.id)
    );
    if (unreadMessages.length > 0) {
      const lastUnread = unreadMessages[unreadMessages.length - 1];
      emit('message:read', { chatId: selectedChat.id, messageId: lastUnread.id });
      // Clear unread count for this chat
      setChats((prev) =>
        prev.map((c) => (c.id === selectedChat.id ? { ...c, unreadCount: 0 } : c))
      );
    }
  }, [selectedChat, messages, user, emit]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedChat) return;
    const content = newMessage.trim();
    setNewMessage('');
    stopTyping(selectedChat.id);

    // Optimistic update
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      chatId: selectedChat.id,
      senderId: user!.id,
      content,
      type: 'text',
      createdAt: new Date().toISOString(),
      readBy: [user!.id],
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    // Send via Socket.IO for real-time delivery (Requirements: 7.1)
    emit('message:send', { chatId: selectedChat.id, content, type: 'text' });

    try {
      const { data } = await api.post(`/chats/${selectedChat.id}/messages`, { content, type: 'text' });
      setMessages((prev) => prev.map((m) => (m.id === optimisticMsg.id ? data : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      addToast('Failed to send message', 'error');
    }
  }, [newMessage, selectedChat, user, stopTyping, emit, addToast]);

  const handleMediaUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    if (file.size > 25 * 1024 * 1024) {
      addToast('File size must be under 25MB', 'error');
      return;
    }

    const mediaType = file.type.startsWith('image')
      ? 'image'
      : file.type.startsWith('video')
        ? 'video'
        : file.type.startsWith('audio')
          ? 'audio'
          : 'document';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', mediaType);

    try {
      const { data } = await api.post(`/chats/${selectedChat.id}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Add the message to the thread
      if (data) {
        setMessages((prev) => [...prev, data]);
      }
    } catch {
      addToast('Failed to send media', 'error');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedChat, addToast]);

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    if (selectedChat) {
      if (value) startTyping(selectedChat.id);
      else stopTyping(selectedChat.id);
    }
  };

  const initiateCall = useCallback(async (type: 'voice' | 'video') => {
    if (!selectedChat) return;
    setCallType(type);
    setCallState('calling');
    setIsMuted(false);
    setIsCameraOff(false);
    try {
      const { data } = await api.post('/calls/initiate', { chatId: selectedChat.id, type });
      setCurrentCallId(data.callId);
      // WebRTC signaling via Socket.IO (Requirements: 17.1)
      emit('call:signal', { callId: data.callId, signal: { type: 'offer' } });
    } catch {
      addToast('Failed to start call', 'error');
      setCallState('idle');
      setCurrentCallId(null);
    }
  }, [selectedChat, emit, addToast]);

  const endCall = useCallback(() => {
    if (currentCallId) {
      emit('call:end', { callId: currentCallId });
    }
    setCallState('idle');
    setCurrentCallId(null);
    setIsMuted(false);
    setIsCameraOff(false);
  }, [currentCallId, emit]);

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    setCallType(incomingCall.type);
    setCallState('connected');
    setCurrentCallId(incomingCall.callId);
    setIsMuted(false);
    setIsCameraOff(false);
    // Send answer signal via Socket.IO
    emit('call:signal', { callId: incomingCall.callId, signal: { type: 'answer' } });
    setIncomingCall(null);
  }, [incomingCall, emit]);

  const declineIncomingCall = useCallback(() => {
    if (!incomingCall) return;
    emit('call:end', { callId: incomingCall.callId });
    setIncomingCall(null);
  }, [incomingCall, emit]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraOff((prev) => !prev);
  }, []);

  const getChatDisplayName = (chat: Chat): string => {
    if (chat.name) return chat.name;
    const other = chat.participants.find((p) => p.id !== user?.id);
    return other?.displayName || other?.username || 'Unknown';
  };

  const getChatAvatar = (chat: Chat): string | undefined => {
    const other = chat.participants.find((p) => p.id !== user?.id);
    return other?.avatarUrl;
  };

  const isOnline = (chat: Chat): boolean => {
    if (chat.type === 'group') return false;
    const other = chat.participants.find((p) => p.id !== user?.id);
    return other ? (onlineMap.get(other.id) ?? false) : false;
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-4 -mx-4 md:-mx-0 md:mt-0 md:rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Chat list sidebar */}
      <div className={`w-full md:w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoadingChats ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <SkeletonLoader width="48px" height="48px" rounded="full" />
                  <div className="flex-1 space-y-2">
                    <SkeletonLoader height="14px" className="w-2/3" />
                    <SkeletonLoader height="12px" className="w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChat(chat)}
                  className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    selectedChat?.id === chat.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      {getChatAvatar(chat) ? (
                        <img src={getChatAvatar(chat)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
                          {getChatDisplayName(chat)[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    {isOnline(chat) && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {getChatDisplayName(chat)}
                      </p>
                      {chat.lastMessage && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTime(chat.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {chat.lastMessage?.content || 'No messages yet'}
                      </p>
                      {chat.unreadCount > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 bg-blue-500 text-white text-xs rounded-full min-w-[20px] text-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className={`flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 dark:text-gray-500">Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <button
                onClick={() => setSelectedChat(null)}
                className="md:hidden p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Back to chat list"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  {getChatAvatar(selectedChat) ? (
                    <img src={getChatAvatar(selectedChat)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
                      {getChatDisplayName(selectedChat)[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                {isOnline(selectedChat) && (
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{getChatDisplayName(selectedChat)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isOnline(selectedChat) ? 'Online' : 'Offline'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => initiateCall('voice')}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Voice call"
                >
                  <PhoneIcon />
                </button>
                <button
                  onClick={() => initiateCall('video')}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Video call"
                >
                  <VideoIcon />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingMessages ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <SkeletonLoader width={`${120 + Math.random() * 100}px`} height="36px" rounded="lg" />
                    </div>
                  ))}
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderId === user?.id;
                  const readByOthers = msg.readBy.filter((id) => id !== user?.id);
                  const isRead = readByOthers.length > 0;
                  const isDelivered = !msg.id.startsWith('temp-');
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] ${isMine ? 'order-2' : ''}`}>
                        {msg.type === 'image' && msg.mediaUrl && (
                          <img src={msg.mediaUrl} alt="Shared image" className="max-w-full rounded-lg mb-1" />
                        )}
                        {msg.type === 'video' && msg.mediaUrl && (
                          <video src={msg.mediaUrl} controls className="max-w-full rounded-lg mb-1" />
                        )}
                        {msg.type === 'audio' && msg.mediaUrl && (
                          <audio src={msg.mediaUrl} controls className="w-full mb-1" />
                        )}
                        {msg.type === 'document' && msg.mediaUrl && (
                          <a
                            href={msg.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 mb-1 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            <DocumentIcon />
                            <span className="text-sm text-blue-600 dark:text-blue-400 truncate">
                              {msg.content || 'Document'}
                            </span>
                          </a>
                        )}
                        {(msg.type === 'text' || (!msg.mediaUrl && msg.content)) && (
                          <div
                            className={`px-3 py-2 rounded-2xl text-sm ${
                              isMine
                                ? 'bg-blue-500 text-white rounded-br-md'
                                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md border border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            {msg.content}
                          </div>
                        )}
                        <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : ''}`}>
                          <span className="text-[10px] text-gray-400">{formatTime(msg.createdAt)}</span>
                          {isMine && (
                            <span className={`text-[10px] ${isRead ? 'text-blue-500' : 'text-gray-400'}`}>
                              {isRead ? '✓✓' : isDelivered ? '✓' : '○'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-2xl bg-gray-200 dark:bg-gray-700 rounded-bl-md">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500"
                  aria-label="Attach file"
                >
                  <AttachIcon />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                  onChange={handleMediaUpload}
                  className="hidden"
                />
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                <EmojiPicker onSelect={(emoji) => setNewMessage((prev) => prev + emoji)} />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Incoming call modal */}
      {incomingCall && callState === 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center">
            <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mx-auto mb-4">
              {incomingCall.callerAvatar ? (
                <img src={incomingCall.callerAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-2xl font-bold">
                  {(incomingCall.callerName || '?')[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              {incomingCall.callerName || 'Unknown'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Incoming {incomingCall.type} call...
            </p>
            <div className="flex justify-center gap-6">
              <button
                onClick={declineIncomingCall}
                className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                aria-label="Decline call"
              >
                <PhoneOffIcon />
              </button>
              <button
                onClick={acceptIncomingCall}
                className="p-4 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors animate-pulse"
                aria-label="Accept call"
              >
                <PhoneIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active call overlay */}
      {callState !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-gray-900/95 flex flex-col items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-gray-700 overflow-hidden mb-4">
            {selectedChat && getChatAvatar(selectedChat) ? (
              <img src={getChatAvatar(selectedChat)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold">
                {selectedChat ? getChatDisplayName(selectedChat)[0]?.toUpperCase() : '?'}
              </div>
            )}
          </div>
          <p className="text-white text-lg font-semibold mb-1">
            {selectedChat ? getChatDisplayName(selectedChat) : ''}
          </p>
          <p className="text-gray-400 text-sm mb-8">
            {callState === 'calling' ? 'Calling...' : callState === 'ringing' ? 'Ringing...' : `${callType === 'video' ? 'Video' : 'Voice'} call connected`}
          </p>
          <div className="flex gap-4">
            {callType === 'video' && (
              <button
                onClick={toggleCamera}
                className={`p-4 rounded-full transition-colors ${
                  isCameraOff ? 'bg-red-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
                aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isCameraOff ? <VideoCameraOffIcon /> : <VideoIcon />}
              </button>
            )}
            <button
              onClick={toggleMute}
              className={`p-4 rounded-full transition-colors ${
                isMuted ? 'bg-red-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOffIcon /> : <MicIcon />}
            </button>
            <button
              onClick={endCall}
              className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
              aria-label="End call"
            >
              <PhoneOffIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Utility ---

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// --- Icons ---

function PhoneIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" strokeWidth={1.5} />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  );
}

function AttachIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function VideoCameraOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-.409l-7.5-7.5M3.75 7.5l7.5 7.5" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 19L5 5m14 0v6a3 3 0 01-5.356 1.857M12 19.5v2m-3.75 0h7.5M8 11V5a4 4 0 018 0v1M6 11a6 6 0 009.352 4.985" />
    </svg>
  );
}

export default MessagesPage;
