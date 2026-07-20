import { create } from 'zustand';
import { api } from '../services/api';

export interface ChatMessage {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  citations: string | null; // JSON encoded string of citations
  feedback_rating: number | null;
  feedback_text: string | null;
  bookmarked: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
  workspace_id?: number; // Added workspace scoping
}

interface ChatStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  bookmarks: ChatMessage[];
  loading: boolean;
  fetchConversations: (workspaceId?: number) => Promise<void>;
  fetchBookmarks: () => Promise<void>;
  createConversation: (workspaceId?: number) => Promise<string>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  updateMessageInStore: (msgId: number, updateFields: Partial<ChatMessage>) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeConversationId: null,
  bookmarks: [],
  loading: false,

  fetchConversations: async (workspaceId?: number) => {
    set({ loading: true });
    try {
      const response = await api.get('/chat/conversations' + (workspaceId ? `?workspace_id=${workspaceId}` : ''));
      set({ conversations: response.data, loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  fetchBookmarks: async () => {
    try {
      const response = await api.get('/chat/bookmarks');
      set({ bookmarks: response.data });
    } catch {}
  },

  createConversation: async (workspaceId?: number) => {
    try {
      const response = await api.post('/chat/conversations' + (workspaceId ? `?workspace_id=${workspaceId}` : ''));
      const newConv = response.data;
      set((state) => ({
        conversations: [newConv, ...state.conversations],
        activeConversationId: newConv.id
      }));
      return newConv.id;
    } catch (err) {
      throw err;
    }
  },

  renameConversation: async (id, title) => {
    try {
      await api.put(`/chat/conversations/${id}`, { title });
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, title } : c
        )
      }));
    } catch {}
  },

  deleteConversation: async (id) => {
    try {
      await api.delete(`/chat/conversations/${id}`);
      set((state) => {
        const remaining = state.conversations.filter((c) => c.id !== id);
        const nextActive = state.activeConversationId === id 
          ? (remaining[0]?.id || null) 
          : state.activeConversationId;
        return {
          conversations: remaining,
          activeConversationId: nextActive
        };
      });
    } catch {}
  },

  setActiveConversationId: (id) => {
    set({ activeConversationId: id });
  },

  updateMessageInStore: (msgId, updateFields) => {
    // Proactively updates message feedback/bookmarks inside active conversations
    set((state) => {
      const updatedConversations = state.conversations.map((conv) => {
        if (!conv.messages) return conv;
        return {
          ...conv,
          messages: conv.messages.map((m) =>
            m.id === msgId ? { ...m, ...updateFields } : m
          )
        };
      });
      
      const updatedBookmarks = updateFields.bookmarked !== undefined
        ? (updateFields.bookmarked 
            ? state.bookmarks // Wait, we can re-fetch or let components query, but let's sync
            : state.bookmarks.filter((b) => b.id !== msgId))
        : state.bookmarks;

      return {
        conversations: updatedConversations,
        bookmarks: updatedBookmarks as ChatMessage[]
      };
    });
  }
}));
