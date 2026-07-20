import React, { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chat';
import { useWorkspaceStore } from '../store/workspace';
import { useUIStore } from '../store/ui';
import { useAuthStore } from '../store/auth';
import { 
  Search, 
  MessageSquare, 
  FileText, 
  ShieldAlert, 
  Plus, 
  Bookmark, 
  Moon, 
  LogOut, 
  Keyboard, 
  Hash
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  setActiveTab: (tab: string) => void;
}

interface CommandItem {
  icon: React.ReactNode;
  label: string;
  category: string;
  shortcut?: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, setActiveTab }) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { createConversation } = useChatStore();
  const { workspaces, setActiveWorkspaceId } = useWorkspaceStore();
  const { bookmarksOpen, setBookmarksOpen, addNotification } = useUIStore();
  const { clearAuth } = useAuthStore();

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Build command list
  const commands: CommandItem[] = [
    {
      icon: <MessageSquare className="w-4 h-4" />,
      label: 'Switch to Chat Assistant',
      category: 'Navigation',
      shortcut: 'C',
      action: () => {
        setActiveTab('chat');
        addNotification('Switched to Chat Assistant', 'info');
      }
    },
    {
      icon: <FileText className="w-4 h-4" />,
      label: 'Switch to Document Library',
      category: 'Navigation',
      shortcut: 'D',
      action: () => {
        setActiveTab('documents');
        addNotification('Switched to Document Library', 'info');
      }
    },
    {
      icon: <ShieldAlert className="w-4 h-4" />,
      label: 'Switch to Admin Panel',
      category: 'Navigation',
      shortcut: 'A',
      action: () => {
        setActiveTab('admin');
        addNotification('Switched to Admin Panel', 'info');
      }
    },
    {
      icon: <Plus className="w-4 h-4" />,
      label: 'Create New Chat Session',
      category: 'Chat Action',
      shortcut: '⌘+Shift+N',
      action: () => {
        setActiveTab('chat');
        createConversation()
          .then(() => addNotification('Started new chat conversation', 'success'))
          .catch(() => addNotification('Failed to create new chat', 'error'));
      }
    },
    {
      icon: <Bookmark className="w-4 h-4" />,
      label: 'Toggle Bookmarks Tray',
      category: 'UI Toggle',
      shortcut: '⌘+B',
      action: () => {
        setBookmarksOpen(!bookmarksOpen);
      }
    },
    {
      icon: <Moon className="w-4 h-4" />,
      label: 'Toggle Dark Mode Theme',
      category: 'UI Preference',
      action: () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        addNotification(isDark ? 'Switched to dark theme' : 'Switched to light theme', 'info');
      }
    },
    {
      icon: <LogOut className="w-4 h-4" />,
      label: 'Sign Out / Log Out',
      category: 'Session',
      action: () => {
        if (confirm('Are you sure you want to sign out?')) {
          clearAuth();
          addNotification('Logged out successfully', 'info');
        }
      }
    }
  ];

  // Add workspaces as command options
  workspaces.forEach(ws => {
    commands.push({
      icon: <Hash className="w-4 h-4 text-indigo-400" />,
      label: `Switch Workspace: ${ws.name}`,
      category: 'Workspaces',
      action: () => {
        setActiveWorkspaceId(ws.id);
        setActiveTab('chat');
        addNotification(`Switched scope to ${ws.name}`, 'success');
      }
    });
  });

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(search.toLowerCase()) || 
    cmd.category.toLowerCase().includes(search.toLowerCase())
  );

  // Keyboard navigation inside list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4 font-sans">
      <div 
        ref={containerRef}
        className="w-full max-w-xl bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-2xl glass flex flex-col max-h-[420px]"
      >
        {/* Search header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 bg-slate-950/30">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search workspaces..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent border-none text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-0"
          />
          <kbd className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-400 font-mono rounded border border-slate-700 shadow-sm">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="flex-1 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No matching commands or workspaces found
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div
                key={index}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer text-xs transition-all ${
                  index === selectedIndex 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-850 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 font-semibold">
                  <span className={index === selectedIndex ? 'text-white' : 'text-slate-500'}>
                    {cmd.icon}
                  </span>
                  <span>{cmd.label}</span>
                </div>
                {cmd.shortcut && (
                  <span className={`font-mono text-[10px] uppercase font-bold ${
                    index === selectedIndex ? 'text-white/80' : 'text-slate-500'
                  }`}>
                    {cmd.shortcut}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 border-t border-white/5 bg-slate-950/30 flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5" /> Shortcuts
          </div>
          <div className="flex gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
        </div>
      </div>
    </div>
  );
};
