import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface UIStore {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  pinnedConversationIds: string[];
  togglePinConversation: (id: string) => void;
  notifications: NotificationItem[];
  addNotification: (message: string, type?: 'info' | 'success' | 'error') => void;
  removeNotification: (id: string) => void;
  bookmarksOpen: boolean;
  setBookmarksOpen: (open: boolean) => void;
  activePreviewDocId: number | null;
  setActivePreviewDocId: (id: number | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  pinnedConversationIds: JSON.parse(localStorage.getItem('pinned_chats') || '[]'),
  
  togglePinConversation: (id) => set((state) => {
    const isPinned = state.pinnedConversationIds.includes(id);
    const updated = isPinned 
      ? state.pinnedConversationIds.filter((pid) => pid !== id)
      : [...state.pinnedConversationIds, id];
    localStorage.setItem('pinned_chats', JSON.stringify(updated));
    return { pinnedConversationIds: updated };
  }),

  notifications: [],
  
  addNotification: (message, type = 'info') => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }]
    }));
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id)
      }));
    }, 4000);
  },

  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((n) => n.id !== id)
  })),

  bookmarksOpen: false,
  setBookmarksOpen: (open) => set({ bookmarksOpen: open }),

  activePreviewDocId: null,
  setActivePreviewDocId: (id) => set({ activePreviewDocId: id })
}));
