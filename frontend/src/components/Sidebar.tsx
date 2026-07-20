import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { useUIStore } from '../store/ui';
import { useWorkspaceStore } from '../store/workspace';
import { 
  MessageSquare, 
  FileText, 
  ShieldAlert, 
  Plus, 
  LogOut, 
  Sun, 
  Moon, 
  Edit3, 
  Trash2, 
  Check, 
  X,
  User as UserIcon,
  Search,
  Pin,
  Bookmark,
  Sparkles,
  Command
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  
  const { 
    conversations, 
    activeConversationId, 
    fetchConversations, 
    createConversation, 
    renameConversation, 
    deleteConversation, 
    setActiveConversationId 
  } = useChatStore();

  const {
    searchQuery,
    setSearchQuery,
    pinnedConversationIds,
    togglePinConversation,
    bookmarksOpen,
    setBookmarksOpen,
    addNotification
  } = useUIStore();

  const {
    workspaces,
    activeWorkspaceId,
    fetchWorkspaces,
    createWorkspace,
    deleteWorkspace,
    setActiveWorkspaceId
  } = useWorkspaceStore();

  const [darkMode, setDarkMode] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    fetchConversations();
    fetchWorkspaces();
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      setDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setDarkMode(false);
    }
  }, []);

  const toggleTheme = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setDarkMode(false);
      addNotification('Switched to light theme', 'info');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setDarkMode(true);
      addNotification('Switched to dark theme', 'info');
    }
  };

  const handleCreateChat = async () => {
    try {
      await createConversation(activeWorkspaceId || undefined);
      setActiveTab('chat');
      addNotification('Started new chat conversation', 'success');
    } catch {
      addNotification('Failed to create new chat', 'error');
    }
  };

  const handleStartEdit = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      await renameConversation(id, editTitle);
      addNotification('Renamed conversation', 'success');
    }
    setEditingId(null);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this chat session?')) {
      await deleteConversation(id);
      addNotification('Deleted conversation session', 'info');
    }
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    togglePinConversation(id);
    const isNowPinned = !pinnedConversationIds.includes(id);
    addNotification(isNowPinned ? 'Chat pinned to top' : 'Chat unpinned', 'success');
  };

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWorkspace = activeWorkspaceId === null ? c.workspace_id === null : c.workspace_id === activeWorkspaceId;
    return matchesSearch && matchesWorkspace;
  });

  const pinnedConversations = filteredConversations.filter(c => pinnedConversationIds.includes(c.id));
  const unpinnedConversations = filteredConversations.filter(c => !pinnedConversationIds.includes(c.id));

  return (
    <aside className="w-80 bg-slate-950/80 border-r border-white/5 flex flex-col h-screen text-slate-300 font-sans glass select-none">
      
      {/* Brand Header */}
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-slate-950/20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/10 border border-indigo-500/35 rounded-xl text-indigo-400 font-bold shadow-md shadow-indigo-600/5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight text-xs flex items-center gap-1.5">
              Knowledge Intel
            </h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Enterprise SaaS</p>
          </div>
        </div>
      </div>

      {/* Main Pages Section */}
      <div className="p-4 space-y-1">
        <button
          onClick={() => setActiveTab('chat')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
            activeTab === 'chat' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
              : 'hover:bg-slate-900/60 hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chat Assistant
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
            activeTab === 'documents' 
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
              : 'hover:bg-slate-900/60 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Document Library
        </button>

        {user?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
              activeTab === 'admin' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                : 'hover:bg-slate-900/60 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Admin Panel
          </button>
        )}

        <button
          onClick={() => setBookmarksOpen(!bookmarksOpen)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
            bookmarksOpen 
              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
              : 'hover:bg-slate-900/60 hover:text-white'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          Bookmarks Tray
        </button>
      </div>

      {/* Dynamic Command Palette Quick Link */}
      <div className="px-4 mb-2">
        <button
          onClick={() => {
            const event = new KeyboardEvent('keydown', {
              key: 'k',
              metaKey: true,
              bubbles: true
            });
            window.dispatchEvent(event);
          }}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-900/40 hover:bg-slate-900 border border-white/5 hover:border-white/10 rounded-xl text-[10px] text-slate-500 hover:text-slate-350 transition-all font-semibold"
        >
          <span className="flex items-center gap-1.5"><Command className="w-3.5 h-3.5" /> Search commands...</span>
          <kbd className="font-mono text-[9px] bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">⌘K</kbd>
        </button>
      </div>

      {/* Chat History Header & Search */}
      <div className="flex-1 flex flex-col min-h-0 border-t border-white/5 mt-2 pt-4">
        <div className="px-4 mb-3 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Conversations</span>
          <button
            onClick={handleCreateChat}
            className="p-1.5 bg-slate-900/60 hover:bg-slate-800 hover:text-white text-slate-400 rounded-lg transition-colors border border-white/5"
            title="New Chat Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Global Search box */}
        <div className="px-4 mb-3 relative">
          <span className="absolute inset-y-0 left-0 pl-7 flex items-center pointer-events-none text-slate-550">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            id="global-search-input"
            type="text"
            placeholder="Search docs or chats... (Cmd + /)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-slate-900/60 border border-white/5 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-white/10 focus:ring-0 transition-colors"
          />
        </div>

        {/* History Scroll List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-3">
          
          {/* 1. Pinned Chats Section */}
          {pinnedConversations.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[8px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                <Pin className="w-2.5 h-2.5 text-indigo-400 rotate-45" /> Pinned
              </div>
              {pinnedConversations.map((conv) => {
                const isActive = activeConversationId === conv.id;
                const isEditing = editingId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveConversationId(conv.id);
                        setActiveTab('chat');
                      }
                    }}
                    className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border border-transparent ${
                      isActive 
                        ? 'bg-slate-900/60 text-white border-white/5 shadow-md' 
                        : 'hover:bg-slate-900/20 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                        />
                        <button onClick={(e) => handleSaveEdit(conv.id, e)} className="p-1 text-green-500 hover:text-green-400">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleCancelEdit} className="p-1 text-red-500 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="truncate flex-1 pr-2">{conv.title}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleTogglePin(conv.id, e)}
                            className="p-1 text-indigo-450 hover:text-indigo-300 rounded opacity-80 hover:opacity-100"
                            title="Unpin conversation"
                          >
                            <Pin className="w-3 h-3 rotate-45 fill-indigo-450/20" />
                          </button>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={(e) => handleStartEdit(conv.id, conv.title, e)}
                              className="p-1 hover:text-indigo-450 rounded text-slate-500"
                              title="Rename"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(conv.id, e)}
                              className="p-1 hover:text-rose-400 rounded text-slate-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. All Chats Section */}
          <div className="space-y-1">
            {pinnedConversations.length > 0 && (
              <div className="px-2 text-[8px] font-bold text-slate-600 uppercase tracking-widest">
                All Chats
              </div>
            )}
            {unpinnedConversations.length === 0 && pinnedConversations.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-650 font-medium">
                No chat sessions found
              </div>
            ) : (
              unpinnedConversations.map((conv) => {
                const isActive = activeConversationId === conv.id;
                const isEditing = editingId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveConversationId(conv.id);
                        setActiveTab('chat');
                      }
                    }}
                    className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border border-transparent ${
                      isActive 
                        ? 'bg-slate-900/60 text-white border-white/5 shadow-md' 
                        : 'hover:bg-slate-900/20 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                        />
                        <button onClick={(e) => handleSaveEdit(conv.id, e)} className="p-1 text-green-500 hover:text-green-400">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handleCancelEdit} className="p-1 text-red-500 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="truncate flex-1 pr-2">{conv.title}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleTogglePin(conv.id, e)}
                            className="p-1 text-slate-600 hover:text-slate-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Pin conversation to top"
                          >
                            <Pin className="w-3 h-3" />
                          </button>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={(e) => handleStartEdit(conv.id, conv.title, e)}
                              className="p-1 hover:text-indigo-400 rounded text-slate-500"
                              title="Rename"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteChat(conv.id, e)}
                              className="p-1 hover:text-red-400 rounded text-slate-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </div>

        {/* Project Workspaces list scoping controls */}
        <div className="border-t border-white/5 mt-2 pt-4 px-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Project Workspaces</span>
            <button
              onClick={async () => {
                const name = prompt("Enter project workspace name:");
                if (!name) return;
                const desc = prompt("Enter description (optional):") || "";
                try {
                  await createWorkspace(name, desc);
                  addNotification("Workspace project created", "success");
                } catch {
                  addNotification("Failed to create workspace", "error");
                }
              }}
              className="p-1 bg-slate-900/60 hover:bg-slate-800 hover:text-white text-slate-400 rounded-lg transition-colors border border-white/5"
              title="Create Workspace Project"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1 max-h-32 overflow-y-auto mb-2 pr-1">
            <div
              onClick={() => {
                setActiveWorkspaceId(null);
                setActiveTab('chat');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                activeWorkspaceId === null
                  ? 'bg-indigo-605/10 text-indigo-400 border border-indigo-500/20'
                  : 'hover:bg-slate-900/40 text-slate-500'
              }`}
            >
              🌐 All Uploads Scope
            </div>

            {workspaces.map((ws) => {
              const isSelected = activeWorkspaceId === ws.id;
              return (
                <div
                  key={ws.id}
                  onClick={() => {
                    setActiveWorkspaceId(ws.id);
                    setActiveTab('chat');
                  }}
                  className={`group px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-indigo-605/10 text-indigo-400 border border-indigo-500/20'
                      : 'hover:bg-slate-900/40 text-slate-500 hover:text-slate-350'
                  }`}
                >
                  <span className="truncate pr-2">{ws.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this workspace project?")) {
                        deleteWorkspace(ws.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-455 transition-opacity"
                    title="Delete Workspace"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="p-4 border-t border-white/5 space-y-3 bg-slate-950/40">
        <div className="flex items-center justify-between px-2">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Appearance</span>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 p-2 bg-slate-900/60 hover:bg-slate-800 rounded-xl hover:text-white transition-all border border-white/5"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
          </button>
        </div>

        {/* User Card & Logout */}
        <div className="flex items-center justify-between p-3 bg-slate-900/30 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <UserIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate leading-none">{user?.full_name || user?.email}</p>
              <p className="text-[9px] text-slate-500 capitalize font-medium pt-1">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to sign out?')) {
                clearAuth();
                addNotification('Logged out successfully', 'info');
              }
            }}
            className="p-2 hover:bg-slate-800 text-slate-500 hover:text-rose-400 rounded-xl transition-colors"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
