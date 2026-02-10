



import React, { useState } from 'react';
import { db } from '../services/db';
import { toast } from 'react-hot-toast';
import { Upload, Download } from 'lucide-react';
import { useAppContext } from '../hooks/useAppContext';

const BackupPage: React.FC = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const { showConfirmation } = useAppContext();

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const allData: { [key: string]: any[] } = {};
            // FIX: Cast `db` to `any` to access Dexie's `tables` property.
            for (const table of (db as any).tables) {
                allData[table.name] = await table.toArray();
            }
            
            const jsonString = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `umji-pos-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Data exported successfully!');
        } catch (error) {
            console.error("Export failed:", error);
            toast.error("Failed to export data.");
        } finally {
            setIsExporting(false);
        }
    };
    
    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                const dataString = e.target.result as string;
                showConfirmation(
                    'Import Data',
                    'This will overwrite all existing data. This action cannot be undone. Are you sure you want to continue?',
                    async () => {
                        setIsImporting(true);
                        try {
                            const data = JSON.parse(dataString);
                            // FIX: Cast `db` to `any` to access Dexie's `transaction` and `tables` properties.
                            await (db as any).transaction('rw', (db as any).tables, async () => {
                                // Clear tables in reverse order of dependencies if any
                                const tables = [...(db as any).tables].reverse();
                                for (const table of tables) {
                                    await table.clear();
                                }
                                // Add data in normal order
                                for (const table of (db as any).tables) {
                                    if (data[table.name]) {
                                        // Dexie's bulkAdd handles date revival from ISO strings
                                        await table.bulkAdd(data[table.name].map((item: any) => {
                                            // Manually convert date strings back to Date objects
                                            if(item.timestamp) item.timestamp = new Date(item.timestamp);
                                            if(item.purchaseDate) item.purchaseDate = new Date(item.purchaseDate);
                                            if(item.date) item.date = new Date(item.date);
                                            if(item.createdAt) item.createdAt = new Date(item.createdAt);
                                            return item;
                                        }));
                                    }
                                }
                            });
                            toast.success('Data imported successfully! The app will now reload.');
                            setTimeout(() => window.location.reload(), 2000);
                        } catch (error) {
                            console.error("Import failed:", error);
                            toast.error("Failed to import data. The file might be corrupted.");
                        } finally {
                            setIsImporting(false);
                        }
                    }
                );
            }
        };
        reader.readAsText(file);
        // Reset file input to allow re-selection of the same file
        event.target.value = '';
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <h1 className="text-3xl font-bold text-center">Backup & Restore</h1>

            <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm text-center">
                <h2 className="text-xl font-semibold mb-2">Export Data</h2>
                <p className="text-secondary-500 dark:text-secondary-400 mb-4">Download a JSON file containing all your store data.</p>
                <button onClick={handleExport} disabled={isExporting} className="inline-flex items-center gap-2 bg-primary-600 text-white px-5 py-3 rounded-lg shadow hover:bg-primary-700 transition disabled:bg-primary-300">
                    <Download size={20} />
                    {isExporting ? 'Exporting...' : 'Export All Data'}
                </button>
            </div>
            
            <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm text-center">
                <h2 className="text-xl font-semibold mb-2">Import Data</h2>
                <p className="text-secondary-500 dark:text-secondary-400 mb-4">Restore data from a previously exported JSON file. <strong className="text-red-500">This will overwrite existing data.</strong></p>
                <label className="inline-flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-lg shadow hover:bg-green-700 transition cursor-pointer">
                    <Upload size={20} />
                    {isImporting ? 'Importing...' : 'Choose File to Import'}
                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
            </div>
        </div>
    );
};

export default BackupPage;