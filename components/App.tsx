import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Menu,
  Send,
  Mic,
  Image as ImageIcon,
  StopCircle,
  Paperclip,
  X,
  LogOut,
  LogIn,
  MessageSquareMore
} from 'lucide-react';
import Auth from './Auth';
import Sidebar from './Sidebar';
import SettingsModal from './SettingsModal';
import MemoryManagerModal from './MemoryManagerModal';
import ModelSelector from './ModelSelector';
import MarkdownRenderer from './MarkdownRenderer';
import { GeminiApiError, generateResponseStream } from '../services/geminiService';
import { AppSettings, ChatSession, Message, ModelType, ParsedGeminiError, ErrorRecoveryAction, GeminiErrorType, UserLocation, ThemePreference } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { SettingsService } from '../services/settingsService';
import { ChatService } from '../services/chatService';
import { LocationService } from '../services/locationService';
import ChatMessage from './ChatMessage';
import { ErrorMessage } from './ErrorMessage';
import { parseGeminiError, formatErrorForChat } from '../services/errorService';
import { useSessionSynopsis } from '../hooks/useSessionSynopsis';
import SearchPage from './SearchPage';

// Safely retrieve API Key
const getApiKey = () => {
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

function GeminiChat() {
  const { user, signOut, userName } = useAuth();
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Initialize sidebar state based on screen size
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 900;
    }
    return true;
  });

  // Handle responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      // Only auto-collapse when window becomes narrow
      if (window.innerWidth < 900) {
        setIsSidebarOpen(false);
      }
      // Don't auto-expand when window becomes wide - let user control it
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemoryManagerOpen, setIsMemoryManagerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Initialize theme preference from local storage
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gemini_theme_preference');
      if (saved === 'system' || saved === 'light' || saved === 'dark') return saved;
      // Migrate from old theme setting
      const oldTheme = localStorage.getItem('gemini_theme');
      if (oldTheme === 'dark') return 'dark';
      if (oldTheme === 'light') return 'light';
      return 'system';
    }
    return 'system';
  });

  // Compute isDarkMode from preference (with system preference listener)
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const computeDarkMode = () => {
      if (themePreference === 'dark') return true;
      if (themePreference === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    };

    setIsDarkMode(computeDarkMode());

    // Listen for system preference changes when in system mode
    if (themePreference === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => setIsDarkMode(computeDarkMode());
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [themePreference]);

  // Save theme preference to localStorage
  useEffect(() => {
    localStorage.setItem('gemini_theme_preference', themePreference);
  }, [themePreference]);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Location State
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // Load IP-based location on mount (no permission needed)
  useEffect(() => {
    LocationService.getLocationFromIP()
      .then(location => {
        setUserLocation(location);
        console.log('📍 Location loaded:', location.displayName);
      })
      .catch(err => {
        console.error('Failed to get location:', err);
      })
      .finally(() => {
        setLocationLoading(false);
      });
  }, []);

  // Handler for "Update location" - uses browser geolocation (requires permission)
  const handleUpdateLocation = async () => {
    setLocationLoading(true);
    try {
      const location = await LocationService.getLocationFromBrowser();
      setUserLocation(location);
      console.log('📍 Location updated via GPS:', location.displayName);
    } catch (err) {
      console.error('Failed to update location:', err);
      // Keep the previous IP-based location on failure
    } finally {
      setLocationLoading(false);
    }
  };

  // Load settings from Supabase on login
  useEffect(() => {
    if (user) {
      SettingsService.fetchSettings(user.id).then(savedSettings => {
        if (savedSettings) {
          setSettings(savedSettings);
        }
      });
    }
  }, [user]);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (user) {
      SettingsService.updateSettings(user.id, newSettings).catch(err =>
        console.error("Failed to save settings:", err)
      );
    }
  };

  // Chat State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  // currentSessionId is synced with URL
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [attachments, setAttachments] = useState<{ mimeType: string; data: string; name: string }[]>([]);
  const [lastError, setLastError] = useState<ParsedGeminiError | null>(null);
  const [isTemporaryMode, setIsTemporaryMode] = useState(false);

  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textBeforeRecordingRef = useRef<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Session Synopsis Hook - generates lightweight synopses for Session RAG
  // Triggers on session switch and idle timeout (60 min)
  useSessionSynopsis({
    currentSessionId,
    sessions,
    apiKey: getApiKey(),
    userId: user?.id,
    enabled: !!user && settings.enableCrossSessionMemory
  });

  // Sync URL sessionId with state
  useEffect(() => {
    setCurrentSessionId(sessionId || null);
  }, [sessionId]);

  // Initialize Sessions
  useEffect(() => {
    if (user) {
      // Cleanup expired temporary sessions on app load
      ChatService.cleanupExpiredTemporarySessions(user.id)
        .catch(err => console.warn('Temporary chat cleanup failed:', err));

      ChatService.fetchSessions(user.id)
        .then(fetchedSessions => {
          setSessions(fetchedSessions);

          // Note: We deliberately DO NOT auto-select the first session here if !sessionId.
          // This ensures /app loads as "New Chat" (empty state) as requested.
        })
        .catch(err => console.error("Failed to load sessions:", err));
    } else {
      setSessions([]);
      setCurrentSessionId(null);
    }
  }, [user]);

  // Handle Theme Side Effects
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('gemini_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('gemini_theme', 'light');
    }
  }, [isDarkMode]);

  // Scroll to bottom when a new message is added (count increases)
  useEffect(() => {
    if (sessions.length > 0 && currentSessionId) {
      const currentSession = sessions.find(s => s.id === currentSessionId);
      if (currentSession) {
        // Only scroll if we haven't seen this message count before
        scrollToBottom();
      }
    }
  }, [sessions.length, currentSessionId, sessions.find(s => s.id === currentSessionId)?.messages.length]);


  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight } = chatContainerRef.current;
      const maxScrollTop = scrollHeight - clientHeight;

      chatContainerRef.current.scrollTo({
        top: maxScrollTop,
        behavior: isGenerating ? 'auto' : 'smooth'
      });
    }
  };

  const createNewSession = async () => {
    navigate('/app');
    setInput('');
    setAttachments([]);
    setIsTemporaryMode(false);  // Reset temporary mode when starting a new chat
    setIsSearchOpen(false);     // Close search page when starting a new chat
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      navigate('/app');
    }
    ChatService.deleteSession(id).catch(err => console.error("Failed to delete session", err));
  };

  const togglePinSession = (id: string) => {
    setSessions(prev => {
      const session = prev.find(s => s.id === id);
      if (session) {
        ChatService.updateSession(id, { is_pinned: !session.isPinned })
          .catch(err => console.error("Failed to pin session", err));
      }
      return prev.map(s =>
        s.id === id ? { ...s, isPinned: !s.isPinned } : s
      );
    });
  };

  const renameSession = (id: string, newTitle: string) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, title: newTitle } : s
    ));
    ChatService.updateSession(id, { title: newTitle })
      .catch(err => console.error("Failed to rename session", err));
  };

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const handleSendMessage = async () => {
    if ((!input.trim() && attachments.length === 0) || isGenerating) return;
    // Allow guest users to chat (no persistence)
    // if (!user) return;

    let activeSessionId = currentSessionId;

    // If no session is active, create one now
    if (!activeSessionId) {
      try {
        if (user) {
          activeSessionId = await ChatService.createSession(user.id, input.slice(0, 30) || 'New Chat', isTemporaryMode);
          navigate(`/app/${activeSessionId}`);
        } else {
          // Guest: Generate a random local ID
          activeSessionId = Date.now().toString();
          setCurrentSessionId(activeSessionId);
        }

        const newSession: ChatSession = {
          id: activeSessionId,
          title: input.slice(0, 30) || 'New Chat',
          messages: [],
          updatedAt: Date.now(),
          isPinned: false,
          isTemporary: isTemporaryMode
        };
        // Add to sessions list (temp sessions are filtered out in Sidebar)
        setSessions(prev => [newSession, ...prev]);

        // Reset temporary mode after creating session
        if (isTemporaryMode) {
          setIsTemporaryMode(false);
        }

      } catch (error) {
        console.error("Failed to create session", error);
        return;
      }
    }

    const userMsgId = Date.now().toString(); // Optimistic ID
    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      text: input,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined
    };

    setSessions(prev => {
      return prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            messages: [...s.messages, userMessage],
            title: s.messages.length === 0 ? (input.slice(0, 30) || 'New Conversation') : s.title,
            updatedAt: Date.now()
          };
        }
        return s;
      });
    });

    const currentInput = input;
    const currentAttachments = [...attachments];

    setInput('');
    setAttachments([]);
    setIsGenerating(true);

    const modelMsgId = (Date.now() + 1).toString();

    setSessions(prev => prev.map(s => {
      if (s.id === activeSessionId) {
        return {
          ...s,
          messages: [...s.messages, {
            id: modelMsgId,
            role: 'model',
            text: '',
            timestamp: Date.now()
          }]
        };
      }
      return s;
    }));

    if (user) {
      ChatService.saveMessage(activeSessionId, 'user', currentInput, currentAttachments.length > 0 ? currentAttachments : undefined)
        .catch(err => console.error("Failed to save user message", err));
    }

    try {
      const apiKey = getApiKey();
      if (!apiKey) throw new Error("API Key not found. Please ensure process.env.API_KEY is set.");

      const sessionInState = sessions.find(s => s.id === activeSessionId) ||
        (activeSessionId && activeSessionId === currentSessionId ? currentSession : undefined);

      const existingMessages = sessionInState ? sessionInState.messages : [];

      // Check if this is a temporary session
      const isSessionTemporary = currentSession?.isTemporary || isTemporaryMode;

      const stream = generateResponseStream(
        apiKey,
        settings,
        existingMessages,
        currentInput,
        currentAttachments,
        activeSessionId,  // Pass session ID for summarization (undefined for guest users)
        user?.id,         // Pass user ID for cross-session memory
        0,                // retryAttempt
        userLocation,     // User's location for context-aware responses
        isSessionTemporary  // Skip memory/summarization for temporary chats
      );

      let fullResponse = '';

      for await (const chunk of stream) {
        fullResponse += chunk;
        setSessions(prev => prev.map(s => {
          if (s.id === activeSessionId) {
            const msgs = [...s.messages];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg.id === modelMsgId) {
              lastMsg.text = fullResponse;
            }
            return { ...s, messages: msgs };
          }
          return s;
        }));

        // Scroll to follow streaming text as it appears
        scrollToBottom();
      }

      if (activeSessionId && user) {
        ChatService.saveMessage(activeSessionId, 'model', fullResponse)
          .catch(err => console.error("Failed to save model message", err));
      }

      // Clear any previous error on successful message
      setLastError(null);

    } catch (error) {
      console.error("Error generating response:", error);

      let parsedError: ParsedGeminiError;

      // Check if this is already a GeminiApiError with structured data
      if (error instanceof GeminiApiError) {
        parsedError = {
          type: error.type,
          message: error.message,
          userMessage: error.userMessage,
          suggestion: error.suggestion,
          retryable: error.retryable,
          httpCode: error.httpCode,
        };
      } else {
        // Parse generic errors
        parsedError = parseGeminiError(error);
      }

      // Store the error for UI display
      setLastError(parsedError);

      // Update the message in the chat to show error
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          const msgs = [...s.messages];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg && lastMsg.id === modelMsgId) {
            lastMsg.text = formatErrorForChat(parsedError);
            lastMsg.isError = true;
          }
          return { ...s, messages: msgs };
        }
        return s;
      }));

      // Save error message to database for logged-in users
      if (activeSessionId && user) {
        ChatService.saveMessage(activeSessionId, 'model', formatErrorForChat(parsedError), undefined, true)
          .catch(err => console.error("Failed to save error message", err));
      }

    } finally {
      setIsGenerating(false);
      setIsGenerating(false);
      // scrollToBottom(); // Removed force scroll at end to preserve reading position
    }
  };

  // Handle error recovery actions
  const handleErrorRecovery = (action: ErrorRecoveryAction['action']) => {
    switch (action) {
      case 'new_chat':
        // Navigate to new chat
        navigate('/app');
        setLastError(null);
        break;

      case 'retry':
        // Retry the last message
        if (currentSession && currentSession.messages.length >= 2) {
          const lastUserMsg = [...currentSession.messages]
            .reverse()
            .find(m => m.role === 'user' && !m.isError);
          if (lastUserMsg) {
            // Remove the error message and retry
            setSessions(prev => prev.map(s => {
              if (s.id === currentSessionId) {
                return {
                  ...s,
                  messages: s.messages.filter(m => !m.isError)
                };
              }
              return s;
            }));
            setInput(lastUserMsg.text);
            setLastError(null);
            // Trigger send
            setTimeout(() => handleSendMessage(), 100);
          }
        }
        break;

      case 'clear_context':
        // Clear older messages, keep recent 10
        if (currentSession) {
          const recentMessages = currentSession.messages.slice(-10);
          setSessions(prev => prev.map(s => {
            if (s.id === currentSessionId) {
              return { ...s, messages: recentMessages };
            }
            return s;
          }));
          setLastError(null);
        }
        break;

      case 'check_settings':
        // Open settings modal
        setIsSettingsOpen(true);
        setLastError(null);
        break;

      case 'wait':
        // Show countdown and auto-retry
        setLastError(null);
        setTimeout(() => {
          handleErrorRecovery('retry');
        }, 5000);
        break;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, {
          mimeType: file.type,
          data: base64String,
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    textBeforeRecordingRef.current = input;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      const prefix = textBeforeRecordingRef.current;
      const spacer = (prefix && !prefix.endsWith(' ') && transcript) ? ' ' : '';
      setInput(prefix + spacer + transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[#131314]">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={(id) => {
          navigate(`/app/${id}`);
          setIsSearchOpen(false);
        }}
        onNewChat={() => {
          createNewSession();
          setIsSearchOpen(false);
        }}
        onDeleteSession={deleteSession}
        onTogglePinSession={togglePinSession}
        onRenameSession={renameSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        isDarkMode={isDarkMode}
        themePreference={themePreference}
        setThemePreference={setThemePreference}
        userLocation={userLocation}
        locationLoading={locationLoading}
        onUpdateLocation={handleUpdateLocation}
        isTemporaryMode={isTemporaryMode}
        onToggleTemporaryMode={() => {
          setIsTemporaryMode(!isTemporaryMode);
          setIsSearchOpen(false);
        }}
      />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col relative h-full w-full transition-colors ${
        !currentSession || currentSession.messages.length === 0
          ? 'bg-[#F0F4F8] dark:bg-[#1e1f20]'
          : 'bg-white dark:bg-[#131314]'
      }`}>
        {/* Top Header - Always visible */}
        <div className={`flex items-center p-4 sticky top-0 backdrop-blur-md z-10 ${
          !currentSession || currentSession.messages.length === 0
            ? 'bg-[#F0F4F8]/80 dark:bg-[#1e1f20]/80'
            : 'bg-white/80 dark:bg-[#131314]/80'
        }`}>
          <span onClick={createNewSession} className="text-xl font-medium text-gray-700 dark:text-gray-200 ml-1 hover:opacity-80 transition-opacity cursor-pointer">Gemini</span>
          <div className="ml-auto">
            {user ? (
              <button
                onClick={() => signOut()}
                className="p-2 hover:bg-gray-100 dark:hover:bg-[#333] rounded-full text-gray-500"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors text-sm font-medium"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>

        {isSearchOpen ? (
          <SearchPage
            sessions={sessions}
            onSelectSession={(id) => {
              navigate(`/app/${id}`);
              setIsSearchOpen(false);
            }}
            onClose={() => setIsSearchOpen(false)}
          />
        ) : (
        <>
        {/* Chat Area */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700"
        >
          {!currentSession || currentSession.messages.length === 0 ? (
            isTemporaryMode && user ? (
              // Temporary Chat Mode Welcome Screen
              <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                <div className="mb-6">
                  <MessageSquareMore className="w-12 h-12 text-gray-400" />
                </div>
                <h1 className="text-2xl font-medium text-gray-800 dark:text-gray-100 mb-2">
                  Temporary chat
                </h1>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                  Temporary chats don't appear in Recent Chats and are saved for 72 hours.
                </p>
              </div>
            ) : (
              // Normal Welcome Screen
              <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
                <div className="mb-8 relative scale-150">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-red-500 blur-xl opacity-20 absolute inset-0"></div>
                  <img
                    src="https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg"
                    alt="AI icon"
                    className="w-16 h-16 relative z-10"
                  />
                </div>
                {/* Always render greeting to reserve space, animate when ready */}
                <div key={userName || 'guest'} className={user && !userName ? 'invisible' : ''}>
                  <h1 className="text-4xl md:text-5xl font-medium mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 pb-1 animate-fade-in-fast" style={{ opacity: 0 }}>
                    Hello, {userName || 'Human'}.
                  </h1>
                  <p className="text-xl text-gray-500 dark:text-gray-400 max-w-lg animate-fade-in-fast" style={{ animationDelay: '0.3s', opacity: 0 }}>
                    How can I help you today?
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="max-w-5xl mx-auto w-full pb-32 pt-8 px-4">
              {currentSession.messages.map((msg, idx) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error Message Display */}
        {lastError && (
          <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 max-w-lg w-full px-4 z-50">
            <ErrorMessage
              error={lastError}
              onAction={handleErrorRecovery}
            />
          </div>
        )}

        {/* Input Area */}
        <div className={`absolute bottom-0 left-0 right-0 backdrop-blur-md pt-2 pb-6 px-4 ${
          !currentSession || currentSession.messages.length === 0
            ? 'bg-[#F0F4F8]/90 dark:bg-[#1e1f20]/90'
            : 'bg-white/90 dark:bg-[#131314]/90'
        }`}>
          <div className="max-w-3xl mx-auto relative">
            {/* Active Attachments Preview */}
            {attachments.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto py-2">
                {attachments.map((att, i) => (
                  <div key={i} className="relative group shrink-0">
                    {att.mimeType.startsWith('image/') ? (
                      <img src={`data:${att.mimeType};base64,${att.data}`} className="h-16 w-16 object-cover rounded-md border border-gray-300 dark:border-gray-600" />
                    ) : (
                      <div className="h-16 w-16 bg-gray-200 dark:bg-gray-700 rounded-md flex items-center justify-center">
                        <Mic className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-2 -right-2 bg-gray-500 text-white rounded-full p-0.5 hover:bg-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              onPaste={(e) => {
                const items = e.clipboardData.items;
                Array.from(items).forEach(item => {
                  if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        const base64String = (reader.result as string).split(',')[1];
                        setAttachments(prev => [...prev, {
                          mimeType: file.type,
                          data: base64String,
                          name: file.name
                        }]);
                      };
                      reader.readAsDataURL(file);
                    }
                  }
                });
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                  Array.from(files).forEach((file: File) => {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        const base64String = (reader.result as string).split(',')[1];
                        setAttachments(prev => [...prev, {
                          mimeType: file.type,
                          data: base64String,
                          name: file.name
                        }]);
                      };
                      reader.readAsDataURL(file);
                    }
                  });
                }
              }}
              className={`
                 flex items-end gap-2 p-2 rounded-[28px] border transition-colors
                 ${isGenerating ? 'bg-gray-50 dark:bg-[#1e1f20] border-gray-200 dark:border-[#333]' : 'bg-white dark:bg-[#1e1f20] border-gray-200 dark:border-transparent focus-within:border-gray-300 dark:focus-within:border-[#444]'}
              `}>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-[#333] rounded-full transition-colors shrink-0"
                title="Upload image"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
              />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={isTemporaryMode && user ? "Ask questions in a temporary chat" : "Ask Gemini"}
                className="flex-1 max-h-[150px] py-2.5 bg-transparent border-none outline-none resize-none text-gray-800 dark:text-gray-100 placeholder-gray-500 leading-6"
                rows={1}
              />


              <div className="flex items-center mr-2">
                <ModelSelector
                  settings={settings}
                  onUpdateSettings={(newSettings) => {
                    handleUpdateSettings(newSettings);
                    // Refocus textarea after model change
                    setTimeout(() => {
                      textareaRef.current?.focus();
                    }, 0);
                  }}
                />
              </div>

              {input.trim() || attachments.length > 0 ? (
                <button
                  onClick={handleSendMessage}
                  disabled={isGenerating}
                  className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleMicClick}
                  className={`p-2.5 rounded-full transition-all duration-200 shrink-0 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-[#333]'}`}
                >
                  {isRecording ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
            </div>
            <div className="text-center mt-2">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Gemini may display inaccurate info, including about people, so double-check its responses.
              </p>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isLoggedIn={!!user}
        onOpenMemoryManager={() => setIsMemoryManagerOpen(true)}
      />

      {user && (
        <MemoryManagerModal
          isOpen={isMemoryManagerOpen}
          onClose={() => setIsMemoryManagerOpen(false)}
          userId={user.id}
          apiKey={getApiKey()}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/app" element={<GeminiChat />} />
      <Route path="/app/:sessionId" element={<GeminiChat />} />
      <Route path="/auth" element={<Auth />} />
    </Routes>
  );
}

export default App;