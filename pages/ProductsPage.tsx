// CHANGED: Overhauled component for attribute-based variants and barcode generation
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { Product, Variant, Supplier, ProductCategory, ProductOption, Brand } from '../types';
import { Plus, Edit, Trash2, X, Barcode as BarcodeIcon, Printer, Download, Copy, Check, ChevronsRight, Grid, Paperclip, ChevronDown, ChevronUp, FileText, Image as ImageIcon, ZoomIn, ZoomOut, Search, ChevronsLeft, ChevronRight, ChevronsRight as ChevronsRightIcon, ChevronsLeft as ChevronsLeftIcon, Palette, Text, ChevronLeft, Archive, Package, Filter, RotateCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import JsBarcode from 'jsbarcode';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';
import html2canvas from 'html2canvas';

// --- New Bulk Action Components ---

const BulkActionsBar: React.FC<{
    selectedCount: number;
    onEdit: () => void;
    onDelete: () => void;
    onPrint: () => void;
    onClear: () => void;
    canEdit: boolean;
    canDelete: boolean;
}> = ({ selectedCount, onEdit, onDelete, onPrint, onClear, canEdit, canDelete }) => {
    return (
        <div className="flex justify-between items-center bg-primary-500/10 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border-2 border-primary-500 p-3 rounded-lg mb-4 animate-fadeIn">
            <span className="font-semibold">{selectedCount} product(s) selected</span>
            <div className="flex items-center gap-2 md:gap-4">
                {canEdit && <button onClick={onEdit} className="flex items-center gap-2 hover:bg-primary-500/20 p-2 rounded-md transition-colors"><Edit size={16} /> <span className="hidden md:inline">Edit</span></button>}
                {canDelete && <button onClick={onDelete} className="flex items-center gap-2 text-red-500 hover:bg-red-500/10 p-2 rounded-md transition-colors"><Trash2 size={16} /> <span className="hidden md:inline">Delete</span></button>}
                <button onClick={onPrint} className="flex items-center gap-2 hover:bg-primary-500/20 p-2 rounded-md transition-colors"><BarcodeIcon size={16} /> <span className="hidden md:inline">Print Barcodes</span></button>
                <button onClick={onClear} title="Clear selection" className="p-2 hover:bg-primary-500/20 rounded-full transition-colors"><X size={16} /></button>
            </div>
        </div>
    );
};

const BulkEditModal: React.FC<{
    productIds: Set<number>;
    onClose: () => void;
    suppliers: Supplier[];
    brands: Brand[];
}> = ({ productIds, onClose, suppliers, brands }) => {
    const [fieldsToUpdate, setFieldsToUpdate] = useState<Set<keyof Product>>(new Set());
    const [updateData, setUpdateData] = useState<Partial<Product>>({});
    const categories = useLiveQuery<ProductCategory[]>(() => db.productCategories.toArray()) ?? [];

    const handleFieldToggle = (field: keyof Product, checked: boolean) => {
        setFieldsToUpdate(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(field);
            } else {
                newSet.delete(field);
                setUpdateData(currentData => {
                    const { [field]: _, ...rest } = currentData;
                    return rest;
                });
            }
            return newSet;
        });
    };

    const handleApplyChanges = async () => {
        const finalUpdateData: Partial<Product> = {};
        fieldsToUpdate.forEach(field => {
            if (updateData[field] !== undefined) {
                finalUpdateData[field] = updateData[field];
            }
        });

        if (Object.keys(finalUpdateData).length === 0) {
            toast.error("No changes to apply. Please select a field and set a new value.");
            return;
        }

        const idsToUpdate = Array.from(productIds);
        const originalProducts = await db.products.where('id').anyOf(idsToUpdate).toArray();

        await db.products.where('id').anyOf(idsToUpdate).modify(finalUpdateData);
        
        toast.custom((t) => (
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-secondary-50 dark:bg-secondary-900 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                <div className="flex-1 w-0 p-4">
                    <p className="font-medium">{idsToUpdate.length} products updated!</p>
                </div>
                <div className="flex border-l border-secondary-200 dark:border-secondary-800">
                    <button
                        onClick={async () => {
                            await db.products.bulkPut(originalProducts);
                            toast.dismiss(t.id);
                            toast.success('Changes have been undone.');
                        }}
                        className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                        Undo
                    </button>
                </div>
            </div>
        ), { duration: 10000 });

        onClose();
    };

    const renderField = (field: keyof Product, label: string, input: React.ReactNode) => (
        <div className="flex items-center gap-4 p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
            <input
                type="checkbox"
                onChange={(e) => handleFieldToggle(field, e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label className="w-40 font-medium">{label}</label>
            <div className={`flex-1 ${!fieldsToUpdate.has(field) ? 'opacity-50' : ''}`}>
                {React.cloneElement(input as React.ReactElement, { disabled: !fieldsToUpdate.has(field) })}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-2xl animate-slideInUp">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Bulk Edit {productIds.size} Products</h2>
                    <button type="button" onClick={onClose}><X /></button>
                </div>
                <p className="text-sm text-secondary-500 mb-4">Select the fields you want to update for all selected products. Unchecked fields will not be changed.</p>
                <div className="space-y-3">
                    {renderField('categoryId', 'Category', 
                        <select
                            name="categoryId"
                            value={updateData.categoryId || ''}
                            onChange={(e) => setUpdateData(d => ({ ...d, categoryId: Number(e.target.value) }))}
                            className="w-full p-2 bg-secondary-50 dark:bg-secondary-900 rounded"
                        >
                            <option value="" disabled>Select a category</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    )}
                    {renderField('brandId', 'Brand',
                        <select
                            name="brandId"
                            value={updateData.brandId || ''}
                            onChange={(e) => setUpdateData(d => ({ ...d, brandId: Number(e.target.value) }))}
                            className="w-full p-2 bg-secondary-50 dark:bg-secondary-900 rounded"
                        >
                            <option value="">No Brand</option>
                            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    )}
                    {renderField('supplierId', 'Supplier',
                        <select
                            name="supplierId"
                            value={updateData.supplierId || ''}
                            onChange={(e) => setUpdateData(d => ({ ...d, supplierId: Number(e.target.value) }))}
                            className="w-full p-2 bg-secondary-50 dark:bg-secondary-900 rounded"
                        >
                            <option value="">No Supplier</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    )}
                    {renderField('lowStockThreshold', 'Low Stock Threshold',
                        <input
                            name="lowStockThreshold"
                            type="number"
                            value={updateData.lowStockThreshold || ''}
                            onChange={(e) => setUpdateData(d => ({ ...d, lowStockThreshold: Number(e.target.value) }))}
                            className="w-full p-2 bg-secondary-50 dark:bg-secondary-900 rounded"
                        />
                    )}
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button onClick={handleApplyChanges} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Apply Changes</button>
                </div>
            </div>
        </div>
    );
};

// --- Helper Functions ---
const getCategoryWithDescendants = (parentId: number, allCategories: ProductCategory[]): number[] => {
    const descendantIds: number[] = [];
    const queue: number[] = [parentId];
    const visited = new Set<number>([parentId]);

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        descendantIds.push(currentId);
        const children = allCategories.filter(cat => cat.parentId === currentId);
        for (const child of children) {
            if (child.id && !visited.has(child.id)) {
                visited.add(child.id);
                queue.push(child.id);
            }
        }
    }
    return descendantIds;
};

const generateCategoryOptions = (categories: ProductCategory[]): { id: number; name: string }[] => {
    const options: { id: number; name: string }[] = [];
    const categoryMap = new Map<number, ProductCategory & { children: ProductCategory[] }>();
    
    categories.forEach(cat => {
        categoryMap.set(cat.id!, { ...cat, children: [] });
    });

    categories.forEach(cat => {
        if (cat.parentId && categoryMap.has(cat.parentId)) {
            categoryMap.get(cat.parentId)!.children.push(categoryMap.get(cat.id!)!);
        }
    });

    const buildOptions = (categoryId: number, depth: number) => {
        const category = categoryMap.get(categoryId)!;
        options.push({ id: category.id!, name: `${'\u00A0\u00A0\u00A0\u00A0'.repeat(depth)} ${category.name}` });
        category.children.sort((a,b) => a.name.localeCompare(b.name)).forEach(child => buildOptions(child.id!, depth + 1));
    };

    categories.filter(c => !c.parentId).sort((a,b) => a.name.localeCompare(b.name)).forEach(rootCat => buildOptions(rootCat.id!, 0));
    
    return options;
};

