import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Sale, Product, Expense, SaleItem, Supplier, User, ProductCategory, Variant, ReportLayoutElement, StoreInfo, StaffCommission, Shift } from '../types';
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, isValid } from 'date-fns';
import { FileText, Image as ImageIcon, Download, BarChart2, TrendingUp, TrendingDown, Package, CreditCard, PieChart as PieChartIcon, Info, Search, FileDown, Table, LineChart as LineChartIcon, Donut, Award, Users, Archive, History } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { useAppContext } from '../hooks/useAppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'react-hot-toast';

type ReportTab = 'summary' | 'sales' | 'profit_loss' | 'stock' | 'sellers' | 'commission' | 'shifts';
type VisualizationType = 'table' | 'bar' | 'line' | 'pie' | 'donut';

// --- Reusable Components ---
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
    const presets = {
        'Today': { start: startOfDay(new Date()), end: endOfDay(new Date()) },
        'Yesterday': { start: startOfDay(subDays(new Date(), 1)), end: endOfDay(subDays(new Date(), 1)) },
        'Last 7 Days': { start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) },
        'Last 30 Days': { start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) },
        'This Month': { start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
        'Last Month': { start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }
    };

    return (
        <div className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-2xl shadow-sm flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
                <label htmlFor="start-date" className="text-sm font-medium">From:</label>
                <input id="start-date" type="date" value={format(dateRange.start, 'yyyy-MM-dd')} onChange={e => setDateRange({ ...dateRange, start: startOfDay(e.target.valueAsDate || new Date()) })} className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-md border border-secondary-200 dark:border-secondary-700"/>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="end-date" className="text-sm font-medium">To:</label>
                <input id="end-date" type="date" value={format(dateRange.end, 'yyyy-MM-dd')} onChange={e => setDateRange({ ...dateRange, end: endOfDay(e.target.valueAsDate || new Date()) })} className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-md border border-secondary-200 dark:border-secondary-700"/>
            </div>
            <div className="flex flex-wrap gap-2">
                {Object.entries(presets).map(([name, range]) => (
                    <button key={name} onClick={() => setDateRange(range)} className="px-3 py-2 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600 transition">{name}</button>
                ))}
            </div>
        </div>
    );
};

const COLORS = ['#5d2bff', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#d946ef'];

// --- Visualization Components ---
const ReportVisualization: React.FC<{
    type: VisualizationType;
    chartData: any[];
    tableData: any[];
    tableHeaders: string[];
    dataKey: string;
    nameKey: string;
}> = ({ type, chartData, tableData, tableHeaders, dataKey, nameKey }) => {
    switch(type) {
        case 'bar':
            return <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                    <XAxis dataKey={nameKey} />
                    <YAxis />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--color-secondary-800)', border: 'none' }} />
                    <Bar dataKey={dataKey} fill="var(--color-primary-500)" />
                </BarChart>
            </ResponsiveContainer>;
        case 'line':
            return <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
                    <XAxis dataKey={nameKey} />
                    <YAxis />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--color-secondary-800)', border: 'none' }} />
                    <Line type="monotone" dataKey={dataKey} stroke="var(--color-primary-500)" strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>;
        case 'pie':
        case 'donut':
             return <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie data={chartData} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={100} innerRadius={type === 'donut' ? 60 : 0} label>
                        {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>;
        case 'table':
        default:
            return <DetailedTable headers={tableHeaders} data={tableData} />;
    }
};

