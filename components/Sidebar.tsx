import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Settings, 
  Menu, 
  Search, 
  Trash2,
  Moon,
  Sun,
  Pin,
  Pencil
} from 'lucide-react';
import { SidebarProps, ChatSession } from '../types';

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  toggleSidebar,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onTogglePinSession,
  onRenameSession,
  onOpenSettings,
  isDarkMode,
  toggleTheme,
  location
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredSessions = sessions.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pinnedSessions = filteredSessions.filter(s => s.isPinned);
  const unpinnedSessions = filteredSessions.filter(s => !s.isPinned);

  const handleStartEdit = (session: ChatSession, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveEdit = () => {
    if (editingSessionId && editTitle.trim()) {
        onRenameSession(editingSessionId, editTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') setEditingSessionId(null);
  };

  const renderSessionRow = (session: ChatSession) => (
    <div 
      key={session.id}
      className={`
        group flex items-center gap-3 px-3 py-2 rounded-full cursor-pointer
        text-sm text-gray-700 dark:text-gray-200
        transition-colors
        ${currentSessionId === session.id 
          ? 'bg-[#d3e3fd] dark:bg-[#004a77] font-medium' 
          : 'hover:bg-gray-200 dark:hover:bg-[#333]'
        }
      `}
      onClick={() => {
        onSelectSession(session.id);
        if (window.innerWidth < 768) toggleSidebar();
      }}
    >
      <MessageSquare className="w-4 h-4 shrink-0 text-gray-500" />
      
      {editingSessionId === session.id ? (
        <input
            autoFocus
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent border-b-2 border-blue-500 focus:outline-none text-sm min-w-0"
        />
      ) : (
        <span className="flex-1 truncate">{session.title}</span>
      )}
      
      <div className={`flex items-center gap-1 ${session.isPinned || editingSessionId === session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
         {!editingSessionId && (
            <>
                <button 
                    onClick={(e) => handleStartEdit(session, e)}
                    className="p-1 hover:bg-gray-300 dark:hover:bg-[#444] rounded-full text-gray-500"
                    title="Rename chat"
                >
                    <Pencil className="w-3 h-3" />
                </button>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        const willPin = !session.isPinned;
                        onTogglePinSession(session.id);
                        if (willPin) {
                            handleStartEdit(session, null);
                        }
                    }}
                    className={`p-1 hover:bg-gray-300 dark:hover:bg-[#444] rounded-full ${session.isPinned ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500'}`}
                    title={session.isPinned ? "Unpin chat" : "Pin chat"}
                >
                    <Pin className={`w-3 h-3 ${session.isPinned ? 'fill-current' : ''}`} />
                </button>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                    }}
                    className="p-1 hover:bg-gray-300 dark:hover:bg-[#444] rounded-full"
                    title="Delete chat"
                >
                    <Trash2 className="w-3 h-3 text-gray-500" />
                </button>
            </>
         )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50
        flex flex-col
        w-80 h-full
        bg-[#f0f4f9] dark:bg-[#1e1f20]
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <button 
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-200 dark:hover:bg-[#333] rounded-full transition-colors md:hidden"
          >
            <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
          <div className="flex-1 md:ml-2">
           <span className="font-medium text-gray-600 dark:text-gray-300 text-sm tracking-wide">GEMINI</span>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="px-4 mb-4">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) toggleSidebar();
            }}
            className="
              flex items-center gap-3 w-full p-3 
              bg-[#dfe4ea] dark:bg-[#333537] 
              hover:bg-[#d0d6dd] dark:hover:bg-[#434547]
              rounded-full transition-all duration-200
              text-gray-600 dark:text-gray-200 font-medium text-sm
            "
          >
            <Plus className="w-5 h-5" />
            <span className="flex-1 text-left">New chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 mb-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input 
                    type="text" 
                    placeholder="Search" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-transparent rounded-full text-sm text-gray-700 dark:text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
            </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {pinnedSessions.length > 0 && (
            <>
               <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 mt-2">Pinned</div>
               {pinnedSessions.map(renderSessionRow)}
            </>
          )}

          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 mt-2">Recent</div>
          {unpinnedSessions.map(renderSessionRow)}

          {filteredSessions.length === 0 && (
              <div className="px-4 text-xs text-gray-400 italic">No chats found</div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-2 mt-auto border-t border-gray-200 dark:border-[#333]">
          <button 
            onClick={onOpenSettings}
            className="flex items-center gap-3 w-full p-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#333] text-sm text-gray-700 dark:text-gray-200 transition-colors"
          >
            <Settings className="w-5 h-5 text-gray-500" />
            <span>Settings</span>
          </button>

          <button 
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full p-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-[#333] text-sm text-gray-700 dark:text-gray-200 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-gray-500" /> : <Moon className="w-5 h-5 text-gray-500" />}
            <span>{isDarkMode ? 'Light theme' : 'Dark theme'}</span>
          </button>

          <div className="flex items-center gap-2 mt-2 px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500">{location}</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;