// --- Main Page Component ---
const ProductsPage: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set());
    const { hasPermission } = usePermissions();
    const { showConfirmation } = useAppContext();
    const [sortBy, setSortBy] = useState('name-asc');
    const [filters, setFilters] = useState({
        categoryId: 'all',
        brandId: 'all',
        supplierId: 'all',
        stockStatus: 'all'
    });

    const products = useLiveQuery<Product[]>(() => db.products.toArray()) ?? [];
    const suppliers = useLiveQuery<Supplier[]>(() => db.suppliers.toArray()) ?? [];
    const categories = useLiveQuery<ProductCategory[]>(() => db.productCategories.toArray()) ?? [];
    const brands = useLiveQuery<Brand[]>(() => db.brands.toArray()) ?? [];

    const categoryMap = useMemo(() => {
        if (!categories) return new Map<number, string>();
        return new Map(categories.map(c => [c.id!, c.name]));
    }, [categories]);

    const brandMap = useMemo(() => {
        if (!brands) return new Map<number, string>();
        return new Map(brands.map(b => [b.id!, b.name]));
    }, [brands]);

    const categoryOptions = useMemo(() => categories ? generateCategoryOptions(categories) : [], [categories]);

    const filteredAndSortedProducts = useMemo(() => {
        if (!products || !categories) return [];

        let filtered = products.filter(p => {
            if (filters.categoryId !== 'all') {
                const targetCategoryId = parseInt(filters.categoryId);
                const categoryIdsToMatch = getCategoryWithDescendants(targetCategoryId, categories);
                if (!p.categoryId || !categoryIdsToMatch.includes(p.categoryId)) {
                    return false;
                }
            }
            if (filters.brandId !== 'all' && String(p.brandId) !== filters.brandId) {
                return false;
            }
            if (filters.supplierId !== 'all' && String(p.supplierId) !== filters.supplierId) {
                return false;
            }
            if (filters.stockStatus !== 'all') {
                const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
                if (filters.stockStatus === 'in_stock' && totalStock <= 0) return false;
                if (filters.stockStatus === 'low_stock' && (totalStock <= 0 || totalStock > p.lowStockThreshold)) return false;
                if (filters.stockStatus === 'out_of_stock' && totalStock > 0) return false;
            }
            return true;
        });

        return filtered.sort((a, b) => {
            switch (sortBy) {
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                case 'date-desc': return (b.id || 0) - (a.id || 0);
                case 'date-asc': return (a.id || 0) - (b.id || 0);
                default: return 0;
            }
        });

    }, [products, categories, filters, sortBy]);

    const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
        setSelectedProductIds(new Set()); // Clear selection when filters change
    };

    const clearFilters = () => {
        setFilters({ categoryId: 'all', brandId: 'all', supplierId: 'all', stockStatus: 'all' });
        setSortBy('name-asc');
        setSelectedProductIds(new Set());
    };

    const openModal = (product: Product | null = null) => {
        if (product) {
            if (!hasPermission('EditProductDetails')) {
                toast.error("You don't have permission to edit products.");
                return;
            }
        } else {
            if (!hasPermission('ManageProducts')) {
                toast.error("You don't have permission to add products.");
                return;
            }
        }
        setSelectedProduct(product);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedProduct(null);
    };

    const handleDelete = async (id: number) => {
        if (!hasPermission('ManageProducts')) {
            toast.error("You don't have permission to delete products.");
            return;
        }
        showConfirmation(
            'Delete Product',
            'Are you sure you want to delete this product? This will remove all its variants and stock information.',
            async () => {
                await db.products.delete(id);
                toast.success("Product deleted.");
            }
        );
    };
    
    const handleToggleSelect = (id: number) => {
        setSelectedProductIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedProductIds(new Set(filteredAndSortedProducts.map(p => p.id!)));
        } else {
            setSelectedProductIds(new Set());
        }
    };

    const handleBulkDelete = async () => {
        if (!hasPermission('ManageProducts')) {
            toast.error("You don't have permission to delete products.");
            return;
        }
        const count = selectedProductIds.size;
        showConfirmation(
            `Delete ${count} Products`,
            `Are you sure you want to delete ${count} products? This action cannot be undone.`,
            async () => {
                await db.products.bulkDelete(Array.from(selectedProductIds));
                toast.success(`${count} products deleted.`);
                setSelectedProductIds(new Set());
            }
        );
    };

    const isAllSelected = filteredAndSortedProducts.length > 0 && selectedProductIds.size === filteredAndSortedProducts.length;

    return (
        <div className="animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Products</h1>
                {hasPermission('ManageProducts') &&
                    <button onClick={() => openModal()} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg shadow hover:bg-primary-700 transition">
                        <Plus size={20} />
                        Add Product
                    </button>
                }
            </div>
            
             <div className="flex flex-wrap items-center gap-4 mb-4 p-4 bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm">
                <Filter size={16} className="text-secondary-500 flex-shrink-0" />
                <select value={filters.categoryId} onChange={e => handleFilterChange('categoryId', e.target.value)} className="bg-secondary-100 dark:bg-secondary-800 rounded-lg p-2 text-sm flex-grow sm:flex-grow-0">
                    <option value="all">All Categories</option>
                    {categoryOptions.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                <select value={filters.brandId} onChange={e => handleFilterChange('brandId', e.target.value)} className="bg-secondary-100 dark:bg-secondary-800 rounded-lg p-2 text-sm flex-grow sm:flex-grow-0">
                    <option value="all">All Brands</option>
                    {brands?.map(b => <option key={b.id} value={b.id!}>{b.name}</option>)}
                </select>
                <select value={filters.supplierId} onChange={e => handleFilterChange('supplierId', e.target.value)} className="bg-secondary-100 dark:bg-secondary-800 rounded-lg p-2 text-sm flex-grow sm:flex-grow-0">
                    <option value="all">All Suppliers</option>
                    {suppliers?.map(s => <option key={s.id} value={s.id!}>{s.name}</option>)}
                </select>
                <select value={filters.stockStatus} onChange={e => handleFilterChange('stockStatus', e.target.value)} className="bg-secondary-100 dark:bg-secondary-800 rounded-lg p-2 text-sm flex-grow sm:flex-grow-0">
                    <option value="all">All Stock Statuses</option>
                    <option value="in_stock">In Stock</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                </select>
                <div className="hidden sm:block flex-grow"></div>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="bg-secondary-100 dark:bg-secondary-800 rounded-lg p-2 text-sm flex-grow sm:flex-grow-0">
                    <option value="name-asc">Sort A-Z</option>
                    <option value="name-desc">Sort Z-A</option>
                    <option value="date-desc">Newest First</option>
                    <option value="date-asc">Oldest First</option>
                </select>
                <button onClick={clearFilters} className="p-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600"><RotateCw size={18}/></button>
            </div>


            {selectedProductIds.size > 0 && (
                <BulkActionsBar
                    selectedCount={selectedProductIds.size}
                    onEdit={() => setIsBulkEditModalOpen(true)}
                    onDelete={handleBulkDelete}
                    onPrint={() => setIsBarcodeModalOpen(true)}
                    onClear={() => setSelectedProductIds(new Set())}
                    canEdit={hasPermission('EditProductDetails')}
                    canDelete={hasPermission('ManageProducts')}
                />
            )}

            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 text-sm text-secondary-500 border-b border-secondary-200 dark:border-secondary-800">
                    Showing {filteredAndSortedProducts.length} of {products.length} products.
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-secondary-100 dark:bg-secondary-800/50">
                            <tr>
                                <th className="p-4 w-12 text-center">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={handleSelectAll}
                                        className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                </th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Category</th>
                                <th className="p-4">Brand</th>
                                <th className="p-4">Supplier</th>
                                <th className="p-4">Variants</th>
                                <th className="p-4">Total Stock</th>
                                <th className="p-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedProducts.map(p => (
                                <tr key={p.id} className="border-b border-secondary-200 dark:border-secondary-800 hover:bg-secondary-100 dark:hover:bg-secondary-800/50">
                                    <td className="p-4 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedProductIds.has(p.id!)}
                                            onChange={() => handleToggleSelect(p.id!)}
                                            className="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                        />
                                    </td>
                                    <td className="p-4 font-medium">{p.name}</td>
                                    <td className="p-4 text-secondary-500">{categoryMap.get(p.categoryId!) || 'N/A'}</td>
                                    <td className="p-4 text-secondary-500">{brandMap.get(p.brandId!) || 'N/A'}</td>
                                    <td className="p-4 text-secondary-500">{suppliers.find(s => s.id === p.supplierId)?.name || 'N/A'}</td>
                                    <td className="p-4">{p.variants.length}</td>
                                    <td className="p-4">
                                        {p.variants.reduce((sum, v) => sum + v.stock, 0)}
                                        {p.variants.reduce((sum, v) => sum + v.stock, 0) <= p.lowStockThreshold && p.variants.reduce((sum, v) => sum + v.stock, 0) > 0 && (
                                            <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Low Stock</span>
                                        )}
                                        {p.variants.reduce((sum, v) => sum + v.stock, 0) === 0 && (
                                            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Out of Stock</span>
                                        )}
                                    </td>
                                    <td className="p-4">
                                        <div className="flex gap-2">
                                            {hasPermission('EditProductDetails') &&
                                                <button onClick={() => openModal(p)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full"><Edit size={16} /></button>
                                            }
                                            {hasPermission('ManageProducts') &&
                                                <button onClick={() => handleDelete(p.id!)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
                                            }
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && <ProductFormModal product={selectedProduct} onClose={closeModal} suppliers={suppliers} brands={brands} />}
            {isBarcodeModalOpen && (
                <BarcodePrintModal
                    initialProductIds={Array.from(selectedProductIds)}
                    onClose={() => setIsBarcodeModalOpen(false)}
                />
            )}
            {isBulkEditModalOpen && (
                <BulkEditModal
                    productIds={selectedProductIds}
                    onClose={() => { setIsBulkEditModalOpen(false); setSelectedProductIds(new Set()); }}
                    suppliers={suppliers}
                    brands={brands}
                />
            )}
        </div>
    );
};

const TagInput: React.FC<{ values: string[], onChange: (newValues: string[]) => void, placeholder: string }> = ({ values, onChange, placeholder }) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === ',' || e.key === 'Enter') {
            e.preventDefault();
            const newValue = inputValue.trim();
            if (newValue && !values.includes(newValue)) {
                onChange([...values, newValue]);
            }
            setInputValue('');
        } else if (e.key === 'Backspace' && !inputValue) {
            if (values.length > 0) {
                removeTag(values.length - 1);
            }
        }
    };

    const removeTag = (indexToRemove: number) => {
        onChange(values.filter((_, index) => index !== indexToRemove));
    };
    
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text');
        const newValues = pastedText.split(',').map(v => v.trim()).filter(Boolean);
        if (newValues.length > 0) {
            const uniqueNewValues = newValues.filter(v => !values.includes(v));
            onChange([...values, ...uniqueNewValues]);
        }
    };
    
    return (
        <div className="flex-1 flex flex-wrap items-center gap-2 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg border-2 border-transparent focus-within:border-primary-500">
            {values.map((value, index) => (
                <div key={index} className="flex items-center gap-1 bg-primary-500 text-white text-sm px-2 py-1 rounded">
                    <span>{value}</span>
                    <button type="button" onClick={() => removeTag(index)} className="hover:bg-primary-600 rounded-full">
                        <X size={14} />
                    </button>
                </div>
            ))}
            <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={placeholder}
                className="flex-1 bg-transparent outline-none min-w-[120px]"
            />
        </div>
    );
};


