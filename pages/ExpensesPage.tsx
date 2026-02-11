
// CHANGED: Implemented full CRUD functionality for Expenses
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Expense, ShiftEvent, ExpenseCategory } from '../types';
import { Plus, Edit, Trash2, X, ImageUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';

// This is the new modal for adding/editing expense categories on the fly
const CategoryFormModal: React.FC<{
    onClose: () => void;
    onCategoryAdded: (newCategory: ExpenseCategory) => void;
}> = ({ onClose, onCategoryAdded }) => {
    const [name, setName] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Category name cannot be empty.");
            return;
        }
        try {
            const newId = await db.expenseCategories.add({ name: name.trim() });
            toast.success("Category created.");
            onCategoryAdded({ id: newId, name: name.trim() });
            onClose();
        } catch (error) {
            toast.error("A category with this name already exists.");
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[101] p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">New Expense Category</h2>
                    <button type="button" onClick={onClose}><X/></button>
                </div>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Category Name (e.g., Utilities)"
                    required
                    autoFocus
                    className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg mb-4"
                />
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Category</button>
                </div>
            </form>
        </div>
    );
};


const ExpenseFormModal: React.FC<{ expense: Expense | null; onClose: () => void; }> = ({ expense, onClose }) => {
    const { activeShift } = useAppContext();
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    const initialFormData = useMemo(() => ({
        categoryId: expense?.categoryId || 0,
        amount: expense?.amount || 0,
        date: expense?.date || new Date(),
        notes: expense?.notes || '',
        receiptImage: expense?.receiptImage || '',
        paidFromCashDrawer: expense?.paidFromCashDrawer ?? (!!activeShift),
    }), [expense, activeShift]);

    const [formData, setFormData] = useState(initialFormData);

    const categories = useLiveQuery(() => db.expenseCategories.orderBy('name').toArray());

    useEffect(() => {
        setFormData(initialFormData);
    }, [initialFormData]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => setFormData({ ...formData, receiptImage: event.target?.result as string });
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.categoryId || Number(formData.categoryId) === 0) {
            toast.error("Please select a category.");
            return;
        }
        if (formData.amount <= 0) {
            toast.error("Amount must be greater than zero.");
            return;
        }

        const dataToSave = {
            ...formData,
            amount: parseFloat(String(formData.amount)),
            date: new Date(formData.date),
            categoryId: Number(formData.categoryId)
        };

        try {
            await (db as any).transaction('rw', db.expenses, db.shiftEvents, async () => {
                if (expense?.id) {
                    // Editing an existing expense
                    const originalExpense = await db.expenses.get(expense.id);

                    if (originalExpense?.paidFromCashDrawer) {
                        const oldEvent = await db.shiftEvents.where({ relatedExpenseId: expense.id }).first();
                        if (oldEvent) await db.shiftEvents.delete(oldEvent.id!);
                    }

                    await db.expenses.update(expense.id, dataToSave);

                    if (dataToSave.paidFromCashDrawer && activeShift) {
                        const newEvent: Omit<ShiftEvent, 'id'> = {
                            shiftId: activeShift.id!,
                            timestamp: new Date(),
                            type: 'expense_payment',
                            amount: dataToSave.amount,
                            notes: `Expense #${expense.id}: ${dataToSave.notes || categoryMap.get(dataToSave.categoryId)}`,
                            relatedExpenseId: expense.id
                        };
                        await db.shiftEvents.add(newEvent as ShiftEvent);
                    }
                    toast.success('Expense updated successfully.');

                } else {
                    // Adding a new expense
                    const newId = await db.expenses.add(dataToSave as Expense);
                    if (dataToSave.paidFromCashDrawer && activeShift) {
                        const newEvent: Omit<ShiftEvent, 'id'> = {
                            shiftId: activeShift.id!,
                            timestamp: new Date(),
                            type: 'expense_payment',
                            amount: dataToSave.amount,
                            notes: `Expense #${newId}: ${dataToSave.notes || categoryMap.get(dataToSave.categoryId)}`,
                            relatedExpenseId: newId
                        };
                        await db.shiftEvents.add(newEvent as ShiftEvent);
                    }
                    toast.success('Expense added successfully.');
                }
            });
            onClose();
        } catch (error) {
            toast.error('Failed to save expense.');
            console.error(error);
        }
    };
    
    const categoryMap = useMemo(() => new Map(categories?.map(c => [c.id, c.name])), [categories]);

    return (
        <>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fadeIn">
                <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slideInUp">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{expense ? 'Edit' : 'Add'} Expense</h2><button type="button" onClick={onClose}><X/></button></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input type="number" step="0.01" name="amount" placeholder="Amount" value={formData.amount} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                            <input type="date" name="date" value={format(new Date(formData.date), 'yyyy-MM-dd')} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        </div>
                        <div className="flex items-center gap-2">
                            <select name="categoryId" value={formData.categoryId} onChange={handleChange} required className="flex-1 w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                                <option value={0} disabled>Select a category</option>
                                {categories?.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                            </select>
                            <button type="button" onClick={() => setIsCategoryModalOpen(true)} className="p-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600"><Plus size={20}/></button>
                        </div>
                        <textarea name="notes" placeholder="Notes (Optional)" value={formData.notes} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={3}></textarea>
                        
                        {activeShift && (
                           <label className="flex items-center gap-2 cursor-pointer p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                               <input type="checkbox" name="paidFromCashDrawer" checked={formData.paidFromCashDrawer} onChange={handleChange} className="h-5 w-5 rounded text-primary-600 focus:ring-primary-500"/>
                               <span>Paid from Cash Drawer (Shift #{activeShift.id})</span>
                           </label>
                        )}
                        
                        <div className="flex items-center gap-4">
                            <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600"><ImageUp size={16}/> Upload Receipt<input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" /></label>
                            {formData.receiptImage && <img src={formData.receiptImage} alt="Receipt Preview" className="w-16 h-16 object-cover rounded-lg" />}
                        </div>
                        
                        <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">{expense ? 'Update' : 'Save'}</button></div>
                    </form>
                </div>
            </div>
            {isCategoryModalOpen && (
                <CategoryFormModal 
                    onClose={() => setIsCategoryModalOpen(false)} 
                    onCategoryAdded={(newCategory) => {
                        setFormData(prev => ({...prev, categoryId: newCategory.id!}));
                    }}
                />
            )}
        </>
    );
};


const ExpensesPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    
    const { storeInfo, showConfirmation } = useAppContext();
    const { hasPermission } = usePermissions();
    const currency = storeInfo?.currency || '$';

    const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray());
    const categories = useLiveQuery(() => db.expenseCategories.toArray());
    const categoryMap = useMemo(() => new Map(categories?.map(c => [c.id, c.name])), [categories]);

    const openModal = (expense: Expense | null = null) => {
        setSelectedExpense(expense);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedExpense(null);
    };

    const handleDelete = async (expense: Expense) => {
        if (!hasPermission('DeleteExpenses')) {
            toast.error("You don't have permission to delete expenses.");
            return;
        }
        showConfirmation(
            'Delete Expense',
            'Are you sure you want to delete this expense?',
            async () => {
                try {
                     await (db as any).transaction('rw', db.expenses, db.shiftEvents, async () => {
                        if (expense.paidFromCashDrawer) {
                            const event = await db.shiftEvents.where({ relatedExpenseId: expense.id }).first();
                            if (event) await db.shiftEvents.delete(event.id!);
                        }
                        await db.expenses.delete(expense.id!);
                     });
                    toast.success('Expense deleted successfully.');
                } catch (error) {
                    toast.error('Failed to delete expense.');
                    console.error(error);
                }
            }
        );
    };

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Expenses</h1>
                <button onClick={() => openModal()} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg shadow hover:bg-primary-700 transition">
                    <Plus size={20} />
                    Add Expense
                </button>
            </div>
            
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary-100 dark:bg-secondary-800/50">
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Notes</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses?.map(e => (
                                <tr key={e.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                    <td className="p-4">{format(e.date, 'MMM d, yyyy')}</td>
                                    <td className="p-4">{categoryMap.get(e.categoryId) || 'Uncategorized'}</td>
                                    <td className="p-4 font-medium">{currency}{e.amount.toFixed(2)}</td>
                                    <td className="p-4 text-secondary-500">{e.notes}</td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            <button onClick={() => openModal(e)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full"><Edit size={16} /></button>
                                            {hasPermission('DeleteExpenses') && (
                                                <button onClick={() => handleDelete(e)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && <ExpenseFormModal expense={selectedExpense} onClose={closeModal} />}
        </div>
    );
};

export default ExpensesPage;
