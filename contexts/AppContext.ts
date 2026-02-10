

import { createContext } from 'react';
import type { User, StoreInfo, Permission, Shift } from '../types';
import type { UserWithPermissions } from '../App';

export interface AppContextType {
  currentUser: UserWithPermissions | null;
  storeInfo: StoreInfo | null;
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  activeShift: Shift | null;
  login: (user: User) => Promise<void>;
  logout: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setAccentColor: (color: string) => void;
  setActiveShift: (shift: Shift | null) => void;
  openShiftModal: (modal: 'close' | 'drop') => void;
  showConfirmation: (title: string, message: string, onConfirm: () => void) => void;
}

export const AppContext = createContext<AppContextType | null>(null);