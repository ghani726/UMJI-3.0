import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Sale, Product, Expense, Supplier, User, ProductCategory, Shift, Customer, Purchase, ExpenseCategory, StoreInfo } from '../types';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { FileText, Image as ImageIcon, BarChart2, TrendingUp, TrendingDown, Package, CreditCard, PieChart as PieChartIcon, Search, Table, LineChart as LineChartIcon, Donut, Award, Users as UsersIcon, Archive, History, Banknote, Building } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { useAppContext } from '../hooks/useAppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'react-hot-toast';

type ReportTab = 'summary' | 'sales' | 'inventory' | 'expenses' | 'customers_suppliers' | 'shifts';
type VisualizationType = 'table' | 'bar' | 'line' | 'pie' | 'donut';

// --- Reusable UI Components ---
const ReportCard: React.FC<{ title: string; value: string; icon: React.ElementType; }> = ({ title, value, icon: Icon }) => (
    <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400">{title}</p>
                <p className="text-3xl font-bold text-secondary-900 dark:text-secondary-100">{value}</p>
            </div>
            <div className="p-3 bg-primary-100 dark:bg-primary-900/50 rounded-full">
                <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
        </div>
    </div>
);

const DateFilterBar: React.FC<{ dateRange: { start: Date, end: Date }, setDateRange: (range: { start: Date, end: Date }) => void }> = ({ dateRange, setDateRange }) => {
    const presets = { 'Today': { start: startOfDay(new Date()), end: endOfDay(new Date()) }, 'Yesterday': { start: startOfDay(subDays(new Date(), 1)), end: endOfDay(subDays(new Date(), 1)) }, 'Last 7 Days': { start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) }, 'Last 30 Days': { start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) }, 'This Month': { start: startOfMonth(new Date()), end: endOfMonth(new Date()) }, 'Last Month': { start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) } };
    return (<div className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-2xl shadow-sm flex flex-wrap items-center gap-4"><div className="flex items-center gap-2"><label htmlFor="start-date" className="text-sm font-medium">From:</label><input id="start-date" type="date" value={format(dateRange.start, 'yyyy-MM-dd')} onChange={e => setDateRange({ ...dateRange, start: startOfDay(e.target.valueAsDate || new Date()) })} className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-md border border-secondary-200 dark:border-secondary-700"/></div><div className="flex items-center gap-2"><label htmlFor="end-date" className="text-sm font-medium">To:</label><input id="end-date" type="date" value={format(dateRange.end, 'yyyy-MM-dd')} onChange={e => setDateRange({ ...dateRange, end: endOfDay(e.target.valueAsDate || new Date()) })} className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-md border border-secondary-200 dark:border-secondary-700"/></div><div className="flex flex-wrap gap-2">{Object.entries(presets).map(([name, range]) => (<button key={name} onClick={() => setDateRange(range)} className="px-3 py-2 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600 transition">{name}</button>))}</div></div>);
};

const DetailedTable: React.FC<{ headers: string[], data: Record<string, any>[] }> = ({ headers, data }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredData = useMemo(() => { if (!searchTerm) return data; const lowercasedTerm = searchTerm.toLowerCase(); return data.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(lowercasedTerm))); }, [data, searchTerm]);
    if (!data || data.length === 0) return <p className="text-center text-secondary-500 p-8">No data available for this period.</p>;
    const keys = Object.keys(data[0]);
    return (<div className="max-h-[60vh] overflow-y-auto"><div className="relative my-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} /><input type="text" placeholder="Search table..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700"/></div><table className="w-full text-sm text-left"><thead className="bg-secondary-100 dark:bg-secondary-800/50 sticky top-0"><tr>{headers.map((h, i) => <th key={i} className="p-4">{h}</th>)}</tr></thead><tbody>{filteredData.map((row, i) => (<tr key={i} className="border-b border-secondary-200 dark:border-secondary-800">{keys.map(key => <td key={key} className="p-4">{row[key]}</td>)}</tr>))}</tbody></table></div>);
};

// --- Report Generation & Export Logic ---

