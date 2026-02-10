// CHANGED: Implemented full CRUD for Purchases with stock management
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Purchase, Supplier, Product, PurchaseItem, Variant, ProductCategory, ProductOption } from '../types';
import { Plus, Edit, Trash2, X, Search, PackagePlus, Barcode as BarcodeIcon, ChevronsRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';
import { v4 as uuidv4 } from 'uuid';

// --- Main Page Component ---
const PurchasesPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const { storeInfo, showConfirmation } = useAppContext();
    const currency = storeInfo?.currency || '$';

    const purchases = useLiveQuery(() => db.purchases.reverse().toArray(), []);
    const suppliers = useLiveQuery(() => db.suppliers.toArray(), []);

    const supplierMap = useMemo(() => new Map(suppliers?.map(s => [s.id, s.name])), [suppliers]);

    const filteredPurchases = useMemo(() => {
        if (!purchases) return [];
        if (!searchTerm) return purchases;
        const lowerSearch = searchTerm.toLowerCase();
        return purchases.filter(p => {
            const supplierName = supplierMap.get(p.supplierId)?.toLowerCase() || '';
            return supplierName.includes(lowerSearch) || p.referenceNo?.toLowerCase().includes(lowerSearch) || String(p.id).includes(lowerSearch);
        });
    }, [purchases, searchTerm, supplierMap]);

    const openModal = (purchase: Purchase | null = null) => {
        setSelectedPurchase(purchase);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setSelectedPurchase(null);
        setIsModalOpen(false);
    };

    const handleDelete = async (purchase: Purchase) => {
        showConfirmation(
            'Delete Purchase Order',
            'Are you sure you want to delete this purchase order? If it was "Received", stock levels will be reversed. This action cannot be undone.',
            async () => {
                await (db as any).transaction('rw', db.purchases, db.products, async () => {
                    if (purchase.status === 'received') {
                        for (const item of purchase.items) {
                            const product = await db.products.get(item.productId);
                            if (product) {
                                const newVariants = product.variants.map(v =>
                                    v.id === item.variantId ? { ...v, stock: v.stock - item.quantity } : v
                                );
                                await db.products.update(product.id!, { variants: newVariants });
                            }
                        }
                    }
                    await db.purchases.delete(purchase.id!);
                });
                toast.success('Purchase order deleted and stock adjusted.');
            }
        );
    };

    const getStatusChip = (status: Purchase['status']) => {
        switch (status) {
            case 'received': return <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">Received</span>;
            case 'pending': return <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
            case 'cancelled': return <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">Cancelled</span>;
            default: return null;
        }
    };
    
    const getPaymentStatusChip = (status: Purchase['paymentStatus']) => {
        switch (status) {
            case 'paid': return <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">Paid</span>;
            case 'partially_paid': return <span className="px-2 py-1 text-xs font-semibold bg-yellow-100 text-yellow-800 rounded-full">Partially Paid</span>;
            case 'unpaid': return <span className="px-2 py-1 text-xs font-semibold bg-red-100 text-red-800 rounded-full">Unpaid</span>;
            default: return null;
        }
    };

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Purchases</h1>
                <button onClick={() => openModal()} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg shadow hover:bg-primary-700 transition">
                    <Plus size={20} />
                    New Purchase Order
                </button>
            </div>
            
            <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={20} />
                <input type="text" placeholder="Search by Supplier, Ref #, or ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-secondary-50 dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-800 rounded-lg"/>
            </div>

            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary-100 dark:bg-secondary-800/50">
                            <tr>
                                <th className="p-4">Date</th>
                                <th className="p-4">Ref #</th>
                                <th className="p-4">Supplier</th>
                                <th className="p-4">Total Amount</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Payment Status</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPurchases?.map(p => (
                                <tr key={p.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                    <td className="p-4">{format(p.purchaseDate, 'MMM d, yyyy')}</td>
                                    <td className="p-4 font-mono">{p.referenceNo || 'N/A'}</td>
                                    <td className="p-4 font-medium">{supplierMap.get(p.supplierId) || 'Unknown'}</td>
                                    <td className="p-4">{currency}{p.totalAmount.toFixed(2)}</td>
                                    <td className="p-4">{getStatusChip(p.status)}</td>
                                    <td className="p-4">{getPaymentStatusChip(p.paymentStatus)}</td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            <button onClick={() => openModal(p)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full"><Edit size={16} /></button>
                                            <button onClick={() => handleDelete(p)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isModalOpen && <PurchaseFormModal purchase={selectedPurchase} onClose={closeModal} />}
        </div>
    );
};


// --- Form Modal & Sub-components ---

type FormItem = PurchaseItem & { productName: string };

const PurchaseFormModal: React.FC<{ purchase: Purchase | null; onClose: () => void; }> = ({ purchase, onClose }) => {
    const { storeInfo } = useAppContext();
    const currency = storeInfo?.currency || '$';
    
    const [formData, setFormData] = useState<Omit<Purchase, 'id' | 'items' | 'totalAmount' | 'paymentStatus'>>({
        supplierId: purchase?.supplierId || 0,
        purchaseDate: purchase?.purchaseDate || new Date(),
        status: purchase?.status || 'pending',
        referenceNo: purchase?.referenceNo || '',
        amountPaid: purchase?.amountPaid || 0,
        notes: purchase?.notes || '',
    });
    const [items, setItems] = useState<FormItem[]>(purchase?.items.map(i => ({...i})) || []);
    const [originalPurchase, setOriginalPurchase] = useState<Purchase | null>(null);

    const suppliers = useLiveQuery(() => db.suppliers.toArray());

    useEffect(() => {
        if (purchase) {
            setOriginalPurchase(purchase); // Store original for stock calculation
        }
    }, [purchase]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(p => ({ ...p, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleItemChange = (index: number, field: 'quantity' | 'costPerItem', value: number) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };
    
    const handleItemRemove = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleProductAdded = (product: Product, variant: Variant, quantity: number, costPrice: number) => {
        const newItem: FormItem = {
            productId: product.id!,
            variantId: variant.id,
            productName: `${product.name} ${Object.values(variant.attributes).join(' / ')}`.trim(),
            quantity,
            costPerItem: costPrice
        };
        setItems([...items, newItem]);
    };

    const totalAmount = useMemo(() => items.reduce((sum, item) => sum + (item.quantity * item.costPerItem), 0), [items]);
    const amountDue = totalAmount - (formData.amountPaid || 0);

    const handleSave = async () => {
        if (!formData.supplierId) return toast.error("Please select a supplier.");
        if (items.length === 0) return toast.error("Please add at least one item.");

        const paid = formData.amountPaid || 0;
        let paymentStatus: Purchase['paymentStatus'] = 'unpaid';
        if (totalAmount > 0 && paid >= totalAmount) {
            paymentStatus = 'paid';
        } else if (paid > 0) {
            paymentStatus = 'partially_paid';
        }

        const purchaseData: Omit<Purchase, 'id'> = { ...formData, items, totalAmount, amountPaid: paid, paymentStatus };

        await (db as any).transaction('rw', db.purchases, db.products, async () => {
            // Revert stock if original PO was received
            if (originalPurchase && originalPurchase.status === 'received') {
                for (const item of originalPurchase.items) {
                    const product = await db.products.get(item.productId);
                    if (product) {
                        const newVariants = product.variants.map(v => 
                            v.id === item.variantId ? { ...v, stock: v.stock - item.quantity } : v);
                        await db.products.update(product.id!, { variants: newVariants });
                    }
                }
            }

            // Apply new stock if status is received
            if (purchaseData.status === 'received') {
                 for (const item of purchaseData.items) {
                    const product = await db.products.get(item.productId);
                    if (product) {
                        const newVariants = product.variants.map(v => 
                            v.id === item.variantId ? { ...v, stock: v.stock + item.quantity } : v);
                        await db.products.update(product.id!, { variants: newVariants });
                    }
                }
            }
            
            if (purchase?.id) {
                await db.purchases.update(purchase.id, purchaseData);
            } else {
                await db.purchases.add(purchaseData as Purchase);
            }
        });
        
        toast.success(`Purchase order ${purchase ? 'updated' : 'created'}.`);
        onClose();
    };


    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-6xl h-[95vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{purchase ? 'Edit' : 'New'} Purchase Order</h2><button type="button" onClick={onClose}><X/></button></div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <select name="supplierId" value={formData.supplierId} onChange={handleFormChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                        <option value={0}>Select Supplier</option>
                        {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input type="date" name="purchaseDate" value={format(new Date(formData.purchaseDate), 'yyyy-MM-dd')} onChange={e => setFormData(p => ({...p, purchaseDate: e.target.valueAsDate || new Date()}))} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input name="referenceNo" placeholder="Reference #" value={formData.referenceNo} onChange={handleFormChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <select name="status" value={formData.status} onChange={handleFormChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                        <option value="pending">Pending</option>
                        <option value="received">Received</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                <ProductSearch onProductAdded={handleProductAdded} suppliers={suppliers || []} />

                <div className="flex-1 overflow-y-auto mt-4 border-t border-secondary-200 dark:border-secondary-800 pt-4">
                    <table className="w-full text-sm">
                        <thead><tr className="text-left text-secondary-500"><th>Product</th><th className="w-24">Quantity</th><th className="w-32">Cost/Item</th><th className="w-32 text-right">Total</th><th className="w-12"></th></tr></thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index} className="border-b border-secondary-200 dark:border-secondary-800">
                                    <td className="py-2 font-medium">{item.productName}</td>
                                    <td><input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded"/></td>
                                    <td><input type="number" step="0.01" value={item.costPerItem} onChange={e => handleItemChange(index, 'costPerItem', parseFloat(e.target.value) || 0)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded"/></td>
                                    <td className="text-right font-semibold">{currency}{(item.quantity * item.costPerItem).toFixed(2)}</td>
                                    <td className="text-right"><button onClick={() => handleItemRemove(index)} className="p-2 text-red-500"><Trash2 size={16}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-secondary-200 dark:border-secondary-800">
                     <textarea name="notes" placeholder="Notes (Optional)" value={formData.notes || ''} onChange={handleFormChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={3}/>
                     <div className="space-y-3">
                         <div className="flex items-center justify-between">
                             <label>Amount Paid</label>
                             <input type="number" step="0.01" name="amountPaid" value={formData.amountPaid || ''} onChange={handleFormChange} className="w-40 p-2 text-right bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                         </div>
                         <div className="flex justify-between font-bold text-lg"><span>Total Amount:</span><span>{currency}{totalAmount.toFixed(2)}</span></div>
                         <div className="flex justify-between font-bold text-lg text-red-500"><span>Amount Due:</span><span>{currency}{amountDue.toFixed(2)}</span></div>
                     </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onClose} className="px-6 py-3 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-3 bg-primary-600 text-white rounded-lg">{purchase ? 'Update' : 'Save'} Purchase</button>
                </div>
            </div>
        </div>
    );
};

const ProductSearch: React.FC<{onProductAdded: (p: Product, v: Variant, qty: number, cost: number) => void; suppliers: Supplier[]}> = ({ onProductAdded, suppliers }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddingNew, setIsAddingNew] = useState(false);
    const searchResults = useLiveQuery(() => 
        searchTerm ? db.products.where('name').startsWithIgnoreCase(searchTerm).limit(10).toArray() : Promise.resolve([]), 
    [searchTerm]);
    
    const handleSelect = (product: Product, variant: Variant) => {
        onProductAdded(product, variant, 1, variant.costPrice);
        setSearchTerm('');
    };

    return (
        <div className="bg-secondary-100 dark:bg-secondary-800 p-4 rounded-lg flex items-center gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={20} />
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search for a product to add..." 
                    className="w-full pl-10 pr-4 py-3 bg-secondary-50 dark:bg-secondary-900 rounded-lg"
                />
                {searchTerm && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-secondary-50 dark:bg-secondary-900 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                        {searchResults?.map(p => (
                            <div key={p.id}>
                                {p.variants.map(v => (
                                    <button key={v.id} onClick={() => handleSelect(p,v)} className="w-full text-left p-3 hover:bg-secondary-200 dark:hover:bg-secondary-800">
                                        {p.name} {Object.values(v.attributes).join(' / ')}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <button onClick={() => setIsAddingNew(true)} className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg">
                <PackagePlus size={18} /> Add New
            </button>
            {isAddingNew && <FullProductAddModal onProductAdded={onProductAdded} onClose={() => setIsAddingNew(false)} suppliers={suppliers} />}
        </div>
    );
};

// --- Full-featured Product Add Modal (copied from ProductsPage.tsx and adapted) ---
const TagInput: React.FC<{ values: string[], onChange: (newValues: string[]) => void, placeholder: string }> = ({ values, onChange, placeholder }) => {
    const [inputValue, setInputValue] = useState('');
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === ',' || e.key === 'Enter') { e.preventDefault(); const newValue = inputValue.trim(); if (newValue && !values.includes(newValue)) { onChange([...values, newValue]); } setInputValue(''); } else if (e.key === 'Backspace' && !inputValue) { if (values.length > 0) { removeTag(values.length - 1); } } };
    const removeTag = (indexToRemove: number) => { onChange(values.filter((_, index) => index !== indexToRemove)); };
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); const pastedText = e.clipboardData.getData('text'); const newValues = pastedText.split(',').map(v => v.trim()).filter(Boolean); if (newValues.length > 0) { const uniqueNewValues = newValues.filter(v => !values.includes(v)); onChange([...values, ...uniqueNewValues]); } };
    return (<div className="flex-1 flex flex-wrap items-center gap-2 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg border-2 border-transparent focus-within:border-primary-500">{values.map((value, index) => (<div key={index} className="flex items-center gap-1 bg-primary-500 text-white text-sm px-2 py-1 rounded"><span>{value}</span><button type="button" onClick={() => removeTag(index)} className="hover:bg-primary-600 rounded-full"><X size={14} /></button></div>))}<input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder={placeholder} className="flex-1 bg-transparent outline-none min-w-[120px]"/></div>);
};

const VariantRow: React.FC<{ variant: Variant; options: ProductOption[]; onChange: (id: string, field: keyof Omit<Variant, 'id' | 'attributes'>, value: string) => void; onRemove: (id: string) => void; isSelected: boolean; onToggleSelect: (id: string, checked: boolean) => void; }> = ({variant, options, onChange, onRemove, isSelected, onToggleSelect}) => {
    const { hasPermission } = usePermissions();

    const generateNewBarcode = async () => {
        const allProducts = await db.products.toArray();
        const existingBarcodes = new Set<number>();
        
        allProducts.forEach(p => {
            p.variants.forEach(v => {
                if (v.barcode) {
                    const num = parseInt(v.barcode, 10);
                    if (!isNaN(num)) existingBarcodes.add(num);
                }
            });
        });

        let nextBarcodeNum = 0;
        while(existingBarcodes.has(nextBarcodeNum)) {
            nextBarcodeNum++;
        }

        if (nextBarcodeNum > 999999) {
            toast.error("All available barcodes are in use.");
            return;
        }

        const newBarcode = String(nextBarcodeNum).padStart(6, '0');
        onChange(variant.id, 'barcode', newBarcode);
    };

    return (
        <div className="bg-secondary-100 dark:bg-secondary-800/50 p-2 rounded-lg grid grid-cols-12 gap-2 items-center text-sm">
            <input type="checkbox" checked={isSelected} onChange={e => onToggleSelect(variant.id, e.target.checked)} className="col-span-1 h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"/>
            <div className={`font-medium ${hasPermission('EditProductDetails') ? 'col-span-2' : 'col-span-3'}`}>{options.slice(1).map(opt => variant.attributes[opt.name]).join(' / ') || 'Standard'}</div>
            <input placeholder="SKU" value={variant.sku || ''} onChange={e => onChange(variant.id, 'sku', e.target.value)} className="col-span-2 p-2 bg-secondary-200 dark:bg-secondary-700 rounded"/>
            <div className="col-span-2 relative"><input placeholder="Barcode" value={variant.barcode || ''} onChange={e => onChange(variant.id, 'barcode', e.target.value)} className="w-full p-2 pr-9 bg-secondary-200 dark:bg-secondary-700 rounded"/><button type="button" onClick={generateNewBarcode} title="Generate Barcode" className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-secondary-500 hover:text-primary-500"><BarcodeIcon size={16} /></button></div>
            {hasPermission('EditProductDetails') && <input type="number" placeholder="Cost" step="0.01" value={variant.costPrice || ''} onChange={e => onChange(variant.id, 'costPrice', e.target.value)} className="col-span-1 p-2 bg-secondary-200 dark:bg-secondary-700 rounded"/>}
            <input type="number" placeholder="Price" step="0.01" value={variant.sellingPrice || ''} onChange={e => onChange(variant.id, 'sellingPrice', e.target.value)} className={hasPermission('EditProductDetails') ? "col-span-2" : "col-span-3" + " p-2 bg-secondary-200 dark:bg-secondary-700 rounded"}/>
            <input type="number" placeholder="Stock" value={variant.stock || ''} onChange={e => onChange(variant.id, 'stock', e.target.value)} className="col-span-1 p-2 bg-secondary-200 dark:bg-secondary-700 rounded"/>
            <div className="col-span-1 flex justify-end"><button type="button" onClick={() => onRemove(variant.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button></div>
        </div>
    );
};

const generateCategoryOptions = (categories: ProductCategory[]): { id: number; name: string }[] => {
    const options: { id: number; name: string }[] = [];
    const categoryMap = new Map<number, ProductCategory & { children: ProductCategory[] }>();
    categories.forEach(cat => { categoryMap.set(cat.id!, { ...cat, children: [] }); });
    categories.forEach(cat => { if (cat.parentId && categoryMap.has(cat.parentId)) { categoryMap.get(cat.parentId)!.children.push(categoryMap.get(cat.id!)!); } });
    const buildOptions = (categoryId: number, depth: number) => { const category = categoryMap.get(categoryId)!; options.push({ id: category.id!, name: `${'    '.repeat(depth)} ${category.name}` }); category.children.sort((a,b) => a.name.localeCompare(b.name)).forEach(child => buildOptions(child.id!, depth + 1)); };
    categories.filter(c => !c.parentId).sort((a,b) => a.name.localeCompare(b.name)).forEach(rootCat => buildOptions(rootCat.id!, 0));
    return options;
};

const FullProductAddModal: React.FC<{ onProductAdded: (p: Product, v: Variant, qty: number, cost: number) => void; onClose: () => void; suppliers: Supplier[]; }> = ({ onProductAdded, onClose, suppliers }) => {
    const { hasPermission } = usePermissions();
    const [formData, setFormData] = useState<Omit<Product, 'id' | 'variantAttributes'>>({ name: '', categoryId: undefined, brand: '', lowStockThreshold: 10, options: [], variants: [{ id: uuidv4(), attributes: {}, stock: 0, costPrice: 0, sellingPrice: 0 }] });
    const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
    const [bulkEditData, setBulkEditData] = useState<Partial<Pick<Variant, 'stock' | 'costPrice' | 'sellingPrice'>>>({});
    const categories = useLiveQuery<ProductCategory[]>(() => db.productCategories.toArray()) ?? [];
    const categoryOptions = useMemo(() => categories ? generateCategoryOptions(categories) : [], [categories]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: (name === 'lowStockThreshold' || name === 'supplierId' || name === 'categoryId') ? parseInt(value) : value })); };
    const handleOptionChange = (index: number, field: 'name' | 'values', value: string | string[]) => { const newOptions = [...formData.options]; if (field === 'values' && Array.isArray(value)) { newOptions[index].values = value; } else if (field === 'name' && typeof value === 'string') { const oldName = newOptions[index].name; newOptions[index].name = value; const newVariants = formData.variants.map(v => { if (oldName && (oldName in v.attributes)) { v.attributes[value] = v.attributes[oldName]; delete v.attributes[oldName]; } return v; }); setFormData(prev => ({...prev, variants: newVariants})); } setFormData(prev => ({ ...prev, options: newOptions })); };
    const addOption = () => { setFormData(prev => ({ ...prev, options: [...prev.options, { name: '', values: [] }] })); };
    const removeOption = (index: number) => { const optionToRemove = formData.options[index]; const newVariants = formData.variants.map(v => { delete v.attributes[optionToRemove.name]; return v; }); setFormData(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== index), variants: newVariants, })); };
    const cartesian = <T,>(...a: T[][]): T[][] => { if (!a || a.length === 0) { return []; } return a.reduce<T[][]>( (acc, val) => acc.flatMap(d => val.map(e => [...d, e])), [[]] ); };
    
    const handleGenerateVariants = async () => {
        const { options, variants: oldVariants } = formData;
        if (options.length === 0 || options.some(opt => opt.values.length === 0)) {
            toast.error("Please add options and their values before generating variants.");
            return;
        }

        const allProducts = await db.products.toArray();
        const existingBarcodes = new Set<number>();

        allProducts.forEach(p => {
            p.variants.forEach(v => {
                if (v.barcode) {
                    const num = parseInt(v.barcode, 10);
                    if (!isNaN(num)) existingBarcodes.add(num);
                }
            });
        });
        formData.variants.forEach(v => {
            if (v.barcode) {
                const num = parseInt(v.barcode, 10);
                if (!isNaN(num)) existingBarcodes.add(num);
            }
        });

        let nextBarcodeNum = 0;
        const findNextAvailable = () => {
            while (existingBarcodes.has(nextBarcodeNum)) {
                nextBarcodeNum++;
            }
            const newBarcodeNum = nextBarcodeNum;
            existingBarcodes.add(newBarcodeNum);
            return String(newBarcodeNum).padStart(6, '0');
        };

        const valueArrays = options.map(opt => opt.values);
        const combinations = cartesian(...valueArrays);
        const newVariants = combinations.map(combo => {
            const attributes: Record<string, string> = {};
            options.forEach((opt, i) => { attributes[opt.name] = (combo as string[])[i]; });
            const existingVariant = oldVariants.find(v => Object.keys(attributes).length === Object.keys(v.attributes).length && Object.keys(attributes).every(key => attributes[key] === v.attributes[key]));
            return existingVariant || { id: uuidv4(), attributes, stock: 0, costPrice: 0, sellingPrice: 0, barcode: findNextAvailable() };
        });
        setFormData(prev => ({ ...prev, variants: newVariants }));
        setSelectedVariants(new Set());
    };
    
    const handleVariantChange = (id: string, field: keyof Omit<Variant, 'id' | 'attributes'>, value: string) => { setFormData(prev => ({ ...prev, variants: prev.variants.map(v => v.id === id ? { ...v, [field]: (field === 'stock' ? parseInt(value) || 0 : (field === 'costPrice' || field === 'sellingPrice' ? parseFloat(value) || 0 : value)) } : v) })); };
    const removeVariant = (id: string) => { setFormData(prev => ({ ...prev, variants: prev.variants.filter(v => v.id !== id) })); };
    const handleToggleSelectVariant = (id: string, checked: boolean) => { setSelectedVariants(prev => { const newSet = new Set(prev); if (checked) newSet.add(id); else newSet.delete(id); return newSet; }); };
    const handleApplyBulkEdit = () => { const updatedCount = selectedVariants.size; if (updatedCount === 0) return; setFormData(prev => ({ ...prev, variants: prev.variants.map(v => selectedVariants.has(v.id) ? { ...v, ...bulkEditData } : v) })); setBulkEditData({}); setSelectedVariants(new Set()); toast.success(`Updated ${updatedCount} variants.`); };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const dataToSave = { ...formData };
            delete (dataToSave as any).variantAttributes;
            delete (dataToSave as any).category;
            const newProductId = await db.products.add(dataToSave as Product);
            const newProduct = await db.products.get(newProductId);
            if (newProduct) {
                const firstVariant = newProduct.variants[0];
                if (firstVariant) {
                    onProductAdded(newProduct, firstVariant, 1, firstVariant.costPrice);
                    toast.success(`'${newProduct.name}' created and added to purchase order.`);
                    onClose();
                } else {
                    toast.error("Product created but it has no variants to add.");
                    onClose();
                }
            }
        } catch(error) {
            toast.error('Failed to save product.');
            console.error(error);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-6xl h-[95vh] flex flex-col animate-slideInUp">
                 <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Add New Product</h2><button type="button" onClick={onClose}><X /></button></div>
                 <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-6">
                    <fieldset className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <input name="name" value={formData.name} onChange={handleChange} required placeholder="Product Name" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <select name="categoryId" value={formData.categoryId || ''} onChange={handleChange} required className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"><option value="" disabled>Select a category</option>{categoryOptions.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select>
                        <input name="brand" value={formData.brand || ''} onChange={handleChange} placeholder="Brand" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <select name="supplierId" value={formData.supplierId || ''} onChange={handleChange} className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"><option value="">No Supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                        <input name="lowStockThreshold" type="number" value={formData.lowStockThreshold} onChange={handleChange} required placeholder="Low Stock Threshold" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    </fieldset>
                    <fieldset className="p-4 border border-secondary-200 dark:border-secondary-800 rounded-lg"><legend className="px-2 font-semibold">Product Options</legend><div className="space-y-3">{formData.options.map((option, index) => (<div key={index} className="flex items-center gap-2"><input placeholder="Option Name (e.g., Color)" value={option.name} onChange={e => handleOptionChange(index, 'name', e.target.value)} className="w-1/3 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/><TagInput values={option.values} onChange={newValues => handleOptionChange(index, 'values', newValues)} placeholder="Add values and press Enter or comma"/><button type="button" onClick={() => removeOption(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button></div>))}</div><div className="flex gap-4 mt-4"><button type="button" onClick={addOption} className="text-sm text-primary-500 hover:underline">+ Add Option</button><button type="button" onClick={handleGenerateVariants} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"><ChevronsRight size={16}/> Generate Variants</button></div></fieldset>
                    <fieldset className="p-4 border border-secondary-200 dark:border-secondary-800 rounded-lg"><legend className="px-2 font-semibold">Variants ({formData.variants.length})</legend>{selectedVariants.size > 0 && <div className="p-3 mb-4 bg-primary-100 dark:bg-primary-900/50 rounded-lg flex items-center gap-4 flex-wrap animate-fadeIn"><span className="font-semibold">{selectedVariants.size} selected</span><input type="number" placeholder="Stock" onChange={e => setBulkEditData(d => ({...d, stock: parseInt(e.target.value) || 0}))} className="w-24 p-2 bg-secondary-50 dark:bg-secondary-800 rounded"/>{hasPermission('EditProductDetails') && <input type="number" placeholder="Cost" step="0.01" onChange={e => setBulkEditData(d => ({...d, costPrice: parseFloat(e.target.value) || 0}))} className="w-24 p-2 bg-secondary-50 dark:bg-secondary-800 rounded"/>}<input type="number" placeholder="Price" step="0.01" onChange={e => setBulkEditData(d => ({...d, sellingPrice: parseFloat(e.target.value) || 0}))} className="w-24 p-2 bg-secondary-50 dark:bg-secondary-800 rounded"/><button type="button" onClick={handleApplyBulkEdit} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg">Apply</button></div>}<div className="grid grid-cols-12 gap-2 items-center font-bold text-xs text-secondary-500 px-2 pb-2"><div className="col-span-1"></div><div className={hasPermission('EditProductDetails') ? "col-span-2" : "col-span-3"}>Variant</div><div className="col-span-2">SKU</div><div className="col-span-2">Barcode</div>{hasPermission('EditProductDetails') && <div className="col-span-1">Cost</div>}<div className={hasPermission('EditProductDetails') ? "col-span-2" : "col-span-3"}>Price</div><div className="col-span-1">Stock</div><div className="col-span-1 text-right"></div></div><div className="space-y-2">{formData.variants.map(v => <VariantRow key={v.id} variant={v} options={formData.options} onChange={handleVariantChange} onRemove={removeVariant} isSelected={selectedVariants.has(v.id)} onToggleSelect={handleToggleSelectVariant}/>)}</div></fieldset>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Product</button></div>
            </form>
        </div>
    );
};


export default PurchasesPage;