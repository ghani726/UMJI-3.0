// CHANGED: Complete overhaul of the sales page with advanced features
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, logActivity } from '../services/db';
import type { Product, Variant, CartItem, Sale, SaleItem, Discount, StoreInfo, Payment, Customer, Voucher, HeldSale, User, StaffCommission, Shift, PaymentMethod } from '../types';
import { Search, Plus, Minus, Trash2, X, DollarSign, Printer, Image, Save, FileText, Undo, Banknote, CreditCard, Wallet, Smartphone, Repeat, UserPlus, XCircle, Ticket, History, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAppContext } from '../hooks/useAppContext';
import { usePermissions } from '../hooks/usePermissions';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { format, startOfDay, endOfDay, addDays, addWeeks } from 'date-fns';
import { useLocation, useNavigate } from 'react-router-dom';

// Debounce function
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<F>): Promise<ReturnType<F>> =>
        new Promise(resolve => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => resolve(func(...args)), waitFor);
        });
};

const StartShiftModal: React.FC = () => {
    const { currentUser, setActiveShift, storeInfo } = useAppContext();
    const [openingBalance, setOpeningBalance] = useState('');

    const handleStartShift = async (e: React.FormEvent) => {
        e.preventDefault();
        const balance = parseFloat(openingBalance);
        if (isNaN(balance) || balance < 0 || !currentUser) {
            toast.error("Please enter a valid opening balance.");
            return;
        }

        try {
            const newShift: Omit<Shift, 'id'> = {
                userId: currentUser.id!,
                username: currentUser.username,
                startTime: new Date(),
                status: 'open',
                openingBalance: balance,
            };
            const id = await db.shifts.add(newShift as Shift);
            setActiveShift({ ...newShift, id } as Shift);
            toast.success(`Shift started with ${storeInfo?.currency || '$'}${balance.toFixed(2)}`);
        } catch (error) {
            toast.error("Failed to start shift.");
            console.error(error);
        }
    };

    return (
        <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-8 w-full max-w-md animate-slideInUp relative">
            <h2 className="text-2xl font-bold text-center mb-2">Start a New Shift</h2>
            <p className="text-center text-secondary-500 mb-6">Enter the starting cash amount in your drawer to begin sales.</p>
            <form onSubmit={handleStartShift} className="space-y-4">
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-500">{storeInfo?.currency || '$'}</span>
                    <input
                        type="number"
                        step="0.01"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        placeholder="0.00"
                        autoFocus
                        required
                        className="w-full pl-8 pr-4 py-3 text-lg font-semibold bg-secondary-100 dark:bg-secondary-800 border border-secondary-300 dark:border-secondary-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition text-center"
                    />
                </div>
                <button type="submit" className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition disabled:bg-primary-300 flex items-center justify-center gap-2">
                    Start Shift <ArrowRight size={18} />
                </button>
            </form>
        </div>
    );
};

const SalesPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [discountOnInvoice, setDiscountOnInvoice] = useState<Discount | undefined>();
    const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
    const [extraCharges, setExtraCharges] = useState(0);
    const [modal, setModal] = useState<'payment' | 'receipt' | 'itemEdit' | 'previousSales' | 'viewSale' | 'customerSearch' | 'holdSale' | 'recallSale' | null>(null);
    const [editingItem, setEditingItem] = useState<CartItem | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<{product: Product, variant: Variant} | null>(null);
    const [lastSale, setLastSale] = useState<(Sale & { customerPreviousBalance?: number }) | null>(null);
    const [viewingSale, setViewingSale] = useState<Sale | null>(null);
    const [returnForSaleId, setReturnForSaleId] = useState<number | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const { currentUser, storeInfo, activeShift } = useAppContext();
    const { hasPermission } = usePermissions();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [lastScannedBarcode, setLastScannedBarcode] = useState('');

    const location = useLocation();
    const navigate = useNavigate();

    const heldSales = useLiveQuery(() => db.heldSales.orderBy('createdAt').reverse().toArray());

    const activePromotions = useLiveQuery(() => {
        const now = new Date();
        return db.promotions
            .where('startDate').belowOrEqual(now)
            .and(p => new Date(p.endDate) >= now)
            .toArray();
    }, []);

    const updateQuantity = useCallback(async (item: CartItem, newQuantity: number) => {
        if (newQuantity <= 0 && (!returnForSaleId || newQuantity > item.quantity)) {
             setCart(cart => cart.filter(cartItem => cartItem !== item));
             return;
        }

        if (returnForSaleId) {
            // In a return, we can't have positive quantity, and can't return more than was bought.
            // This logic relies on original quantities being negative.
            // Let's assume this is handled by EditItemModal for now. For simple +/- buttons:
            const originalItem = lastSale?.items.find(i => i.variantId === item.variantId);
            const originalQty = originalItem ? -originalItem.quantity : 0;
            if(newQuantity > 0 || newQuantity < originalQty) {
                toast.error(`Cannot return more than purchased.`);
                return;
            }
        } else if (newQuantity < 0) {
            return; // Don't allow negative quantity for normal sales
        }

        try {
            const product = await db.products.get(item.productId);
            const variant = product?.variants.find(v => v.id === item.variantId);
            if (!variant) throw new Error("Product variant not found in database.");

            // For returns, we don't check stock. For sales, we do.
            if (!returnForSaleId && newQuantity > variant.stock) {
                toast.error(`Not enough stock for ${item.name}. Only ${variant.stock} available.`);
                // Optionally set quantity to max available
                setCart(cart => cart.map(cartItem => cartItem === item ? { ...cartItem, quantity: variant.stock } : cartItem));
                return;
            }
            
            setCart(cart => cart.map(cartItem => cartItem === item ? { ...cartItem, quantity: newQuantity } : cartItem));
        } catch (error) {
            toast.error("Could not verify stock.");
            console.error(error);
        }
    }, [returnForSaleId, lastSale]);

    if (!activeShift) {
        return (
            <div className="h-full flex items-center justify-center animate-fadeIn">
                <StartShiftModal />
            </div>
        );
    }

    const findPromotionForItem = useCallback((productId: number, variantId: string): { name: string, discount: number } | null => {
        if (!activePromotions) return null;
        for (const promo of activePromotions) {
            const item = promo.items.find(i => i.productId === productId && i.variantId === variantId);
            if (item) {
                return { name: promo.name, discount: item.discountValue };
            }
        }
        return null;
    }, [activePromotions]);

    const addScannedItemToCart = useCallback(async (item: CartItem) => {
        const existingItemIndex = cart.findIndex(i => i.productId === item.productId && i.variantId === item.variantId && !i.discount && !i.note && i.sellingPrice === i.originalPrice);
        
        if (existingItemIndex > -1) {
            const existingItem = cart[existingItemIndex];
            await updateQuantity(existingItem, existingItem.quantity + 1);
        } else {
            setCart(prev => [...prev, item]);
        }
    }, [cart, updateQuantity]);

    const handleBarcodeScan = useCallback(async (barcode: string) => {
        if (!barcode || barcode === lastScannedBarcode) return;

        toast.loading(`Searching for ${barcode}...`, { id: 'barcode-scan' });
        setLastScannedBarcode(barcode);

        try {
            const productsWithBarcode = await db.products
                .filter(p => p.variants.some(v => v.barcode === barcode))
                .toArray();

            let foundProduct: Product | undefined;
            let foundVariant: Variant | undefined;

            if (productsWithBarcode.length > 0) {
                foundProduct = productsWithBarcode[0];
                foundVariant = foundProduct.variants.find(v => v.barcode === barcode);
            }

            if (foundProduct && foundVariant) {
                if (foundVariant.stock <= 0) {
                     toast.error(`${foundProduct.name} is out of stock.`, { id: 'barcode-scan' });
                     return;
                }
                
                const promotion = findPromotionForItem(foundProduct.id!, foundVariant.id);
                const sellingPrice = promotion ? foundVariant.sellingPrice - promotion.discount : foundVariant.sellingPrice;

                const cartItem: CartItem = {
                    productId: foundProduct.id!,
                    variantId: foundVariant.id,
                    name: `${foundProduct.name} ${Object.values(foundVariant.attributes).join(' / ')}`.trim(),
                    attributes: foundVariant.attributes,
                    sku: foundVariant.sku,
                    quantity: 1,
                    costPrice: foundVariant.costPrice,
                    originalPrice: foundVariant.sellingPrice,
                    sellingPrice: sellingPrice,
                    promotionDiscount: promotion?.discount,
                    promotionName: promotion?.name,
                };
                await addScannedItemToCart(cartItem);
                toast.success(`'${cartItem.name}' added to cart.`, { id: 'barcode-scan' });
                if (searchInputRef.current) {
                    searchInputRef.current.value = '';
                    setSearchTerm('');
                }
            } else {
                toast.error(`Product with barcode "${barcode}" not found.`, { id: 'barcode-scan' });
            }
        } catch (error) {
            console.error('Barcode scan processing error:', error);
            toast.error('Error processing barcode.', { id: 'barcode-scan' });
        } finally {
            setTimeout(() => setLastScannedBarcode(''), 500);
        }
    }, [lastScannedBarcode, addScannedItemToCart, findPromotionForItem, updateQuantity]);

    useEffect(() => {
        let barcode = '';
        let lastKeyTime = Date.now();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (modal || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
                return;
            }

            const currentTime = Date.now();
            if (currentTime - lastKeyTime > 100) {
                barcode = '';
            }

            if (e.key === 'Enter') {
                if (barcode.length > 2) {
                    e.preventDefault();
                    handleBarcodeScan(barcode);
                }
                barcode = '';
            } else if (e.key.length === 1) {
                barcode += e.key;
            }
            
            lastKeyTime = currentTime;
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [modal, handleBarcodeScan]);

    const debouncedSearch = useCallback(debounce((term: string) => term, 250), []);
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    useEffect(() => {
        debouncedSearch(searchTerm).then(setDebouncedSearchTerm);
    }, [searchTerm, debouncedSearch]);

    const products = useLiveQuery(() => {
        if (!debouncedSearchTerm) return [];
        const term = debouncedSearchTerm.toLowerCase();
        return db.products.filter(p => 
            p.name.toLowerCase().includes(term) ||
            p.variants.some(v => 
                (v.barcode && v.barcode.toLowerCase().includes(term)) ||
                (v.sku && v.sku.toLowerCase().includes(term))
            )
        ).limit(20).toArray();
    }, [debouncedSearchTerm]);
    
    // FIX: Filter products to show specific variants on barcode/SKU search
    const productsToDisplay = useMemo(() => {
        if (!products) return [];
    
        const term = debouncedSearchTerm.toLowerCase();
        if (!term) {
            return [];
        }
    
        const result: { product: Product, variant: Variant }[] = [];
    
        for (const p of products) {
            const matchingVariantsByBarcodeOrSku = p.variants.filter(v => 
                (v.barcode && v.barcode.toLowerCase().includes(term)) ||
                (v.sku && v.sku.toLowerCase().includes(term))
            );
    
            // If there are specific variant matches by barcode or SKU, prioritize showing only them.
            if (matchingVariantsByBarcodeOrSku.length > 0) {
                for (const v of matchingVariantsByBarcodeOrSku) {
                    result.push({ product: p, variant: v });
                }
            } else if (p.name.toLowerCase().includes(term)) {
                // Otherwise, if the match was on the product name, show all variants.
                for (const v of p.variants) {
                    result.push({ product: p, variant: v });
                }
            }
        }
        return result;
    }, [products, debouncedSearchTerm]);

    const closeModal = useCallback(() => {
        setModal(null);
        setSelectedProduct(null);
        setEditingItem(null);
        setViewingSale(null);
    }, []);
    
    const addToCart = useCallback(async (item: CartItem) => {
        const isCustom = item.sellingPrice !== item.originalPrice || item.discount || item.note || item.promotionDiscount;
        const existingItemIndex = isCustom ? -1 : cart.findIndex(i => i.productId === item.productId && i.variantId === item.variantId && !i.discount && !i.note && i.sellingPrice === i.originalPrice);
        
        if (existingItemIndex > -1) {
            const existingItem = cart[existingItemIndex];
            await updateQuantity(existingItem, existingItem.quantity + item.quantity);
        } else {
            const product = await db.products.get(item.productId);
            const variant = product?.variants.find(v => v.id === item.variantId);
            if (!variant || item.quantity > variant.stock) {
                toast.error(`Not enough stock. Only ${variant?.stock || 0} available.`);
                return;
            }
            setCart(prev => [...prev, item]);
        }
        closeModal();
    }, [cart, closeModal, updateQuantity]);
    
    const openItemModal = (product: Product, variant: Variant) => {
        if (variant.stock <= 0) {
            toast.error("This item is out of stock.");
            return;
        }

        const promotion = findPromotionForItem(product.id!, variant.id);
        const item: CartItem = {
            productId: product.id!,
            variantId: variant.id,
            name: `${product.name} ${Object.values(variant.attributes).join(' / ')}`.trim(),
            attributes: variant.attributes,
            sku: variant.sku,
            quantity: 1,
            costPrice: variant.costPrice,
            originalPrice: variant.sellingPrice,
            sellingPrice: promotion ? variant.sellingPrice - promotion.discount : variant.sellingPrice,
            promotionDiscount: promotion?.discount,
            promotionName: promotion?.name,
        };

        if (!hasPermission('ChangeItemPricesInCart') && !promotion) {
             addToCart(item);
             return;
        }
        
        if (!hasPermission('ChangeItemPricesInCart') && promotion) {
            toast.success("Promotional price applied.");
            addToCart(item);
            return;
        }

        setSelectedProduct({ product, variant });
        setModal('itemEdit');
    };

    const openEditModal = (item: CartItem) => {
        if (!hasPermission('ChangeItemPricesInCart')) {
             toast.error("You don't have permission to modify cart items.");
             return;
        }
        setEditingItem(item);
        setModal('itemEdit');
    };
    
    const updateCartItem = (updatedItem: CartItem) => {
        setCart(cart.map(item => item === editingItem ? updatedItem : item));
        closeModal();
    };

    const cartOriginalSubtotal = useMemo(() => cart.reduce((total, item) => total + item.originalPrice * item.quantity, 0), [cart]);
    const itemsTotal = useMemo(() => cart.reduce((total, item) => total + item.sellingPrice * item.quantity, 0), [cart]);
    
    const invoiceDiscountValue = useMemo(() => {
        if (!discountOnInvoice) return 0;
        if (discountOnInvoice.type === 'flat') return discountOnInvoice.value;
        return itemsTotal * (discountOnInvoice.value / 100);
    }, [itemsTotal, discountOnInvoice]);

    const voucherDiscountValue = useMemo(() => {
        if (!appliedVoucher || appliedVoucher.type === 'gift_card') return 0;
        const subtotal = itemsTotal - invoiceDiscountValue;
        if (appliedVoucher.type === 'coupon_flat') return Math.min(subtotal, appliedVoucher.value);
        if (appliedVoucher.type === 'coupon_percentage') return subtotal * (appliedVoucher.value / 100);
        return 0;
    }, [itemsTotal, invoiceDiscountValue, appliedVoucher]);

    const cartTotal = useMemo(() => itemsTotal - invoiceDiscountValue - voucherDiscountValue + extraCharges, [itemsTotal, invoiceDiscountValue, voucherDiscountValue, extraCharges]);

    const clearSaleState = useCallback(() => {
        setCart([]);
        setDiscountOnInvoice(undefined);
        setAppliedVoucher(null);
        setExtraCharges(0);
        setReturnForSaleId(null);
        setSelectedCustomer(null);
    }, []);

    const handleProcessSale = async (payments: Payment[], cashGiven: number, change: number, dueInfo?: { dueAmount: number, dueDate: Date }) => {
        if (cart.length === 0 || !currentUser || !storeInfo) return;
    
        if (returnForSaleId && !hasPermission('ProcessRefunds')) {
            toast.error("You don't have permission to process refunds.");
            return;
        }

        // Final stock check before processing
        for (const item of cart) {
            const product = await db.products.get(item.productId);
            const variant = product?.variants.find(v => v.id === item.variantId);
            if (!variant || (item.quantity > 0 && item.quantity > variant.stock)) { // Only check for positive quantity (sales)
                toast.error(`Sale aborted: Not enough stock for ${item.name}. Only ${variant?.stock || 0} left.`);
                return; // Abort sale
            }
        }
    
        try {
            let saleId: number | undefined;
            let customerPreviousBalance = 0;
    
            await (db as any).transaction('rw', [db.sales, db.products, db.storeInfo, db.customers, db.vouchers, db.users, db.staffCommissions], async (tx: any) => {
                const saleItems: SaleItem[] = cart.map(item => ({
                    productId: item.productId,
                    variantId: item.variantId,
                    productName: item.name,
                    attributes: item.attributes,
                    sku: item.sku,
                    quantity: item.quantity,
                    costPrice: item.costPrice,
                    originalPrice: item.originalPrice,
                    pricePerItem: item.sellingPrice,
                    totalPrice: item.sellingPrice * item.quantity,
                    discount: item.discount,
                    promotionDiscount: item.promotionDiscount,
                    note: item.note,
                }));

                const totalItemDiscountValue = cart.reduce((total, item) => {
                    const originalTotal = item.originalPrice * item.quantity;
                    const sellingTotal = item.sellingPrice * item.quantity;
                    const difference = originalTotal - sellingTotal;
                    return total + (difference > 0 ? difference : 0);
                }, 0);
                
                const currentStoreInfo = await tx.table('storeInfo').get(1);
                if (!currentStoreInfo) throw new Error("Store info not found.");
                const currentInvoiceNumber = currentStoreInfo.invoiceCounter;
    
                const newSale: Omit<Sale, 'id'> = {
                    invoiceNumber: currentInvoiceNumber,
                    timestamp: new Date(),
                    subTotal: cartOriginalSubtotal,
                    totalItemDiscount: totalItemDiscountValue,
                    discountOnInvoice: discountOnInvoice,
                    voucherDiscount: voucherDiscountValue,
                    appliedVoucherCode: appliedVoucher?.code,
                    tax: 0,
                    totalAmount: cartTotal,
                    payments,
                    cashGiven,
                    change,
                    items: saleItems,
                    userId: currentUser.id!,
                    customerId: selectedCustomer?.id,
                    customerName: selectedCustomer?.name,
                    note: returnForSaleId ? `Return for INV #${returnForSaleId}` : (dueInfo ? 'Credit Sale' : undefined),
                    dueAmount: dueInfo?.dueAmount,
                    dueDate: dueInfo?.dueDate,
                    shiftId: activeShift?.id,
                };
                
                saleId = await tx.table('sales').add(newSale as Sale);

                if (dueInfo && selectedCustomer) {
                    const customer = await tx.table('customers').get(selectedCustomer.id);
                    if (customer) {
                        customerPreviousBalance = customer.dueBalance || 0;
                        const newBalance = customerPreviousBalance + dueInfo.dueAmount;
                        await tx.table('customers').update(selectedCustomer.id, { dueBalance: newBalance });
                    }
                }
                
                // Decrement stock for each item sold
                for (const item of cart) {
                    const product = await tx.table('products').get(item.productId);
                    if (product) {
                        const newVariants = product.variants.map(v => 
                            v.id === item.variantId ? { ...v, stock: v.stock - item.quantity } : v
                        );
                        await tx.table('products').update(item.productId, { variants: newVariants });
                    }
                }
                
                if (appliedVoucher) {
                    const voucherUpdate: Partial<Voucher> = { timesUsed: appliedVoucher.timesUsed + 1 };
                    if (appliedVoucher.type === 'gift_card') {
                        const payment = payments.find(p => p.method === 'gift_card');
                        if (payment) {
                            voucherUpdate.remainingBalance = (appliedVoucher.remainingBalance || 0) - payment.amount;
                        }
                    }
                    await tx.table('vouchers').update(appliedVoucher.id, voucherUpdate);
                }

                await tx.table('storeInfo').update(1, { invoiceCounter: currentInvoiceNumber + 1 });

                // Commission Calculation
                const saleUser = await tx.table('users').get(currentUser.id!);
                if (saleUser && saleUser.commissionEnabled && newSale.totalAmount > 0) {
                    let earnedCommission = 0;
                    const commissionType = saleUser.commissionType || 'per_sale';
                    const commissionValue = saleUser.commissionValue || 0;

                    if (commissionType === 'per_sale') {
                        earnedCommission = (newSale.totalAmount * commissionValue) / 100;
                    } else if (commissionType === 'fixed_per_sale') {
                        earnedCommission = commissionValue;
                    } else if (commissionType === 'per_product') {
                        earnedCommission = newSale.items.reduce((sum, item) => {
                            const itemCommission = (item.totalPrice * commissionValue) / 100;
                            return sum + itemCommission;
                        }, 0);
                    }
                    
                    if (earnedCommission > 0) {
                        const commissionRecord: Omit<StaffCommission, 'id'> = {
                            staffId: currentUser.id!,
                            saleId: saleId!,
                            saleInvoiceNumber: newSale.invoiceNumber,
                            date: newSale.timestamp,
                            totalSaleValue: newSale.totalAmount,
                            earnedCommission: earnedCommission,
                        };
                        await tx.table('staffCommissions').add(commissionRecord);
                    }
                }
            });
    
            if (!saleId) {
                throw new Error("Failed to get sale ID after transaction.");
            }
            
            const completedSale = await db.sales.get(saleId);
    
            if (!completedSale) {
                throw new Error("Failed to retrieve the completed sale from the database.");
            }
    
            clearSaleState();
            
            toast.success('Transaction completed!');
            setLastSale({ ...completedSale, customerPreviousBalance });
            setModal('receipt');
    
            const logAction = returnForSaleId ? 'Process Return' : 'Create Sale';
            const logDetails = dueInfo 
                ? `Credit Sale #${completedSale.invoiceNumber} for ${storeInfo.currency}${cartTotal.toFixed(2)}. Due: ${storeInfo.currency}${dueInfo.dueAmount.toFixed(2)}`
                : returnForSaleId 
                ? `Return for INV #${returnForSaleId} processed. Total: ${storeInfo.currency}${cartTotal.toFixed(2)}` 
                : `Sale #${completedSale.invoiceNumber} for ${storeInfo.currency}${cartTotal.toFixed(2)}`;
            logActivity(currentUser.id!, currentUser.username, logAction, logDetails);
    
        } catch (error) {
            console.error('Failed to process sale:', error);
            toast.error('Error processing transaction.');
        }
    };

    const handleHoldSale = async (name: string) => {
        if (!name.trim()) {
            toast.error("Please provide a reference name for the held sale.");
            return;
        }
        const heldSale: Omit<HeldSale, 'id'> = {
            name: name.trim(),
            cart,
            createdAt: new Date(),
            discountOnInvoice,
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer?.name
        };
        await db.heldSales.add(heldSale as HeldSale);
        clearSaleState();
        toast.success(`Sale held as "${name.trim()}".`);
        closeModal();
    };

    const handleRecallSale = async (heldSale: HeldSale) => {
        if (cart.length > 0) {
            if (!window.confirm("This will discard your current sale. Are you sure?")) {
                return;
            }
        }
        setCart(heldSale.cart);
        setDiscountOnInvoice(heldSale.discountOnInvoice);
        if (heldSale.customerId) {
            const customer = await db.customers.get(heldSale.customerId);
            setSelectedCustomer(customer || null);
        } else {
            setSelectedCustomer(null);
        }
        // Reset other things not stored in held sale
        setAppliedVoucher(null);
        setExtraCharges(0);
        setReturnForSaleId(null);

        await db.heldSales.delete(heldSale.id!);
        toast.success(`Recalled sale "${heldSale.name}".`);
        closeModal();
    };
    
    const handleDeleteHeldSale = async (id: number) => {
        if (window.confirm("Are you sure you want to delete this held sale?")) {
            await db.heldSales.delete(id);
            toast.success("Held sale deleted.");
        }
    }

    const handleLoadForReturn = useCallback((saleToLoad: Sale) => {
        if (!hasPermission('ProcessRefunds')) {
            toast.error("You don't have permission to process refunds.");
            return;
        }
        
        if (cart.length > 0 && !window.confirm("This will clear your current cart. Are you sure you want to initiate a return?")) {
            return;
        }

        const returnItems: CartItem[] = saleToLoad.items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            name: item.productName,
            attributes: item.attributes,
            sku: item.sku,
            quantity: -item.quantity, // Negative quantity for return
            costPrice: item.costPrice,
            originalPrice: item.originalPrice,
            sellingPrice: item.pricePerItem,
            note: `Return for INV #${saleToLoad.invoiceNumber}`
        }));

        clearSaleState();
        setCart(returnItems);
        setReturnForSaleId(saleToLoad.invoiceNumber);
        setLastSale(saleToLoad);
        closeModal();
        toast.success(`Loaded items from Invoice #${saleToLoad.invoiceNumber} for return. Adjust quantities as needed.`);
    }, [hasPermission, cart.length, clearSaleState, closeModal]);

    // Effect to handle navigation from other pages (e.g., customer returns)
    useEffect(() => {
        if (location.state?.saleToReturn) {
            const saleToReturn = location.state.saleToReturn as Sale;
            handleLoadForReturn(saleToReturn);
            // Clear the state from location history to prevent re-triggering on refresh
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [location, navigate, handleLoadForReturn]);

    const handleReprintSale = (sale: Sale) => {
        setLastSale(sale);
        setModal('receipt');
    };
    
    const handleDiscard = () => {
        if (cart.length > 0 && window.confirm("Are you sure you want to discard this transaction?")) {
            clearSaleState();
            toast.success('Transaction discarded.');
        } else if (cart.length === 0) {
             toast('No active transaction to discard.');
        }
    };

    const handleUndo = () => {
        if (cart.length > 0) {
            setCart(cart.slice(0, -1));
            toast.success('Removed last item.');
        }
    };

    const handlePrintLatest = async () => {
        try {
            const latestSale = await db.sales.orderBy('id').reverse().first();
            if (latestSale) {
                setLastSale(latestSale);
                setModal('receipt');
            } else {
                toast.error("No receipt available for printing.");
            }
        } catch (error) {
            console.error("Failed to fetch latest receipt:", error);
            toast.error("Could not retrieve the latest receipt.");
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F1') { e.preventDefault(); searchInputRef.current?.focus(); }
            if(e.ctrlKey) {
                switch(e.key.toLowerCase()){
                    case 'n': e.preventDefault(); handleDiscard(); break;
                    case 'z': e.preventDefault(); handleUndo(); break;
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cart]);

    return (
        <div className="h-full flex flex-col lg:flex-row gap-6 animate-fadeIn">
            {/* Product Selection */}
            <div className="lg:w-3/5 flex flex-col">
                <div className="relative mb-4">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400" size={20} />
                    <input ref={searchInputRef} type="text" placeholder="Search products or scan barcode... (F1)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-secondary-50 dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-800 rounded-full focus:ring-2 focus:ring-primary-500 outline-none"/>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {productsToDisplay.map(({ product: p, variant: v }) => (
                            <button key={`${p.id}-${v.id}`} onClick={() => openItemModal(p, v)} disabled={v.stock <= 0 || !!returnForSaleId} className="w-full h-full bg-secondary-50 dark:bg-secondary-900 rounded-xl p-3 text-center transition hover:shadow-lg transform hover:-translate-y-1 flex flex-col justify-between disabled:opacity-50 disabled:cursor-not-allowed">
                                <div>
                                    <p className="font-semibold text-sm leading-tight">{p.name}</p>
                                    {Object.values(v.attributes).length > 0 && <p className="text-xs text-secondary-500">{Object.values(v.attributes).join(' / ')}</p>}
                                    {v.stock > 0 && <p className="text-xs text-secondary-500 mt-1">Stock: {v.stock}</p>}
                                    {v.stock <= 0 && <p className="text-xs text-red-500 font-bold mt-1">Out of Stock</p>}
                                </div>
                                <p className="font-bold text-primary-500 mt-1">{storeInfo?.currency || '$'}{v.sellingPrice.toFixed(2)}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Current Sale */}
            <div className={`lg:w-2/5 bg-secondary-50 dark:bg-secondary-900 rounded-2xl flex flex-col p-6 shadow-lg ${returnForSaleId ? 'ring-2 ring-orange-500' : ''}`}>
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-secondary-200 dark:border-secondary-800">
                    <h2 className="text-xl font-bold">{returnForSaleId ? `Return for #${returnForSaleId}` : `Current Sale #${storeInfo?.invoiceCounter}`}</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={handleUndo} title="Undo last item (Ctrl+Z)" className="p-2 text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-800 rounded-full"><Undo size={18}/></button>
                        <button onClick={() => setModal('previousSales')} className="text-sm text-primary-600 hover:underline">Previous Sales</button>
                    </div>
                </div>
                <CustomerDisplay customer={selectedCustomer} onSelect={() => setModal('customerSearch')} onClear={() => setSelectedCustomer(null)} />
                <div className="flex-1 overflow-y-auto -mr-3 pr-3">
                    {cart.length === 0 ? (
                        <p className="text-center text-secondary-500 mt-10">Scan or select a product to start</p>
                    ) : (
                        <div className="space-y-3">
                            {cart.map((item, index) => (
                                <div key={index} className="flex items-center gap-3 bg-secondary-100 dark:bg-secondary-800/50 p-2 rounded-lg">
                                    <div className="flex-1 cursor-pointer" onClick={() => openEditModal(item)}>
                                        <p className="font-semibold text-sm">{item.name}</p>
                                        <p className="text-xs text-secondary-500">
                                            {item.originalPrice !== item.sellingPrice && <span className="line-through mr-1">{storeInfo?.currency || '$'}{item.originalPrice.toFixed(2)}</span>}
                                            {storeInfo?.currency || '$'}{item.sellingPrice.toFixed(2)}
                                            {item.promotionName && <span className="ml-2 text-green-600 dark:text-green-400 text-[10px] bg-green-100 dark:bg-green-900/50 px-1.5 py-0.5 rounded-full">{item.promotionName}</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); updateQuantity(item, item.quantity - 1);}} className="p-1 rounded-full bg-secondary-200 dark:bg-secondary-700"><Minus size={14} /></button>
                                        <span className="font-bold w-6 text-center">{item.quantity}</span>
                                        <button onClick={(e) => { e.stopPropagation(); updateQuantity(item, item.quantity + 1);}} className="p-1 rounded-full bg-secondary-200 dark:bg-secondary-700"><Plus size={14} /></button>
                                    </div>
                                    <p className="font-bold w-20 text-right">{storeInfo?.currency || '$'}{(item.sellingPrice * item.quantity).toFixed(2)}</p>
                                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item, 0); }} className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="mt-6 border-t pt-4 border-secondary-200 dark:border-secondary-800">
                    <div className="text-sm space-y-2">
                        <div className="flex justify-between"><span>Subtotal</span><span>{storeInfo?.currency || '$'}{itemsTotal.toFixed(2)}</span></div>
                        {hasPermission('GiveDiscountsOnInvoice') && <ApplyInvoiceDiscount discount={discountOnInvoice} setDiscount={setDiscountOnInvoice} currency={storeInfo?.currency || '$'} />}
                        <VoucherSection appliedVoucher={appliedVoucher} setAppliedVoucher={setAppliedVoucher} discountValue={voucherDiscountValue} currency={storeInfo?.currency || '$'} />
                         <div className="flex justify-between">
                            <span>Extra Charges</span>
                            <input type="number" step="0.01" value={extraCharges || ''} onChange={e => setExtraCharges(parseFloat(e.target.value) || 0)} placeholder="0.00" className="w-24 p-1 text-right bg-secondary-100 dark:bg-secondary-800 rounded" />
                         </div>
                        <div className="flex justify-between font-bold text-2xl text-primary-600 dark:text-primary-400"><span>Total</span><span>{storeInfo?.currency || '$'}{cartTotal.toFixed(2)}</span></div>
                    </div>
                     <div className="grid grid-cols-4 gap-3 mt-4">
                        <button onClick={() => setModal('holdSale')} disabled={cart.length === 0} className="w-full py-3 bg-yellow-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:bg-yellow-300"><Save size={16} /> Hold</button>
                        <button onClick={() => setModal('recallSale')} className="w-full py-3 bg-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 relative">
                            <History size={16}/> Recall
                            {heldSales && heldSales.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{heldSales.length}</span>}
                        </button>
                        <button onClick={handleDiscard} disabled={cart.length === 0} title="New Sale (Ctrl+N)" className="w-full py-3 bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:bg-red-300"><Trash2 size={16}/> Discard</button>
                        <button onClick={handlePrintLatest} disabled={cart.length > 0} title={cart.length > 0 ? "Finish current sale to print latest receipt" : "Print Latest Receipt"} className="w-full py-3 bg-teal-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:bg-teal-300 disabled:cursor-not-allowed"><Printer size={16}/> Print</button>
                    </div>
                    <button onClick={() => setModal('payment')} disabled={cart.length === 0} className="w-full mt-3 py-4 bg-primary-600 text-white font-bold rounded-xl shadow-lg hover:bg-primary-700 transition disabled:bg-primary-300 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        <DollarSign /> {returnForSaleId ? 'Refund' : 'Charge'}
                    </button>
                </div>
            </div>
            
            {(modal === 'itemEdit') && (selectedProduct || editingItem) && <EditItemModal item={editingItem} productInfo={selectedProduct} onApply={editingItem ? updateCartItem : addToCart} onClose={closeModal} currency={storeInfo?.currency || '$'} />}
            {modal === 'payment' && <PaymentModal total={cartTotal} onProcessSale={handleProcessSale} onClose={closeModal} currency={storeInfo?.currency || '$'} appliedVoucher={appliedVoucher} selectedCustomer={selectedCustomer} onCustomerRequired={() => { closeModal(); setModal('customerSearch'); }} />}
            {modal === 'receipt' && lastSale && <ReceiptModal sale={lastSale} storeInfo={storeInfo} onClose={() => { setModal(null); setLastSale(null); }} />}
            {modal === 'previousSales' && <PreviousSalesModal onClose={() => setModal(null)} currency={storeInfo?.currency || '$'} onViewDetails={(sale) => { setViewingSale(sale); setModal('viewSale'); }} />}
            {modal === 'viewSale' && viewingSale && <ViewSaleModal sale={viewingSale} storeInfo={storeInfo} onClose={() => setModal('previousSales')} onLoadForReturn={handleLoadForReturn} onReprint={handleReprintSale} />}
            {modal === 'customerSearch' && <CustomerSearchModal onSelect={(customer) => { setSelectedCustomer(customer); setModal(null); }} onClose={() => setModal(null)} />}
            {modal === 'holdSale' && <HoldSaleModal onHold={handleHoldSale} onClose={closeModal} />}
            {modal === 'recallSale' && <RecallSaleModal heldSales={heldSales || []} onRecall={handleRecallSale} onDelete={handleDeleteHeldSale} onClose={closeModal} currency={storeInfo?.currency || '$'} />}
        </div>
    );
};


// MODAL COMPONENTS
const EditItemModal: React.FC<{ item: CartItem | null, productInfo: {product: Product, variant: Variant} | null, onApply: (item: CartItem) => void, onClose: () => void, currency: string }> = ({ item, productInfo, onApply, onClose, currency }) => {
    const [qty, setQty] = useState(item?.quantity || 1);
    const [price, setPrice] = useState(item?.sellingPrice || productInfo?.variant.sellingPrice || 0);
    const [discountType, setDiscountType] = useState<'percentage'|'flat'>(item?.discount?.type || 'percentage');
    const [discountValue, setDiscountValue] = useState(item?.discount?.value || 0);
    const [note, setNote] = useState(item?.note || '');
    const [stock, setStock] = useState(0);

    const originalPrice = item?.originalPrice || productInfo?.variant.sellingPrice || 0;
    
    useEffect(() => {
        const fetchStock = async () => {
            const productId = item?.productId || productInfo?.product.id;
            const variantId = item?.variantId || productInfo?.variant.id;
            if (productId && variantId) {
                const product = await db.products.get(productId);
                const variant = product?.variants.find(v => v.id === variantId);
                setStock(variant?.stock || 0);
            }
        };
        fetchStock();
    }, [item, productInfo]);

    const handleApply = () => {
        if (qty > stock) {
            toast.error(`Not enough stock. Only ${stock} available.`);
            return;
        }

        const p = productInfo?.product || {id: item?.productId, name: item?.name};
        const v = productInfo?.variant || {id: item?.variantId, costPrice: item?.costPrice, attributes: item?.attributes, sku: item?.sku};

        const cartItem: CartItem = {
            productId: p.id!,
            variantId: v.id,
            name: item?.name || `${p.name} ${Object.values(v.attributes).join(' / ')}`.trim(),
            attributes: v.attributes,
            sku: v.sku,
            quantity: qty,
            costPrice: v.costPrice,
            originalPrice: originalPrice,
            sellingPrice: price,
            discount: discountValue > 0 ? { type: discountType, value: discountValue } : undefined,
            note: note,
        };
        onApply(cartItem);
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Edit Item</h2><button onClick={onClose}><X/></button></div>
                <div className="space-y-4">
                    <div><label className="text-sm font-medium">Quantity (Available: {stock})</label><input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value) || 1)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded mt-1" /></div>
                    <div><label className="text-sm font-medium">Selling Price ({currency})</label><input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded mt-1" /></div>
                    <div><label className="text-sm font-medium">Discount</label>
                    <div className="flex gap-2 mt-1">
                        <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded">
                            <option value="percentage">%</option><option value="flat">{currency}</option>
                        </select>
                        <input type="number" step="0.01" value={discountValue} onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)} placeholder="Discount Value" className="flex-1 p-2 bg-secondary-100 dark:bg-secondary-800 rounded" />
                    </div></div>
                    <div><label className="text-sm font-medium">Note</label><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded mt-1" /></div>
                </div>
                 <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button onClick={handleApply} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Apply</button>
                </div>
            </div>
        </div>
    );
};

const PaymentModal: React.FC<{ total: number, onClose: () => void, onProcessSale: (payments: Payment[], cashGiven: number, change: number, due?: { dueAmount: number, dueDate: Date }) => void, currency: string, appliedVoucher: Voucher | null, selectedCustomer: Customer | null, onCustomerRequired: () => void }> = ({ total, onClose, onProcessSale, currency, appliedVoucher, selectedCustomer, onCustomerRequired }) => {
    const { storeInfo } = useAppContext();
    const [parts, setParts] = useState([{ id: 1, method: 'cash', amount: total }]);
    const [cashGiven, setCashGiven] = useState('');

    const isRefund = total < 0;

    const totalFromParts = useMemo(() => parts.reduce((sum, p) => sum + p.amount, 0), [parts]);
    const remainingToPay = total - totalFromParts;
    const totalCash = useMemo(() => parts.filter(p => p.method === 'cash').reduce((sum, p) => sum + p.amount, 0), [parts]);
    const change = useMemo(() => (parseFloat(cashGiven) || 0) - totalCash, [cashGiven, totalCash]);

    const enabledPaymentMethods = useMemo(() => storeInfo?.paymentMethods?.filter(p => p.enabled) || [], [storeInfo]);

    const handleUpdatePart = (id: number, field: 'method' | 'amount', value: string | number) => {
        setParts(currentParts => {
            const newParts = currentParts.map(p => {
                if (p.id === id) {
                    if (field === 'amount') {
                        const newAmount = typeof value === 'number' ? value : parseFloat(value);
                        return { ...p, amount: isNaN(newAmount) ? 0 : newAmount };
                    }
                    return { ...p, [field]: value };
                }
                return p;
            });

            // Auto-adjust the last part's amount if it's not the one being edited
            const editedPartIndex = newParts.findIndex(p => p.id === id);
            if (field === 'amount' && newParts.length > 1 && editedPartIndex < newParts.length - 1) {
                const totalOfOtherParts = newParts.slice(0, -1).reduce((sum, p) => sum + p.amount, 0);
                newParts[newParts.length-1].amount = total - totalOfOtherParts;
            }
            return newParts;
        });
    };

    const handleAddPart = () => {
        if (remainingToPay <= 0) return;
        const newPart = {
            id: Date.now(),
            method: enabledPaymentMethods.find(m => m.id !== 'cash')?.id || 'card',
            amount: remainingToPay
        };
        setParts(currentParts => {
            const sumOfCurrent = currentParts.reduce((sum, p) => sum + p.amount, 0);
            if (sumOfCurrent > total) {
                const lastPart = currentParts[currentParts.length - 1];
                const newLastPartAmount = lastPart.amount - remainingToPay;
                return [...currentParts.slice(0, -1), { ...lastPart, amount: newLastPartAmount }, newPart];
            }
            return [...currentParts, newPart];
        });
    };

    const handleRemovePart = (id: number) => {
        setParts(currentParts => {
            const newParts = currentParts.filter(p => p.id !== id);
            const newTotalFromParts = newParts.reduce((sum, p) => sum + p.amount, 0);
            const newRemaining = total - newTotalFromParts;
            if (newParts.length > 0) {
                 newParts[newParts.length-1].amount += newRemaining;
            }
            return newParts;
        });
    };

    const handleFinalize = () => {
        if (Math.abs(remainingToPay) > 0.001) {
            toast.error(`Amount does not match total. Remaining: ${currency}${remainingToPay.toFixed(2)}`);
            return;
        }

        const finalPayments = parts.map(({id, ...rest}) => rest);
        onProcessSale(finalPayments, parseFloat(cashGiven) || 0, Math.max(0, change));
    };

    if (isRefund) {
        const handleRefund = (method: string) => {
            const refundPayment: Payment = { method, amount: total, referenceId: 'REFUND' };
            onProcessSale([refundPayment], 0, 0);
        };
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn p-4">
                <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-8 w-full max-w-md animate-slideInUp">
                    <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold">Process Refund</h2><button onClick={onClose}><X /></button></div>
                    <div className="text-center mb-6"><p className="text-secondary-500">Total to Refund</p><p className="text-5xl font-bold text-red-500">{currency}{Math.abs(total).toFixed(2)}</p></div>
                    <p className="text-center mb-4">Select refund method:</p>
                    <div className="grid grid-cols-2 gap-4">
                        {enabledPaymentMethods.map(pm => (
                             <button key={pm.id} onClick={() => handleRefund(pm.id)} className="p-4 text-lg rounded-lg border-2 flex items-center justify-center gap-2 capitalize border-secondary-300 dark:border-secondary-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20"><Banknote size={16}/> {pm.name}</button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl w-full max-w-md animate-slideInUp overflow-hidden">
                <div className="p-6 flex justify-between items-center"><h2 className="text-2xl font-bold">Payment</h2><button onClick={onClose}><X /></button></div>

                <div className="bg-primary-600 text-white text-center py-6">
                    <p className="opacity-80">Total Due</p>
                    <p className="text-5xl font-bold">{currency}{total.toFixed(2)}</p>
                </div>
                
                <div className="p-6 space-y-4">
                    <div className="space-y-2">
                    {parts.map((part, index) => (
                        <div key={part.id} className="flex items-center gap-2">
                             <select value={part.method} onChange={e => handleUpdatePart(part.id, 'method', e.target.value)} className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg w-1/3">
                                {enabledPaymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                            </select>
                            <input type="number" step="0.01" value={part.amount} onChange={e => handleUpdatePart(part.id, 'amount', e.target.value)} className="flex-1 p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg text-right font-semibold" />
                             {parts.length > 1 && <button onClick={() => handleRemovePart(part.id)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16}/></button>}
                        </div>
                    ))}
                    </div>
                    
                    <button onClick={handleAddPart} disabled={remainingToPay <= 0} className="text-sm font-semibold text-primary-600 disabled:text-secondary-400">+ Split Payment</button>
                    
                    {totalCash > 0 && (
                        <div className="p-4 bg-secondary-100 dark:bg-secondary-800 rounded-lg space-y-3">
                            <h3 className="font-semibold">Cash Payment</h3>
                            <div className="flex items-center gap-2">
                                <label className="text-sm">Cash Given:</label>
                                <input value={cashGiven} onChange={e => setCashGiven(e.target.value)} placeholder={totalCash.toFixed(2)} className="flex-1 p-2 bg-secondary-50 dark:bg-secondary-900 rounded text-right" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {[5, 10, 20, 50, 100].map(val => (
                                    <button key={val} onClick={() => setCashGiven(val.toString())} className="px-3 py-1 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-lg">{currency}{val}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className={`p-4 rounded-lg text-center font-bold text-xl ${change > 0 ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' : 'bg-secondary-100 dark:bg-secondary-800'}`}>
                        Change: {currency}{Math.max(0, change).toFixed(2)}
                    </div>
                    
                    <button onClick={handleFinalize} disabled={Math.abs(remainingToPay) > 0.001} className="w-full py-4 bg-primary-600 text-white font-bold rounded-xl shadow-lg hover:bg-primary-700 transition disabled:bg-primary-300 disabled:cursor-not-allowed">
                        Finalize
                    </button>
                </div>
            </div>
        </div>
    );
};


const ReceiptContent: React.FC<{ sale: Sale & { customerPreviousBalance?: number }, storeInfo: StoreInfo | null, forwardedRef: React.Ref<HTMLDivElement> }> = ({ sale, storeInfo, forwardedRef }) => {
    const formattedInvoiceNumber = `INV-${format(new Date(sale.timestamp), 'yyyyMMdd')}-${String(sale.invoiceNumber).padStart(4, '0')}`;
    const isColorDark = (hexColor?: string) => {
        if (!hexColor) return false;
        const color = hexColor.charAt(0) === '#' ? hexColor.substring(1, 7) : hexColor;
        const r = parseInt(color.substring(0, 2), 16);
        const g = parseInt(color.substring(2, 4), 16);
        const b = parseInt(color.substring(4, 6), 16);
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        return luma < 128;
    };
    
    const defaultReceiptLayout = {
        showLogo: true, showStoreName: true, showAddress: true, showPhone: true,
        showOwnerName: false, showEmail: false,
    };
    const layout = { ...defaultReceiptLayout, ...storeInfo?.receiptLayout };

    const receiptPageSize = storeInfo?.receiptPageSize || 'thermal_80mm';
    const receiptWidth = receiptPageSize === 'A4' ? 'max-w-[700px] w-full' : 'max-w-[300px] w-full';
    const receiptFont = receiptPageSize === 'A4' ? 'font-sans' : 'font-mono';
    const headerColor = storeInfo?.receiptHeaderColor || 'transparent';
    const headerTextColor = isColorDark(headerColor) ? 'text-white' : 'text-black';

    const receiptItemsTotal = sale.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const invoiceDiscount = sale.discountOnInvoice ? (sale.discountOnInvoice.type === 'flat' ? sale.discountOnInvoice.value : receiptItemsTotal * (sale.discountOnInvoice.value / 100)) : 0;
    const totalDiscounts = invoiceDiscount + (sale.voucherDiscount || 0);

    return (
         <div ref={forwardedRef} id="print-area" className={`bg-white text-black text-xs ${receiptFont} ${receiptWidth} mx-auto shadow-lg`}>
            <div style={{ backgroundColor: headerColor }} className={`p-4 ${headerTextColor} text-center`}>
               {layout.showLogo && storeInfo?.logo && <img src={storeInfo.logo} alt="logo" className="w-24 h-auto mx-auto mb-2 rounded"/>}
               {layout.showStoreName && <h3 className="font-bold text-2xl" style={{ color: headerTextColor }}>{storeInfo?.storeName}</h3>}
               {layout.showOwnerName && <p className="text-sm" style={{ color: headerTextColor }}>Prop: {storeInfo?.ownerName}</p>}
               {layout.showAddress && <p className="text-sm" style={{ color: headerTextColor }}>{storeInfo?.address}</p>}
               {layout.showPhone && <p className="text-sm" style={{ color: headerTextColor }}>{storeInfo?.phone}</p>}
               {layout.showEmail && <p className="text-sm" style={{ color: headerTextColor }}>{storeInfo?.email}</p>}
            </div>
            <div className="p-4 space-y-2 text-black">
               <div className="text-base text-center">
                    <p><strong>{sale.totalAmount < 0 ? 'Return Receipt' : 'Invoice'}:</strong> {formattedInvoiceNumber}</p>
                    <p><strong>Date:</strong> {format(new Date(sale.timestamp), 'PPpp')}</p>
                    {sale.customerName && <p><strong>Customer:</strong> {sale.customerName}</p>}
               </div>
               {storeInfo?.receiptHeader && <p className="text-center text-[10px] my-2">{storeInfo.receiptHeader}</p>}
               <hr className="my-2 border-dashed border-gray-500"/>
               <table className="w-full text-left text-black"><thead><tr className="border-b border-black text-black"><th className="py-1 font-semibold">Item</th><th className="text-center font-semibold">Qty</th><th className="text-right font-semibold">Price</th><th className="text-right font-semibold">Total</th></tr></thead>
               <tbody>
                   {sale.items.map((item, i) => (<tr key={i} className="border-b border-gray-300 text-black">
                       <td className="py-1">{item.productName} {Object.values(item.attributes).length > 0 && `(${Object.values(item.attributes).join('/')})`}</td>
                       <td className="text-center">{item.quantity}</td>
                       <td className="text-right">{item.pricePerItem.toFixed(2)}</td>
                       <td className="text-right">{item.totalPrice.toFixed(2)}</td>
                   </tr>))}
               </tbody></table>
               <div className="pt-2 text-black">
                    <p className="flex justify-between"><span>Subtotal:</span><span>{receiptItemsTotal.toFixed(2)}</span></p>
                    {totalDiscounts > 0 && <p className="flex justify-between text-red-600"><span>Discounts:</span><span>-{totalDiscounts.toFixed(2)}</span></p>}
                    <p className="flex justify-between font-bold text-lg border-t border-black pt-1"><span>Total:</span><span>{storeInfo?.currency}{sale.totalAmount.toFixed(2)}</span></p>
                    {sale.dueAmount && sale.dueAmount > 0 && (
                        <div className="mt-2 pt-2 border-t border-dashed border-gray-500">
                            {sale.customerPreviousBalance && sale.customerPreviousBalance > 0 && (
                                <p className="flex justify-between"><span>Previous Balance:</span><span>{storeInfo?.currency}{sale.customerPreviousBalance.toFixed(2)}</span></p>
                            )}
                            <p className="flex justify-between font-bold"><span>Amount Paid:</span><span>{storeInfo?.currency}{(sale.totalAmount - sale.dueAmount).toFixed(2)}</span></p>
                            <p className="flex justify-between font-bold text-red-500"><span>Due this Sale:</span><span>{storeInfo?.currency}{sale.dueAmount.toFixed(2)}</span></p>
                            <p className="flex justify-between font-bold text-red-500 text-lg border-t border-red-300 pt-1 mt-1"><span>Total Outstanding:</span><span>{storeInfo?.currency}{((sale.customerPreviousBalance || 0) + sale.dueAmount).toFixed(2)}</span></p>
                            {sale.dueDate && <p className="text-center text-xs mt-2 text-red-500">Please pay the remaining balance by: {format(new Date(sale.dueDate), 'PP')}</p>}
                        </div>
                    )}
                </div>
                <hr className="my-2 border-dashed border-gray-500"/>
                 <div className="text-black">
                    {sale.payments.map((p,i) => <p key={i} className="flex justify-between capitalize"><span>{p.method} {p.amount < 0 ? 'Refund' : ''}:</span><span>{p.amount.toFixed(2)}</span></p>)}
                    {sale.cashGiven && sale.cashGiven > 0 ? <p className="flex justify-between"><span>Cash Given:</span><span>{sale.cashGiven.toFixed(2)}</span></p> : null}
                    {sale.change && sale.change > 0 ? <p className="flex justify-between"><span>Change:</span><span>{sale.change?.toFixed(2)}</span></p> : null}
                </div>
               {storeInfo?.receiptFooter && <p className="text-center text-sm mt-4">{storeInfo.receiptFooter}</p>}
               {sale.note && <p className="text-center text-xs mt-4 pt-2 border-t border-dashed border-gray-400">Note: {sale.note}</p>}
            </div>
        </div>
    );
};

const ReceiptModal: React.FC<{ sale: Sale & { customerPreviousBalance?: number }, storeInfo: StoreInfo | null, onClose: () => void }> = ({ sale, storeInfo, onClose }) => {
    const receiptRef = useRef<HTMLDivElement>(null);
    
    const handlePrint = useCallback(() => {
        window.print();
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                handlePrint();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlePrint]);

    const handleSavePNG = async () => {
        if (!receiptRef.current) return;
        try {
            const canvas = await html2canvas(receiptRef.current);
            const link = document.createElement('a');
            link.download = `receipt-${sale.invoiceNumber}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (error) {
            toast.error("Failed to generate PNG.");
            console.error(error);
        }
    };
    
    const handleSaveJPG = async () => {
        if (!receiptRef.current) return;
        try {
            const canvas = await html2canvas(receiptRef.current);
            const link = document.createElement('a');
            link.download = `receipt-${sale.invoiceNumber}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (error) {
            toast.error("Failed to generate JPG.");
            console.error(error);
        }
    };

    const handleSavePDF = () => {
        const doc = new jsPDF();
        const content = receiptRef.current;
        if (content) {
            doc.html(content, {
                callback: function (doc) { doc.save(`receipt-${sale.invoiceNumber}.pdf`); },
                x: 10, y: 10, width: 180, windowWidth: content.offsetWidth
            });
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg flex flex-col animate-slideInUp">
                <div className="max-h-[60vh] overflow-y-auto">
                    <ReceiptContent sale={sale} storeInfo={storeInfo} forwardedRef={receiptRef} />
                </div>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <button onClick={handlePrint} title="Print (Ctrl+P)" className="flex items-center justify-center gap-2 p-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg"><Printer size={16}/> Print</button>
                    <button onClick={handleSavePNG} className="flex items-center justify-center gap-2 p-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg"><Image size={16}/> PNG</button>
                    <button onClick={handleSaveJPG} className="flex items-center justify-center gap-2 p-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg"><Image size={16}/> JPG</button>
                    <button onClick={handleSavePDF} className="flex items-center justify-center gap-2 p-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg"><FileText size={16}/> PDF</button>
                </div>
                <button onClick={onClose} className="w-full mt-3 py-3 bg-primary-600 text-white font-bold rounded-lg">New Sale</button>
            </div>
        </div>
    );
};

const PreviousSalesModal: React.FC<{onClose: () => void, currency: string, onViewDetails: (sale: Sale) => void}> = ({onClose, currency, onViewDetails}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const sales = useLiveQuery(() => db.sales.reverse().toArray(), []);
    const products = useLiveQuery(() => db.products.toArray());

    const productAndVariantMap = useMemo(() => {
        if (!products) return null;
        const map = new Map<number, Map<string, Variant>>();
        products.forEach(p => {
            if (typeof p.id === 'number') {
                const variants = new Map<string, Variant>();
                p.variants.forEach(v => variants.set(v.id, v));
                map.set(p.id, variants);
            }
        });
        return map;
    }, [products]);
    
    const filteredSales = useMemo(() => {
        if (!sales || !productAndVariantMap) return [];
        
        const start = startDate ? startOfDay(new Date(startDate)) : null;
        const end = endDate ? endOfDay(new Date(endDate)) : null;

        return sales.filter(s => {
            const saleDate = new Date(s.timestamp);
            const dateMatch = (!start || saleDate >= start) && (!end || saleDate <= end);
            if (!dateMatch) return false;

            if (!searchTerm.trim()) return true;

            const term = searchTerm.toLowerCase().trim();

            if (s.invoiceNumber.toString().includes(term)) return true;
            if (s.customerName?.toLowerCase().includes(term)) return true;

            const itemMatch = s.items.some(item => {
                if (item.productName.toLowerCase().includes(term)) return true;
                
                const variantsMap = productAndVariantMap.get(item.productId);
                if (variantsMap) {
                    const variant = variantsMap.get(item.variantId);
                    if (variant) {
                        if (variant.sku && variant.sku.toLowerCase().includes(term)) return true;
                        if (variant.barcode && variant.barcode.toLowerCase().includes(term)) return true;
                    }
                }
                return false;
            });

            return itemMatch;
        });
    }, [sales, productAndVariantMap, searchTerm, startDate, endDate]);
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-2xl h-[80vh] flex flex-col animate-slideInUp">
                 <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Previous Sales</h2><button onClick={onClose}><X /></button></div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
                    <input type="text" placeholder="Search invoice, customer, product, SKU..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded"/>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded"/>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 bg-secondary-100 dark:bg-secondary-800 rounded"/>
                 </div>
                 <div className="flex-1 overflow-y-auto">
                     {filteredSales.map(sale => (
                         <div key={sale.id} className="p-3 mb-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg flex justify-between items-center">
                            <div>
                                <div className="font-semibold">{sale.totalAmount < 0 ? 'Return' : 'Invoice'} #{sale.invoiceNumber}</div>
                                <div className="text-sm text-secondary-500">{format(sale.timestamp, 'PPpp')}</div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`font-bold ${sale.totalAmount < 0 ? 'text-red-500' : ''}`}>{currency}{sale.totalAmount.toFixed(2)}</span>
                                <button onClick={() => onViewDetails(sale)} className="px-4 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg">View</button>
                            </div>
                         </div>
                     ))}
                 </div>
            </div>
        </div>
    );
};

const ViewSaleModal: React.FC<{ sale: Sale, storeInfo: StoreInfo | null, onClose: () => void, onLoadForReturn: (sale: Sale) => void, onReprint: (sale: Sale) => void }> = ({ sale, storeInfo, onClose, onLoadForReturn, onReprint }) => {
    const { hasPermission } = usePermissions();
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-fadeIn">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Sale Details</h2>
                    <button onClick={onClose}><X /></button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto border border-secondary-200 dark:border-secondary-800 rounded-lg">
                    <ReceiptContent sale={sale} storeInfo={storeInfo} forwardedRef={null} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <button onClick={() => onReprint(sale)} className="flex items-center justify-center gap-2 py-3 bg-secondary-200 dark:bg-secondary-700 rounded-lg"><Printer size={16}/> Reprint</button>
                    {sale.totalAmount > 0 && hasPermission('ProcessRefunds') && <button onClick={() => onLoadForReturn(sale)} className="flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-lg"><Repeat size={16}/> Initiate Return</button>}
                    <button onClick={onClose} className="py-3 bg-primary-600 text-white rounded-lg col-start-2">Done</button>
                </div>
            </div>
        </div>
    )
};

const ApplyInvoiceDiscount: React.FC<{discount?: Discount, setDiscount: (d?: Discount) => void, currency: string}> = ({ discount, setDiscount, currency }) => {
    const [type, setType] = useState<'percentage'|'flat'>(discount?.type || 'percentage');
    const [value, setValue] = useState(discount?.value || 0);

    useEffect(() => {
        if (value > 0) {
            setDiscount({ type, value });
        } else {
            setDiscount(undefined);
        }
    }, [type, value, setDiscount]);

    return (
        <div className="flex justify-between items-center text-red-500">
            <span>Invoice Discount</span>
            <div className="flex gap-1">
                <input type="number" step="0.01" value={value || ''} onChange={e => setValue(parseFloat(e.target.value) || 0)} placeholder="0.00" className="w-20 p-1 text-right bg-secondary-100 dark:bg-secondary-800 rounded" />
                <select value={type} onChange={e => setType(e.target.value as any)} className="p-1 bg-secondary-100 dark:bg-secondary-800 rounded">
                    <option value="percentage">%</option><option value="flat">{currency}</option>
                </select>
            </div>
        </div>
    );
};

const VoucherSection: React.FC<{ appliedVoucher: Voucher | null, setAppliedVoucher: (v: Voucher | null) => void, discountValue: number, currency: string }> = ({ appliedVoucher, setAppliedVoucher, discountValue, currency }) => {
    const [code, setCode] = useState('');

    const handleApply = async () => {
        const voucher = await db.vouchers.where('code').equalsIgnoreCase(code).first();
        if (!voucher) return toast.error("Voucher code not found.");
        
        const now = new Date();
        if (voucher.expiryDate && new Date(voucher.expiryDate) < now) return toast.error("Voucher has expired.");
        if (voucher.maxUses > 0 && voucher.timesUsed >= voucher.maxUses) return toast.error("Voucher has reached its usage limit.");
        if (voucher.type === 'gift_card' && (!voucher.remainingBalance || voucher.remainingBalance <= 0)) return toast.error("Gift card has no remaining balance.");
        
        setAppliedVoucher(voucher);
        toast.success(`'${voucher.code}' applied successfully.`);
    };

    if (appliedVoucher) {
        return (
            <div className="flex justify-between items-center text-green-600">
                <span>Voucher: {appliedVoucher.code}</span>
                <div className="flex items-center gap-2">
                    {appliedVoucher.type !== 'gift_card' && <span>-{currency}{discountValue.toFixed(2)}</span>}
                    {appliedVoucher.type === 'gift_card' && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Gift Card</span>}
                    <button onClick={() => setAppliedVoucher(null)}><XCircle size={16} className="text-red-500"/></button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Ticket size={16} className="text-secondary-500"/>
            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Coupon or Gift Card" className="flex-1 p-1 text-sm bg-secondary-100 dark:bg-secondary-800 rounded" />
            <button onClick={handleApply} className="text-sm px-3 py-1 bg-secondary-200 dark:bg-secondary-700 rounded hover:bg-secondary-300">Apply</button>
        </div>
    );
};

const CustomerDisplay: React.FC<{ customer: Customer | null; onSelect: () => void; onClear: () => void; }> = ({ customer, onSelect, onClear }) => {
    if (customer) {
        return (
            <div className="flex items-center justify-between p-3 mb-4 bg-primary-100 dark:bg-primary-900/50 rounded-lg">
                <div className="flex-1">
                    <p className="text-sm font-medium text-primary-800 dark:text-primary-200">Customer</p>
                    <p className="font-semibold text-primary-900 dark:text-primary-100">{customer.name}</p>
                </div>
                <button onClick={onClear} className="p-2 text-primary-500 hover:bg-primary-200 dark:hover:bg-primary-800/50 rounded-full">
                    <XCircle size={20} />
                </button>
            </div>
        );
    }

    return (
        <button onClick={onSelect} className="w-full flex items-center justify-center gap-2 p-3 mb-4 bg-secondary-100 dark:bg-secondary-800 rounded-lg hover:bg-secondary-200 dark:hover:bg-secondary-700 transition">
            <UserPlus size={20} />
            Add Customer
        </button>
    );
};

const CustomerSearchModal: React.FC<{ onSelect: (customer: Customer) => void; onClose: () => void; }> = ({ onSelect, onClose }) => {
    const [tab, setTab] = useState<'search' | 'create'>('search');

    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const customers = useLiveQuery(() => 
        searchTerm 
            ? db.customers.where('name').startsWithIgnoreCase(searchTerm).or('phone').startsWith(searchTerm).limit(20).toArray()
            : db.customers.reverse().limit(20).toArray(),
        [searchTerm]
    );

    // Create state
    const [formData, setFormData] = useState<Omit<Customer, 'id' | 'createdAt'>>({
        name: '', phone: '', email: '', address: '', notes: ''
    });

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleCreateAndSelect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.phone) {
            toast.error("Name and Phone are required.");
            return;
        }

        try {
            const newCustomerData: Omit<Customer, 'id'> = { ...formData, createdAt: new Date(), dueBalance: 0 };
            const id = await db.customers.add(newCustomerData as Customer);
            toast.success('New customer added.');
            onSelect({ ...newCustomerData, id } as Customer);
        } catch (error) {
            toast.error('Failed to create customer. The name might already exist.');
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-lg h-[70vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Select or Add Customer</h2>
                    <button onClick={onClose} type="button"><X /></button>
                </div>
                
                <div className="border-b border-secondary-200 dark:border-secondary-800 mb-4">
                    <nav className="-mb-px flex space-x-8">
                        <button onClick={() => setTab('search')} className={`${tab === 'search' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Search Existing</button>
                        <button onClick={() => setTab('create')} className={`${tab === 'create' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>Add New Customer</button>
                    </nav>
                </div>

                {tab === 'search' && (
                    <div className="flex-1 flex flex-col">
                        <input type="text" placeholder="Search by name or phone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus className="w-full p-3 mb-4 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {customers?.map(c => (
                                <button key={c.id} onClick={() => onSelect(c)} className="w-full text-left p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg hover:bg-secondary-200 dark:hover:bg-secondary-700">
                                    <p className="font-semibold">{c.name}</p>
                                    <p className="text-sm text-secondary-500">{c.phone}</p>
                                </button>
                            ))}
                            {(customers?.length === 0 && searchTerm) && <p className="text-center text-secondary-500">No customers found matching your search.</p>}
                            {(customers?.length === 0 && !searchTerm) && <p className="text-center text-secondary-500">No customers found. Add one!</p>}
                        </div>
                    </div>
                )}
                
                {tab === 'create' && (
                    <form onSubmit={handleCreateAndSelect} className="flex-1 overflow-y-auto space-y-4 pr-2 -mr-2">
                        <input name="name" placeholder="Full Name" value={formData.name} onChange={handleFormChange} required autoFocus className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <input name="phone" type="tel" placeholder="Phone Number" value={formData.phone} onChange={handleFormChange} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <input name="email" type="email" placeholder="Email (Optional)" value={formData.email} onChange={handleFormChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                        <textarea name="address" placeholder="Address (Optional)" value={formData.address} onChange={handleFormChange} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                        <button type="submit" className="w-full mt-4 py-3 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition">Save & Select Customer</button>
                    </form>
                )}

            </div>
        </div>
    );
};

const HoldSaleModal: React.FC<{ onHold: (name: string) => void, onClose: () => void }> = ({ onHold, onClose }) => {
    const [name, setName] = useState('');
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-sm animate-slideInUp">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Hold Sale</h2>
                    <button type="button" onClick={onClose}><X/></button>
                </div>
                <p className="text-sm text-secondary-500 mb-4">Enter a reference name for this sale to recall it later.</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., John Doe, Table 5" required autoFocus className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg mb-4"/>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button>
                    <button onClick={() => onHold(name)} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Hold Sale</button>
                </div>
            </div>
        </div>
    );
};

const RecallSaleModal: React.FC<{ heldSales: HeldSale[], onRecall: (sale: HeldSale) => void, onDelete: (id: number) => void, onClose: () => void, currency: string }> = ({ heldSales, onRecall, onDelete, onClose, currency }) => {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-xl h-[70vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">Recall Sale</h2><button onClick={onClose}><X /></button></div>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {heldSales.length > 0 ? heldSales.map(sale => {
                        const total = sale.cart.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
                        return (
                             <div key={sale.id} className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg flex justify-between items-center">
                                <div>
                                    <div className="font-semibold">{sale.name}</div>
                                    <div className="text-sm text-secondary-500">{format(sale.createdAt, 'PPpp')} - {sale.cart.length} item(s) - {currency}{total.toFixed(2)}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => onDelete(sale.id!)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><Trash2 size={16} /></button>
                                    <button onClick={() => onRecall(sale)} className="px-4 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg">Recall</button>
                                </div>
                             </div>
                        )
                    }) : <p className="text-center p-8 text-secondary-500">No sales are currently on hold.</p>}
                </div>
            </div>
        </div>
    )
}

export default SalesPage;