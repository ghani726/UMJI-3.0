

import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Users, Truck, Receipt, BarChart2, Settings, History, Save, Building, Megaphone } from 'lucide-react';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';
import type { Permission } from '../types';

interface NavItem {
    to: string;
    icon: React.ElementType;
    label: string;
    permission?: Permission;
}

const navItems: NavItem[] = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: 'AccessDashboard' },
    { to: '/sales', icon: ShoppingCart, label: 'Sales', permission: 'AccessSales' },
    { to: '/products', icon: Package, label: 'Products', permission: 'AccessProducts' },
    { to: '/customers', icon: Users, label: 'Customers', permission: 'AccessCustomers' },
    { to: '/purchases', icon: Truck, label: 'Purchases', permission: 'AccessPurchases' },
    { to: '/suppliers', icon: Building, label: 'Suppliers', permission: 'AccessSuppliers' },
    { to: '/expenses', icon: Receipt, label: 'Expenses', permission: 'AccessExpenses' },
    { to: '/reports', icon: BarChart2, label: 'Reports', permission: 'AccessReports' },
    { to: '/promotions', icon: Megaphone, label: 'Promotions', permission: 'AccessPromotions' },
    { to: '/activity', icon: History, label: 'Activity Log', permission: 'AccessActivityLog' },
    { to: '/backup', icon: Save, label: 'Backup/Restore', permission: 'AccessBackup' },
    { to: '/settings', icon: Settings, label: 'Settings', permission: 'AccessSettings' },
];

const Sidebar: React.FC = () => {
    const { storeInfo } = useAppContext();
    const { hasPermission } = usePermissions();
    
    const accessibleNavItems = navItems.filter(item => !item.permission || hasPermission(item.permission));

    return (
        <aside className="hidden md:flex flex-col w-64 bg-secondary-50 dark:bg-secondary-900 border-r border-secondary-200 dark:border-secondary-800 transition-all duration-300">
            <div className="h-16 flex items-center justify-center px-4 border-b border-secondary-200 dark:border-secondary-800">
                 <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400 truncate">{storeInfo?.storeName || 'UMJI POS'}</h1>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-2">
                {accessibleNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                            `flex items-center px-4 py-2.5 rounded-lg transition-colors duration-200 text-sm font-medium ${
                                isActive
                                    ? 'bg-primary-500 text-white shadow-md'
                                    : 'text-secondary-600 dark:text-secondary-300 hover:bg-secondary-200 dark:hover:bg-secondary-800'
                            }`
                        }
                    >
                        <item.icon size={20} className="mr-3" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

export default Sidebar;