// --- Report Layout & Export ---
const ReportLayout: React.FC<{
    reportTitle: string;
    dateRange: { start: Date, end: Date };
    storeInfo: StoreInfo | null;
    summaryCards: React.ReactNode;
    visualization: React.ReactNode;
    dataTable: React.ReactNode;
}> = ({ reportTitle, dateRange, storeInfo, summaryCards, visualization, dataTable }) => {
    const layoutOrder = storeInfo?.reportLayoutOrder || ['logo', 'storeName', 'address', 'reportTitle', 'dateRange', 'summaryCards', 'chart', 'dataTable'];
    
    const paperStyles: React.CSSProperties = {
        width: storeInfo?.reportPaperSize === 'A4' ? '210mm' : storeInfo?.reportPaperSize === 'A5' ? '148mm' : '8.5in',
        padding: `${storeInfo?.reportMargins?.top || 20}mm ${storeInfo?.reportMargins?.right || 15}mm ${storeInfo?.reportMargins?.bottom || 20}mm ${storeInfo?.reportMargins?.left || 15}mm`,
    };

    const components: Record<ReportLayoutElement['id'], React.ReactNode> = {
        logo: storeInfo?.logo ? <img src={storeInfo.logo} alt="logo" className="w-24 h-auto mb-4"/> : null,
        storeName: <h1 className="text-2xl font-bold">{storeInfo?.storeName}</h1>,
        address: <p className="text-sm text-gray-500">{storeInfo?.address} - {storeInfo?.phone}</p>,
        reportTitle: <h2 className="text-xl font-semibold mt-4 border-b pb-2 mb-2">{reportTitle}</h2>,
        dateRange: storeInfo?.reportShowDate ? <p className="text-sm text-gray-500 mb-4">{format(dateRange.start, 'PP')} to {format(dateRange.end, 'PP')}</p> : null,
        summaryCards: <div className="print-no-break">{summaryCards}</div>,
        chart: <div className="print-no-break">{visualization}</div>,
        dataTable: <div className="print-no-break">{dataTable}</div>,
    };

    return (
        <div style={paperStyles} className="bg-white text-black font-sans report-container">
            <style>{`
                @media print {
                    .report-container { page-break-after: always; }
                    .print-no-break { page-break-inside: avoid; }
                }
            `}</style>
            <div className="report-content space-y-4">
                {layoutOrder.map(id => <div key={id}>{components[id]}</div>)}
            </div>
            <div className="report-footer text-center text-xs text-gray-400 border-t pt-2 mt-8">
                <p>Page <span className="page-number"></span> of <span className="total-pages"></span> - Generated on {format(new Date(), 'PPpp')}</p>
                <p>Software by UMJI POS</p>
            </div>
        </div>
    );
};

