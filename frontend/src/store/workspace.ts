import { create } from 'zustand';
import { api } from '../services/api';

export interface Document {
  id: number;
  filename: string;
  file_type: string;
  size_bytes: number;
}

export interface Workspace {
  id: number;
  name: string;
  description: string | null;
  documents?: Document[];
  created_at: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  loading: boolean;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  bindDocuments: (workspaceId: number, documentIds: number[]) => Promise<void>;
  deleteWorkspace: (workspaceId: number) => Promise<void>;
  setActiveWorkspaceId: (workspaceId: number | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  loading: false,
  fetchWorkspaces: async () => {
    set({ loading: true });
    try {
      const response = await api.get('/workspaces');
      set({ workspaces: response.data || [] });
    } catch (err) {
      console.error('Failed to load workspaces', err);
    } finally {
      set({ loading: false });
    }
  },
  createWorkspace: async (name, description) => {
    const response = await api.post('/workspaces', { name, description });
    const newWs = response.data;
    set((state) => ({ workspaces: [...state.workspaces, newWs] }));
    return newWs;
  },
  bindDocuments: async (workspaceId, documentIds) => {
    await api.post(`/workspaces/${workspaceId}/documents`, { document_ids: documentIds });
    await get().fetchWorkspaces();
  },
  deleteWorkspace: async (workspaceId) => {
    await api.delete(`/workspaces/${workspaceId}`);
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
      activeWorkspaceId: state.activeWorkspaceId === workspaceId ? null : state.activeWorkspaceId
    }));
  },
  setActiveWorkspaceId: (workspaceId) => {
    set({ activeWorkspaceId: workspaceId });
  }
}));
