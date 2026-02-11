import React, { useState } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { Sun, Moon, LogOut, User as UserIcon, Clock, ArrowDown, XCircle } from 'lucide-react';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';
import { formatDistanceToNow } from 'date-fns';

const ShiftControl: React.FC = () => {
    const { activeShift, openShiftModal } = useAppContext();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    if (!activeShift) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-secondary-600 bg-secondary-200 dark:text-secondary-300 dark:bg-secondary-800 rounded-lg">
                <Clock size={16} />
                <span>No Active Shift</span>
            </div>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setIsMenuOpen(p => !p)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-green-700 bg-green-100 dark:text-green-200 dark:bg-green-900/50 rounded-lg hover:bg-green-200 dark:hover:bg-green-800/50"
            >
                <Clock size={16} className="animate-pulse" />
                <span>Shift Open ({formatDistanceToNow(activeShift.startTime, { addSuffix: true })})</span>
            </button>
            {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-secondary-50 dark:bg-secondary-900 rounded-lg shadow-xl py-1 z-50 animate-fadeIn">
                    <button onClick={() => { openShiftModal('drop'); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-200 dark:hover:bg-secondary-800">
                        <ArrowDown size={16} className="mr-2" />
                        Cash Drop
                    </button>
                    <button onClick={() => { openShiftModal('close'); setIsMenuOpen(false); }} className="w-full text-left flex items-center px-4 py-2 text-sm text-red-500 hover:bg-secondary-200 dark:hover:bg-secondary-800">
                        <XCircle size={16} className="mr-2" />
                        Close Shift
                    </button>
                </div>
            )}
        </div>
    );
};


const Header: React.FC = () => {
    const { currentUser, logout, theme, setTheme } = useAppContext();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { hasPermission } = usePermissions();

    const getPageTitle = () => {
        const path = location.pathname.split('/')[1] || 'dashboard';
        return path.charAt(0).toUpperCase() + path.slice(1);
    };

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    return (
        <header className="bg-secondary-100/80 dark:bg-secondary-950/80 backdrop-blur-sm sticky top-0 z-20 flex items-center justify-between p-4 border-b border-secondary-200 dark:border-secondary-900">
            <h1 className="text-xl md:text-2xl font-bold text-primary-600 dark:text-primary-400">{getPageTitle()}</h1>
            <div className="flex items-center gap-2 md:gap-4">
                <ShiftControl />
                <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-secondary-200 dark:hover:bg-secondary-800 transition-colors">
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <div className="relative">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white font-bold">
                           {currentUser?.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="hidden md:inline">{currentUser?.username}</span>
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-secondary-50 dark:bg-secondary-900 rounded-lg shadow-xl py-1 z-50 animate-fadeIn">
                            {/* FIX: Use permission-based check instead of role-based check */}
                            {hasPermission('AccessSettings') && (
                                <NavLink to="/settings" className="flex items-center px-4 py-2 text-sm text-secondary-700 dark:text-secondary-300 hover:bg-secondary-200 dark:hover:bg-secondary-800">
                                    <UserIcon size={16} className="mr-2" />
                                    Profile
                                </NavLink>
                            )}
                            <button onClick={logout} className="w-full text-left flex items-center px-4 py-2 text-sm text-red-500 hover:bg-secondary-200 dark:hover:bg-secondary-800">
                                <LogOut size={16} className="mr-2" />
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