const ReportContainer: React.FC<{
    title: string;
    dateRange: { start: Date, end: Date };
    reportComponent: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }>;
}> = ({ title, dateRange, reportComponent: ReportComponent }) => {
    const { storeInfo } = useAppContext();
    const [reportData, setReportData] = useState<any | null>(null);
    const [visualizationType, setVisualizationType] = useState<VisualizationType>('table');
    const exportRef = useRef<HTMLDivElement>(null);

    const handleExport = async (type: 'pdf' | 'png' | 'xls' | 'csv') => {
        if (!reportData) {
            toast.error("Report data is not available yet.");
            return;
        }

        const filename = `${title.replace(/ /g, '_')}_${format(new Date(), 'yyyyMMdd')}`;
        
        if (type === 'xls') {
            exportToXLS(reportData.tableHeaders, reportData.tableData.map((row: any) => Object.values(row)), filename);
            return;
        }
        if (type === 'csv') {
            exportToCSV(reportData.tableHeaders, reportData.tableData.map((row: any) => Object.values(row)), filename);
            return;
        }

        if (exportRef.current) {
            toast.loading('Generating export...', { id: 'export-toast' });
            const canvas = await html2canvas(exportRef.current, { scale: 2 });
            if (type === 'png') {
                const link = document.createElement('a');
                link.download = `${filename}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } else if (type === 'pdf') {
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF({
                    orientation: 'p',
                    unit: 'mm',
                    format: storeInfo?.reportPaperSize.toLowerCase() || 'a4'
                });
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                const ratio = canvasWidth / canvasHeight;
                const imgWidth = pdfWidth;
                const imgHeight = imgWidth / ratio;
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
                pdf.save(`${filename}.pdf`);
            }
            toast.success('Export complete!', { id: 'export-toast' });
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="bg-secondary-50 dark:bg-secondary-900 p-4 rounded-2xl shadow-sm flex flex-wrap justify-between items-center gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold mr-4">View As:</h3>
                    {(Object.keys(VISUALIZATION_ICONS) as VisualizationType[]).map(vizType => (
                        <button key={vizType} onClick={() => setVisualizationType(vizType)} className={`p-2 rounded-lg ${visualizationType === vizType ? 'bg-primary-500 text-white' : 'bg-secondary-200 dark:bg-secondary-700'}`}>
                           {React.createElement(VISUALIZATION_ICONS[vizType], { size: 20 })}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"><FileText size={16}/> PDF</button>
                    <button onClick={() => handleExport('png')} className="flex items-center gap-2 px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"><ImageIcon size={16}/> PNG</button>
                    <button onClick={() => handleExport('xls')} className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">XLS</button>
                    <button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">CSV</button>
                </div>
            </div>

            {/* This is the visible on-screen report */}
            <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm overflow-x-auto">
                 <ReportComponent dateRange={dateRange} onDataReady={setReportData} />
                {reportData && (
                     <ReportVisualization
                        type={visualizationType}
                        chartData={reportData.chartData}
                        tableData={reportData.tableData}
                        tableHeaders={reportData.tableHeaders}
                        dataKey={reportData.chartDataKey}
                        nameKey={reportData.chartNameKey}
                    />
                )}
            </div>

            {/* This is the hidden, formatted-for-export version */}
            <div style={{ position: 'fixed', left: '-2000px', top: 0, zIndex: -1 }}>
                 {reportData && storeInfo &&
                    <div ref={exportRef}>
                        <ReportLayout
                           reportTitle={title}
                           dateRange={dateRange}
                           storeInfo={storeInfo}
                           summaryCards={<SummaryCards cards={reportData.summaryCards} />}
                           visualization={<ReportVisualization type={visualizationType} {...reportData} />}
                           dataTable={<DetailedTable headers={reportData.tableHeaders} data={reportData.tableData} />}
                        />
                    </div>
                }
            </div>
        </div>
    );
};

const SummaryCards: React.FC<{cards: { title: string, value: string, icon: React.ElementType }[]}> = ({ cards }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {cards.map(card => <ReportCard key={card.title} {...card} />)}
    </div>
);

// --- Individual Report Logic ---
const SalesReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    const sales = useLiveQuery(() => db.sales.where('timestamp').between(dateRange.start, dateRange.end, true, true).toArray(), [dateRange]);

    useEffect(() => {
        if (!sales) return;
        
        const summary = {
            sales: sales.length,
            items: sales.reduce((sum, s) => sum + s.items.reduce((itemSum, i) => itemSum + Math.abs(i.quantity), 0), 0),
            revenue: sales.reduce((sum, s) => sum + s.totalAmount, 0),
            avgSale: sales.length > 0 ? sales.reduce((sum, s) => sum + s.totalAmount, 0) / sales.length : 0,
        };

        const tableData = sales.map(s => ({
            invoice: `#${s.invoiceNumber}`,
            date: format(s.timestamp, 'PPp'),
            customer: s.customerName || 'N/A',
            items: s.items.reduce((sum, i) => sum + Math.abs(i.quantity), 0),
            total: `${currency}${s.totalAmount.toFixed(2)}`
        }));
        
        const salesByDay = sales.reduce((acc, sale) => {
            const day = format(sale.timestamp, 'MMM d');
            acc[day] = (acc[day] || 0) + sale.totalAmount;
            return acc;
        }, {} as Record<string, number>);
        const chartData = Object.entries(salesByDay).map(([day, revenue]) => ({ day, revenue })).slice(-30);

        onDataReady({
            summaryCards: [
                { title: "Total Revenue", value: `${currency}${summary.revenue.toFixed(2)}`, icon: TrendingUp },
                { title: "Total Sales", value: summary.sales.toString(), icon: CreditCard },
                { title: "Items Sold", value: summary.items.toString(), icon: Package },
                { title: "Average Sale", value: `${currency}${summary.avgSale.toFixed(2)}`, icon: BarChart2 }
            ],
            tableHeaders: ['Invoice #', 'Date', 'Customer', 'Items', 'Total'],
            tableData,
            chartData,
            chartDataKey: 'revenue',
            chartNameKey: 'day'
        });

    }, [sales, currency, onDataReady]);

    return !sales ? <p>Loading report data...</p> : null;
};

const ProfitLossReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    const sales = useLiveQuery(() => db.sales.where('timestamp').between(dateRange.start, dateRange.end, true, true).toArray(), [dateRange]);
    const expenses = useLiveQuery(() => db.expenses.where('date').between(dateRange.start, dateRange.end, true, true).toArray(), [dateRange]);

    useEffect(() => {
        if (!sales || !expenses) return;
        const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
        const cogs = sales.flatMap(s => s.items || []).reduce((sum, i) => sum + (Number(i.costPrice) || 0) * (Number(i.quantity) || 0), 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
        const grossProfit = revenue - cogs;
        const netProfit = grossProfit - totalExpenses;

        const tableData = [
            { metric: 'Total Revenue', amount: `${currency}${revenue.toFixed(2)}`},
            { metric: 'Cost of Goods Sold (COGS)', amount: `-${currency}${cogs.toFixed(2)}`},
            { metric: 'Gross Profit', amount: `${currency}${grossProfit.toFixed(2)}`},
            { metric: 'Operating Expenses', amount: `-${currency}${totalExpenses.toFixed(2)}`},
            { metric: 'Net Profit', amount: `${currency}${netProfit.toFixed(2)}`},
        ];

        onDataReady({
             summaryCards: [
                { title: "Net Profit", value: `${currency}${netProfit.toFixed(2)}`, icon: TrendingUp },
                { title: "Gross Profit", value: `${currency}${grossProfit.toFixed(2)}`, icon: BarChart2 },
                { title: "Revenue", value: `${currency}${revenue.toFixed(2)}`, icon: CreditCard },
                { title: "Expenses", value: `${currency}${totalExpenses.toFixed(2)}`, icon: TrendingDown }
            ],
            tableHeaders: ['Metric', 'Amount'],
            tableData,
            chartData: [{ name: 'Revenue', value: revenue }, { name: 'COGS', value: cogs }, { name: 'Expenses', value: totalExpenses }],
            chartDataKey: 'value',
            chartNameKey: 'name'
        });
    }, [sales, expenses, currency, onDataReady]);
    
    return (!sales || !expenses) ? <p>Loading report data...</p> : null;
};

const StockReport: React.FC<{ onDataReady: (data: any) => void }> = ({ onDataReady }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    const products = useLiveQuery(() => db.products.toArray());
    const categories = useLiveQuery(() => db.productCategories.toArray());
    
    const categoryMap = useMemo(() => {
        if (!categories) return new Map<number, string>();
        return new Map(categories.map(c => [c.id!, c.name]));
    }, [categories]);

    useEffect(() => {
        if (!products || !categoryMap) return;
        const allVariants = products.flatMap(p => p.variants.map(v => ({ product: p, variant: v })));
        
        const summary = {
            totalUnits: allVariants.reduce((sum, item) => sum + (Number(item.variant.stock) || 0), 0),
            costValue: allVariants.reduce((sum, item) => sum + ((Number(item.variant.stock) || 0) * (Number(item.variant.costPrice) || 0)), 0),
            saleValue: allVariants.reduce((sum, item) => sum + ((Number(item.variant.stock) || 0) * (Number(item.variant.sellingPrice) || 0)), 0),
            productCount: products.length,
        };

        const tableData = allVariants.map(item => ({
            product: item.product.name,
            variant: Object.values(item.variant.attributes).join(' / ') || 'Standard',
            sku: item.variant.sku || 'N/A',
            stock: item.variant.stock,
            cost: `${currency}${(Number(item.variant.costPrice) || 0).toFixed(2)}`,
            price: `${currency}${(Number(item.variant.sellingPrice) || 0).toFixed(2)}`,
        }));
        
        const stockByCategory = products.reduce((acc, p) => {
            const categoryName = p.categoryId ? (categoryMap.get(p.categoryId) || 'Uncategorized') : 'Uncategorized';
            const stock = p.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
            acc[categoryName] = (acc[categoryName] || 0) + stock;
            return acc;
        }, {} as Record<string, number>);

        onDataReady({
            summaryCards: [
                { title: "Total Units", value: summary.totalUnits.toString(), icon: Package },
                { title: "Inventory Cost Value", value: `${currency}${summary.costValue.toFixed(2)}`, icon: TrendingDown },
                { title: "Inventory Sale Value", value: `${currency}${summary.saleValue.toFixed(2)}`, icon: TrendingUp },
                { title: "Total Products", value: summary.productCount.toString(), icon: Package },
            ],
            tableHeaders: ['Product', 'Variant', 'SKU', 'Stock', 'Cost', 'Price'],
            tableData,
            chartData: Object.entries(stockByCategory).map(([category, stock]) => ({ category, stock })),
            chartDataKey: 'stock',
            chartNameKey: 'category'
        });
    }, [products, currency, onDataReady, categoryMap]);

    return !products ? <p>Loading report data...</p> : null;
};

const BestSellersReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
    const sales = useLiveQuery(() => db.sales.where('timestamp').between(dateRange.start, dateRange.end, true, true).toArray(), [dateRange]);
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';

    useEffect(() => {
        if (!sales) return;
        const soldItems = new Map<string, { name: string; quantity: number, revenue: number }>();
        sales.forEach(s => s.items.forEach(i => {
            const key = `${i.productId}-${i.variantId}`;
            const existing = soldItems.get(key) || { name: i.productName, quantity: 0, revenue: 0 };
            existing.quantity += i.quantity;
            existing.revenue += i.totalPrice;
            soldItems.set(key, existing);
        }));
        
        const allItems = Array.from(soldItems.values());
        const byQuantity = [...allItems].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
        
        onDataReady({
            summaryCards: byQuantity.slice(0, 4).map((item, i) => ({
                title: `#${i + 1} Best Seller`,
                value: item.name,
                icon: Package
            })),
            tableHeaders: ['Product', 'Quantity Sold', 'Revenue'],
            tableData: byQuantity.map(i => ({ name: i.name, quantity: i.quantity, revenue: `${currency}${i.revenue.toFixed(2)}` })),
            chartData: byQuantity,
            chartDataKey: 'quantity',
            chartNameKey: 'name'
        });
    }, [sales, currency, onDataReady]);

    return !sales ? <p>Loading report data...</p> : null;
};

const CommissionReport: React.FC<{ dateRange: { start: Date, end: Date }, onDataReady: (data: any) => void }> = ({ dateRange, onDataReady }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    const [staffId, setStaffId] = useState<number>(0);

    const users = useLiveQuery(() => db.users.toArray());
    const commissions = useLiveQuery(() => {
        let query = db.staffCommissions.where('date').between(dateRange.start, dateRange.end, true, true);
        if (staffId > 0) {
            query = query.and(c => c.staffId === staffId);
        }
        return query.toArray();
    }, [dateRange, staffId]);

    const usersMap = useMemo(() => new Map(users?.map(u => [u.id, u.username])), [users]);

    useEffect(() => {
        if (!commissions || !usersMap) return;

        const totalCommission = commissions.reduce((sum, c) => sum + c.earnedCommission, 0);
        const totalSalesValue = commissions.reduce((sum, c) => sum + c.totalSaleValue, 0);

        const tableData = commissions.map(c => ({
            date: format(c.date, 'PPp'),
            staff: usersMap.get(c.staffId) || 'Unknown',
            invoice: `#${c.saleInvoiceNumber}`,
            saleValue: `${currency}${c.totalSaleValue.toFixed(2)}`,
            commission: `${currency}${c.earnedCommission.toFixed(2)}`,
        }));
        
        const commissionByUser = commissions.reduce((acc, c) => {
            const username = usersMap.get(c.staffId) || 'Unknown';
            acc[username] = (acc[username] || 0) + c.earnedCommission;
            return acc;
        }, {} as Record<string, number>);
        const chartData = Object.entries(commissionByUser).map(([name, commission]) => ({ name, commission }));

        onDataReady({
            summaryCards: [
                { title: "Total Commission", value: `${currency}${totalCommission.toFixed(2)}`, icon: Award },
                { title: "Total Sales Value", value: `${currency}${totalSalesValue.toFixed(2)}`, icon: TrendingUp },
                { title: "Commissioned Sales", value: commissions.length.toString(), icon: CreditCard },
                { title: "Top Earner", value: chartData.sort((a,b) => b.commission - a.commission)[0]?.name || 'N/A', icon: Users },
            ],
            tableHeaders: ['Date', 'Staff Member', 'Invoice #', 'Sale Value', 'Commission Earned'],
            tableData,
            chartData,
            chartDataKey: 'commission',
            chartNameKey: 'name'
        });
    }, [commissions, usersMap, currency, onDataReady]);
    
    return (
        <div className="mb-4">
            <select value={staffId} onChange={e => setStaffId(Number(e.target.value))} className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-md border border-secondary-200 dark:border-secondary-700">
                <option value={0}>All Staff</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            {(!commissions || !users) && <p>Loading report data...</p>}
        </div>
    );
};

const ShiftsReport: React.FC<{ dateRange: { start: Date, end: Date } }> = ({ dateRange }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    const shifts = useLiveQuery(() => db.shifts.where('startTime').between(dateRange.start, dateRange.end, true, true).and(s => s.status === 'closed').reverse().toArray(), [dateRange]);
    
    if (!shifts) {
        return <p>Loading shift reports...</p>;
    }

    return (
        <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Shift History</h3>
            <DetailedTable
                headers={['Shift ID', 'User', 'Start Time', 'End Time', 'Expected Cash', 'Counted Cash', 'Difference']}
                data={shifts.map(s => {
                    // FIX: `closingBalance` and `expectedBalance` can be undefined. Coalesce them to 0 to ensure the subtraction is valid.
                    const closing = s.closingBalance || 0;
                    const expected = s.expectedBalance || 0;
                    const difference = closing - expected;
                    return {
                        id: `#${s.id}`,
                        user: s.username,
                        start: format(s.startTime, 'PPp'),
                        end: s.endTime ? format(s.endTime, 'PPp') : 'N/A',
                        expected: `${currency}${expected.toFixed(2)}`,
                        counted: `${currency}${closing.toFixed(2)}`,
                        difference: `${difference > 0 ? '+' : ''}${currency}${difference.toFixed(2)}`
                    };
                })}
            />
        </div>
    );
};


