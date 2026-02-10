import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Promotion, PromotionItem, Product, Variant, Voucher } from '../types';
import { Plus, Edit, Trash2, X, Search, ChevronRight, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format, startOfDay, endOfDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../hooks/useAppContext';

type MainTab = 'events' | 'vouchers';

const PromotionsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<MainTab>('events');

    return (
        <div className="animate-fadeIn space-y-6">
            <h1 className="text-3xl font-bold">Promotions</h1>

            <div className="border-b border-secondary-200 dark:border-secondary-800">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('events')} className={`${activeTab === 'events' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Sale Events</button>
                    <button onClick={() => setActiveTab('vouchers')} className={`${activeTab === 'vouchers' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Coupons & Gift Cards</button>
                </nav>
            </div>

            {activeTab === 'events' && <SaleEventsManager />}
            {activeTab === 'vouchers' && <VoucherManager />}
        </div>
    );
};


// --- Sale Events Manager ---
const SaleEventsManager: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
    const { showConfirmation } = useAppContext();

    const promotions = useLiveQuery(() => db.promotions.toArray(), []);

    const openModal = (promo: Promotion | null = null) => {
        setEditingPromotion(promo);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        showConfirmation(
            'Delete Sale Event',
            'Are you sure you want to delete this sale event?',
            async () => {
                await db.promotions.delete(id);
                toast.success('Sale event deleted.');
            }
        );
    };

    const getStatus = (promo: Promotion) => {
        const now = new Date();
        const start = new Date(promo.startDate);
        const end = new Date(promo.endDate);
        if (now < start) return <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-800 rounded-full">Upcoming</span>;
        if (now > end) return <span className="text-xs font-semibold px-2 py-1 bg-secondary-200 text-secondary-800 rounded-full">Expired</span>;
        return <span className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-800 rounded-full">Active</span>;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Create time-based sales for specific products.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"><Plus size={16} /> New Sale Event</button>
            </div>
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-secondary-100 dark:bg-secondary-800/50 text-left"><tr><th className="p-4">Name</th><th className="p-4">Period</th><th className="p-4">Items</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead>
                    <tbody>
                        {promotions?.map(promo => (
                            <tr key={promo.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                <td className="p-4 font-medium">{promo.name}</td>
                                <td className="p-4">{format(promo.startDate, 'PP')} - {format(promo.endDate, 'PP')}</td>
                                <td className="p-4">{promo.items.length}</td>
                                <td className="p-4">{getStatus(promo)}</td>
                                <td className="p-4"><div className="flex gap-2">
                                    <button onClick={() => openModal(promo)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(promo.id!)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                                </div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <SaleEventFormModal promotion={editingPromotion} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const SaleEventFormModal: React.FC<{ promotion: Promotion | null; onClose: () => void; }> = ({ promotion, onClose }) => {
    const [formData, setFormData] = useState<Omit<Promotion, 'id'>>({
        name: promotion?.name || '',
        startDate: promotion?.startDate || new Date(),
        endDate: promotion?.endDate || endOfDay(new Date()),
        items: promotion?.items || []
    });
    const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);

    const handleSave = async () => {
        if (!formData.name.trim()) return toast.error("Event name is required.");
        if (formData.items.length === 0) return toast.error("Add at least one product to the sale.");

        const dataToSave = {
            ...formData,
            startDate: startOfDay(new Date(formData.startDate)),
            endDate: endOfDay(new Date(formData.endDate)),
        };

        if (promotion?.id) {
            await db.promotions.update(promotion.id, dataToSave);
            toast.success("Sale event updated.");
        } else {
            await db.promotions.add(dataToSave as Promotion);
            toast.success("Sale event created.");
        }
        onClose();
    };

    const handleItemUpdate = (index: number, field: 'discountValue', value: number) => {
        const newItems = [...formData.items];
        newItems[index][field] = value;
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const handleItemRemove = (index: number) => {
        setFormData(prev => ({...prev, items: prev.items.filter((_, i) => i !== index)}));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-4xl h-[90vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{promotion ? 'Edit' : 'New'} Sale Event</h2><button type="button" onClick={onClose}><X/></button></div>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-4">
                    <input value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} placeholder="Event Name (e.g., Summer Sale)" className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <div className="grid grid-cols-2 gap-4">
                        <input type="date" value={format(new Date(formData.startDate), 'yyyy-MM-dd')} onChange={e => setFormData(p => ({...p, startDate: e.target.valueAsDate || new Date()}))} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <input type="date" value={format(new Date(formData.endDate), 'yyyy-MM-dd')} onChange={e => setFormData(p => ({...p, endDate: e.target.valueAsDate || new Date()}))} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    </div>
                    <div className="p-4 border border-secondary-200 dark:border-secondary-800 rounded-lg">
                        <div className="flex justify-between items-center mb-2"><h3 className="font-semibold">Sale Items ({formData.items.length})</h3><button type="button" onClick={() => setIsProductSelectorOpen(true)} className="text-sm text-primary-500 hover:underline">+ Add Products</button></div>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {formData.items.map((item, index) => (
                                <div key={index} className="flex items-center gap-2 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                                    <p className="flex-1 text-sm">{item.productName}</p>
                                    <input type="number" step="0.01" value={item.discountValue} onChange={e => handleItemUpdate(index, 'discountValue', parseFloat(e.target.value) || 0)} placeholder="Flat Discount" className="w-32 p-1 bg-secondary-200 dark:bg-secondary-700 rounded"/>
                                    <button type="button" onClick={() => handleItemRemove(index)} className="p-2 text-red-500"><Trash2 size={16}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-4"><button type="button" onClick={onClose}>Cancel</button><button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save</button></div>
                {isProductSelectorOpen && <ProductSelectorModal existingItems={formData.items} onAdd={(newItems) => setFormData(p => ({...p, items: [...p.items, ...newItems]}))} onClose={() => setIsProductSelectorOpen(false)} />}
            </div>
        </div>
    );
};

const ProductSelectorModal: React.FC<{ existingItems: PromotionItem[], onAdd: (items: PromotionItem[]) => void; onClose: () => void }> = ({ existingItems, onAdd, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selected, setSelected] = useState<PromotionItem[]>([]);
    const products = useLiveQuery(() => searchTerm ? db.products.where('name').startsWithIgnoreCase(searchTerm).toArray() : [], [searchTerm]);

    const handleSelect = (product: Product, variant: Variant) => {
        const item: PromotionItem = {
            productId: product.id!,
            variantId: variant.id,
            productName: `${product.name} ${Object.values(variant.attributes).join(' / ')}`.trim(),
            discountType: 'flat',
            discountValue: 0
        };
        setSelected(prev => [...prev, item]);
    };

    const isSelectedOrExisting = (productId: number, variantId: string) => {
        return selected.some(i => i.productId === productId && i.variantId === variantId) || existingItems.some(i => i.productId === productId && i.variantId === variantId);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-2xl h-[70vh] flex flex-col animate-slideInUp">
                <h3 className="font-bold mb-4">Select Products</h3>
                <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} /><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search products..." className="w-full pl-10 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg" /></div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {products?.map(p => (
                        <div key={p.id} className="bg-secondary-100 dark:bg-secondary-800 p-2 rounded-lg">
                            <h4 className="font-semibold px-2">{p.name}</h4>
                            {p.variants.map(v => (
                                <div key={v.id} className="flex items-center justify-between p-2 hover:bg-secondary-200 dark:hover:bg-secondary-700 rounded">
                                    <span className="text-sm">{Object.values(v.attributes).join(' / ') || 'Standard'}</span>
                                    <button onClick={() => handleSelect(p,v)} disabled={isSelectedOrExisting(p.id!, v.id)} className="text-sm px-3 py-1 bg-primary-500 text-white rounded disabled:bg-secondary-300">Select</button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                 <div className="flex justify-end gap-3 mt-4"><button type="button" onClick={onClose}>Cancel</button><button onClick={() => { onAdd(selected); onClose(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Add {selected.length} Selected</button></div>
            </div>
        </div>
    );
};

// --- Voucher Manager ---
const VoucherManager: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
    const { showConfirmation } = useAppContext();

    const vouchers = useLiveQuery(() => db.vouchers.toArray(), []);

    const openModal = (voucher: Voucher | null = null) => {
        setEditingVoucher(voucher);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: number) => {
        showConfirmation(
            'Delete Voucher',
            'Are you sure you want to delete this voucher? This cannot be undone.',
            async () => {
                await db.vouchers.delete(id);
                toast.success('Voucher deleted.');
            }
        );
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Create discount codes and gift cards for customers.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"><Plus size={16} /> New Voucher</button>
            </div>
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-secondary-100 dark:bg-secondary-800/50 text-left"><tr><th className="p-4">Code</th><th className="p-4">Type</th><th className="p-4">Value</th><th className="p-4">Usage</th><th className="p-4">Actions</th></tr></thead>
                    <tbody>
                        {vouchers?.map(v => (
                             <tr key={v.id} className="border-b border-secondary-200 dark:border-secondary-800">
                                <td className="p-4 font-mono font-medium">{v.code}</td>
                                <td className="p-4 capitalize">{v.type.replace(/_/g, ' ')}</td>
                                <td className="p-4">{v.type === 'gift_card' ? `${v.remainingBalance?.toFixed(2)} / ${v.initialBalance?.toFixed(2)}` : `${v.value}${v.type.includes('percentage') ? '%' : ''}`}</td>
                                <td className="p-4">{v.timesUsed} / {v.maxUses === 0 ? '∞' : v.maxUses}</td>
                                <td className="p-4"><div className="flex gap-2">
                                    <button onClick={() => openModal(v)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                                    <button onClick={() => handleDelete(v.id!)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                                </div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && <VoucherFormModal voucher={editingVoucher} onClose={() => setIsModalOpen(false)} />}
        </div>
    );
};

const VoucherFormModal: React.FC<{ voucher: Voucher | null; onClose: () => void; }> = ({ voucher, onClose }) => {
    const [formData, setFormData] = useState<Omit<Voucher, 'id'>>({
        code: voucher?.code || '',
        type: voucher?.type || 'coupon_flat',
        value: voucher?.value || 0,
        initialBalance: voucher?.initialBalance || 0,
        remainingBalance: voucher?.remainingBalance || 0,
        isSingleUse: voucher?.isSingleUse ?? false,
        timesUsed: voucher?.timesUsed || 0,
        maxUses: voucher?.maxUses || 1,
        expiryDate: voucher?.expiryDate,
        isActive: voucher?.isActive ?? true,
    });
    
    const [copied, setCopied] = useState(false);

    const generateCode = () => {
        const code = Array(8).fill(0).map(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join('');
        setFormData(p => ({...p, code }));
    };

    const handleSave = async () => {
        let dataToSave = {...formData};
        if(dataToSave.type === 'gift_card') {
            dataToSave.initialBalance = dataToSave.value;
            dataToSave.remainingBalance = dataToSave.value;
        }
        if (dataToSave.isSingleUse) {
            dataToSave.maxUses = 1;
        }

        if (voucher?.id) {
            await db.vouchers.update(voucher.id, dataToSave);
            toast.success("Voucher updated.");
        } else {
            await db.vouchers.add(dataToSave as Voucher);
            toast.success("Voucher created.");
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{voucher ? 'Edit' : 'New'} Voucher</h2><button type="button" onClick={onClose}><X/></button></div>
                <div className="space-y-6">
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                            <input 
                                id="voucher-code"
                                value={formData.code} 
                                onChange={e => setFormData(p => ({...p, code: e.target.value.toUpperCase()}))}
                                placeholder=" "
                                className="block w-full px-3 py-3 text-sm font-mono bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"
                            />
                            <label 
                                htmlFor="voucher-code"
                                className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3"
                            >
                                Voucher Code
                            </label>
                        </div>
                        <button type="button" onClick={generateCode} className="px-4 py-3 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-lg">Generate</button>
                        <button type="button" onClick={() => { navigator.clipboard.writeText(formData.code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="p-3 bg-secondary-200 dark:bg-secondary-700 rounded-lg">{copied ? <Check size={20}/> : <Copy size={20}/>}</button>
                    </div>

                    <div className="relative">
                        <select 
                            id="voucher-type"
                            value={formData.type} 
                            onChange={e => setFormData(p => ({...p, type: e.target.value as any}))} 
                            className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 focus:border-primary-500"
                        >
                            <option value="coupon_flat">Coupon (Flat Amount)</option>
                            <option value="coupon_percentage">Coupon (Percentage)</option>
                            <option value="gift_card">Gift Card</option>
                        </select>
                        <label 
                            htmlFor="voucher-type"
                            className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 start-3"
                        >
                            Voucher Type
                        </label>
                    </div>
                    
                    <div className="relative">
                        <input 
                            id="voucher-value"
                            type="number"
                            step="0.01" 
                            value={formData.value || ''} 
                            onChange={e => setFormData(p => ({...p, value: parseFloat(e.target.value) || 0}))} 
                            placeholder=" "
                            className="block w-full px-3 py-3 text-sm bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"
                        />
                        <label 
                            htmlFor="voucher-value"
                            className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3"
                        >
                            {formData.type.includes('percentage') ? 'Percentage %' : 'Value/Balance'}
                        </label>
                    </div>

                    {formData.type.includes('coupon') && <div className="space-y-4">
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={formData.isSingleUse} onChange={e => setFormData(p => ({...p, isSingleUse: e.target.checked}))} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 bg-secondary-100 border-secondary-300" /> 
                            Single Use
                        </label>
                        {!formData.isSingleUse && 
                            <div className="relative">
                                <input 
                                    id="max-uses"
                                    type="number" 
                                    value={formData.maxUses || ''} 
                                    onChange={e => setFormData(p => ({...p, maxUses: parseInt(e.target.value) || 0}))} 
                                    placeholder=" "
                                    className="block w-full px-3 py-3 text-sm bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"
                                />
                                <label 
                                    htmlFor="max-uses"
                                    className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3"
                                >
                                    Max Uses (0 for unlimited)
                                </label>
                            </div>
                        }
                    </div>}
                    
                    <div className="relative">
                        <input 
                            id="expiry-date"
                            type="date" 
                            value={formData.expiryDate ? format(new Date(formData.expiryDate), 'yyyy-MM-dd') : ''} 
                            onChange={e => setFormData(p => ({...p, expiryDate: e.target.valueAsDate ? endOfDay(e.target.valueAsDate) : undefined}))}
                            className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 focus:border-primary-500"
                        />
                        <label 
                            htmlFor="expiry-date"
                            className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 start-3"
                        >
                            Expiry Date (optional)
                        </label>
                    </div>
                </div>
                 <div className="flex justify-end gap-3 mt-6"><button onClick={onClose} type="button" className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button onClick={handleSave} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save</button></div>
            </div>
        </div>
    );
};


export default PromotionsPage;