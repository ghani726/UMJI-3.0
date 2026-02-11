// CHANGED: Overhauled all types for new features

export const ALL_PERMISSIONS = [
  'AccessDashboard',
  'AccessSales',
  'ProcessRefunds',
  'ChangeItemPricesInCart',
  'GiveDiscountsOnInvoice',
  'AccessProducts',
  'EditProductDetails',
  'ManageProducts',
  'AccessCustomers',
  'DeleteCustomers',
  'AccessPurchases',
  'AccessSuppliers',
  'AccessExpenses',
  'DeleteExpenses',
  'AccessReports',
  'AccessActivityLog',
  'AccessBackup',
  'AccessSettings',
  'ManageUsers',
  'ManageRoles',
  'AccessPromotions',
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  'AccessDashboard',
  'AccessSales',
  'AccessProducts',
  'AccessCustomers',
];

export interface Role {
  id?: number;
  name: string;
  permissions: Permission[];
}

export interface ReceiptLayout {
    showLogo: boolean;
    showStoreName: boolean;
    showOwnerName: boolean;
    showAddress: boolean;
    showPhone: boolean;
    showEmail: boolean;
}

export interface ReportLayoutElement {
    id: 'logo' | 'storeName' | 'address' | 'reportTitle' | 'dateRange' | 'summaryCards' | 'chart' | 'dataTable';
    label: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  enabled: boolean;
  isSystem: boolean;
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
    { id: 'cash', name: 'Cash', enabled: true, isSystem: true },
    { id: 'card', name: 'Card', enabled: true, isSystem: true },
    { id: 'credit', name: 'Credit', enabled: true, isSystem: true },
    { id: 'gift_card', name: 'Gift Card', enabled: true, isSystem: true },
    { id: 'other', name: 'Other', enabled: true, isSystem: true },
];

export interface StoreInfo {
  id?: number;
  storeName: string;
  ownerName: string;
  address: string;
  phone: string;
  email: string;
  logo?: string; // base64
  currency: string;
  theme: 'light' | 'dark';
  accentColor: string;
  receiptHeader?: string;
  receiptFooter?: string;
  receiptPageSize?: 'A4' | 'thermal_80mm';
  receiptHeaderColor?: string;
  invoiceCounter: number;
  defaultMargin?: number;
  receiptLayout?: ReceiptLayout;
  // NEW REPORT SETTINGS
  reportPaperSize: 'A4' | 'A5' | 'Letter';
  reportMargins: { top: number; right: number; bottom: number; left: number }; // in mm
  reportShowDate: boolean;
  reportLayoutOrder: ReportLayoutElement['id'][];
  // NEW REGISTRATION SETTINGS
  isDemoMode?: boolean;
  enableQuickSale?: boolean;
  autoBackup?: boolean;
  paymentMethods?: PaymentMethod[];
}

export interface ReportPreset {
    id?: number;
    name: string;
    settings: Partial<StoreInfo>;
}

export interface SecurityQuestion {
  question: string;
  answer: string;
}

export interface User {
  id?: number;
  username: string;
  passwordHash: string; // Should be properly hashed
  roleId: number;
  securityQuestions?: SecurityQuestion[];
  // NEW COMMISSION & SALARY
  commissionEnabled?: boolean;
  commissionType?: 'per_product' | 'per_sale' | 'fixed_per_sale';
  commissionValue?: number;
  salary?: number;
  canViewOwnCommission?: boolean;
}

export interface StaffCommission {
  id?: number;
  staffId: number;
  saleId: number;
  saleInvoiceNumber: number;
  date: Date;
  totalSaleValue: number;
  earnedCommission: number;
}

export interface StaffPayment {
  id?: number;
  staffId: number;
  period: string; // e.g., '2024-07'
  salaryAmount: number;
  totalCommission: number;
  totalPaid: number;
  status: 'unpaid' | 'paid';
  paymentDate?: Date;
}


export interface Customer {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: Date;
  dueBalance?: number;
}

export interface ProductCategory {
  id?: number;
  name: string;
  parentId?: number | null;
}

