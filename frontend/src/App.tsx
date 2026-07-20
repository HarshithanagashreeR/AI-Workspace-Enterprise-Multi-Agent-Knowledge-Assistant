import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth';
import { useChatStore } from './store/chat';
import { useUIStore } from './store/ui';
import { AuthPage } from './pages/AuthPage';
import { Sidebar } from './components/Sidebar';
import { ChatWindow } from './components/ChatWindow';
import { DocumentConsole } from './components/DocumentConsole';
import { AdminConsole } from './components/AdminConsole';
import { CommandPalette } from './components/CommandPalette';
import { Info, CheckCircle2, AlertTriangle, X, Keyboard } from 'lucide-react';

const queryClient = new QueryClient();

const AppContent: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [activeTab, setActiveTab] = useState('chat'); // chat, documents, admin
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const {
    notifications,
    removeNotification,
    bookmarksOpen,
    setBookmarksOpen,
    setActivePreviewDocId,
    addNotification
  } = useUIStore();

  const createConversation = useChatStore((state) => state.createConversation);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd + K : Open Command Palette
      if (isMeta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }

      // Cmd + / : Focus Search Bar
      if (isMeta && e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
          searchInput.focus();
        }
      }

      // Cmd + Shift + N : Create New Chat
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (activeTab !== 'chat') {
          setActiveTab('chat');
        }
        createConversation()
          .then(() => addNotification('Created a new conversation', 'success'))
          .catch(() => addNotification('Failed to create conversation', 'error'));
      }

      // Cmd + B : Toggle Bookmarks Drawer
      if (isMeta && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setBookmarksOpen(!bookmarksOpen);
      }

      // Cmd + H : Toggle Keyboard Shortcuts Guide
      if (isMeta && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShortcutHelpOpen(prev => !prev);
      }

      // Esc : Close drawers / palettes
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setBookmarksOpen(false);
        setActivePreviewDocId(null);
        setShortcutHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bookmarksOpen, activeTab, createConversation, setBookmarksOpen, setActivePreviewDocId, addNotification]);

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 relative font-sans">
      
      {/* Background Radial Glow Effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-indigo-500/5 blur-[120px]"></div>
        <div className="absolute -bottom-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-purple-500/5 blur-[120px]"></div>
      </div>

      {/* Floating command palette overlay */}
      <CommandPalette 
        isOpen={cmdOpen} 
        onClose={() => setCmdOpen(false)} 
        setActiveTab={setActiveTab} 
      />

      {/* Sidebar Nav & History */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-slate-950/20 z-10 border-l border-white/5">
        
        {/* Floating Help / Shortcut button */}
        <button
          onClick={() => setShortcutHelpOpen(true)}
          className="fixed bottom-4 right-4 p-2.5 bg-slate-900/80 border border-white/10 hover:border-indigo-500/40 text-slate-400 hover:text-white rounded-xl shadow-lg hover:shadow-indigo-600/10 transition-all z-40 glass"
          title="Keyboard Shortcuts Guide (Cmd + H)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {activeTab === 'chat' && <ChatWindow />}
        {activeTab === 'documents' && <DocumentConsole />}
        {activeTab === 'admin' && <AdminConsole />}
      </main>

      {/* Keyboard Shortcuts Dialog Modal */}
      {shortcutHelpOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900/90 border border-white/10 rounded-2xl p-6 shadow-2xl glass space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-indigo-400" /> Keyboard Shortcuts Guide
              </h3>
              <button 
                onClick={() => setShortcutHelpOpen(false)}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-3 text-[11px]">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">Open Command Palette</span>
                <kbd className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 font-mono rounded border border-slate-700">⌘ + K</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">Start New Chat</span>
                <kbd className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 font-mono rounded border border-slate-700">⌘ + Shift + N</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">Toggle Bookmarks Tray</span>
                <kbd className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 font-mono rounded border border-slate-700">⌘ + B</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">Focus Search Input</span>
                <kbd className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 font-mono rounded border border-slate-700">⌘ + /</kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-medium">Close Overlays / Preview</span>
                <kbd className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 font-mono rounded border border-slate-700">ESC</kbd>
              </div>
            </div>

            <div className="pt-2 text-[9px] text-slate-500 font-semibold uppercase tracking-wider text-center">
              Press Escape to exit this guide.
            </div>
          </div>
        </div>
      )}

      {/* Premium Toast Notifications Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className="pointer-events-auto flex items-start gap-3 p-4 rounded-xl border glass shadow-lg shadow-black/40 notification-enter w-full"
          >
            <div className="shrink-0 pt-0.5">
              {notif.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {notif.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
              {notif.type === 'info' && <Info className="w-5 h-5 text-indigo-400" />}
            </div>
            
            <div className="flex-1 text-xs font-semibold text-slate-200 leading-relaxed">
              {notif.message}
            </div>

            <button
              onClick={() => removeNotification(notif.id)}
              className="shrink-0 p-0.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