const VISUALIZATION_ICONS: Record<VisualizationType, React.ElementType> = { table: Table, bar: BarChart2, line: LineChartIcon, pie: PieChartIcon, donut: Donut };
const COLORS = ['#5d2bff', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#d946ef'];

const ReportVisualization: React.FC<{ type: VisualizationType; data: any[]; dataKey: string; nameKey: string; currency: string; }> = ({ type, data, dataKey, nameKey, currency }) => {
    const chartProps = { data, margin: { top: 20, right: 20, bottom: 5, left: 0 } };
    const tooltipFormatter = (value: number) => `${currency}${value.toFixed(2)}`;
    switch(type) {
        case 'bar': return <ResponsiveContainer width="100%" height={300}><BarChart {...chartProps}><CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" /><XAxis dataKey={nameKey} tick={{fontSize: 10}} interval={0} angle={-30} textAnchor="end" /><YAxis tickFormatter={val => `${currency}${val}`} /><Tooltip formatter={tooltipFormatter} contentStyle={{ backgroundColor: 'var(--color-secondary-800)', border: 'none' }} /><Bar dataKey={dataKey} fill="var(--color-primary-500)" /></BarChart></ResponsiveContainer>;
        case 'line': return <ResponsiveContainer width="100%" height={300}><LineChart {...chartProps}><CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" /><XAxis dataKey={nameKey} tick={{fontSize: 12}} /><YAxis tickFormatter={val => `${currency}${val}`} /><Tooltip formatter={tooltipFormatter} contentStyle={{ backgroundColor: 'var(--color-secondary-800)', border: 'none' }} /><Line type="monotone" dataKey={dataKey} stroke="var(--color-primary-500)" strokeWidth={2} /></LineChart></ResponsiveContainer>;
        case 'pie': case 'donut': return <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={100} innerRadius={type === 'donut' ? 60 : 0} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => { const RADIAN = Math.PI / 180; const radius = innerRadius + (outerRadius - innerRadius) * 0.5; const x = cx + radius * Math.cos(-midAngle * RADIAN); const y = cy + radius * Math.sin(-midAngle * RADIAN); return (percent > 0.05) ? <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">{`${(percent * 100).toFixed(0)}%`}</text> : null; }}>{(data || []).map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={tooltipFormatter} /><Legend /></PieChart></ResponsiveContainer>;
        default: return null;
    }
};

const ReportLayout: React.FC<{
    reportTitle: string;
    dateRange: { start: Date; end: Date };
    storeInfo: StoreInfo;
    summaryCards: React.ReactNode;
    visualization: React.ReactNode;
    dataTable: React.ReactNode;
}> = ({ reportTitle, dateRange, storeInfo, summaryCards, visualization, dataTable }) => {
    const layoutMap: Record<string, React.ReactNode> = {
        logo: storeInfo.logo ? <img src={storeInfo.logo} alt="Logo" className="w-24 h-auto mb-4" /> : null,
        storeName: storeInfo.storeName ? <h1 className="text-3xl font-bold">{storeInfo.storeName}</h1> : null,
        address: <p className="text-sm">{storeInfo.address} | {storeInfo.phone}</p>,
        reportTitle: <h2 className="text-2xl font-semibold mt-4">{reportTitle}</h2>,
        dateRange: storeInfo.reportShowDate ? <p className="text-secondary-500 mb-4">{format(dateRange.start, 'PP')} - {format(dateRange.end, 'PP')}</p> : null,
        summaryCards: summaryCards,
        chart: visualization,
        dataTable: dataTable,
    };

    return (
        <div className="bg-white text-black p-8 font-sans">
            {(storeInfo.reportLayoutOrder || []).map(id => (
                <div key={id}>{layoutMap[id]}</div>
            ))}
        </div>
    );
};


const ReportContainer: React.FC<{ title: string; dateRange: { start: Date, end: Date }; reportComponent: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }>; }> = ({ title, dateRange, reportComponent: ReportComponent }) => {
    const { storeInfo } = useAppContext();
    const [reportData, setReportData] = useState<any | null>(null);
    const [visualizationType, setVisualizationType] = useState<VisualizationType>('bar');
    const exportRef = useRef<HTMLDivElement>(null);

    const handleExport = async (type: 'pdf' | 'png' | 'xls' | 'csv') => {
        if (!reportData) return toast.error("Report data is not available yet.");
        const filename = `${title.replace(/ /g, '_')}_${format(new Date(), 'yyyyMMdd')}`;
        if (type === 'xls') return exportToXLS(reportData.tableHeaders, reportData.tableData.map((row: any) => Object.values(row)), filename);
        if (type === 'csv') return exportToCSV(reportData.tableHeaders, reportData.tableData.map((row: any) => Object.values(row)), filename);
        if (exportRef.current) {
            toast.loading('Generating export...', { id: 'export-toast' });
            const canvas = await html2canvas(exportRef.current, { scale: 2 });
            if (type === 'png') { const link = document.createElement('a'); link.download = `${filename}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }
            else if (type === 'pdf') { const imgData = canvas.toDataURL('image/png'); const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: storeInfo?.reportPaperSize.toLowerCase() || 'a4' }); const pdfWidth = pdf.internal.pageSize.getWidth(); const canvasWidth = canvas.width; const canvasHeight = canvas.height; const ratio = canvasWidth / canvasHeight; const imgHeight = pdfWidth / ratio; pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight); pdf.save(`${filename}.pdf`); }
            toast.success('Export complete!', { id: 'export-toast' });
        }
    };
    
    return (<div className="space-y-6">
        {/* Invisible component to calculate data */}
        <ReportComponent dateRange={dateRange} onDataReady={setReportData} />

        {/* Always visible cards */}
        {reportData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {(reportData.summaryCards || []).map((card: any) => <ReportCard key={card.title} {...card} />)}
            </div>
        ) : <p>Loading report data...</p>}
        
        {/* Visualization Section */}
        {reportData && (<div className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-2xl shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold mr-4">View As:</h3>{(Object.keys(VISUALIZATION_ICONS) as VisualizationType[]).map(vizType => (<button key={vizType} onClick={() => setVisualizationType(vizType)} className={`p-2 rounded-lg ${visualizationType === vizType ? 'bg-primary-500 text-white' : 'bg-secondary-200 dark:bg-secondary-700'}`}>{React.createElement(VISUALIZATION_ICONS[vizType], { size: 20 })}</button>))}</div>
                <div className="flex flex-wrap gap-2"><button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"><FileText size={16}/> PDF</button><button onClick={() => handleExport('png')} className="flex items-center gap-2 px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"><ImageIcon size={16}/> PNG</button><button onClick={() => handleExport('xls')} className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">XLS</button><button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">CSV</button></div>
            </div>
            {visualizationType === 'table' ? <DetailedTable headers={reportData.tableHeaders} data={reportData.tableData || []} /> : <ReportVisualization type={visualizationType} data={reportData.chartData || []} dataKey={reportData.chartDataKey} nameKey={reportData.chartNameKey} currency={storeInfo?.currency || '$'} />}
        </div>)}

        <div style={{ position: 'fixed', left: '-2000px', top: 0, zIndex: -1 }}>
             {reportData && storeInfo && <div ref={exportRef}><ReportLayout reportTitle={title} dateRange={dateRange} storeInfo={storeInfo} summaryCards={<div className="grid grid-cols-2 gap-4">{(reportData.summaryCards || []).map((card: any) => <ReportCard key={card.title} {...card} />)}</div>} visualization={visualizationType === 'table' ? null : <ReportVisualization type={visualizationType} {...reportData} data={reportData.chartData || []} currency={storeInfo.currency} />} dataTable={<DetailedTable headers={reportData.tableHeaders} data={reportData.tableData || []} />} /></div>}
        </div>
    </div>);
};

// --- Helper Functions ---
const getRootCategory = (categoryId: number | undefined, categoryMap: Map<number, ProductCategory>): ProductCategory | null => {
    if (categoryId === undefined) return null;
    let current = categoryMap.get(categoryId);
    if (!current) return null;
    while (current.parentId) { const parent = categoryMap.get(current.parentId); if (!parent) break; current = parent; }
    return current;
};

// --- Individual Report Logic Components (defined inside main component to keep it one file) ---

const ReportsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ReportTab>('summary');
    const [dateRange, setDateRange] = useState({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) });

    // --- REPORT: SUMMARY ---
    const SummaryReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
        const { storeInfo } = useAppContext(); const currency = storeInfo?.currency || '$';
        const data = useLiveQuery(async () => {
            const sales = await db.sales.where('timestamp').between(dateRange.start, dateRange.end, true, true).toArray();
            const expenses = await db.expenses.where('date').between(dateRange.start, dateRange.end, true, true).toArray();
            const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
            const cogs = sales.flatMap(s => s.items || []).reduce((sum, i) => sum + (Number(i.costPrice) || 0) * Math.abs(Number(i.quantity) || 0), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
            const grossProfit = revenue - cogs;
            const netProfit = grossProfit - totalExpenses;
            return { revenue, cogs, totalExpenses, grossProfit, netProfit, salesCount: sales.length, expensesCount: expenses.length };
        }, [dateRange]);

        useEffect(() => {
            if (!data) return;
            onDataReady({
                summaryCards: [ { title: "Net Profit", value: `${currency}${data.netProfit.toFixed(2)}`, icon: TrendingUp }, { title: "Gross Profit", value: `${currency}${data.grossProfit.toFixed(2)}`, icon: BarChart2 }, { title: "Revenue", value: `${currency}${data.revenue.toFixed(2)}`, icon: CreditCard }, { title: "Expenses", value: `${currency}${data.totalExpenses.toFixed(2)}`, icon: TrendingDown } ],
                tableHeaders: ['Metric', 'Amount'],
                tableData: [ { metric: 'Total Revenue', amount: `${currency}${data.revenue.toFixed(2)}`}, { metric: 'Cost of Goods Sold (COGS)', amount: `-${currency}${data.cogs.toFixed(2)}`}, { metric: 'Gross Profit', amount: `${currency}${data.grossProfit.toFixed(2)}`}, { metric: 'Operating Expenses', amount: `-${currency}${data.totalExpenses.toFixed(2)}`}, { metric: 'Net Profit', amount: `${currency}${data.netProfit.toFixed(2)}`}, ],
                chartData: [{ name: 'Revenue', value: data.revenue }, { name: 'Gross Profit', value: data.grossProfit }, { name: 'Expenses', value: data.totalExpenses }, { name: 'Net Profit', value: data.netProfit }],
                chartDataKey: 'value',
                chartNameKey: 'name'
            });
        }, [data, currency, onDataReady]);
        return null;
    };

    // --- REPORT: SALES ---
    const SalesReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
        const { storeInfo } = useAppContext(); const currency = storeInfo?.currency || '$';
        const data = useLiveQuery(async () => {
            const sales = await db.sales.where('timestamp').between(dateRange.start, dateRange.end, true, true).toArray();
            const expenses = await db.expenses.where('date').between(dateRange.start, dateRange.end, true, true).toArray();
            const products = await db.products.toArray();
            const categories = await db.productCategories.toArray();
            const categoryMap = new Map((categories as ProductCategory[]).map(c => [c.id!, c]));
            const productCategoryMap = new Map((products as Product[]).map(p => [p.id!, p.categoryId]));
            
            const totalUnitsSold = sales.reduce((sum, s) => sum + s.items.reduce((iSum, i) => iSum + Math.abs(i.quantity), 0), 0);
            const totalRevenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
            // FIX: Robustly calculate totalCOGS to prevent errors with potentially non-numeric or missing data.
            const totalCOGS = sales.flatMap(s => s.items || []).reduce((sum, i) => sum + (Number(i.costPrice) || 0) * Math.abs(Number(i.quantity) || 0), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
            const grossProfit = totalRevenue - totalCOGS;
            const netProfit = grossProfit - totalExpenses;
            const avgMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
            
            const salesByRootCategory: Record<string, number> = {};
            for (const sale of sales) {
                for (const item of sale.items) {
                    const categoryId = productCategoryMap.get(item.productId);
                    const rootCategory = getRootCategory(categoryId, categoryMap);
                    const rootName = rootCategory?.name || 'Uncategorized';
                    salesByRootCategory[rootName] = (salesByRootCategory[rootName] || 0) + item.totalPrice;
                }
            }
            return { totalUnitsSold, totalRevenue, totalCOGS, grossProfit, netProfit, avgMargin, totalExpenses, salesByRootCategory, sales };
        }, [dateRange]);

        useEffect(() => {
            if (!data) return;
            onDataReady({
                // FIX: Cast properties to 'number' before calling .toFixed() to prevent 'unknown' type errors from useLiveQuery.
                summaryCards: [ { title: "Total Sales", value: `${currency}${(data.totalRevenue as number).toFixed(2)}`, icon: TrendingUp }, { title: "Net Profit", value: `${currency}${(data.netProfit as number).toFixed(2)}`, icon: BarChart2 }, { title: "Products Sold", value: (data.totalUnitsSold as number).toString(), icon: Package }, { title: "Avg. Profit Margin", value: `${(data.avgMargin as number).toFixed(2)}%`, icon: PieChartIcon } ],
                tableHeaders: ['Invoice #', 'Date', 'Customer', 'Items', 'Total'],
                tableData: data.sales.map(s => ({ invoice: `#${s.invoiceNumber}`, date: format(s.timestamp, 'PPp'), customer: s.customerName || 'N/A', items: s.items.reduce((sum, i) => sum + Math.abs(i.quantity), 0), total: `${currency}${s.totalAmount.toFixed(2)}` })),
                chartData: Object.entries(data.salesByRootCategory).map(([name, value]) => ({ name, value })),
                chartDataKey: 'value',
                chartNameKey: 'name'
            });
        }, [data, currency, onDataReady]);
        return null;
    };

    // --- REPORT: INVENTORY ---
    const InventoryReport: React.FC<{ onDataReady: (data: any) => void }> = ({ onDataReady }) => {
        const { storeInfo } = useAppContext(); const currency = storeInfo?.currency || '$';
        const data = useLiveQuery(async () => {
            const products = await db.products.toArray();
            const categories = await db.productCategories.toArray();
            const categoryMap = new Map((categories as ProductCategory[]).map(c => [c.id!, c]));
            const totalProducts = products.length;
            const allVariants = products.flatMap(p => p.variants.map(v => ({...v, product: p})));
            const totalUnits = allVariants.reduce((sum, v) => sum + v.stock, 0);
            const inventoryCostValue = allVariants.reduce((sum, v) => sum + v.stock * v.costPrice, 0);
            const potentialRevenue = allVariants.reduce((sum, v) => sum + v.stock * v.sellingPrice, 0);

            const stockByRootCategory: Record<string, number> = {};
            for (const product of products) {
                const rootCategory = getRootCategory(product.categoryId, categoryMap);
                const rootName = rootCategory?.name || 'Uncategorized';
                const productStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
                stockByRootCategory[rootName] = (stockByRootCategory[rootName] || 0) + productStock;
            }
            return { totalProducts, totalUnits, inventoryCostValue, potentialRevenue, stockByRootCategory, allVariants };
        }, []);

        useEffect(() => {
            if (!data) return;
            onDataReady({
                summaryCards: [ { title: "Total Products", value: data.totalProducts.toString(), icon: Archive }, { title: "Total Units in Stock", value: data.totalUnits.toString(), icon: Package }, { title: "Inventory Cost Value", value: `${currency}${data.inventoryCostValue.toFixed(2)}`, icon: TrendingDown }, { title: "Potential Revenue", value: `${currency}${data.potentialRevenue.toFixed(2)}`, icon: TrendingUp } ],
                tableHeaders: ['Product', 'Variant', 'SKU', 'Stock', 'Cost', 'Price'],
                tableData: data.allVariants.map(v => ({ product: v.product.name, variant: Object.values(v.attributes).join(' / ') || 'Standard', sku: v.sku || 'N/A', stock: v.stock, cost: `${currency}${v.costPrice.toFixed(2)}`, price: `${currency}${v.sellingPrice.toFixed(2)}` })),
                chartData: Object.entries(data.stockByRootCategory).map(([name, value]) => ({ name, value })),
                chartDataKey: 'value',
                chartNameKey: 'name'
            });
        }, [data, currency, onDataReady]);
        return null;
    };
    
    // --- REPORT: EXPENSES ---
    const ExpensesReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
        const { storeInfo } = useAppContext(); const currency = storeInfo?.currency || '$';
        const data = useLiveQuery(async () => {
            const expenses = await db.expenses.where('date').between(dateRange.start, dateRange.end, true, true).toArray();
            const categories = await db.expenseCategories.toArray();
            const categoryMap = categories ? new Map((categories as ExpenseCategory[]).map(c => [c.id!, c.name])) : new Map();
            const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
            const expensesByCategory = expenses.reduce((acc, e) => {
                const catName: string = categoryMap.get(e.categoryId) || 'Uncategorized';
                acc[catName] = (acc[catName] || 0) + e.amount;
                return acc;
            }, {} as Record<string, number>);
            return { expenses, categoryMap, totalExpenses, expensesByCategory };
        }, [dateRange]);

        useEffect(() => {
            if (!data) return;
            const sortedCategories = Object.entries(data.expensesByCategory).sort((a,b) => b[1] - a[1]);
            onDataReady({
                summaryCards: [
                    { title: "Total Expenses", value: `${currency}${data.totalExpenses.toFixed(2)}`, icon: Banknote },
                    ...sortedCategories.slice(0, 3).map(([name, value]) => ({ title: name, value: `${currency}${value.toFixed(2)}`, icon: TrendingDown }))
                ],
                tableHeaders: ['Date', 'Category', 'Amount', 'Notes'],
                tableData: data.expenses.map(e => ({ date: format(e.date, 'PP'), category: data.categoryMap.get(e.categoryId) || 'N/A', amount: `${currency}${e.amount.toFixed(2)}`, notes: e.notes || '' })),
                chartData: sortedCategories.map(([name, value]) => ({ name, value })),
                chartDataKey: 'value',
                chartNameKey: 'name'
            });
        }, [data, currency, onDataReady]);
        return null;
    };

    // --- REPORT: CUSTOMERS & SUPPLIERS ---
    const CustomersSuppliersReport: React.FC<{ dateRange: { start: Date, end: Date } }> = ({ dateRange }) => {
        const { storeInfo } = useAppContext(); const currency = storeInfo?.currency || '$';
        const data = useLiveQuery(async () => {
            const customers = await db.customers.count();
            const suppliers = await db.suppliers.toArray();
            const purchases = await db.purchases.where('paymentStatus').notEqual('paid').toArray();
            const dueToSuppliers = purchases.reduce((acc, p) => {
                const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || 'Unknown';
                const due = p.totalAmount - p.amountPaid;
                acc[supplierName] = (acc[supplierName] || 0) + due;
                return acc;
            }, {} as Record<string, number>);
            return { customers, suppliers, dueToSuppliers };
        }, [dateRange]);

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <ReportCard title="Total Customers" value={data?.customers.toString() || '0'} icon={UsersIcon} />
                    <ReportCard title="Total Suppliers" value={data?.suppliers?.length.toString() || '0'} icon={Building} />
                </div>
                {data && Object.keys(data.dueToSuppliers).length > 0 && (<>
                    <h3 className="text-xl font-semibold">Supplier Payables</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {Object.entries(data.dueToSuppliers).map(([name, due]) => (
                            <ReportCard key={name} title={`Due to ${name}`} value={`${currency}${Number(due).toFixed(2)}`} icon={Banknote} />
                        ))}
                    </div>
                </>)}
                <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm"><h3 className="text-xl font-semibold mb-2">Suppliers List</h3><DetailedTable headers={['Name', 'Contact', 'Phone', 'Email']} data={data?.suppliers?.map(s => ({ name: s.name, contact: s.contactPerson || 'N/A', phone: s.phone, email: s.email || 'N/A' })) || []} /></div>
            </div>
        );
    };

    // --- REPORT: SHIFTS ---
    const ShiftsReport: React.FC<{ dateRange: { start: Date, end: Date } }> = ({ dateRange }) => {
        const { storeInfo } = useAppContext(); const currency = storeInfo?.currency || '$';
        const shifts = useLiveQuery(() => db.shifts.where('startTime').between(dateRange.start, dateRange.end, true, true).and(s => s.status === 'closed').reverse().toArray(), [dateRange]);
        if (!shifts) return <p>Loading shift reports...</p>;
        return (<div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm"><h3 className="text-lg font-semibold mb-4">Shift History</h3><DetailedTable headers={['Shift ID', 'User', 'Start Time', 'End Time', 'Expected Cash', 'Counted Cash', 'Difference']} data={shifts.map(s => { 
            const closing = s.closingBalance || 0;
            const expected = s.expectedBalance || 0;
            const difference = closing - expected;
            return { id: `#${s.id}`, user: s.username, start: format(s.startTime, 'PPp'), end: s.endTime ? format(s.endTime, 'PPp') : 'N/A', expected: `${currency}${expected.toFixed(2)}`, counted: `${currency}${closing.toFixed(2)}`, difference: `${difference >= 0 ? '+' : ''}${currency}${difference.toFixed(2)}` }; 
        })}/></div>);
    };

    const reportMapping: Record<ReportTab, { title: string, component: React.FC<any>, isDateFiltered: boolean }> = {
        summary: { title: 'Summary Report', component: SummaryReport, isDateFiltered: true },
        sales: { title: 'Sales Report', component: SalesReport, isDateFiltered: true },
        inventory: { title: 'Inventory Report', component: InventoryReport, isDateFiltered: false },
        expenses: { title: 'Expenses Report', component: ExpensesReport, isDateFiltered: true },
        customers_suppliers: { title: 'Customers & Suppliers', component: CustomersSuppliersReport, isDateFiltered: false },
        shifts: { title: 'Shifts Report', component: ShiftsReport, isDateFiltered: true },
    };

    const tabs: { id: ReportTab, label: string }[] = [ { id: 'summary', label: 'Summary' }, { id: 'sales', label: 'Sales' }, { id: 'inventory', label: 'Inventory' }, { id: 'expenses', label: 'Expenses' }, { id: 'customers_suppliers', label: 'Customers & Suppliers' }, { id: 'shifts', label: 'Shifts' } ];
    const { title, component: ReportComponent, isDateFiltered } = reportMapping[activeTab];

    return (
        <div className="animate-fadeIn space-y-6">
            <h1 className="text-3xl font-bold">Reports</h1>
            {isDateFiltered && <DateFilterBar dateRange={dateRange} setDateRange={setDateRange} />}
            <div className="border-b border-secondary-200 dark:border-secondary-800"><nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">{tabs.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`${activeTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>{tab.label}</button>))}</nav></div>
            {activeTab === 'shifts' || activeTab === 'customers_suppliers' ? <ReportComponent dateRange={dateRange} /> : <ReportContainer title={title} dateRange={dateRange} reportComponent={ReportComponent} />}
        </div>
    );
};

// --- Export Helper Logic ---
const excelTemplate = (worksheet: string, table: string) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>${table}</table></body></html>`;
const generateFile = (content: string, filename: string, type: string) => { const blob = new Blob([content], { type }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); URL.revokeObjectURL(link.href); };
const exportToXLS = (headers: string[], data: any[][], filename: string) => { const tableHeader = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`; const tableBody = `<tbody>${data.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`; generateFile(excelTemplate('Report', tableHeader + tableBody), `${filename}.xls`, 'application/vnd.ms-excel'); };
const exportToCSV = (headers: string[], data: any[][], filename: string) => { const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n'); generateFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;'); };

export default ReportsPage;
