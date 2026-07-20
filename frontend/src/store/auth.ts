import { create } from 'zustand';

interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Load initial state from localStorage
  const savedToken = localStorage.getItem('token');
  const savedRefreshToken = localStorage.getItem('refresh_token');
  const savedUserStr = localStorage.getItem('user');
  
  let savedUser: User | null = null;
  if (savedUserStr) {
    try {
      savedUser = JSON.parse(savedUserStr);
    } catch {
      localStorage.removeItem('user');
    }
  }

  return {
    token: savedToken,
    refreshToken: savedRefreshToken,
    user: savedUser,
    isAuthenticated: !!savedToken,

    setAuth: (token, refreshToken, user) => {
      localStorage.setItem('token', token);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      set({ token, refreshToken, user, isAuthenticated: true });
    },

    updateUser: (updatedUser) => {
      set((state) => {
        if (!state.user) return {};
        const newUser = { ...state.user, ...updatedUser };
        localStorage.setItem('user', JSON.stringify(newUser));
        return { user: newUser };
      });
    },

    clearAuth: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
    },
  };
});
