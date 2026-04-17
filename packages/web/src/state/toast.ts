import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  level: 'info' | 'error' | 'success';
}

interface ToastStore {
  toasts: ToastItem[];
  push: (msg: string, level?: ToastItem['level']) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, level = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, level }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (msg: string) => useToastStore.getState().push(msg, 'info'),
  error: (msg: string) => useToastStore.getState().push(msg, 'error'),
  success: (msg: string) => useToastStore.getState().push(msg, 'success'),
};
