



// CHANGED: Implemented full CRUD functionality for Expenses
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Expense, ShiftEvent } from '../types';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';

const ExpensesPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    
    const { storeInfo, showConfirmation } = useAppContext();
    const { hasPermission } = usePermissions();
    const currency = storeInfo?.currency || '$';

    const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray());

    const openModal = (expense: Expense | null = null) => {
        setSelectedExpense(expense);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedExpense(null);
    };
    
    const handleDelete = async (id: number) => {
        if (!hasPermission('DeleteExpenses')) {
            toast.error("You don't have permission to delete expenses.");
            return;
        }
        showConfirmation(
            'Delete Expense',
            'Are you sure you want to delete this expense?',
            async () => {
                try {
                    // Also delete any associated shift event
                    // FIX: Cast `db` to `any` to access Dexie's `transaction` method.
                    await (db as any).transaction('rw', db.expenses, db.shiftEvents, async () => {
                        await db.shiftEvents.where({ relatedExpenseId: id }).delete();
                        await db.expenses.delete(id);
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
                                <th className="p-4">Type</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Notes</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses?.map(e => (
                                <tr key={e.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                    <td className="p-4">{format(e.date, 'MMM d, yyyy')}</td>
                                    <td className="p-4 font-medium">{e.type}</td>
                                    <td className="p-4">{currency}{e.amount.toFixed(2)}</td>
                                    <td className="p-4 text-secondary-500 truncate max-w-xs">{e.notes}</td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            <button onClick={() => openModal(e)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                                            {hasPermission('DeleteExpenses') && (
                                                <button onClick={() => handleDelete(e.id!)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
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

// Form Modal Component for Expenses
interface ExpenseFormModalProps {
    expense: Expense | null;
    onClose: () => void;
}

const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({ expense, onClose }) => {
    const { activeShift } = useAppContext();
    const [formData, setFormData] = useState<Omit<Expense, 'id'>>(expense || {
        type: '', amount: 0, date: new Date(), notes: '', paidFromCashDrawer: false
    });
    const [paidFromDrawer, setPaidFromDrawer] = useState(expense?.paidFromCashDrawer || false);

    useEffect(() => {
        if (!activeShift) {
            setPaidFromDrawer(false);
        }
    }, [activeShift]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, date: e.target.valueAsDate || new Date() }));
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (paidFromDrawer && !activeShift) {
            toast.error("No active shift. Cannot pay from cash drawer.");
            return;
        }
        if (formData.amount <= 0) {
            toast.error("Amount must be greater than zero.");
            return;
        }

        try {
            // FIX: Cast `db` to `any` to access Dexie's `transaction` method.
            await (db as any).transaction('rw', db.expenses, db.shiftEvents, async () => {
                const expenseData = { 
                    ...formData, 
                    paidFromCashDrawer: paidFromDrawer, 
                    shiftId: paidFromDrawer ? activeShift!.id : undefined 
                };
                let expenseId;

                if (expense && expense.id) {
                    await db.expenses.update(expense.id, expenseData);
                    expenseId = expense.id;
                } else {
                    expenseId = await db.expenses.add(expenseData as Expense);
                }

                // Clean up any existing shift event for this expense to handle edits
                await db.shiftEvents.where({ relatedExpenseId: expenseId }).delete();

                if (paidFromDrawer && activeShift) {
                    await db.shiftEvents.add({
                        shiftId: activeShift.id,
                        timestamp: new Date(),
                        type: 'expense_payment',
                        amount: formData.amount,
                        relatedExpenseId: expenseId,
                        notes: `Expense: ${formData.type}`
                    } as ShiftEvent);
                }
            });
            toast.success('Expense saved successfully.');
            onClose();
        } catch (error) {
            toast.error('Failed to save expense.');
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slideInUp">
                <h2 className="text-xl font-bold mb-4">{expense ? 'Edit' : 'Add'} Expense</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input name="type" placeholder="Expense Type (e.g., Rent, Utilities)" value={formData.type} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="amount" type="number" step="0.01" placeholder="Amount" value={formData.amount || ''} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="date" type="date" value={format(new Date(formData.date), 'yyyy-MM-dd')} onChange={handleDateChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <textarea name="notes" placeholder="Notes" value={formData.notes || ''} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={3}></textarea>
                    
                    {activeShift && (
                        <label className="flex items-center gap-3 p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg cursor-pointer">
                            <input
                                type="checkbox"
                                checked={paidFromDrawer}
                                onChange={(e) => setPaidFromDrawer(e.target.checked)}
                                className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span>Pay from cash drawer (Shift #{activeShift.id})</span>
                        </label>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">{expense ? 'Update' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ExpensesPage;