export interface Brand {
  id?: number;
  name: string;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface Variant {
  id: string; // uuid
  attributes: Record<string, string>; // e.g., { "Color": "Red", "Size": "M" }
  sku?: string;
  barcode?: string;
  stock: number;
  costPrice: number;
  sellingPrice: number;
}

export interface Product {
  id?: number;
  name: string;
  category?: string; // Kept for migration
  categoryId?: number;
  brandId?: number;
  supplierId?: number;
  images?: string[]; // base64 array
  description?: string;
  options: ProductOption[];
  variants: Variant[];
  lowStockThreshold: number;
  variantAttributes?: string[]; // Kept for backward compatibility during migration
}

export interface Discount {
  type: 'percentage' | 'flat';
  value: number;
  reason?: string;
}

export interface CartItem {
  productId: number;
  variantId: string;
  name: string;
  attributes: Record<string, string>;
  sku?: string;
  quantity: number;
  costPrice: number;
  originalPrice: number;
  sellingPrice: number; // The price after any edits
  discount?: Discount;
  promotionDiscount?: number;
  promotionName?: string;
  note?: string;
}

export interface Payment {
    method: string;
    amount: number;
    referenceId?: string;
}

export interface Sale {
  id?: number;
  invoiceNumber: number;
  timestamp: Date;
  subTotal: number;
  totalItemDiscount: number;
  discountOnInvoice?: Discount;
  voucherDiscount?: number;
  appliedVoucherCode?: string;
  tax?: number;
  totalAmount: number;
  payments: Payment[];
  cashGiven?: number;
  change?: number;
  items: SaleItem[];
  userId: number;
  customerId?: number;
  customerName?: string;
  note?: string;
  dueAmount?: number;
  dueDate?: Date;
  shiftId?: number;
}

export interface SaleItem {
  productId: number;
  variantId: string;
  productName: string;
  attributes: Record<string, string>;
  sku?: string;
  quantity: number;
  costPrice: number;
  originalPrice: number;
  pricePerItem: number; // The final price for one item after discount
  totalPrice: number;
  discount?: Discount;
  promotionDiscount?: number;
  note?: string;
}

export interface HeldSale {
    id?: number;
    name: string;
    cart: CartItem[];
    createdAt: Date;
    discountOnInvoice?: Discount;
    customerId?: number;
    customerName?: string;
}

export interface Supplier {
  id?: number;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface Purchase {
    id?: number;
    supplierId: number;
    purchaseDate: Date;
    totalAmount: number;
    items: PurchaseItem[];
    status: 'pending' | 'received' | 'cancelled';
    referenceNo?: string;
    amountPaid: number;
    paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
    notes?: string;
}

export interface PurchaseItem {
    productId: number;
    variantId: string;
    productName: string;
    quantity: number;
    costPerItem: number;
}

export interface ExpenseCategory {
  id?: number;
  name: string;
}

export interface Expense {
    id?: number;
    categoryId: number;
    amount: number;
    date: Date;
    notes?: string;
    receiptImage?: string; // base64
    paidFromCashDrawer?: boolean;
    shiftId?: number;
}

export interface ActivityLog {
    id?: number;
    timestamp: Date;
    userId: number;
    username: string;
    action: string;
    details: string;
}

export interface Promotion {
  id?: number;
  name: string;
  startDate: Date;
  endDate: Date;
  items: PromotionItem[];
}

export interface PromotionItem {
  productId: number;
  variantId: string;
  productName: string;
  discountType: 'flat';
  discountValue: number;
}

export interface Voucher {
  id?: number;
  code: string;
  type: 'coupon_percentage' | 'coupon_flat' | 'gift_card';
  value: number;
  initialBalance?: number;
  remainingBalance?: number;
  isSingleUse: boolean;
  timesUsed: number;
  maxUses: number;
  expiryDate?: Date;
  isActive: boolean;
}

export interface Shift {
  id?: number;
  userId: number;
  username: string;
  startTime: Date;
  endTime?: Date;
  status: 'open' | 'closed';
  openingBalance: number;
  closingBalance?: number;
  expectedBalance?: number;
  
  // Final calculated values on close
  cashSales?: number;
  cashRefunds?: number;
  cashExpenses?: number;
  cashDrops?: number;
  cardSales?: number;
  otherSales?: number;
  totalSales?: number;
  totalRefunds?: number;
  paymentBreakdown?: Record<string, number>;
  notes?: string;
}

export interface ShiftEvent {
  id?: number;
  shiftId: number;
  timestamp: Date;
  type: 'cash_drop' | 'expense_payment';
  amount: number; // always positive, represents cash out
  notes?: string;
  relatedExpenseId?: number;
}