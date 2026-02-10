// CHANGED: Implemented full CRUD functionality for Suppliers
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Supplier } from '../types';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAppContext } from '../hooks/useAppContext';

const SuppliersPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const { showConfirmation } = useAppContext();

    const suppliers = useLiveQuery(() => db.suppliers.toArray());

    const openModal = (supplier: Supplier | null = null) => {
        setSelectedSupplier(supplier);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedSupplier(null);
    };
    
    const handleDelete = async (id: number) => {
        showConfirmation(
            'Delete Supplier',
            'Are you sure you want to delete this supplier?',
            async () => {
                try {
                    await db.suppliers.delete(id);
                    toast.success('Supplier deleted successfully.');
                } catch (error) {
                    toast.error('Failed to delete supplier.');
                    console.error(error);
                }
            }
        );
    };

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Suppliers</h1>
                <button onClick={() => openModal()} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg shadow hover:bg-primary-700 transition">
                    <Plus size={20} />
                    Add Supplier
                </button>
            </div>
            
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary-100 dark:bg-secondary-800/50">
                            <tr>
                                <th className="p-4">Name</th>
                                <th className="p-4">Contact Person</th>
                                <th className="p-4">Phone</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suppliers?.map(s => (
                                <tr key={s.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                    <td className="p-4 font-medium">{s.name}</td>
                                    <td className="p-4 text-secondary-500">{s.contactPerson}</td>
                                    <td className="p-4">{s.phone}</td>
                                    <td className="p-4">{s.email}</td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            <button onClick={() => openModal(s)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                                            <button onClick={() => handleDelete(s.id!)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && <SupplierFormModal supplier={selectedSupplier} onClose={closeModal} />}
        </div>
    );
};

// Form Modal Component for Suppliers
interface SupplierFormModalProps {
    supplier: Supplier | null;
    onClose: () => void;
}

const SupplierFormModal: React.FC<SupplierFormModalProps> = ({ supplier, onClose }) => {
    const [formData, setFormData] = useState<Omit<Supplier, 'id'>>(supplier || {
        name: '', contactPerson: '', phone: '', email: '', address: '', notes: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (supplier && supplier.id) {
                await db.suppliers.update(supplier.id, formData);
                toast.success('Supplier updated successfully.');
            } else {
                await db.suppliers.add(formData as Supplier);
                toast.success('Supplier added successfully.');
            }
            onClose();
        } catch (error) {
            toast.error('Failed to save supplier.');
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slideInUp">
                <h2 className="text-xl font-bold mb-4">{supplier ? 'Edit' : 'Add'} Supplier</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input name="name" placeholder="Supplier Name" value={formData.name} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="contactPerson" placeholder="Contact Person" value={formData.contactPerson} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="phone" placeholder="Phone" value={formData.phone} onChange={handleChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="email" type="email" placeholder="Email" value={formData.email} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <textarea name="address" placeholder="Address" value={formData.address} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={3}></textarea>
                    <textarea name="notes" placeholder="Notes" value={formData.notes} onChange={handleChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={3}></textarea>
                    
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">{supplier ? 'Update' : 'Save'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SuppliersPage;