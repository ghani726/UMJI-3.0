import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { DollarSign, Package, Users, Receipt, TrendingUp, TrendingDown, BarChart2, AlertTriangle, PieChart as PieChartIcon, ShoppingCart, Archive, ChevronsUp, ChevronsDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { useAppContext } from '../hooks/useAppContext';
import type { Sale, Product, Expense } from '../types';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, getHours, getDaysInMonth, getMonth, getYear, eachDayOfInterval, eachHourOfInterval, eachMonthOfInterval, subYears } from 'date-fns';

type DatePreset = 'today' | 'this_week' | 'this_month' | 'this_year' | 'overall';

const StatCard: React.FC<{ title: string; value: string; icon: React.ElementType; }> = ({ title, value, icon: Icon }) => {
    return (
        <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm transition-all hover:shadow-lg hover:-translate-y-1 text-left w-full">
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400 truncate">{title}</p>
                    <p className="text-3xl font-bold text-secondary-900 dark:text-secondary-100 break-words">{value}</p>
                </div>
                <div className="p-3 bg-primary-100 dark:bg-primary-900/50 rounded-full">
                    <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
            </div>
        </div>
    );
};

const TopSellers: React.FC<{ dateRange: { start: Date, end: Date } | null }> = ({ dateRange }) => {
    const topSellers = useLiveQuery(() => {
        const query = dateRange ? db.sales.where('timestamp').between(dateRange.start, dateRange.end) : db.sales;
        return query.toArray().then(sales => {
            const itemMap = new Map<string, { name: string, quantity: number, revenue: number }>();
            sales.forEach(sale => {
                sale.items.forEach(item => {
                    const key = `${item.productId}-${item.variantId}`;
                    const existing = itemMap.get(key) || { name: item.productName, quantity: 0, revenue: 0 };
                    existing.quantity += item.quantity;
                    existing.revenue += item.totalPrice;
                    itemMap.set(key, existing);
                });
            });
            return Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
        });
    }, [dateRange]);

    return (
        <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm h-full">
            <h3 className="font-semibold mb-4 text-secondary-800 dark:text-secondary-200">Top Selling Products</h3>
            <div className="space-y-3">
                {topSellers && topSellers.length > 0 ? topSellers.map((item, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                        <span className="truncate pr-2">{item.name}</span>
                        <span className="font-bold bg-secondary-100 dark:bg-secondary-800 px-2 py-1 rounded">{item.quantity} sold</span>
                    </div>
                )) : (
                    <div className="flex flex-col items-center justify-center h-full py-8 text-secondary-500">
                        <ShoppingCart size={32} className="mb-2 opacity-50" />
                        <p className="text-sm">No sales in this period.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const LowStockAlerts: React.FC = () => {
    const lowStockItems = useLiveQuery(() => 
        db.products.filter(p => p.variants.some(v => v.stock > 0 && v.stock <= p.lowStockThreshold)).toArray()
    , []);

    if (!lowStockItems || lowStockItems.length === 0) {
        return null;
    }

    return (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700/50 p-6 rounded-2xl shadow-sm lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
                <h3 className="font-semibold text-secondary-800 dark:text-secondary-200">Low Stock Items</h3>
            </div>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                {lowStockItems.map(p => p.variants.filter(v => v.stock > 0 && v.stock <= p.lowStockThreshold).map(v => (
                     <div key={v.id} className="flex justify-between items-center text-sm">
                        <span className="truncate pr-2">{p.name} {Object.values(v.attributes).join(' / ')}</span>
                        <span className="font-bold text-red-500 bg-red-100 dark:bg-red-900/50 px-2 py-1 rounded">{v.stock} left</span>
                    </div>
                )))}
            </div>
        </div>
    );
};


const DashboardPage: React.FC = () => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    const [datePreset, setDatePreset] = useState<DatePreset>('this_month');

    const dateRange = useMemo(() => {
        const now = new Date();
        switch (datePreset) {
            case 'today': return { start: startOfDay(now), end: endOfDay(now) };
            case 'this_week': return { start: startOfWeek(now), end: endOfWeek(now) };
            case 'this_year': return { start: startOfYear(now), end: endOfYear(now) };
            case 'overall': return null;
            case 'this_month':
            default:
                return { start: startOfMonth(now), end: endOfMonth(now) };
        }
    }, [datePreset]);

    const stats = useLiveQuery(async () => {
        const salesQuery = dateRange ? db.sales.where('timestamp').between(dateRange.start, dateRange.end) : db.sales;
        const expensesQuery = dateRange ? db.expenses.where('date').between(dateRange.start, dateRange.end) : db.expenses;
        
        const [sales, expenses, products] = await Promise.all([
            salesQuery.toArray(),
            expensesQuery.toArray(),
            db.products.toArray()
        ]);

        const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const allSaleItems = sales.flatMap(s => s.items);
        const cogs = allSaleItems.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
        const grossProfit = totalRevenue - cogs;
        const netProfit = grossProfit - totalExpenses;
        const totalProductsSold = allSaleItems.reduce((sum, item) => sum + item.quantity, 0);

        const totalProductsInStock = products.length;
        const totalItemsInStock = products.flatMap(p => p.variants).reduce((sum, v) => sum + v.stock, 0);

        return { totalRevenue, netProfit, grossProfit, totalExpenses, cogs, totalProductsSold, totalProductsInStock, totalItemsInStock };
    }, [dateRange]);

    const salesChartData = useLiveQuery(async () => {
        const salesQuery = dateRange ? db.sales.where('timestamp').between(dateRange.start, dateRange.end) : db.sales;
        const sales = await salesQuery.toArray();

        if (datePreset === 'today' && dateRange) {
            const hours = eachHourOfInterval({ start: dateRange.start, end: dateRange.end });
            const hourlySales = hours.map(hour => ({ name: format(hour, 'ha'), sales: 0 }));
            sales.forEach(sale => {
                const hourIndex = getHours(sale.timestamp);
                if (hourlySales[hourIndex]) {
                    hourlySales[hourIndex].sales += sale.totalAmount;
                }
            });
            return hourlySales;
        }

        if ((datePreset === 'this_week' || datePreset === 'this_month') && dateRange) {
            const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
            const dailySales: { [key: string]: number } = {};
            days.forEach(day => dailySales[format(day, 'MMM d')] = 0);
            sales.forEach(sale => {
                const day = format(sale.timestamp, 'MMM d');
                dailySales[day] = (dailySales[day] || 0) + sale.totalAmount;
            });
            return Object.entries(dailySales).map(([name, sales]) => ({ name, sales }));
        }

        const monthlySales: { [key: string]: number } = {};
        const rangeStart = dateRange ? dateRange.start : (await db.sales.orderBy('timestamp').first())?.timestamp || subYears(new Date(), 1);
        const months = eachMonthOfInterval({ start: rangeStart, end: new Date() });
        months.forEach(month => monthlySales[format(month, 'MMM yyyy')] = 0);
        
        sales.forEach(sale => {
            const month = format(sale.timestamp, 'MMM yyyy');
            monthlySales[month] = (monthlySales[month] || 0) + sale.totalAmount;
        });
        return Object.entries(monthlySales).map(([name, sales]) => ({ name, sales }));

    }, [dateRange, datePreset]);

    const categorySalesData = useLiveQuery(async () => {
        const salesQuery = dateRange ? db.sales.where('timestamp').between(dateRange.start, dateRange.end) : db.sales;
        const [sales, products, categories] = await Promise.all([
            salesQuery.toArray(),
            db.products.toArray(),
            db.productCategories.toArray()
        ]);

        const productCategoryMap = new Map(products.map(p => [p.id!, p.categoryId]));
        const categoryNameMap = new Map(categories.map(c => [c.id!, c.name]));
        
        const salesByCategory: Record<string, number> = {};
        for (const sale of sales) {
            for (const item of sale.items) {
                const categoryId = productCategoryMap.get(item.productId);
                // FIX: Type 'unknown' cannot be used as an index type. Resolved by ensuring categoryName is always a string and correctly handling uncategorized items.
                const categoryName = (categoryId !== undefined ? categoryNameMap.get(categoryId) : undefined) || 'Uncategorized';
                salesByCategory[categoryName] = (salesByCategory[categoryName] || 0) + item.totalPrice;
            }
        }
        return Object.entries(salesByCategory).map(([name, sales]) => ({ name, sales })).sort((a,b) => b.sales - a.sales);
    }, [dateRange]);

    return (
        <div className="space-y-8 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-4">
                 <h1 className="text-3xl font-bold">Dashboard</h1>
                 <div className="flex flex-wrap gap-2">
                    {(['today', 'this_week', 'this_month', 'this_year', 'overall'] as DatePreset[]).map(preset => (
                        <button key={preset} onClick={() => setDatePreset(preset)} className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${datePreset === preset ? 'bg-primary-600 text-white shadow' : 'bg-secondary-200 dark:bg-secondary-800 hover:bg-secondary-300 dark:hover:bg-secondary-700'}`}>
                            {preset.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </button>
                    ))}
                </div>
            </div>

            <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><TrendingUp size={20}/> Sales Performance</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                    <StatCard title="Total Sales" value={`${currency}${stats?.totalRevenue?.toFixed(2) ?? '0.00'}`} icon={DollarSign} />
                    <StatCard title="Net Profit" value={`${currency}${stats?.netProfit?.toFixed(2) ?? '0.00'}`} icon={ChevronsUp} />
                    <StatCard title="Gross Profit" value={`${currency}${stats?.grossProfit?.toFixed(2) ?? '0.00'}`} icon={BarChart2} />
                    <StatCard title="Products Sold" value={stats?.totalProductsSold?.toString() ?? '0'} icon={ShoppingCart} />
                    <StatCard title="Cost of Goods" value={`${currency}${stats?.cogs?.toFixed(2) ?? '0.00'}`} icon={Package} />
                    <StatCard title="Expenses" value={`${currency}${stats?.totalExpenses?.toFixed(2) ?? '0.00'}`} icon={ChevronsDown} />
                </div>
            </section>
            
             <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Archive size={20}/> Inventory Summary</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                    <StatCard title="Total Products" value={stats?.totalProductsInStock?.toString() ?? '0'} icon={Package} />
                    <StatCard title="Total Items in Stock" value={stats?.totalItemsInStock?.toString() ?? '0'} icon={Archive} />
                </div>
            </section>


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm">
                    <h3 className="font-semibold mb-4 text-secondary-800 dark:text-secondary-200">Sales Overview</h3>
                    {salesChartData && salesChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={salesChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                                <XAxis dataKey="name" tick={{fontSize: 12}} />
                                <YAxis tick={{fontSize: 12}} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-secondary-800)', border: 'none' }} formatter={(value: number) => [`${currency}${value.toFixed(2)}`, "Sales"]}/>
                                <Line type="monotone" dataKey="sales" stroke="var(--color-primary-500)" strokeWidth={2} activeDot={{ r: 8 }} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-[300px] text-secondary-500">
                            <BarChart2 size={48} className="mb-4 opacity-50" />
                            No sales data for this period.
                        </div>
                    )}
                </div>
                 <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm">
                    <h3 className="font-semibold mb-4 text-secondary-800 dark:text-secondary-200">Sales by Category</h3>
                     <ResponsiveContainer width="100%" height={300}>
                        {categorySalesData && categorySalesData.length > 0 ? (
                           <BarChart data={categorySalesData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 12}} />
                                <Tooltip formatter={(value: number) => `${currency}${value.toFixed(2)}`}/>
                                <Bar dataKey="sales" fill="var(--color-primary-500)" />
                            </BarChart>
                        ) : (
                             <div className="flex flex-col items-center justify-center h-full text-secondary-500">
                                <PieChartIcon size={48} className="mb-4 opacity-50" />
                                <p className="text-sm">No category data to display.</p>
                            </div>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-1">
                    <TopSellers dateRange={dateRange} />
                </div>
                <LowStockAlerts />
            </div>
        </div>
    );
};

export default DashboardPage;