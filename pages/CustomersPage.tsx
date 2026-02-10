import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Customer, Sale } from '../types';
import { Plus, Edit, Trash2, X, Eye, ShoppingBag, ArrowLeftRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useAppContext } from '../hooks/useAppContext';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';

const CustomersPage: React.FC = () => {
    const [modal, setModal] = useState<'form' | 'details' | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [viewingSale, setViewingSale] = useState<Sale | null>(null);
    const navigate = useNavigate();
    const { hasPermission } = usePermissions();
    const { showConfirmation } = useAppContext();

    const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []);

    const openFormModal = (customer: Customer | null = null) => {
        setSelectedCustomer(customer);
        setModal('form');
    };

    const openDetailsModal = (customer: Customer) => {
        setSelectedCustomer(customer);
        setModal('details');
    };

    const closeModal = () => {
        setModal(null);
        setSelectedCustomer(null);
    };
    
    const handleDelete = async (id: number) => {
        showConfirmation(
            'Delete Customer',
            'Are you sure you want to delete this customer? All their sales history will be retained but unlinked.',
            async () => {
                try {
                    // FIX: Cast `db` to `any` to access Dexie's `transaction` method.
                    await (db as any).transaction('rw', db.customers, db.sales, async () => {
                        await db.sales.where({ customerId: id }).modify({ customerId: undefined, customerName: undefined });
                        await db.customers.delete(id);
                    });
                    toast.success("Customer deleted and sales history unlinked.");
                } catch (error) {
                    toast.error("Failed to delete customer.");
                    console.error(error);
                }
            }
        );
    };

    const handleInitiateReturn = (sale: Sale) => {
        navigate('/sales', { state: { saleToReturn: sale } });
    };

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Customers</h1>
                <button onClick={() => openFormModal()} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg shadow hover:bg-primary-700 transition">
                    <Plus size={20} />
                    Add Customer
                </button>
            </div>
            
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary-100 dark:bg-secondary-800/50">
                            <tr>
                                <th className="p-4">Name</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Joined On</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers?.map(c => (
                                <tr key={c.id} className="border-b border-secondary-200 dark:border-secondary-800 hover:bg-secondary-100 dark:hover:bg-secondary-800/50">
                                    <td className="p-4 font-medium">{c.name}</td>
                                    <td className="p-4">{c.phone}</td>
                                    <td className="p-4 text-secondary-500">{c.email || 'N/A'}</td>
                                    <td className="p-4 text-secondary-500">{format(c.createdAt, 'MMM d, yyyy')}</td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            <button onClick={() => openDetailsModal(c)} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><Eye size={16} /></button>
                                            <button onClick={() => openFormModal(c)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full"><Edit size={16} /></button>
                                            {hasPermission('DeleteCustomers') && (
                                                <button onClick={() => handleDelete(c.id!)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {modal === 'form' && <CustomerFormModal customer={selectedCustomer} onClose={closeModal} />}
            {modal === 'details' && selectedCustomer && <CustomerDetailsModal customer={selectedCustomer} onClose={closeModal} onViewSale={setViewingSale} />}
            {viewingSale && <SaleDetailsModal sale={viewingSale} onClose={() => setViewingSale(null)} onInitiateReturn={handleInitiateReturn} />}
        </div>
    );
};

const CustomerFormModal: React.FC<{ customer: Customer | null; onClose: () => void; }> = ({ customer, onClose }) => {
    const [formData, setFormData] = useState<Omit<Customer, 'id' | 'createdAt' | 'dueBalance'>>(customer || {
        name: '', phone: '', email: '', address: '', notes: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (customer?.id) {
                await db.customers.update(customer.id, formData);
                toast.success('Customer updated.');
            } else {
                await db.customers.add({ ...formData, createdAt: new Date(), dueBalance: 0 } as Customer);
                toast.success('Customer added.');
            }
            onClose();
        } catch (error) {
            toast.error('Failed to save customer. Name might already exist.');
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slideInUp">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{customer ? 'Edit' : 'Add'} Customer</h2><button type="button" onClick={onClose}><X/></button></div>
                    <input name="name" placeholder="Full Name" value={formData.name} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="phone" type="tel" placeholder="Phone Number" value={formData.phone} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="email" type="email" placeholder="Email (Optional)" value={formData.email} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <textarea name="address" placeholder="Address (Optional)" value={formData.address} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                    <textarea name="notes" placeholder="Notes (Optional)" value={formData.notes} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                    <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Customer</button></div>
                </form>
            </div>
        </div>
    );
};

const CustomerDetailsModal: React.FC<{ customer: Customer; onClose: () => void; onViewSale: (sale: Sale) => void; }> = ({ customer, onClose, onViewSale }) => {
    const { storeInfo } = useAppContext();
    const sales = useLiveQuery(() => db.sales.where('customerId').equals(customer.id!).reverse().toArray(), [customer.id]);

    const totalSpent = sales?.reduce((sum, sale) => sum + sale.totalAmount, 0) || 0;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-2xl h-[80vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Customer Details</h2><button onClick={onClose}><X/></button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div className="bg-secondary-100 dark:bg-secondary-800 p-4 rounded-lg">
                        <h3 className="font-bold text-lg">{customer.name}</h3>
                        <p>{customer.phone}</p>
                        <p>{customer.email}</p>
                        <p>{customer.address}</p>
                        {customer.notes && <p className="text-sm mt-2 pt-2 border-t border-secondary-300 dark:border-secondary-700">Notes: {customer.notes}</p>}
                    </div>
                    <div className="bg-secondary-100 dark:bg-secondary-800 p-4 rounded-lg flex flex-col justify-center space-y-2">
                         <div className="text-center">
                            <p className="text-secondary-500 dark:text-secondary-400">Total Spent</p>
                            <p className="text-2xl font-bold">{storeInfo?.currency}{totalSpent.toFixed(2)}</p>
                            <p className="text-sm text-secondary-500 dark:text-secondary-400">across {sales?.length || 0} transactions</p>
                        </div>
                        {customer.dueBalance && customer.dueBalance > 0 && (
                            <div className="text-center border-t border-secondary-200 dark:border-secondary-700 pt-2">
                                <p className="text-secondary-500 dark:text-secondary-400">Outstanding Balance</p>
                                <p className="text-2xl font-bold text-red-500">{storeInfo?.currency}{customer.dueBalance.toFixed(2)}</p>
                            </div>
                        )}
                    </div>
                </div>
                
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2"><ShoppingBag size={20} /> Purchase History</h3>
                <div className="flex-1 overflow-y-auto border border-secondary-200 dark:border-secondary-800 rounded-lg">
                    {sales && sales.length > 0 ? (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-secondary-100 dark:bg-secondary-800/50 sticky top-0"><tr><th className="p-3">Invoice #</th><th className="p-3">Date</th><th className="p-3">Items</th><th className="p-3 text-right">Total</th><th className="p-3 text-center">Actions</th></tr></thead>
                            <tbody>
                                {sales.map(s => (<tr key={s.id} className={`border-b border-secondary-200 dark:border-secondary-800 ${s.dueAmount && s.dueAmount > 0 ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                                    <td className="p-3">#{s.invoiceNumber}</td>
                                    <td className="p-3">{format(s.timestamp, 'PPp')}</td>
                                    <td className="p-3">{s.items.reduce((sum, i) => sum + Math.abs(i.quantity), 0)}</td>
                                    <td className="p-3 text-right font-medium">{storeInfo?.currency}{s.totalAmount.toFixed(2)}</td>
                                    <td className="p-3 text-center">
                                        <button onClick={() => onViewSale(s)} className="px-3 py-1 text-xs bg-primary-500 text-white rounded-full hover:bg-primary-600">View</button>
                                    </td>
                                </tr>))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-center p-8 text-secondary-500">No purchase history found for this customer.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const SaleDetailsModal: React.FC<{ sale: Sale; onClose: () => void; onInitiateReturn: (sale: Sale) => void; }> = ({ sale, onClose, onInitiateReturn }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Sale Details - #{sale.invoiceNumber}</h2>
                    <button onClick={onClose}><X/></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 -mr-2">
                    <div className="text-sm bg-secondary-100 dark:bg-secondary-800 p-3 rounded-lg">
                        <p><strong>Date:</strong> {format(sale.timestamp, 'PPpp')}</p>
                        <p><strong>Total:</strong> {currency}{sale.totalAmount.toFixed(2)}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold mb-2">Items Purchased</h3>
                        <div className="space-y-2">
                            {sale.items.map((item, index) => (
                                <div key={index} className="flex justify-between p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg text-sm">
                                    <div>
                                        <p className="font-medium">{item.productName}</p>
                                        <p className="text-xs text-secondary-500">{Math.abs(item.quantity)} x {currency}{item.pricePerItem.toFixed(2)}</p>
                                    </div>
                                    <p className="font-semibold">{currency}{item.totalPrice.toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Close</button>
                    {sale.totalAmount > 0 && (
                        <button onClick={() => onInitiateReturn(sale)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
                            <ArrowLeftRight size={16} />
                            Initiate Return
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomersPage;