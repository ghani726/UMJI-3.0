



import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Dexie from 'dexie';
import { db } from './services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { User, Permission, Shift, Payment } from './types';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Banknote, CreditCard, Wallet, Smartphone, Ticket, X, ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react';


// Import Pages
import DashboardPage from './pages/DashboardPage';
import SalesPage from './pages/SalesPage';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import PurchasesPage from './pages/PurchasesPage';
import ExpensesPage from './pages/ExpensesPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import BackupPage from './pages/BackupPage';
import ActivityLogPage from './pages/ActivityLogPage';
import PromotionsPage from './pages/PromotionsPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Import Components
import Layout from './components/Layout';
import { AppContext, type AppContextType } from './contexts/AppContext';
import { usePermissions } from './hooks/usePermissions';
// FIX: Add missing import for useAppContext hook.
import { useAppContext } from './hooks/useAppContext';

export type UserWithPermissions = User & { permissions: Permission[] };

const LoadingSpinner: React.FC = () => (
    <div className="flex items-center justify-center h-screen bg-secondary-100 dark:bg-secondary-950">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary-500"></div>
    </div>
);

// --- Confirmation Modal ---
const ConfirmationModal: React.FC<{
  title: string;
  message: string;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ title, message, onConfirm, onClose }) => {

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4 animate-fadeIn">
      <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-8 w-full max-w-md animate-slideInUp text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/50 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold mb-2">{title}</h2>
        <p className="text-secondary-500 dark:text-secondary-400 mb-8">{message}</p>
        <div className="flex justify-center gap-4">
          <button type="button" onClick={onClose} className="px-6 py-3 bg-secondary-200 dark:bg-secondary-700 font-semibold rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600 transition">Cancel</button>
          <button onClick={handleConfirm} className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 transition">Confirm</button>
        </div>
      </div>
    </div>
  );
};


// --- Shift Modals ---

const CloseShiftModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { currentUser, activeShift, setActiveShift, storeInfo } = useAppContext();
    const [closingBalance, setClosingBalance] = useState('');
    const [notes, setNotes] = useState('');
    const [summary, setSummary] = useState<any>(null);

    const calculateSummary = useCallback(async () => {
        if (!activeShift) return;
        
        const sales = await db.sales.where({ shiftId: activeShift.id }).toArray();
        const expenses = await db.expenses.where({ shiftId: activeShift.id, paidFromCashDrawer: true }).toArray();
        const cashDrops = await db.shiftEvents.where({ shiftId: activeShift.id, type: 'cash_drop' }).toArray();

        const cashSales = sales.flatMap(s => s.payments).filter(p => p.method === 'cash' && p.amount > 0).reduce((sum, p) => sum + p.amount, 0);
        const cashRefunds = sales.flatMap(s => s.payments).filter(p => p.method === 'cash' && p.amount < 0).reduce((sum, p) => sum + p.amount, 0);
        const cashExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const totalCashDrops = cashDrops.reduce((sum, d) => sum + d.amount, 0);
        
        const expectedBalance = activeShift.openingBalance + cashSales + cashRefunds - cashExpenses - totalCashDrops;

        const paymentBreakdown = sales.flatMap(s => s.payments).reduce((acc, p) => {
            acc[p.method] = (acc[p.method] || 0) + p.amount;
            return acc;
        }, {} as Record<string, number>);

        setSummary({
            openingBalance: activeShift.openingBalance,
            cashSales,
            cashRefunds,
            cashExpenses,
            cashDrops: totalCashDrops,
            expectedBalance,
            paymentBreakdown,
            totalSales: sales.reduce((s, c) => s + c.totalAmount, 0)
        });
    }, [activeShift]);

    useEffect(() => {
        calculateSummary();
    }, [calculateSummary]);

    const handleCloseShift = async () => {
        const counted = parseFloat(closingBalance);
        if (isNaN(counted) || !activeShift || !summary) {
            toast.error("Please enter a valid closing balance.");
            return;
        }

        const finalShiftData: Partial<Shift> = {
            status: 'closed',
            endTime: new Date(),
            closingBalance: counted,
            notes,
            expectedBalance: summary.expectedBalance,
            cashSales: summary.cashSales,
            cashRefunds: summary.cashRefunds,
            cashExpenses: summary.cashExpenses,
            cashDrops: summary.cashDrops,
            paymentBreakdown: summary.paymentBreakdown,
            totalSales: summary.totalSales,
        };

        await db.shifts.update(activeShift.id!, finalShiftData);
        toast.success("Shift closed successfully.");
        setActiveShift(null);
        onClose();
    };
    
    if (!summary) return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"><LoadingSpinner /></div>

    const difference = parseFloat(closingBalance) - summary.expectedBalance;

    const PaymentIcon = ({ method }: { method: string }) => {
        switch (method) {
            case 'cash': return <Banknote size={16}/>;
            case 'card': return <CreditCard size={16}/>;
            case 'credit': return <Smartphone size={16}/>;
            case 'gift_card': return <Ticket size={16}/>;
            default: return <Wallet size={16}/>;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Close Shift</h2><button type="button" onClick={onClose}><X/></button></div>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Summary Side */}
                    <div className="space-y-3">
                        <h3 className="font-semibold text-lg">Shift Summary</h3>
                        <div className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg space-y-2 text-sm">
                            <div className="flex justify-between"><span>Opening Balance:</span><span className="font-medium">{storeInfo?.currency}{summary.openingBalance.toFixed(2)}</span></div>
                            <div className="flex justify-between text-green-600 dark:text-green-400"><span>Cash Sales:</span><span className="font-medium">{storeInfo?.currency}{summary.cashSales.toFixed(2)}</span></div>
                            <div className="flex justify-between text-red-500"><span>Cash Refunds:</span><span className="font-medium">{storeInfo?.currency}{summary.cashRefunds.toFixed(2)}</span></div>
                            <div className="flex justify-between text-red-500"><span>Cash Expenses:</span><span className="font-medium">-{storeInfo?.currency}{summary.cashExpenses.toFixed(2)}</span></div>
                             <div className="flex justify-between text-red-500"><span>Cash Drops:</span><span className="font-medium">-{storeInfo?.currency}{summary.cashDrops.toFixed(2)}</span></div>
                             <div className="flex justify-between font-bold border-t pt-2 mt-2 border-secondary-300 dark:border-secondary-700"><span>Expected in Drawer:</span><span>{storeInfo?.currency}{summary.expectedBalance.toFixed(2)}</span></div>
                        </div>
                         <h3 className="font-semibold text-lg mt-4">Payment Totals</h3>
                         <div className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg space-y-2 text-sm">
                            {Object.entries(summary.paymentBreakdown).map(([methodId, amount]) => {
                                const paymentMethod = storeInfo?.paymentMethods?.find(pm => pm.id === methodId);
                                return (
                                <div key={methodId} className="flex justify-between capitalize">
                                    <span className="flex items-center gap-2">
                                        <PaymentIcon method={methodId} /> {paymentMethod?.name || methodId}
                                    </span>
                                    <span className="font-medium">{storeInfo?.currency}{(amount as number).toFixed(2)}</span>
                                </div>
                            )})}
                             <div className="flex justify-between font-bold border-t pt-2 mt-2 border-secondary-300 dark:border-secondary-700"><span>Total Sales:</span><span>{storeInfo?.currency}{summary.totalSales.toFixed(2)}</span></div>
                         </div>
                    </div>
                    {/* Closing Side */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-lg">Cash Count</h3>
                        <div>
                            <label className="text-sm font-medium">Counted Cash in Drawer</label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500">{storeInfo?.currency || '$'}</span>
                                <input type="number" step="0.01" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} placeholder="0.00" autoFocus required className="w-full pl-8 pr-4 py-3 text-lg font-semibold bg-secondary-100 dark:bg-secondary-800 rounded-lg text-center"/>
                            </div>
                        </div>
                        {closingBalance && <div className={`p-4 rounded-lg text-center ${difference === 0 ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300'}`}>
                            <p className="font-bold text-lg">{difference === 0 ? 'Balanced' : (difference > 0 ? 'Overage' : 'Shortage')}</p>
                            <p className="text-2xl font-bold">{difference > 0 ? '+' : ''}{storeInfo?.currency}{difference.toFixed(2)}</p>
                        </div>}
                        <div>
                            <label className="text-sm font-medium">Notes (Optional)</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full mt-1 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={3}></textarea>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button onClick={handleCloseShift} className="px-6 py-2 bg-red-600 text-white font-bold rounded-lg">End Shift</button>
                </div>
            </div>
        </div>
    );
};

const CashDropModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { activeShift, storeInfo } = useAppContext();
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');

    const handleConfirm = async () => {
        const dropAmount = parseFloat(amount);
        if (isNaN(dropAmount) || dropAmount <= 0 || !activeShift) {
            toast.error("Please enter a valid amount.");
            return;
        }

        await db.shiftEvents.add({
            shiftId: activeShift.id!,
            timestamp: new Date(),
            type: 'cash_drop',
            amount: dropAmount,
            notes
        });

        toast.success(`Cash drop of ${storeInfo?.currency || '$'}${dropAmount.toFixed(2)} recorded.`);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Record Cash Drop</h2><button type="button" onClick={onClose}><X/></button></div>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Amount to Remove</label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500">{storeInfo?.currency || '$'}</span>
                            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus required className="w-full pl-8 pr-4 py-3 text-lg bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        </div>
                    </div>
                     <div>
                        <label className="text-sm font-medium">Notes (Optional)</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Bank Deposit" className="w-full mt-1 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button onClick={handleConfirm} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Confirm</button>
                </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<UserWithPermissions | null>(null);
    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
    const [accentColor, setAccentColor] = useState<string>('#5d2bff');
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const [activeShift, setActiveShift] = useState<Shift | null>(null);
    const [shiftModal, setShiftModal] = useState<'close' | 'drop' | null>(null);
    const storeInfo = useLiveQuery(() => db.storeInfo.get(1));

    const [confirmation, setConfirmation] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);

    const showConfirmation = useCallback((title: string, message: string, onConfirm: () => void) => {
        setConfirmation({ title, message, onConfirm });
    }, []);

    const checkOpenShift = useCallback(async (userId: number) => {
        try {
            const openShift = await db.shifts.where({ userId, status: 'open' }).first();
            setActiveShift(openShift || null);
        } catch (error) {
            console.error("Failed to check for open shift:", error);
            toast.error("Could not load shift status.");
        }
    }, []);

    const initializeApp = useCallback(async () => {
        try {
            // FIX: Cast `db` to `any` to access Dexie's `open` method.
            await (db as any).open(); // Ensure DB is open

            const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
            setTheme(savedTheme || 'system');
            
            const savedAccent = (await db.storeInfo.get(1))?.accentColor || '#5d2bff';
            setAccentColor(savedAccent);
            
            const sessionUser = sessionStorage.getItem('currentUser');
            if (sessionUser) {
                const parsedUser = JSON.parse(sessionUser);
                setCurrentUser(parsedUser);
                await checkOpenShift(parsedUser.id);
            }
        } catch (error) {
            console.error("Initialization failed:", error);
            if (error instanceof Dexie.SchemaError) {
                console.error("Database schema error. Deleting and reloading.");
                // FIX: Cast `db` to `any` to access Dexie's `delete` method.
                await (db as any).delete();
                window.location.reload();
            } else {
                toast.error("Failed to initialize application data.");
            }
        } finally {
            setIsInitialized(true);
        }
    }, [checkOpenShift]);

    useEffect(() => {
        initializeApp();
    }, [initializeApp]);

    useEffect(() => {
        localStorage.setItem('theme', theme);
        
        const applySystemTheme = () => {
            if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };

        if (theme === 'system') {
            applySystemTheme();
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', applySystemTheme);
            return () => mediaQuery.removeEventListener('change', applySystemTheme);
        } else {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }
    }, [theme]);

    useEffect(() => {
        if(accentColor) {
            const hexToRgb = (hex: string) => {
                let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
            };

            const rgb = hexToRgb(accentColor);
            if(rgb) {
                const shades: Record<string, string> = {};
                for (let i = 0; i < 10; i++) {
                    const factor = i / 10;
                    const r = Math.round(rgb.r + (255 - rgb.r) * (1 - factor));
                    const g = Math.round(rgb.g + (255 - rgb.g) * (1 - factor));
                    const b = Math.round(rgb.b + (255 - rgb.b) * (1 - factor));
                    shades[i === 0 ? '50' : `${i}00`] = `rgb(${r},${g},${b})`;
                }
                shades['500'] = accentColor;
                for (let i = 6; i <= 9; i++) {
                    const factor = (i-5) / 5;
                    const r = Math.round(rgb.r * (1 - factor));
                    const g = Math.round(rgb.g * (1 - factor));
                    const b = Math.round(rgb.b * (1 - factor));
                     shades[`${i}00`] = `rgb(${r},${g},${b})`;
                }
                 shades['950'] = `rgb(${Math.round(rgb.r * 0.5)},${Math.round(rgb.g * 0.5)},${Math.round(rgb.b * 0.5)})`;
                Object.entries(shades).forEach(([shade, color]) => {
                    document.documentElement.style.setProperty(`--color-primary-${shade}`, color);
                });
            }
        }
    }, [accentColor]);

    useEffect(() => {
        const checkPayments = async () => {
            if (currentUser?.permissions.includes('ManageUsers')) {
                const today = new Date();
                if (today.getDate() <= 7) { // Check in the first week of the month
                    const lastMonth = subMonths(today, 1);
                    const lastMonthPeriod = format(lastMonth, 'yyyy-MM');
                    
                    const alreadyPaid = await db.staffPayments.where({ period: lastMonthPeriod }).count();
                    if (alreadyPaid > 0) return; // Already processed for this month

                    const lastMonthCommissions = await db.staffCommissions.where('date').between(startOfMonth(lastMonth), endOfMonth(lastMonth)).count();
                    const usersWithSalaries = await db.users.where('salary').above(0).count();

                    if (lastMonthCommissions > 0 || usersWithSalaries > 0) {
                        toast.custom((t) => (
                            <div className={`${t.visible ? 'animate-slideInUp' : 'animate-leave'} max-w-md w-full bg-secondary-50 dark:bg-secondary-900 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                                <div className="flex-1 w-0 p-4">
                                    <div className="flex items-start">
                                        <div className="ml-3 flex-1">
                                            <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">Payment Reminder</p>
                                            <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">Staff salaries and commissions for {format(lastMonth, 'MMMM yyyy')} are due.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex border-l border-secondary-200 dark:border-secondary-800">
                                    <Link to="/settings" onClick={() => toast.dismiss(t.id)} className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500">
                                        Review
                                    </Link>
                                </div>
                            </div>
                        ), { duration: 10000, id: 'payment-reminder' });
                    }
                }
            }
        };
        if (isInitialized && currentUser) {
            checkPayments();
        }
    }, [isInitialized, currentUser]);

    const login = async (user: User) => {
        try {
            const role = await db.roles.get(user.roleId);
            const userWithPermissions: UserWithPermissions = {
                ...user,
                permissions: role?.permissions || [],
            };
            setCurrentUser(userWithPermissions);
            sessionStorage.setItem('currentUser', JSON.stringify(userWithPermissions));
            await checkOpenShift(user.id!);
        } catch (error) {
            console.error("Failed to fetch role on login:", error);
            toast.error("Could not load user permissions.");
        }
    };

    const logout = () => {
        setCurrentUser(null);
        setActiveShift(null);
        sessionStorage.removeItem('currentUser');
    };

    const contextValue: AppContextType = useMemo(() => ({
        currentUser,
        storeInfo: storeInfo || null,
        theme,
        accentColor,
        activeShift,
        login,
        logout,
        setTheme,
        setAccentColor: (color) => {
            setAccentColor(color);
            db.storeInfo.update(1, { accentColor: color });
        },
        setActiveShift,
        openShiftModal: (modal) => setShiftModal(modal),
        showConfirmation,
    }), [currentUser, storeInfo, theme, accentColor, activeShift, showConfirmation]);

    if (!isInitialized) {
        return <LoadingSpinner />;
    }

    const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
        const location = useLocation();
        if (!currentUser) {
            return <Navigate to="/login" state={{ from: location }} replace />;
        }
        return children ? <>{children}</> : <Outlet />;
    };

    const PermissionRoute: React.FC<{ permission: Permission }> = ({ permission }) => {
        const { hasPermission } = usePermissions();
        if (!hasPermission(permission)) {
            toast.error("You don't have permission to access this page.");
            return <Navigate to="/" replace />;
        }
        return <Outlet />;
    };

    const AuthRoute: React.FC = () => {
        if (currentUser) {
            return <Navigate to="/" replace />;
        }
        return <Outlet />;
    };
    
    const RegisterRoute: React.FC = () => {
        const hasUsers = useLiveQuery(() => db.users.count()) ?? -1;
        if (hasUsers === -1) return <LoadingSpinner />; 
        if (hasUsers > 0) {
            return <Navigate to="/login" replace />;
        }
        return <RegisterPage />;
    };

    return (
        <AppContext.Provider value={contextValue}>
            <Toaster position="top-center" toastOptions={{
                duration: 5000,
                className: 'bg-secondary-200 dark:bg-secondary-800 text-secondary-900 dark:text-secondary-100 shadow-lg',
                success: { iconTheme: { primary: 'var(--color-primary-500)', secondary: 'white' } },
                error: { iconTheme: { primary: '#ef4444', secondary: 'white' } },
            }} />
            <HashRouter>
                <Routes>
                    <Route element={<AuthRoute />}>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterRoute />} />
                    </Route>
                    
                    <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                        <Route index element={<DashboardPage />} />
                        <Route path="sales" element={<SalesPage />} />
                        <Route path="products" element={<ProductsPage />} />
                        
                        <Route element={<PermissionRoute permission="AccessCustomers" />}>
                            <Route path="customers" element={<CustomersPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessPurchases" />}>
                            <Route path="purchases" element={<PurchasesPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessSuppliers" />}>
                             <Route path="suppliers" element={<SuppliersPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessExpenses" />}>
                            <Route path="expenses" element={<ExpensesPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessReports" />}>
                            <Route path="reports" element={<ReportsPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessSettings" />}>
                            <Route path="settings" element={<SettingsPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessBackup" />}>
                             <Route path="backup" element={<BackupPage />} />
                        </Route>
                        <Route element={<PermissionRoute permission="AccessActivityLog" />}>
                            <Route path="activity" element={<ActivityLogPage />} />
                        </Route>
                         <Route element={<PermissionRoute permission="AccessPromotions" />}>
                            <Route path="promotions" element={<PromotionsPage />} />
                        </Route>
                    </Route>

                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </HashRouter>

            {/* Shift modals rendered at top level */}
            {shiftModal === 'close' && <CloseShiftModal onClose={() => setShiftModal(null)} />}
            {shiftModal === 'drop' && <CashDropModal onClose={() => setShiftModal(null)} />}
            
            {/* Global Confirmation Modal */}
            {confirmation && <ConfirmationModal {...confirmation} onClose={() => setConfirmation(null)} />}
        </AppContext.Provider>
    );
};

export default App;