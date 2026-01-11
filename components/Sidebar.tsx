import React, { useState, useEffect } from 'react';
import {
  Plus,
  MessageSquareMore,
  Settings,
  Menu,
  Search,
  Trash2,
  Pin,
  Pencil,
  LogIn,
  SquarePen,
  MoreVertical,
  Share2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SidebarProps, ChatSession } from '../types';
import SettingsPopup from './SettingsPopup';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { SIDEBAR_LAZY_LOAD_CONFIG } from '../constants';

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
  onOpenSearch,
  isDarkMode,
  themePreference,
  setThemePreference,
  userLocation,
  locationLoading,
  onUpdateLocation,
  isTemporaryMode,
  onToggleTemporaryMode,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSettingsPopupOpen, setIsSettingsPopupOpen] = useState(false);

  // Filter out temporary sessions from sidebar display
  const visibleSessions = sessions.filter(s => !s.isTemporary);
  const pinnedSessions = visibleSessions.filter(s => s.isPinned);
  const unpinnedSessions = visibleSessions.filter(s => !s.isPinned);

  // Lazy load unpinned sessions for better performance with many chats
  const {
    visibleItems: visibleUnpinnedSessions,
    sentinelRef,
    hasMore,
  } = useInfiniteScroll(unpinnedSessions, SIDEBAR_LAZY_LOAD_CONFIG);

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
      onClick={() => onSelectSession(session.id)}
    >
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

      <div className={`flex items-center gap-1 ${editingSessionId === session.id ? 'opacity-100' : session.isPinned && openMenuId !== session.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity relative`}>
        {!editingSessionId && (
          <>
            {/* Pin icon - show when pinned and not hovering/menu closed */}
            {session.isPinned && openMenuId !== session.id && (
              <div className="p-1 group-hover:hidden">
                <Pin className="w-4 h-4 text-gray-500 fill-current" />
              </div>
            )}

            {/* 3-dots button - hidden when pinned and not hovering */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(openMenuId === session.id ? null : session.id);
              }}
              className={`p-1 hover:bg-gray-300 dark:hover:bg-[#444] rounded-full text-gray-500 transition-colors ${session.isPinned && openMenuId !== session.id ? 'hidden group-hover:block' : ''}`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {openMenuId === session.id && (
              <div
                className="absolute right-0 top-8 z-50 w-32 bg-[#eef3f8] dark:bg-[#2e2f31] rounded-lg shadow-lg py-1 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const willPin = !session.isPinned;
                    onTogglePinSession(session.id);
                    setOpenMenuId(null);
                    if (willPin) {
                      handleStartEdit(session, e);
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#dde3ea] dark:hover:bg-[#3c3d3f] w-full text-left"
                >
                  <Pin className={`w-4 h-4 ${session.isPinned ? 'fill-current' : ''}`} />
                  {session.isPinned ? "Unpin" : "Pin"}
                </button>
                <button
                  onClick={(e) => {
                    handleStartEdit(session, e);
                    setOpenMenuId(null);
                  }}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#dde3ea] dark:hover:bg-[#3c3d3f] w-full text-left"
                >
                  <Pencil className="w-4 h-4" />
                  Rename
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-[#dde3ea] dark:hover:bg-[#3c3d3f] w-full text-left"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar Container - Always visible, responsive width */}
      <div className={`
        flex flex-col
        ${isOpen ? 'w-[306px]' : 'w-[72px]'}
        h-full
        bg-[#E9EEF6] dark:bg-[#1e1f20]
        transition-all duration-300
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="w-[40px] flex justify-center shrink-0">
            <button onClick={toggleSidebar} className="p-2 hover:bg-gray-200 dark:hover:bg-[#333] rounded-full text-gray-500">
              <Menu className="w-5 h-5" />
            </button>
          </div>
          {user && (
            <div className={`flex items-center gap-1 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              {/* Temporary Chat Toggle */}
              <button
                onClick={onToggleTemporaryMode}
                className={`
                  p-2 rounded-full transition-colors
                  ${isTemporaryMode
                    ? 'bg-[#d3e3fd] dark:bg-[#004a77] text-blue-600 dark:text-blue-300'
                    : 'hover:bg-gray-200 dark:hover:bg-[#333] text-gray-500'}
                `}
                title="Temporary chat"
              >
                <MessageSquareMore className="w-5 h-5" />
              </button>
              {/* Search */}
              <button
                onClick={onOpenSearch}
                className="p-2 hover:bg-gray-200 dark:hover:bg-[#333] rounded-full text-gray-500"
                title="Search"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* New Chat Button */}
        <div className="px-4 mb-4">
          <button
            onClick={onNewChat}
            className="flex items-center gap-3 w-full py-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#333] text-gray-600 dark:text-gray-200 transition-colors font-medium text-sm"
            title={!isOpen ? "New chat" : undefined}
          >
            <div className="w-[40px] flex justify-center shrink-0">
              <SquarePen className="w-5 h-5" />
            </div>
            <span className={`flex-1 text-left whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>New chat</span>
          </button>
        </div>

        {/* Sessions List or Guest Promo */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {user && isOpen ? (
            <>
              <div className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mt-2">Chats</div>
              {pinnedSessions.map(renderSessionRow)}
              {visibleUnpinnedSessions.map(renderSessionRow)}

              {/* Sentinel for lazy loading more unpinned sessions */}
              {hasMore && (
                <div
                  ref={sentinelRef}
                  className="h-8 flex items-center justify-center"
                >
                  <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {sessions.length === 0 && (
                <div className="px-4 text-xs text-gray-400 italic">No chats yet</div>
              )}
            </>
          ) : (
            isOpen && (
              <div className="mx-2 mt-4 p-4 bg-[#e7ebf0] dark:bg-[#282a2c] rounded-2xl">
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-2">Sign in to start saving your chats</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                  Once you're signed in, you can access your recent chats here.
                </p>
                <button
                  onClick={() => navigate('/auth')}
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Sign in
                </button>
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-2 mt-auto border-t border-gray-200 dark:border-[#333]">
          {user && (
            <div className="relative">
              <button
                onClick={() => setIsSettingsPopupOpen(!isSettingsPopupOpen)}
                className="flex items-center gap-3 w-full py-2 rounded-full hover:bg-gray-200 dark:hover:bg-[#333] text-sm text-gray-700 dark:text-gray-200 transition-colors"
                title={!isOpen ? "Settings" : undefined}
              >
                <div className="w-[40px] flex justify-center shrink-0">
                  <Settings className="w-5 h-5 text-gray-500" />
                </div>
                <span className={`whitespace-nowrap transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>Settings</span>
              </button>

              <SettingsPopup
                isOpen={isSettingsPopupOpen}
                onClose={() => setIsSettingsPopupOpen(false)}
                onOpenPreferences={onOpenSettings}
                themePreference={themePreference}
                onSetThemePreference={setThemePreference}
                userLocation={userLocation}
                locationLoading={locationLoading}
                onUpdateLocation={onUpdateLocation}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;