// Form Modal Component
interface ProductFormModalProps {
    product: Product | null;
    onClose: () => void;
    suppliers: Supplier[];
    brands: Brand[];
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({ product, onClose, suppliers, brands }) => {
    const { hasPermission } = usePermissions();
    const [formData, setFormData] = useState<Omit<Product, 'id' | 'variantAttributes'>>({
        name: '', categoryId: undefined, brandId: undefined, lowStockThreshold: 10, options: [],
        variants: [{ id: uuidv4(), attributes: {}, stock: 0, costPrice: 0, sellingPrice: 0 }]
    });
    const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
    const [bulkEditData, setBulkEditData] = useState<Partial<Pick<Variant, 'stock' | 'costPrice' | 'sellingPrice'>>>({});
    const [defaultPricing, setDefaultPricing] = useState({ costPrice: 0, sellingPrice: 0, margin: 0 });
    const categories = useLiveQuery<ProductCategory[]>(() => db.productCategories.toArray()) ?? [];

    const categoryOptions = useMemo(() => categories ? generateCategoryOptions(categories) : [], [categories]);

    useEffect(() => {
        if (product) {
            let initialData = { ...product };
            // Backward compatibility migration from variantAttributes to options
            if (product.variantAttributes && !product.options?.length) {
                const options: ProductOption[] = product.variantAttributes.map(attrName => {
                    const values = [...new Set(product.variants.map(v => v.attributes[attrName]).filter(Boolean))];
                    return { name: attrName, values };
                });
                initialData.options = options;
            }
            setFormData(initialData);

            if (initialData.variants.length > 0) {
                const firstVariant = initialData.variants[0];
                const cost = firstVariant.costPrice || 0;
                const price = firstVariant.sellingPrice || 0;
                const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                setDefaultPricing({ costPrice: cost, sellingPrice: price, margin: parseFloat(margin.toFixed(2)) });
            }
        }
    }, [product]);

    const handleDefaultPricingChange = (field: 'costPrice' | 'sellingPrice' | 'margin', valueStr: string) => {
        const value = parseFloat(valueStr) || 0;
    
        let costPrice = defaultPricing.costPrice;
        let sellingPrice = defaultPricing.sellingPrice;
        let margin = defaultPricing.margin;

        if (field === 'costPrice') {
            costPrice = value;
            if (margin >= 0 && margin < 100) {
                sellingPrice = costPrice / (1 - margin / 100);
            }
        } else if (field === 'sellingPrice') {
            sellingPrice = value;
        } else if (field === 'margin') {
            margin = value;
            if (margin < 100) {
                sellingPrice = costPrice / (1 - (margin / 100));
            } else {
                sellingPrice = costPrice; 
            }
        }

        if (field !== 'margin') {
            margin = sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
        }

        setDefaultPricing({
            costPrice: parseFloat(costPrice.toFixed(2)),
            sellingPrice: parseFloat(sellingPrice.toFixed(2)),
            margin: parseFloat(margin.toFixed(2))
        });
    };


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: (name === 'lowStockThreshold' || name === 'supplierId' || name === 'categoryId' || name === 'brandId') ? parseInt(value) : value }));
    };
    
    const handleOptionChange = (index: number, field: 'name' | 'values', value: string | string[]) => {
        const newOptions = [...formData.options];
        if (field === 'values' && Array.isArray(value)) {
            newOptions[index].values = value;
        } else if (field === 'name' && typeof value === 'string') {
            const oldName = newOptions[index].name;
            newOptions[index].name = value;
            // Update attribute keys in existing variants
            const newVariants = formData.variants.map(v => {
                if (oldName && (oldName in v.attributes)) {
                    v.attributes[value] = v.attributes[oldName];
                    delete v.attributes[oldName];
                }
                return v;
            });
            setFormData(prev => ({...prev, variants: newVariants}));
        }
        setFormData(prev => ({ ...prev, options: newOptions }));
    };

    const addOption = () => {
        setFormData(prev => ({ ...prev, options: [...prev.options, { name: '', values: [] }] }));
    };

    const removeOption = (index: number) => {
        const optionToRemove = formData.options[index];
        const newVariants = formData.variants.map(v => {
            delete v.attributes[optionToRemove.name];
            return v;
        });
        setFormData(prev => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== index),
            variants: newVariants,
        }));
    };

    const cartesian = <T,>(...a: T[][]): T[][] => {
        if (!a || a.length === 0) {
            return [];
        }
        return a.reduce<T[][]>(
            (acc, val) => acc.flatMap(d => val.map(e => [...d, e])),
            [[]]
        );
    };

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

        // Also consider variants already in the form state, in case they are unsaved or modified.
        formData.variants.forEach(v => {
            if (v.barcode) {
                const num = parseInt(v.barcode, 10);
                if (!isNaN(num)) existingBarcodes.add(num);
            }
        });

        let nextBarcodeNum = 0;

        const findNextAvailable = () => {
            while(existingBarcodes.has(nextBarcodeNum)) {
                nextBarcodeNum++;
            }
            const newBarcodeNum = nextBarcodeNum;
            // Add to set so it's not reused in the same generation batch
            existingBarcodes.add(newBarcodeNum); 
            return String(newBarcodeNum).padStart(6, '0');
        };

        const valueArrays = options.map(opt => opt.values);
        const combinations = cartesian(...valueArrays);

        const newVariants = combinations.map(combo => {
            const attributes: Record<string, string> = {};
            options.forEach((opt, i) => { attributes[opt.name] = (combo as string[])[i]; });

            const existingVariant = oldVariants.find(v =>
                Object.keys(attributes).length === Object.keys(v.attributes).length &&
                Object.keys(attributes).every(key => attributes[key] === v.attributes[key])
            );

            return existingVariant || { 
                id: uuidv4(), 
                attributes, 
                stock: 0, 
                costPrice: defaultPricing.costPrice, 
                sellingPrice: defaultPricing.sellingPrice,
                barcode: findNextAvailable(),
            };
        });

        setFormData(prev => ({ ...prev, variants: newVariants }));
        setSelectedVariants(new Set());
    };

    const handleVariantChange = (id: string, field: keyof Omit<Variant, 'id' | 'attributes'> | 'margin', value: string) => {
        setFormData(prev => {
            const newVariants = prev.variants.map(v => {
                if (v.id === id) {
                    if (field === 'sku' || field === 'barcode') {
                        return { ...v, [field]: value };
                    }
                    
                    const numericValue = parseFloat(value);
                    if (isNaN(numericValue) && value !== '') {
                        return v; // Ignore invalid number input unless it's an empty string
                    }
                    const finalValue = isNaN(numericValue) ? 0 : numericValue;


                    if (field === 'stock') {
                         const stockValue = Math.max(0, parseInt(String(finalValue)) || 0);
                         return { ...v, stock: stockValue };
                    }
    
                    let costPrice = v.costPrice;
                    let sellingPrice = v.sellingPrice;
                    
                    if (field === 'costPrice') {
                        costPrice = finalValue;
                        const margin = v.sellingPrice > 0 ? ((v.sellingPrice - costPrice) / v.sellingPrice) * 100 : 0;
                        if (margin >= 0 && margin < 100) {
                           sellingPrice = costPrice / (1 - margin / 100);
                        }
                    } else if (field === 'sellingPrice') {
                        sellingPrice = finalValue;
                    } else if (field === 'margin') {
                        const margin = finalValue;
                        if (margin < 100) {
                            sellingPrice = costPrice / (1 - (margin / 100));
                        } else {
                            sellingPrice = costPrice;
                        }
                    }
                    
                    return { ...v, costPrice: parseFloat(costPrice.toFixed(2)), sellingPrice: parseFloat(sellingPrice.toFixed(2)) };
                }
                return v;
            });
            return { ...prev, variants: newVariants };
        });
    };

    const removeVariant = (id: string) => {
        setFormData(prev => ({ ...prev, variants: prev.variants.filter(v => v.id !== id) }));
    };

    const handleToggleSelectVariant = (id: string, checked: boolean) => {
        setSelectedVariants(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(id); else newSet.delete(id);
            return newSet;
        });
    };

    const handleApplyBulkEdit = () => {
        const updatedCount = selectedVariants.size;
        if (updatedCount === 0) return;
        setFormData(prev => ({
            ...prev,
            variants: prev.variants.map(v => selectedVariants.has(v.id) ? { ...v, ...bulkEditData } : v)
        }));
        setBulkEditData({});
        setSelectedVariants(new Set());
        toast.success(`Updated ${updatedCount} variants.`);
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const dataToSave = { ...formData };
            delete (dataToSave as any).variantAttributes; // Ensure old field is not saved
            delete (dataToSave as any).category; // Ensure old field is not saved

            if (product?.id) {
                await db.products.update(product.id, dataToSave);
                toast.success('Product updated!');
            } else {
                await db.products.add(dataToSave as Product);
                toast.success('Product added!');
            }
            onClose();
        } catch(error) {
            toast.error('Failed to save product.');
            console.error(error);
        }
    };

    const groupedVariants = useMemo(() => {
        if (!formData.options?.length || !formData.options[0]?.name) return null;
        const groupKey = formData.options[0].name;
        return formData.variants.reduce<Record<string, Variant[]>>((acc, variant) => {
            const key = variant.attributes[groupKey] || 'N/A';
            if (!acc[key]) acc[key] = [];
            acc[key].push(variant);
            return acc;
        }, {});
    }, [formData.variants, formData.options]);
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-6xl h-[95vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{product ? 'Edit' : 'Add'} Product</h2><button type="button" onClick={onClose}><X /></button></div>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-6">
                    {/* Basic Info */}
                    <fieldset className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="relative">
                            <input id="product-name" name="name" value={formData.name} onChange={handleChange} required placeholder=" " className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"/>
                            <label htmlFor="product-name" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3">Product Name</label>
                        </div>
                        <div className="relative">
                            <select id="product-category" name="categoryId" value={formData.categoryId || ''} onChange={handleChange} required className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 focus:border-primary-500">
                                <option value="" disabled></option>
                                {categoryOptions.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                            </select>
                            <label htmlFor="product-category" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 start-3">Select a category</label>
                        </div>
                        <div className="relative">
                            <select id="product-brand" name="brandId" value={formData.brandId || ''} onChange={handleChange} className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 focus:border-primary-500">
                                <option value="">No Brand</option>
                                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <label htmlFor="product-brand" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 start-3">Brand</label>
                        </div>
                        <div className="relative">
                            <select id="product-supplier" name="supplierId" value={formData.supplierId || ''} onChange={handleChange} className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 focus:border-primary-500">
                                <option value="">No Supplier</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <label htmlFor="product-supplier" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 start-3">Supplier</label>
                        </div>
                        <div className="relative">
                            <input id="product-low-stock" name="lowStockThreshold" type="number" value={formData.lowStockThreshold} onChange={handleChange} required placeholder=" " className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"/>
                            <label htmlFor="product-low-stock" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3">Low Stock Threshold</label>
                        </div>
                    </fieldset>
                    
                    {/* Default Pricing */}
                     <fieldset className="p-4 border border-secondary-200 dark:border-secondary-800 rounded-lg">
                        <legend className="px-2 font-semibold">Default Pricing</legend>
                         <p className="text-xs text-secondary-500 mb-2">Set default prices for newly generated variants. Changing these won't affect existing variants.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                             {hasPermission('EditProductDetails') && <div className="relative">
                                <input id="default-cost-price" type="text" inputMode="decimal" value={defaultPricing.costPrice || ''} onChange={e => handleDefaultPricingChange('costPrice', e.target.value)} placeholder=" " className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"/>
                                <label htmlFor="default-cost-price" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3">Cost Price</label>
                            </div>}
                             {hasPermission('EditProductDetails') && <div className="relative">
                                <input id="default-margin" type="text" inputMode="decimal" value={defaultPricing.margin || ''} onChange={e => handleDefaultPricingChange('margin', e.target.value)} placeholder=" " className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"/>
                                <label htmlFor="default-margin" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3">Margin (%)</label>
                            </div>}
                             <div className="relative">
                                <input id="default-selling-price" type="text" inputMode="decimal" value={defaultPricing.sellingPrice || ''} onChange={e => handleDefaultPricingChange('sellingPrice', e.target.value)} placeholder=" " className="block w-full px-3 py-3 bg-transparent rounded-lg border-2 border-secondary-300 dark:border-secondary-700 appearance-none focus:outline-none focus:ring-0 peer focus:border-primary-500"/>
                                <label htmlFor="default-selling-price" className="absolute text-sm text-secondary-500 dark:text-secondary-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-secondary-50 dark:bg-secondary-900 px-2 peer-focus:px-2 peer-focus:text-primary-600 peer-focus:dark:text-primary-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 start-3">Selling Price</label>
                            </div>
                        </div>
                    </fieldset>

                    {/* Product Options */}
                    <fieldset className="p-4 border border-secondary-200 dark:border-secondary-800 rounded-lg">
                        <legend className="px-2 font-semibold">Product Options</legend>
                        <div className="space-y-3">
                            {formData.options.map((option, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input placeholder="Option Name (e.g., Color)" value={option.name} onChange={e => handleOptionChange(index, 'name', e.target.value)} className="w-1/3 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                                    <TagInput
                                        values={option.values}
                                        onChange={newValues => handleOptionChange(index, 'values', newValues)}
                                        placeholder="Add values and press Enter or comma"
                                    />
                                    <button type="button" onClick={() => removeOption(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-4 mt-4">
                            <button type="button" onClick={addOption} className="text-sm text-primary-500 hover:underline">+ Add Option</button>
                            <button type="button" onClick={handleGenerateVariants} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"><ChevronsRight size={16}/> Generate Variants</button>
                        </div>
                    </fieldset>

                    {/* Variants List */}
                    <fieldset className="p-4 border border-secondary-200 dark:border-secondary-800 rounded-lg">
                        <legend className="px-2 font-semibold">Variants ({formData.variants.length})</legend>
                        {selectedVariants.size > 0 && <div className="p-3 mb-4 bg-primary-100 dark:bg-primary-900/50 rounded-lg flex items-center gap-4 flex-wrap animate-fadeIn">
                            <span className="font-semibold">{selectedVariants.size} selected</span>
                            <input type="number" placeholder="Stock" onChange={e => {
                                const value = e.target.value;
                                if (value === '') { setBulkEditData(d => { const { stock, ...rest } = d; return rest; }); }
                                else { const num = parseInt(value); if (!isNaN(num)) { setBulkEditData(d => ({ ...d, stock: num })); } }
                            }} className="w-24 p-2 bg-secondary-50 dark:bg-secondary-800 rounded"/>
                            {hasPermission('EditProductDetails') && <input type="number" placeholder="Cost" step="0.01" onChange={e => {
                                const value = e.target.value;
                                if (value === '') { setBulkEditData(d => { const { costPrice, ...rest } = d; return rest; }); }
                                else { const num = parseFloat(value); if (!isNaN(num)) { setBulkEditData(d => ({ ...d, costPrice: num })); } }
                            }} className="w-24 p-2 bg-secondary-50 dark:bg-secondary-800 rounded"/>}
                            <input type="number" placeholder="Price" step="0.01" onChange={e => {
                                const value = e.target.value;
                                if (value === '') { setBulkEditData(d => { const { sellingPrice, ...rest } = d; return rest; }); }
                                else { const num = parseFloat(value); if (!isNaN(num)) { setBulkEditData(d => ({ ...d, sellingPrice: num })); } }
                            }} className="w-24 p-2 bg-secondary-50 dark:bg-secondary-800 rounded"/>
                            <button type="button" onClick={handleApplyBulkEdit} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg">Apply</button>
                        </div>}

                         <div className="grid grid-cols-12 gap-2 items-center font-bold text-xs text-secondary-500 px-2 pb-2">
                            <div className="col-span-1"></div>
                            <div className={hasPermission('EditProductDetails') ? "col-span-2" : "col-span-3"}>Variant</div>
                            <div className="col-span-2">SKU</div>
                            <div className="col-span-2">Barcode</div>
                            {hasPermission('EditProductDetails') && <div className="col-span-1">Cost</div>}
                            {hasPermission('EditProductDetails') && <div className="col-span-1">Margin</div>}
                            <div className="col-span-1">Price</div>
                            <div className="col-span-1">Stock</div>
                            <div className="col-span-1 text-right"></div>
                        </div>

                        <div className="space-y-2">
                            {groupedVariants
                                ? Object.keys(groupedVariants).map(groupName => {
                                    const variants = groupedVariants[groupName];
                                    return (
                                        <div key={groupName}>
                                            <h4 className="font-semibold text-secondary-700 dark:text-secondary-300 px-2 py-1">{groupName}</h4>
                                            {variants.map(v => <VariantRow key={v.id} variant={v} options={formData.options} onChange={handleVariantChange} onRemove={removeVariant} isSelected={selectedVariants.has(v.id)} onToggleSelect={handleToggleSelectVariant} allFormVariants={formData.variants} />)}
                                        </div>
                                    );
                                })
                                : formData.variants.map(v => <VariantRow key={v.id} variant={v} options={formData.options} onChange={handleVariantChange} onRemove={removeVariant} isSelected={selectedVariants.has(v.id)} onToggleSelect={handleToggleSelectVariant} allFormVariants={formData.variants}/>)}
                        </div>
                    </fieldset>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">{product ? 'Update Product' : 'Save Product'}</button></div>
            </form>
        </div>
    );
};

interface VariantRowProps {
    variant: Variant;
    options: ProductOption[];
    onChange: (id: string, field: keyof Omit<Variant, 'id' | 'attributes'> | 'margin', value: string) => void;
    onRemove: (id: string) => void;
    isSelected: boolean;
    onToggleSelect: (id: string, checked: boolean) => void;
    allFormVariants: Variant[];
}
const VariantRow: React.FC<VariantRowProps> = ({variant, options, onChange, onRemove, isSelected, onToggleSelect, allFormVariants}) => {
    const { hasPermission } = usePermissions();
    const margin = variant.sellingPrice > 0 && variant.costPrice > 0 ? (((variant.sellingPrice - variant.costPrice) / variant.sellingPrice) * 100).toFixed(1) : '0.0';

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

        // Also consider variants in current form state
        allFormVariants.forEach(v => {
            if (v.barcode) {
                const num = parseInt(v.barcode, 10);
                if (!isNaN(num)) existingBarcodes.add(num);
            }
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
            <div className="col-span-2 relative">
                <input placeholder="Barcode" value={variant.barcode || ''} onChange={e => onChange(variant.id, 'barcode', e.target.value)} className="w-full p-2 pr-9 bg-secondary-200 dark:bg-secondary-700 rounded"/>
                <button type="button" onClick={generateNewBarcode} title="Generate Barcode" className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-secondary-500 hover:text-primary-500">
                    <BarcodeIcon size={16} />
                </button>
            </div>
            
            {hasPermission('EditProductDetails') && <input type="number" step="0.01" placeholder="Cost" value={variant.costPrice || ''} onChange={e => onChange(variant.id, 'costPrice', e.target.value)} className="col-span-1 p-2 bg-secondary-200 dark:bg-secondary-700 rounded"/>}
            
            {hasPermission('EditProductDetails') && <div className="relative"><input type="number" step="0.01" placeholder="Margin" value={margin} onChange={e => onChange(variant.id, 'margin', e.target.value)} className="col-span-1 w-full p-2 pr-5 bg-secondary-200 dark:bg-secondary-700 rounded"/><span className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary-400 text-xs">%</span></div>}
            
            <input type="number" step="0.01" placeholder="Price" value={variant.sellingPrice || ''} onChange={e => onChange(variant.id, 'sellingPrice', e.target.value)} className="col-span-1 p-2 bg-secondary-200 dark:bg-secondary-700 rounded"/>
            <input type="number" min="0" placeholder="Stock" value={variant.stock || ''} onChange={e => onChange(variant.id, 'stock', e.target.value)} className="col-span-1 p-2 bg-secondary-200 dark:bg-secondary-700 rounded"/>
            
            <div className="col-span-1 flex justify-end">
                <button type="button" onClick={() => onRemove(variant.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
            </div>
        </div>
    );
};

// --- Barcode Print Modal & Components ---

interface BarcodeLayoutSettings {
    rows: number;
    columns: number;
    pageMargin: { top: number; right: number; bottom: number; left: number }; // mm
    gap: { row: number; column: number }; // mm
    paperSize: 'A4' | 'A5' | 'Letter' | 'custom' | 'label';
    customPaperSize: { width: number; height: number }; // mm
    border: { show: boolean; thickness: number; radius: number };
    labelWidth: number;
    labelHeight: number;
}

// NEW: Add settings for the label design itself
interface LabelSettings {
  showProductName: boolean;
  productNameBold: boolean;
  productNameItalic: boolean;

  showPrice: boolean;
  priceBold: boolean;
  priceItalic: boolean;
  
  showBarcodeValue: boolean;
  showSize: boolean;
  showColor: boolean;

  barcodeHeight: number; // px
  barcodeWidth: number; // ratio
  
  fontSize: number; // pt
  sizeFontSize: number; // pt
}


const defaultLayoutSettings: BarcodeLayoutSettings = {
    rows: 10,
    columns: 4,
    pageMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    gap: { row: 2, column: 2 },
    paperSize: 'A4',
    customPaperSize: { width: 210, height: 297 },
    border: { show: false, thickness: 1, radius: 0 },
    labelWidth: 50,
    labelHeight: 25,
};

const defaultLabelSettings: LabelSettings = {
  showProductName: true,
  productNameBold: true,
  productNameItalic: false,
  
  showPrice: true,
  priceBold: true,
  priceItalic: false,
  
  showBarcodeValue: true,
  showSize: true,
  showColor: true,
  
  barcodeHeight: 40,
  barcodeWidth: 1.5,

  fontSize: 10,
  sizeFontSize: 36,
};

const PAPER_SIZES_MM = {
    'A4': { width: 210, height: 297 },
    'A5': { width: 148, height: 210 },
    'Letter': { width: 215.9, height: 279.4 },
};

const Accordion: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; }> = ({ title, icon: Icon, children }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className="border-b border-secondary-200 dark:border-secondary-800">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 font-semibold text-left">
                <div className="flex items-center gap-2"><Icon size={16}/> {title}</div>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {isOpen && <div className="p-3 space-y-4">{children}</div>}
        </div>
    );
};

type BarcodeItem = { product: Product; variant: Variant };

const BarcodeLabel: React.FC<{ item: BarcodeItem; settings: BarcodeLayoutSettings; labelSettings: LabelSettings; currency: string; }> = ({ item, settings, labelSettings, currency }) => {
    const { product, variant } = item;
    const [barcodeUrl, setBarcodeUrl] = useState('');

    useEffect(() => {
        if (variant.barcode) {
            const canvas = document.createElement('canvas');
            try {
                JsBarcode(canvas, variant.barcode, {
                    displayValue: false,
                    margin: 2,
                    height: labelSettings.barcodeHeight,
                    width: labelSettings.barcodeWidth,
                });
                setBarcodeUrl(canvas.toDataURL('image/png'));
            } catch (e) {
                console.error("Invalid barcode:", variant.barcode, e);
                setBarcodeUrl('');
            }
        }
    }, [variant.barcode, labelSettings.barcodeHeight, labelSettings.barcodeWidth]);

    const size = variant.attributes['Size'] || '';
    const color = variant.attributes['Color'] || '';

    const productNameStyle: React.CSSProperties = {
        fontWeight: labelSettings.productNameBold ? 'bold' : 'normal',
        fontStyle: labelSettings.productNameItalic ? 'italic' : 'normal',
        fontSize: `${labelSettings.fontSize + 2}pt`,
        lineHeight: 1.2,
    };
    
    const priceStyle: React.CSSProperties = {
        fontWeight: labelSettings.priceBold ? 'bold' : 'normal',
        fontStyle: labelSettings.priceItalic ? 'italic' : 'normal',
        fontSize: `${labelSettings.fontSize}pt`,
    };
    
    const generalStyle: React.CSSProperties = {
        fontSize: `${labelSettings.fontSize}pt`,
    };
    
    const sizeStyle: React.CSSProperties = {
        fontSize: `${labelSettings.sizeFontSize}pt`,
        fontWeight: 'bolder',
        lineHeight: 1,
    };

    return (
        <div 
            className="w-full h-full bg-white text-black p-2 flex flex-row items-stretch justify-between"
            style={{ 
                fontFamily: 'sans-serif',
                border: settings.border?.show ? `${settings.border.thickness}px solid black` : 'none',
                borderRadius: `${settings.border?.radius || 0}px`,
                overflow: 'hidden'
            }}
        >
            {/* Left Column */}
            <div className="flex flex-col justify-between items-start w-2/3 pr-2">
                <div className="w-full">
                    {labelSettings.showProductName && <h3 style={productNameStyle}>{product.name}</h3>}
                </div>
                <div className="w-full text-center mt-auto">
                    {barcodeUrl ? 
                        <img src={barcodeUrl} alt={`Barcode for ${variant.barcode}`} className="w-full object-contain" style={{height: `${labelSettings.barcodeHeight}px`}} />
                        : <div className="h-10 bg-red-100 text-red-700 text-xs flex items-center justify-center">Invalid Barcode</div>
                    }
                    {labelSettings.showBarcodeValue && <p className="text-xs tracking-widest" style={{ fontSize: `${labelSettings.fontSize-2}pt` }}>{variant.barcode}</p>}
                </div>
            </div>

            {/* Right Column */}
            <div className="flex flex-col items-end justify-between text-right w-1/3">
                {labelSettings.showSize && size && <div style={sizeStyle}>{size}</div>}
                
                <div className="mt-auto">
                    {labelSettings.showColor && color && <p style={generalStyle}>{color}</p>}
                    {labelSettings.showPrice && <p style={priceStyle}>{currency} {variant.sellingPrice.toFixed(0)}</p>}
                </div>
            </div>
        </div>
    );
};


const PagePreview: React.FC<{
    barcodes: BarcodeItem[];
    settings: BarcodeLayoutSettings;
    labelSettings: LabelSettings;
    currency: string;
    paperSize: { width: number, height: number };
}> = ({ barcodes, settings, labelSettings, currency, paperSize }) => {
    return (
        <div
            className="bg-white shadow-lg transform origin-top-left"
            style={{
                width: `${paperSize.width}mm`,
                height: `${paperSize.height}mm`,
                padding: `${settings.pageMargin.top}mm ${settings.pageMargin.right}mm ${settings.pageMargin.bottom}mm ${settings.pageMargin.left}mm`,
                breakAfter: 'page',
                boxSizing: 'border-box',
            }}
        >
            <div
                className="grid h-full w-full"
                style={{
                    gridTemplateRows: `repeat(${settings.rows}, 1fr)`,
                    gridTemplateColumns: `repeat(${settings.columns}, 1fr)`,
                    rowGap: `${settings.gap.row}mm`,
                    columnGap: `${settings.gap.column}mm`,
                }}
            >
                {barcodes.map((item, i) => <BarcodeLabel key={i} item={item} settings={settings} labelSettings={labelSettings} currency={currency} /> )}
            </div>
        </div>
    )
};


const BarcodePrintModal: React.FC<{initialProductIds: number[], onClose: () => void}> = ({ initialProductIds, onClose }) => {
    const initialProducts = useLiveQuery<Product[]>(() => db.products.where('id').anyOf(initialProductIds).toArray(), [initialProductIds]) ?? [];
    const allProductsForSearch = useLiveQuery<Product[]>(() => db.products.toArray(), []);

    type PrintItem = { product: Product; variant: Variant; quantity: number };
    const [itemsToPrint, setItemsToPrint] = useState<PrintItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [printByStock, setPrintByStock] = useState(false);
    
    const searchResults = useMemo(() => {
        if (!searchTerm || !allProductsForSearch) return [];
        return allProductsForSearch.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, allProductsForSearch]);

    useEffect(() => {
        if (initialProducts.length > 0) {
            const initialItems = initialProducts.flatMap(p => 
                p.variants.filter(v => v.barcode).map(v => ({ product: p, variant: v, quantity: 1 }))
            );
            setItemsToPrint(initialItems);
        }
    }, [initialProducts]);

    useEffect(() => {
        setItemsToPrint(prev => prev.map(item => ({
            ...item,
            quantity: printByStock ? item.variant.stock : 1,
        })));
    }, [printByStock]);

    const handleAddItem = (product: Product, variant: Variant) => {
        if (!itemsToPrint.some(item => item.variant.id === variant.id)) {
            setItemsToPrint(prev => [...prev, { product, variant, quantity: printByStock ? variant.stock : 1 }]);
        }
    };

    const handleUpdateQuantity = (variantId: string, newQuantity: number) => {
        setItemsToPrint(prev => prev.map(item => 
            item.variant.id === variantId ? { ...item, quantity: Math.max(0, newQuantity) } : item
        ));
    };

    const handleRemoveItem = (variantId: string) => {
        setItemsToPrint(prev => prev.filter(item => item.variant.id !== variantId));
    };

    const allBarcodes = useMemo(() => {
        return itemsToPrint.flatMap(item => Array(item.quantity).fill({ product: item.product, variant: item.variant }));
    }, [itemsToPrint]);


    const { storeInfo } = useAppContext();
    const [isExporting, setIsExporting] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    
    const [settings, setSettings] = useState<BarcodeLayoutSettings>(() => {
        const saved = localStorage.getItem('umjiBarcodeLayoutSettings');
        try {
            const parsed = saved ? JSON.parse(saved) : {};
            return {
                ...defaultLayoutSettings,
                ...parsed,
                pageMargin: { ...defaultLayoutSettings.pageMargin, ...(parsed.pageMargin || {}) },
                gap: { ...defaultLayoutSettings.gap, ...(parsed.gap || {}) },
                customPaperSize: { ...defaultLayoutSettings.customPaperSize, ...(parsed.customPaperSize || {}) },
                border: { ...defaultLayoutSettings.border, ...(parsed.border || {}) },
            };
        } catch (e) {
            return defaultLayoutSettings;
        }
    });

    const [labelSettings, setLabelSettings] = useState<LabelSettings>(() => {
        const saved = localStorage.getItem('umjiBarcodeLabelSettings');
        try {
            const parsed = saved ? JSON.parse(saved) : {};
            return { ...defaultLabelSettings, ...parsed };
        } catch (e) {
            return defaultLabelSettings;
        }
    });

    useEffect(() => {
        localStorage.setItem('umjiBarcodeLayoutSettings', JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        localStorage.setItem('umjiBarcodeLabelSettings', JSON.stringify(labelSettings));
    }, [labelSettings]);

    const updateSettings = useCallback(<K extends keyof BarcodeLayoutSettings>(key: K, value: BarcodeLayoutSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    }, []);
    
    const updateLabelSettings = useCallback(<K extends keyof LabelSettings>(key: K, value: LabelSettings[K]) => {
        setLabelSettings(prev => ({ ...prev, [key]: value }));
    }, []);


    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1);
    
    const isLabelMode = settings.paperSize === 'label';

    const finalSettings = useMemo(() => isLabelMode ? {
        ...settings,
        rows: 1,
        columns: 1,
        pageMargin: { top: 0, right: 0, bottom: 0, left: 0 },
        gap: { row: 0, column: 0 },
    } : settings, [settings, isLabelMode]);


    const { barcodesPerPage, totalPages, paginatedBarcodes } = useMemo(() => {
        const perPage = finalSettings.rows * finalSettings.columns;
        const total = perPage > 0 ? Math.ceil(allBarcodes.length / perPage) : 0;
        const pageNum = Math.min(currentPage, total > 0 ? total : 1);
        const start = (pageNum - 1) * perPage;
        const end = start + perPage;
        return {
            barcodesPerPage: perPage,
            totalPages: total,
            paginatedBarcodes: allBarcodes.slice(start, end)
        };
    }, [allBarcodes, finalSettings, currentPage]);
    
    useEffect(() => { // Reset to page 1 if settings change
        setCurrentPage(1);
    }, [settings, labelSettings, itemsToPrint]);

    const paperSize = useMemo(() => {
        if (finalSettings.paperSize === 'label') {
            return { width: finalSettings.labelWidth, height: finalSettings.labelHeight };
        }
        if (finalSettings.paperSize === 'custom') return finalSettings.customPaperSize || defaultLayoutSettings.customPaperSize;
        return PAPER_SIZES_MM[finalSettings.paperSize] || PAPER_SIZES_MM['A4'];
    }, [finalSettings.paperSize, finalSettings.customPaperSize, finalSettings.labelWidth, finalSettings.labelHeight]);

    useEffect(() => {
        if (!isPrinting) return;

        toast.loading("Preparing for print...");

        const timer = setTimeout(() => {
            const printContent = document.getElementById('pdf-export-container');
            if (!printContent) {
                toast.error("Could not prepare print content.");
                setIsPrinting(false);
                return;
            }

            const style = document.createElement('style');
            style.innerHTML = `
                @media print {
                    @page { 
                        size: ${paperSize.width}mm ${paperSize.height}mm; 
                        margin: 0; 
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            `;
            const printArea = document.createElement('div');
            printArea.id = "print-area";
            printArea.innerHTML = printContent.innerHTML;
            
            document.head.appendChild(style);
            document.body.appendChild(printArea);

            window.print();

            document.body.removeChild(printArea);
            document.head.removeChild(style);
            
            setIsPrinting(false);
            toast.dismiss();

        }, 500);

        return () => clearTimeout(timer);
    }, [isPrinting, paperSize]);
    
    const handleExportPDF = async () => {
        setIsExporting(true);
        toast.loading(`Generating PDF (Page 1 of ${totalPages})...`, { id: 'pdf-export' });
        
        await new Promise(res => setTimeout(res, 500)); // Allow DOM to update

        const pdf = new jsPDF({
            orientation: paperSize.width > paperSize.height ? 'l' : 'p',
            unit: 'mm',
            format: [paperSize.width, paperSize.height]
        });

        const exportContainer = document.getElementById('pdf-export-container');
        if(!exportContainer) {
            toast.error("Could not find content to export.", { id: 'pdf-export' });
            setIsExporting(false);
            return;
        }
        
        const pageElements = exportContainer.children;

        for (let i = 0; i < pageElements.length; i++) {
            toast.loading(`Generating PDF (Page ${i+1} of ${totalPages})...`, { id: 'pdf-export' });
            const canvas = await html2canvas(pageElements[i] as HTMLElement, { scale: 3 });
            if (i > 0) pdf.addPage([paperSize.width, paperSize.height], paperSize.width > paperSize.height ? 'l' : 'p');
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, paperSize.width, paperSize.height);
        }
        
        pdf.save(`barcodes-${Date.now()}.pdf`);
        toast.success('PDF generated!', { id: 'pdf-export' });
        setIsExporting(false);
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/70 flex flex-col z-50 p-4 text-sm text-secondary-900 dark:text-secondary-100 animate-fadeIn">
                <div className="flex-1 bg-secondary-50 dark:bg-secondary-900 rounded-2xl flex overflow-hidden">
                    {/* Settings Panel */}
                    <div className="w-[380px] flex-shrink-0 bg-secondary-100 dark:bg-secondary-950 flex flex-col">
                        <div className="p-4 border-b border-secondary-200 dark:border-secondary-800 flex justify-between items-center"><h2 className="text-xl font-bold">Customize Barcodes</h2><button onClick={onClose} className="p-2 hover:bg-secondary-200 dark:hover:bg-secondary-800 rounded-full"><X size={20}/></button></div>
                        <div className="flex-1 overflow-y-auto">
                           <Accordion title="Products to Print" icon={Archive}>
                               <div className="relative mb-2">
                                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={16}/>
                                   <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search to add products..." className="w-full pl-9 p-2 bg-secondary-50 dark:bg-secondary-900 rounded-md"/>
                                   {searchTerm && (
                                       <div className="absolute top-full z-10 w-full bg-secondary-50 dark:bg-secondary-900 shadow-lg max-h-48 overflow-y-auto rounded-b-md">
                                           {searchResults?.map(p => p.variants.map(v => (
                                                <button key={v.id} onClick={() => handleAddItem(p,v)} className="w-full text-left p-2 hover:bg-secondary-200 dark:hover:bg-secondary-800 text-xs">
                                                   {p.name} - {Object.values(v.attributes).join('/') || 'Standard'}
                                                </button>
                                           )))}
                                       </div>
                                   )}
                               </div>
                               <div className="space-y-2 max-h-40 overflow-y-auto">
                                   {itemsToPrint.map(item => (
                                       <div key={item.variant.id} className="flex items-center gap-2 text-xs">
                                           <span className="flex-1 truncate">{item.product.name} - {Object.values(item.variant.attributes).join('/') || 'Standard'}</span>
                                           <input type="number" min="0" value={item.quantity} onChange={e => handleUpdateQuantity(item.variant.id, parseInt(e.target.value) || 0)} className="w-14 p-1 rounded bg-secondary-50 dark:bg-secondary-900 disabled:opacity-50 disabled:bg-secondary-200 dark:disabled:bg-secondary-800" disabled={printByStock}/>
                                           <button onClick={() => handleRemoveItem(item.variant.id)}><X size={14} className="text-red-500"/></button>
                                       </div>
                                   ))}
                               </div>
                               <label className="mt-2 w-full flex items-center justify-between gap-2 text-sm p-2 bg-secondary-200 dark:bg-secondary-800 rounded-lg cursor-pointer">
                                  <span className="flex items-center gap-2 font-medium"><Package size={16}/> Print by stock quantity</span>
                                  <input 
                                      type="checkbox" 
                                      checked={printByStock} 
                                      onChange={(e) => setPrintByStock(e.target.checked)} 
                                      className="sr-only peer"
                                  />
                                  <div className="relative w-11 h-6 bg-secondary-300 dark:bg-secondary-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                              </label>
                           </Accordion>
                           <Accordion title="Label Design" icon={Palette}>
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-xs uppercase text-secondary-500">Visible Elements</h4>
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={labelSettings.showProductName} onChange={e => updateLabelSettings('showProductName', e.target.checked)}/> Product Name</label>
                                    {labelSettings.showProductName && <div className="pl-6 flex gap-4"><label className="flex items-center gap-1"><input type="checkbox" checked={labelSettings.productNameBold} onChange={e => updateLabelSettings('productNameBold', e.target.checked)}/> Bold</label><label className="flex items-center gap-1"><input type="checkbox" checked={labelSettings.productNameItalic} onChange={e => updateLabelSettings('productNameItalic', e.target.checked)}/> Italic</label></div>}
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={labelSettings.showSize} onChange={e => updateLabelSettings('showSize', e.target.checked)}/> Size</label>
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={labelSettings.showColor} onChange={e => updateLabelSettings('showColor', e.target.checked)}/> Color</label>
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={labelSettings.showPrice} onChange={e => updateLabelSettings('showPrice', e.target.checked)}/> Price</label>
                                    {labelSettings.showPrice && <div className="pl-6 flex gap-4"><label className="flex items-center gap-1"><input type="checkbox" checked={labelSettings.priceBold} onChange={e => updateLabelSettings('priceBold', e.target.checked)}/> Bold</label><label className="flex items-center gap-1"><input type="checkbox" checked={labelSettings.priceItalic} onChange={e => updateLabelSettings('priceItalic', e.target.checked)}/> Italic</label></div>}
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={labelSettings.showBarcodeValue} onChange={e => updateLabelSettings('showBarcodeValue', e.target.checked)}/> Barcode Number</label>
                                    
                                    <h4 className="font-semibold text-xs uppercase text-secondary-500 pt-2">Barcode Dimensions</h4>
                                    <div className="grid grid-cols-2 gap-3"><label>Height (px)</label><input type="number" min="10" value={labelSettings.barcodeHeight} onChange={e => updateLabelSettings('barcodeHeight', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                    <div className="grid grid-cols-2 gap-3"><label>Width (ratio)</label><input type="number" min="0.5" step="0.1" value={labelSettings.barcodeWidth} onChange={e => updateLabelSettings('barcodeWidth', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>

                                    <h4 className="font-semibold text-xs uppercase text-secondary-500 pt-2">Font Sizes</h4>
                                    <div className="grid grid-cols-2 gap-3"><label>General (pt)</label><input type="number" min="5" value={labelSettings.fontSize} onChange={e => updateLabelSettings('fontSize', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                    <div className="grid grid-cols-2 gap-3"><label>Size Attr. (pt)</label><input type="number" min="10" value={labelSettings.sizeFontSize} onChange={e => updateLabelSettings('sizeFontSize', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                </div>
                            </Accordion>
                            <Accordion title="Page Layout" icon={Grid}>
                                <div className="grid grid-cols-2 gap-3"><label>Paper Size</label><select value={settings.paperSize} onChange={e => updateSettings('paperSize', e.target.value as any)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900">{Object.keys(PAPER_SIZES_MM).map(s => <option key={s} value={s}>{s}</option>)}<option value="custom">Custom</option><option value="label">Label</option></select></div>
                                <div className="grid grid-cols-2 gap-3"><label>Label Width (mm)</label><input type="number" min="1" value={settings.labelWidth} onChange={e => updateSettings('labelWidth', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                <div className="grid grid-cols-2 gap-3"><label>Label Height (mm)</label><input type="number" min="1" value={settings.labelHeight} onChange={e => updateSettings('labelHeight', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                <div className={`grid grid-cols-2 gap-3 ${isLabelMode ? 'opacity-50' : ''}`}><label>Rows</label><input type="number" min="1" disabled={isLabelMode} value={finalSettings.rows} onChange={e => updateSettings('rows', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                <div className={`grid grid-cols-2 gap-3 ${isLabelMode ? 'opacity-50' : ''}`}><label>Columns</label><input type="number" min="1" disabled={isLabelMode} value={finalSettings.columns} onChange={e => updateSettings('columns', +e.target.value)} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                <div className={`grid grid-cols-2 gap-3 ${isLabelMode ? 'opacity-50' : ''}`}><label>Row Gap (mm)</label><input type="number" min="0" disabled={isLabelMode} value={finalSettings.gap.row} onChange={e => updateSettings('gap', {...settings.gap, row: +e.target.value})} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                <div className={`grid grid-cols-2 gap-3 ${isLabelMode ? 'opacity-50' : ''}`}><label>Column Gap (mm)</label><input type="number" min="0" disabled={isLabelMode} value={finalSettings.gap.column} onChange={e => updateSettings('gap', {...settings.gap, column: +e.target.value})} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/></div>
                                <label className={`mt-2 block ${isLabelMode ? 'opacity-50' : ''}`}>Page Margins (mm)</label>
                                <div className={`grid grid-cols-4 gap-2 ${isLabelMode ? 'opacity-50' : ''}`}>
                                    <input type="number" placeholder="T" disabled={isLabelMode} value={finalSettings.pageMargin.top} onChange={e => updateSettings('pageMargin', {...settings.pageMargin, top: +e.target.value})} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/>
                                    <input type="number" placeholder="R" disabled={isLabelMode} value={finalSettings.pageMargin.right} onChange={e => updateSettings('pageMargin', {...settings.pageMargin, right: +e.target.value})} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/>
                                    <input type="number" placeholder="B" disabled={isLabelMode} value={finalSettings.pageMargin.bottom} onChange={e => updateSettings('pageMargin', {...settings.pageMargin, bottom: +e.target.value})} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/>
                                    <input type="number" placeholder="L" disabled={isLabelMode} value={finalSettings.pageMargin.left} onChange={e => updateSettings('pageMargin', {...settings.pageMargin, left: +e.target.value})} className="w-full p-1 rounded bg-secondary-50 dark:bg-secondary-900"/>
                                </div>
                            </Accordion>
                        </div>
                        <div className="p-4 border-t border-secondary-200 dark:border-secondary-800">
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={handleExportPDF} 
                                    disabled={isPrinting || isExporting} 
                                    className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm bg-secondary-200 dark:bg-secondary-800 rounded-lg font-semibold hover:bg-secondary-300 dark:hover:bg-secondary-700 disabled:opacity-50"
                                >
                                    <FileText size={18}/> {isExporting ? 'Exporting...' : 'PDF'}
                                </button>
                                <button 
                                    onClick={() => setIsPrinting(true)} 
                                    disabled={isPrinting || isExporting} 
                                    className="flex items-center justify-center gap-2 w-full px-4 py-3 text-sm bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 disabled:bg-primary-300"
                                >
                                    <Printer size={18}/> {isPrinting ? 'Preparing...' : 'Print'}
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Preview Panel */}
                    <div className="flex-1 flex flex-col p-4">
                        <div className="flex justify-between items-center gap-2 mb-4">
                            <div className="flex items-center gap-2"><button onClick={() => setZoom(z => z-0.2)}><ZoomOut size={20}/></button><button onClick={() => setZoom(1)} className="text-xs px-2 py-1 rounded bg-secondary-200 dark:bg-secondary-800">{Math.round(zoom*100)}%</button><button onClick={() => setZoom(z => z+0.2)}><ZoomIn size={20}/></button></div>
                            <div className="flex items-center gap-2"><button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><ChevronsLeftIcon size={20}/></button><button onClick={() => setCurrentPage(p => p-1)} disabled={currentPage === 1}><ChevronLeft size={20} /></button><span className="text-sm">Page {totalPages > 0 ? currentPage : 0} of {totalPages}</span><button onClick={() => setCurrentPage(p => p+1)} disabled={currentPage >= totalPages}><ChevronRight size={20}/></button><button onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}><ChevronsRightIcon size={20}/></button></div>
                        </div>
                        <div className="flex-1 bg-secondary-200 dark:bg-secondary-800/50 rounded-lg p-4 overflow-auto flex items-center justify-center">
                            <div style={{ transform: `scale(${zoom})` }} className="transition-transform">
                                <PagePreview barcodes={paginatedBarcodes} settings={finalSettings} labelSettings={labelSettings} currency={storeInfo?.currency || '$'} paperSize={paperSize} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Hidden container for high-res export */}
            {(isPrinting || isExporting) && (
                <div id="pdf-export-container" style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1 }}>
                    {Array.from({ length: totalPages }, (_, i) => (
                        <PagePreview
                            key={i}
                            barcodes={allBarcodes.slice(i * barcodesPerPage, (i + 1) * barcodesPerPage)}
                            settings={finalSettings}
                            labelSettings={labelSettings}
                            currency={storeInfo?.currency || '$'}
                            paperSize={paperSize}
                        />
                    ))}
                </div>
            )}
        </>
    );
};


export default ProductsPage;