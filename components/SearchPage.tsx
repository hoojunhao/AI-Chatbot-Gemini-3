import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, MessageSquare, Clock } from 'lucide-react';
import { ChatSession } from '../types';
import { getDateLabel, groupByDate } from '../utils/dateGrouping';

const MAX_RECENT_CHATS = 13;

interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  matchType: 'title' | 'message';
  matchedText: string;
  highlightedText: string;
  messagePreview?: string;
  timestamp: number;
}

interface SearchPageProps {
  sessions: ChatSession[];
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

const SearchPage: React.FC<SearchPageProps> = ({
  sessions,
  onSelectSession,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Search logic - returns results when query is present (one result per session)
  const searchResults = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];
    const matchedSessionIds = new Set<string>();

    sessions.forEach(session => {
      // Skip if already matched this session
      if (matchedSessionIds.has(session.id)) return;

      // Search session title first
      if (session.title.toLowerCase().includes(lowerQuery)) {
        matchedSessionIds.add(session.id);
        results.push({
          sessionId: session.id,
          sessionTitle: session.title,
          matchType: 'title',
          matchedText: session.title,
          highlightedText: highlightMatch(session.title, query),
          timestamp: session.updatedAt,
        });
        return; // Only one result per session
      }

      // Search messages (strip thinking tags)
      for (const msg of session.messages) {
        const textWithoutThinking = stripThinkingTags(msg.text);
        if (textWithoutThinking.toLowerCase().includes(lowerQuery)) {
          matchedSessionIds.add(session.id);
          const preview = extractPreview(textWithoutThinking, query, 100);
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            matchType: 'message',
            matchedText: textWithoutThinking,
            highlightedText: highlightMatch(preview, query),
            messagePreview: preview,
            timestamp: msg.timestamp,
          });
          break; // Only one result per session
        }
      }
    });

    // Sort by timestamp descending
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }, [query, sessions]);

  // Recent sessions for default view (no query) - limited to MAX_RECENT_CHATS
  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECENT_CHATS);
  }, [sessions]);

  // Group recent sessions by date
  const groupedRecentSessions = useMemo(() => {
    return groupByDate(recentSessions, (s) => s.updatedAt);
  }, [recentSessions]);

  // Group search results by date
  const groupedSearchResults = useMemo(() => {
    return groupByDate(searchResults, (r) => r.timestamp);
  }, [searchResults]);

  const handleResultClick = (sessionId: string) => {
    onSelectSession(sessionId);
  };

  const handleSessionClick = (sessionId: string) => {
    onSelectSession(sessionId);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-[#131314]">
      {/* Search Header */}
      <div className="sticky top-0 bg-white dark:bg-[#131314] z-10 p-6 pb-4 pt-0">
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-normal text-gray-800 dark:text-gray-100 mb-6">Search</h1>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search for chats"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-12 pr-12 py-3 bg-white dark:bg-transparent rounded-full
                         text-gray-800 dark:text-gray-100 placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-blue-500/50
                         text-base border border-gray-300 dark:border-[#444]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1
                           hover:bg-gray-200 dark:hover:bg-[#333] rounded-full"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="max-w-xl mx-auto">
          {!query.trim() ? (
            // Default view - Recent chats grouped by date
            sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <MessageSquare className="w-12 h-12 mb-4 opacity-30" />
                <p>No chats yet</p>
                <p className="text-sm mt-1">Start a conversation to see it here</p>
              </div>
            ) : (
              <div className="space-y-6">
                <h2 className="text-base font-medium text-gray-700 dark:text-gray-300">Recent</h2>
                {Array.from(groupedRecentSessions.entries()).map(([dateLabel, sessionsInGroup]) => (
                  <div key={dateLabel}>
                    {/* Date label shown on the right */}
                    <div className="space-y-1">
                      {sessionsInGroup.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => handleSessionClick(session.id)}
                          className="w-full flex items-center justify-between p-4 rounded-xl
                                     hover:bg-gray-100 dark:hover:bg-[#1e1f20]
                                     transition-colors text-left group"
                        >
                          <span className="text-gray-800 dark:text-gray-200 truncate flex-1 pr-4">
                            {session.title}
                          </span>
                          <span className="text-sm text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {dateLabel}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : searchResults.length === 0 ? (
            // No search results
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Search className="w-12 h-12 mb-4 opacity-30" />
              <p>No results found for "{query}"</p>
              <p className="text-sm mt-1">Try different keywords</p>
            </div>
          ) : (
            // Search results grouped by date
            <div className="space-y-6">
              {Array.from(groupedSearchResults.entries()).map(([dateLabel, resultsInGroup]) => (
                <div key={dateLabel}>
                  {/* Group Header */}
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 px-2">
                    {dateLabel}
                  </h3>

                  {/* Results in group */}
                  <div className="space-y-2">
                    {resultsInGroup.map((result, idx) => (
                      <button
                        key={`${result.sessionId}-${result.matchType}-${idx}`}
                        onClick={() => handleResultClick(result.sessionId)}
                        className="w-full text-left p-4 rounded-xl
                                   bg-gray-50 dark:bg-[#1e1f20]
                                   hover:bg-gray-100 dark:hover:bg-[#2a2b2d]
                                   transition-colors"
                      >
                        {/* Session title */}
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate">
                            {result.sessionTitle}
                          </span>
                        </div>

                        {/* Match preview */}
                        <p
                          className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 ml-6"
                          dangerouslySetInnerHTML={{ __html: result.highlightedText }}
                        />

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 mt-2 ml-6 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatTimestamp(result.timestamp)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper functions
function highlightMatch(text: string, query: string): string {
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-700 px-0.5 rounded">$1</mark>');
}

function extractPreview(text: string, query: string, maxLength: number): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text.slice(0, maxLength);

  // Show context around match
  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(text.length, matchIndex + query.length + 60);

  let preview = text.slice(start, end);
  if (start > 0) preview = '...' + preview;
  if (end < text.length) preview = preview + '...';

  return preview;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function stripThinkingTags(text: string): string {
  // Remove <thinking>...</thinking> content from text
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

export default SearchPage;
