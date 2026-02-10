

import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Users, Truck, Receipt, BarChart2, Settings, History, Save, Building, Menu, X, Megaphone } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import type { Permission } from '../types';

interface NavItem {
    to: string;
    icon: React.ElementType;
    label: string;
    permission: Permission;
}

const mainNavItems: NavItem[] = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'AccessDashboard' },
    { to: '/sales', icon: ShoppingCart, label: 'Sales', permission: 'AccessSales' },
    { to: '/products', icon: Package, label: 'Products', permission: 'AccessProducts' },
    { to: '/reports', icon: BarChart2, label: 'Reports', permission: 'AccessReports' },
];

const moreNavItems: NavItem[] = [
    { to: '/customers', icon: Users, label: 'Customers', permission: 'AccessCustomers' },
    { to: '/purchases', icon: Truck, label: 'Purchases', permission: 'AccessPurchases' },
    { to: '/suppliers', icon: Building, label: 'Suppliers', permission: 'AccessSuppliers' },
    { to: '/expenses', icon: Receipt, label: 'Expenses', permission: 'AccessExpenses' },
    { to: '/promotions', icon: Megaphone, label: 'Promotions', permission: 'AccessPromotions' },
    { to: '/activity', icon: History, label: 'Activity Log', permission: 'AccessActivityLog' },
    { to: '/backup', icon: Save, label: 'Backup/Restore', permission: 'AccessBackup' },
    { to: '/settings', icon: Settings, label: 'Settings', permission: 'AccessSettings' },
]

const BottomNav: React.FC = () => {
    const { hasPermission } = usePermissions();
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const accessibleMainNavItems = mainNavItems.filter(item => hasPermission(item.permission));
    const accessibleMoreNavItems = moreNavItems.filter(item => hasPermission(item.permission));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMoreMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuRef]);


    return (
        <>
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-secondary-50 dark:bg-secondary-900 border-t border-secondary-200 dark:border-secondary-800 flex justify-around z-50">
                {accessibleMainNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                            `flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs transition-colors duration-200 ${
                                isActive
                                    ? 'text-primary-500'
                                    : 'text-secondary-500 dark:text-secondary-400'
                            }`
                        }
                    >
                        <item.icon size={24} strokeWidth={1.5} />
                        <span className="mt-1">{item.label}</span>
                    </NavLink>
                ))}
                {accessibleMoreNavItems.length > 0 && (
                    <button
                        onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                        className={`flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs transition-colors duration-200 ${
                            isMoreMenuOpen ? 'text-primary-500' : 'text-secondary-500 dark:text-secondary-400'
                        }`}
                    >
                        {isMoreMenuOpen ? <X size={24} strokeWidth={1.5} /> : <Menu size={24} strokeWidth={1.5} />}
                        <span className="mt-1">More</span>
                    </button>
                )}
            </nav>

            {isMoreMenuOpen && (
                 <div ref={menuRef} className="md:hidden fixed bottom-[3.5rem] right-2 bg-secondary-50 dark:bg-secondary-900 rounded-xl shadow-2xl p-2 z-50 w-48 animate-slideInUp border border-secondary-200 dark:border-secondary-800">
                    <nav className="flex flex-col gap-1">
                        {accessibleMoreNavItems.map((item) => (
                             <NavLink
                                key={item.to}
                                to={item.to}
                                onClick={() => setIsMoreMenuOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center px-3 py-2.5 rounded-lg transition-colors duration-200 text-sm font-medium ${
                                        isActive
                                            ? 'bg-primary-500 text-white shadow-sm'
                                            : 'text-secondary-600 dark:text-secondary-300 hover:bg-secondary-200 dark:hover:bg-secondary-800'
                                    }`
                                }
                            >
                                <item.icon size={20} className="mr-3" />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </div>
            )}
        </>
    );
};

export default BottomNav;