const DetailedTable: React.FC<{ headers: string[], data: Record<string, any>[] }> = ({ headers, data }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const lowercasedTerm = searchTerm.toLowerCase();
        return data.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(lowercasedTerm)));
    }, [data, searchTerm]);
    if (!data || data.length === 0) return <p className="text-center text-secondary-500 p-8">No data available for this period.</p>;
    const keys = Object.keys(data[0]);
    return (
        <div className="max-h-[60vh] overflow-y-auto">
            <div className="relative my-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} /><input type="text" placeholder="Search table..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg border border-secondary-200 dark:border-secondary-700"/></div>
            <table className="w-full text-sm text-left">
                <thead className="bg-secondary-100 dark:bg-secondary-800/50 sticky top-0"><tr>{headers.map((h, i) => <th key={i} className="p-4">{h}</th>)}</tr></thead>
                <tbody>{filteredData.map((row, i) => (<tr key={i} className="border-b border-secondary-200 dark:border-secondary-800">{keys.map(key => <td key={key} className="p-4">{row[key]}</td>)}</tr>))}</tbody>
            </table>
        </div>
    );
};

// --- Export Logic ---
const excelTemplate = (worksheet: string, table: string) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>${table}</table></body></html>`;
const generateFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
};
const exportToXLS = (headers: string[], data: any[][], filename: string) => {
    const tableHeader = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tableBody = `<tbody>${data.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
    generateFile(excelTemplate('Report', tableHeader + tableBody), `${filename}.xls`, 'application/vnd.ms-excel');
};
const exportToCSV = (headers: string[], data: any[][], filename: string) => {
    const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
    generateFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
};

const VISUALIZATION_ICONS: Record<VisualizationType, React.ElementType> = {
    table: Table,
    bar: BarChart2,
    line: LineChartIcon,
    pie: PieChartIcon,
    donut: Donut
};

// --- Main Page Component ---
const ReportsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<ReportTab>('summary');
    const [dateRange, setDateRange] = useState({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
    
    const reportMapping: Record<ReportTab, { title: string, component: React.FC<any>, isDateFiltered: boolean }> = {
        summary: { title: 'Profit & Loss Summary', component: ProfitLossReport, isDateFiltered: true },
        sales: { title: 'Sales Report', component: SalesReport, isDateFiltered: true },
        profit_loss: { title: 'Profit & Loss Report', component: ProfitLossReport, isDateFiltered: true },
        stock: { title: 'Stock Report', component: StockReport, isDateFiltered: false },
        sellers: { title: 'Best Sellers Report', component: BestSellersReport, isDateFiltered: true },
        commission: { title: 'Staff Commission Report', component: CommissionReport, isDateFiltered: true },
        shifts: { title: 'Shifts Report', component: ShiftsReport, isDateFiltered: true },
    };

    const tabs: { id: ReportTab, label: string }[] = [
        { id: 'summary', label: 'Summary' },
        { id: 'sales', label: 'Sales' },
        { id: 'profit_loss', label: 'Profit & Loss' },
        { id: 'stock', label: 'Stock' },
        { id: 'sellers', label: 'Best Sellers' },
        { id: 'commission', label: 'Commission' },
        { id: 'shifts', label: 'Shifts' },
    ];
    
    const { title, component: ReportComponent, isDateFiltered } = reportMapping[activeTab];

    return (
        <div className="animate-fadeIn space-y-6">
            <h1 className="text-3xl font-bold">Reports</h1>
            
            {isDateFiltered && <DateFilterBar dateRange={dateRange} setDateRange={setDateRange} />}
            
            <div className="border-b border-secondary-200 dark:border-secondary-800">
                <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`${activeTab === tab.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            
            {activeTab !== 'shifts' ? (
                <ReportContainer title={title} dateRange={dateRange} reportComponent={ReportComponent} />
            ) : (
                <ShiftsReport dateRange={dateRange} />
            )}
        </div>
    );
};

export default ReportsPage;