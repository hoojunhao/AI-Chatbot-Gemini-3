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
  Compass,
  LogOut,
  LogIn
} from 'lucide-react';
import Auth from './Auth';
import Sidebar from './Sidebar';
import SettingsModal from './SettingsModal';
import ModelSelector from './ModelSelector';
import MarkdownRenderer from './MarkdownRenderer';
import { generateResponseStream } from '../services/geminiService';
import { AppSettings, ChatSession, Message, ModelType } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { SettingsService } from '../services/settingsService';
import { ChatService } from '../services/chatService';
import ChatMessage from './ChatMessage';

// Safely retrieve API Key
const getApiKey = () => {
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

function GeminiChat() {
  const { user, signOut } = useAuth();
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Initialize sidebar state based on screen size
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1000;
    }
    return true;
  });

  // Handle responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      // Only auto-collapse when window becomes narrow
      if (window.innerWidth < 1000) {
        setIsSidebarOpen(false);
      }
      // Don't auto-expand when window becomes wide - let user control it
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initialize theme from local storage or system preference
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('gemini_theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

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

  // Audio State
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textBeforeRecordingRef = useRef<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Sync URL sessionId with state
  useEffect(() => {
    setCurrentSessionId(sessionId || null);
  }, [sessionId]);

  // Initialize Sessions
  useEffect(() => {
    if (user) {
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
        behavior: 'smooth'
      });
    }
  };

  const createNewSession = async () => {
    navigate('/app');
    setInput('');
    setAttachments([]);
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
          activeSessionId = await ChatService.createSession(user.id, input.slice(0, 30) || 'New Chat');
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
          isPinned: false
        };
        setSessions(prev => [newSession, ...prev]);

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

      const stream = generateResponseStream(
        apiKey,
        settings,
        existingMessages,
        currentInput,
        currentAttachments
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
      }

      if (activeSessionId && user) {
        ChatService.saveMessage(activeSessionId, 'model', fullResponse)
          .catch(err => console.error("Failed to save model message", err));
      }

    } catch (error) {
      console.error("Error generating response:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          const msgs = [...s.messages];
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg.id === modelMsgId) {
            lastMsg.text = `Error: ${errorMessage}. Please check your connection and API Key.`;
            lastMsg.isError = true;
          }
          return { ...s, messages: msgs };
        }
        return s;
      }));

      if (activeSessionId && user) {
        ChatService.saveMessage(activeSessionId, 'model', `Error: ${errorMessage}`, undefined, true)
          .catch(err => console.error("Failed to save error message", err));
      }

    } finally {
      setIsGenerating(false);
      setIsGenerating(false);
      // scrollToBottom(); // Removed force scroll at end to preserve reading position
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
        onSelectSession={(id) => navigate(`/app/${id}`)}
        onNewChat={createNewSession}
        onDeleteSession={deleteSession}
        onTogglePinSession={togglePinSession}
        onRenameSession={renameSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDarkMode={isDarkMode}
        toggleTheme={() => setIsDarkMode(!isDarkMode)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-full w-full">
        {/* Top Header */}
        <div className="flex items-center p-3 sticky top-0 bg-white/80 dark:bg-[#131314]/80 backdrop-blur-md z-10">


          <span className="text-xl font-medium text-gray-700 dark:text-gray-200 ml-1">Gemini</span>




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

        {/* Chat Area */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700"
        >
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="mb-8 relative scale-150">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-red-500 blur-xl opacity-20 absolute inset-0"></div>
                <img
                  src="https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg"
                  alt="AI icon"
                  className="w-16 h-16 relative z-10"
                />
              </div>
              <h1 className="text-4xl md:text-5xl font-medium mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-red-500">
                Hello, Human.
              </h1>
              <p className="text-xl text-gray-500 dark:text-gray-400 mb-8 max-w-lg">
                How can I help you today?
              </p>
              <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
                {['Explain quantum physics', 'Write a React component', 'Plan a trip to Tokyo', 'Debug this code'].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="px-4 py-2 bg-gray-50 dark:bg-[#1e1f20] hover:bg-gray-100 dark:hover:bg-[#333] rounded-full text-sm text-gray-600 dark:text-gray-300 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-[#444]"
                  >
                    <Compass className="w-4 h-4 inline-block mr-2 text-blue-500" />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto w-full pb-32 pt-8 px-4">
              {currentSession.messages.map((msg, idx) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-[#131314]/90 backdrop-blur-md pt-2 pb-6 px-4">
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
                 ${isGenerating ? 'bg-gray-50 dark:bg-[#1e1f20] border-gray-200 dark:border-[#333]' : 'bg-[#f0f4f9] dark:bg-[#1e1f20] border-transparent focus-within:bg-white dark:focus-within:bg-[#1e1f20] focus-within:border-gray-300 dark:focus-within:border-[#444]'}
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
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask Gemini"
                className="flex-1 max-h-[150px] py-2.5 bg-transparent border-none outline-none resize-none text-gray-800 dark:text-gray-100 placeholder-gray-500 leading-6"
                rows={1}
              />


              <div className="flex items-center mr-2">
                <ModelSelector
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
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
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />
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