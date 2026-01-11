import React, { useState, useEffect } from 'react';
import { X, Trash2, Pin, PinOff, Edit3, Check, Search, AlertTriangle, Brain } from 'lucide-react';
import { UserMemory, MemoryCategory } from '../types';
import { getMemoryService } from '../services/memoryService';

interface MemoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  apiKey: string;
}

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  personal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  preference: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  interest: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  project: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  technical: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  general: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal: 'Personal',
  preference: 'Preference',
  interest: 'Interest',
  project: 'Project',
  technical: 'Technical',
  general: 'General',
};

const MemoryManagerModal: React.FC<MemoryManagerModalProps> = ({
  isOpen,
  onClose,
  userId,
  apiKey,
}) => {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, userId]);

  const loadMemories = async () => {
    setLoading(true);
    setError(null);
    try {
      const memoryService = getMemoryService(apiKey);
      const data = await memoryService.getAllMemories(userId);
      setMemories(data);
    } catch (err) {
      setError('Failed to load memories');
      console.error('Load memories error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (memoryId: string) => {
    try {
      const memoryService = getMemoryService(apiKey);
      await memoryService.deleteMemory(memoryId);
      setMemories(prev => prev.filter(m => m.id !== memoryId));
    } catch (err) {
      console.error('Delete memory error:', err);
    }
  };

  const handleTogglePin = async (memoryId: string) => {
    try {
      const memoryService = getMemoryService(apiKey);
      await memoryService.togglePinMemory(memoryId);
      setMemories(prev => prev.map(m =>
        m.id === memoryId ? { ...m, isPinned: !m.isPinned } : m
      ));
    } catch (err) {
      console.error('Toggle pin error:', err);
    }
  };

  const handleEdit = (memory: UserMemory) => {
    setEditingId(memory.id);
    setEditText(memory.factText);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;

    try {
      const memoryService = getMemoryService(apiKey);
      await memoryService.editMemory(editingId, editText.trim());
      setMemories(prev => prev.map(m =>
        m.id === editingId ? { ...m, factText: editText.trim() } : m
      ));
      setEditingId(null);
      setEditText('');
    } catch (err) {
      console.error('Edit memory error:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      const memoryService = getMemoryService(apiKey);
      await memoryService.clearAllMemories(userId);
      setMemories([]);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Clear all memories error:', err);
    }
  };

  const filteredMemories = memories
    .filter(m => selectedCategory === 'all' || m.category === selectedCategory)
    .filter(m => m.factText.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Pinned first, then by creation date
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1e1f20] rounded-3xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#333]">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-medium text-gray-800 dark:text-gray-100">Your Memories</h2>
              <p className="text-xs text-gray-500">Facts remembered across conversations</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#333] rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search and Filter */}
        <div className="p-4 border-b border-gray-100 dark:border-[#333] space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 dark:bg-[#2a2b2d] border border-gray-200 dark:border-[#444] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-[#333] dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#444]'
              }`}
            >
              All ({memories.length})
            </button>
            {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(cat => {
              const count = memories.filter(m => m.category === cat).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white'
                      : `${CATEGORY_COLORS[cat]} hover:opacity-80`
                  }`}
                >
                  {CATEGORY_LABELS[cat]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-40 text-red-500">
              <AlertTriangle className="w-5 h-5 mr-2" />
              {error}
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <Brain className="w-12 h-12 mb-2 opacity-30" />
              <p>No memories yet</p>
              <p className="text-xs mt-1">Start chatting and I'll remember important things about you</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemories.map(memory => (
                <div
                  key={memory.id}
                  className={`p-4 rounded-xl border transition-all ${
                    memory.isPinned
                      ? 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-900/10 dark:border-yellow-600/50'
                      : 'border-gray-200 dark:border-[#444] hover:border-gray-300 dark:hover:border-[#555]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {editingId === memory.id ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="flex-1 px-3 py-1 rounded-lg bg-gray-50 dark:bg-[#2a2b2d] border border-gray-200 dark:border-[#444] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={handleSaveEdit}
                            className="p-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{memory.factText}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[memory.category]}`}>
                              {CATEGORY_LABELS[memory.category]}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(memory.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {editingId !== memory.id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTogglePin(memory.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            memory.isPinned
                              ? 'text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
                              : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333]'
                          }`}
                          title={memory.isPinned ? 'Unpin' : 'Pin'}
                        >
                          {memory.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(memory)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-blue-500"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(memory.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333] hover:text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-[#333] flex items-center justify-between">
          {showClearConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-500">Clear all memories?</span>
              <button
                onClick={handleClearAll}
                className="px-4 py-1.5 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600"
              >
                Yes, clear all
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-1.5 bg-gray-200 dark:bg-[#333] text-gray-700 dark:text-gray-300 rounded-full text-sm font-medium hover:bg-gray-300 dark:hover:bg-[#444]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={memories.length === 0}
              className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear all memories
            </button>
          )}

          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default MemoryManagerModal;
