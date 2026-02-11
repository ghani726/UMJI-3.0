

import Dexie, { type Table } from 'dexie';
import type { StoreInfo, User, Product, Sale, Supplier, Purchase, Expense, ActivityLog, HeldSale, ProductCategory, Customer, Role, Promotion, Voucher, Permission, ReportPreset, StaffCommission, StaffPayment, Shift, ShiftEvent, Brand, ExpenseCategory } from '../types';
import { ALL_PERMISSIONS, DEFAULT_STAFF_PERMISSIONS, DEFAULT_PAYMENT_METHODS } from '../types';

export class UmjiPOSDatabase extends Dexie {
  storeInfo!: Table<StoreInfo>;
  users!: Table<User>;
  products!: Table<Product>;
  sales!: Table<Sale>;
  suppliers!: Table<Supplier>;
  purchases!: Table<Purchase>;
  expenses!: Table<Expense>;
  activityLogs!: Table<ActivityLog>;
  heldSales!: Table<HeldSale>;
  productCategories!: Table<ProductCategory>;
  customers!: Table<Customer>;
  roles!: Table<Role>;
  promotions!: Table<Promotion>;
  vouchers!: Table<Voucher>;
  reportPresets!: Table<ReportPreset>;
  staffCommissions!: Table<StaffCommission>;
  staffPayments!: Table<StaffPayment>;
  shifts!: Table<Shift>;
  shiftEvents!: Table<ShiftEvent>;
  brands!: Table<Brand>;
  expenseCategories!: Table<ExpenseCategory>;


  constructor() {
    super('UmjiPOSDatabase');
    // FIX: Cast `this` to `any` to access Dexie's `version` method.
    (this as any).version(6).stores({
      storeInfo: '++id',
      users: '++id, username, roleId',
      products: '++id, name, category, supplierId, *tags',
      sales: '++id, timestamp, userId, invoiceNumber, customerId',
      suppliers: '++id, name',
      purchases: '++id, supplierId, purchaseDate',
      expenses: '++id, date, type',
      activityLogs: '++id, timestamp, userId',
      heldSales: '++id, createdAt',
      productCategories: '++id, &name',
      customers: '++id, &name, phone',
      roles: '++id, &name',
    });
    
    (this as any).version(7).stores({
        promotions: '++id, startDate, endDate',
        vouchers: '++id, &code, type',
    }).upgrade(async (tx: any) => {
        // Migration to add AccessPromotions to Admin role
        const adminRole = await tx.table('roles').where('name').equals('Admin').first();
        if (adminRole && !adminRole.permissions.includes('AccessPromotions')) {
            await tx.table('roles').update(adminRole.id, { permissions: [...adminRole.permissions, 'AccessPromotions'] });
        }
    });

    (this as any).version(8).stores({
        customers: '++id, &name, phone, dueBalance'
    }).upgrade(async (tx: any) => {
        await tx.table('customers').toCollection().modify((customer: Customer) => {
            if (customer.dueBalance === undefined) {
                customer.dueBalance = 0;
            }
        });
    });

    (this as any).version(9).upgrade(async (tx: any) => {
        const adminRole = await tx.table('roles').where('name').equals('Admin').first();
        if (adminRole) {
            const newPermissions: Permission[] = [];
            if (!adminRole.permissions.includes('DeleteCustomers')) {
                newPermissions.push('DeleteCustomers');
            }
            if (!adminRole.permissions.includes('DeleteExpenses')) {
                newPermissions.push('DeleteExpenses');
            }
            if (newPermissions.length > 0) {
                 await tx.table('roles').update(adminRole.id, { permissions: [...adminRole.permissions, ...newPermissions] });
            }
        }
    });

    (this as any).version(10).stores({
        reportPresets: '++id, &name'
    }).upgrade(async (tx: any) => {
        const storeCollection = tx.table('storeInfo');
        await storeCollection.toCollection().modify((store: StoreInfo) => {
            store.reportPaperSize = 'A4';
            store.reportMargins = { top: 20, right: 15, bottom: 20, left: 15 };
            store.reportShowDate = true;
            store.reportLayoutOrder = ['logo', 'storeName', 'address', 'reportTitle', 'dateRange', 'summaryCards', 'chart', 'dataTable'];
        });
    });
    
    (this as any).version(11).upgrade(async (tx: any) => {
        await tx.table('users').toCollection().modify((user: User) => {
            if (!user.securityQuestions) {
                user.securityQuestions = [];
            }
        });
        await tx.table('storeInfo').toCollection().modify((store: StoreInfo) => {
            if (store.isDemoMode === undefined) store.isDemoMode = false;
            if (store.enableQuickSale === undefined) store.enableQuickSale = false;
            if (store.autoBackup === undefined) store.autoBackup = false;
        });
    });

    (this as any).version(12).stores({
        staffCommissions: '++id, staffId, saleId, date',
        staffPayments: '++id, &[period+staffId], staffId, status',
    }).upgrade(async (tx: any) => {
        await tx.table('users').toCollection().modify((user: User) => {
            user.commissionEnabled = false;
            user.commissionType = 'per_sale';
            user.commissionValue = 0;
            user.salary = 0;
            user.canViewOwnCommission = false;
        });
    });

    (this as any).version(13).stores({
        users: '++id, username, roleId, salary'
    });

    (this as any).version(14).upgrade(async (tx: any) => {
        await tx.table('storeInfo').toCollection().modify((store: StoreInfo) => {
            if (!store.paymentMethods) {
                store.paymentMethods = DEFAULT_PAYMENT_METHODS;
            }
        });
    });

    (this as any).version(15).stores({
        shifts: '++id, userId, startTime, endTime, status',
        shiftEvents: '++id, shiftId, timestamp, type',
        sales: '++id, timestamp, userId, invoiceNumber, customerId, shiftId',
        expenses: '++id, date, type, shiftId',
    }).upgrade(async (tx: any) => {
        await tx.table('expenses').toCollection().modify((expense: Expense) => {
            expense.paidFromCashDrawer = false;
        });
    });

    (this as any).version(16).upgrade(async (tx: any) => {
        await tx.table('storeInfo').toCollection().modify((store: StoreInfo) => {
            if (store.paymentMethods) {
                store.paymentMethods = store.paymentMethods.map(pm => {
                    if (pm.isSystem === undefined) {
                        return { ...pm, isSystem: true };
                    }
                    return pm;
                });
            } else {
                store.paymentMethods = DEFAULT_PAYMENT_METHODS;
            }
        });
    });

    (this as any).version(17).stores({
      shiftEvents: '++id, shiftId, timestamp, type, relatedExpenseId',
    });

    (this as any).version(18).stores({
      productCategories: '++id, &[name+parentId], parentId',
      products: '++id, name, categoryId, supplierId',
    }).upgrade(async (tx: any) => {
        await tx.table('productCategories').toCollection().modify((category: ProductCategory) => {
            if (category.parentId === undefined) {
                category.parentId = null;
            }
        });

        const categories = await tx.table('productCategories').toArray();
        // FIX: Explicitly type the return value of map to ensure correct type inference for categoryNameMap, preventing an 'unknown' type error.
        const categoryNameMap = new Map((categories as ProductCategory[]).map((c): [string, number | undefined] => [c.name, c.id]));

        await tx.table('products').toCollection().modify((product: Product) => {
            if (product.category && !product.categoryId) {
                const categoryId = categoryNameMap.get(product.category);
                if (categoryId) {
                    product.categoryId = categoryId;
                }
            }
            delete product.category;
        });
    });

    (this as any).version(19).stores({
        purchases: '++id, supplierId, purchaseDate, paymentStatus',
    }).upgrade(async (tx: any) => {
        await tx.table('purchases').toCollection().modify((purchase: Purchase) => {
            purchase.amountPaid = purchase.amountPaid || 0;
            const total = purchase.totalAmount || 0;
            const paid = purchase.amountPaid;
            if (total > 0 && paid >= total) {
                purchase.paymentStatus = 'paid';
            } else if (paid > 0) {
                purchase.paymentStatus = 'partially_paid';
            } else {
                purchase.paymentStatus = 'unpaid';
            }
            purchase.notes = purchase.notes || '';
        });
    });

    (this as any).version(20).stores({
      brands: '++id, &name',
      products: '++id, name, categoryId, supplierId, brandId',
    }).upgrade(async (tx: any) => {
      const productsToMigrate = await tx.table('products').toArray();
      const brandMap = new Map<string, number>();

      for (const product of productsToMigrate) {
        if (product.brand && typeof product.brand === 'string' && product.brand.trim() !== '') {
          const brandName = product.brand.trim();
          let brandId;

          if (brandMap.has(brandName)) {
            brandId = brandMap.get(brandName);
          } else {
            const existingBrand = await tx.table('brands').where('name').equals(brandName).first();
            if (existingBrand) {
              brandId = existingBrand.id;
            } else {
              brandId = await tx.table('brands').add({ name: brandName });
            }
            brandMap.set(brandName, brandId);
          }
          
          product.brandId = brandId;
        }
        delete product.brand;
        await tx.table('products').put(product);
      }
    });

    (this as any).version(21).stores({
      expenseCategories: '++id, &name',
      expenses: '++id, date, categoryId, shiftId',
    }).upgrade(async (tx: any) => {
        const expenses = await tx.table('expenses').toArray();
        const uniqueTypes = [...new Set(expenses.map(e => e.type).filter(Boolean))];
        const typeToIdMap = new Map<string, number>();

        const defaultCategories = ['Rent', 'Salaries', 'Utilities', 'Supplies', 'Marketing', 'Uncategorized'];
        for (const catName of defaultCategories) {
            const exists = await tx.table('expenseCategories').where('name').equalsIgnoreCase(catName).first();
            if (!exists) {
                const newId = await tx.table('expenseCategories').add({ name: catName });
                typeToIdMap.set(catName, newId);
            } else {
                typeToIdMap.set(catName, exists.id);
            }
        }
        
        for (const type of uniqueTypes) {
            if (type && typeof type === 'string' && !typeToIdMap.has(type)) {
                const newId = await tx.table('expenseCategories').add({ name: type });
                typeToIdMap.set(type, newId);
            }
        }

        const uncategorizedId = typeToIdMap.get('Uncategorized');

        await tx.table('expenses').toCollection().modify((expense: any) => {
            const categoryId = typeToIdMap.get(expense.type);
            if (categoryId) {
                expense.categoryId = categoryId;
            } else {
                expense.categoryId = uncategorizedId;
            }
            delete expense.type;
        });
    });

    (this as any).version(22).upgrade(async (tx: any) => {
        await tx.table('storeInfo').toCollection().modify((store: StoreInfo) => {
            if (store.defaultLowStockThreshold === undefined) {
                store.defaultLowStockThreshold = 10;
            }
        });
    });
  }
}

export const db = new UmjiPOSDatabase();

export async function logActivity(userId: number, username: string, action: string, details: string | object) {
    try {
        await db.activityLogs.add({
            timestamp: new Date(),
            userId,
            username,
            action: action,
            details: typeof details === 'string' ? details : JSON.stringify(details),
        });
    } catch (error) {
        console.error("Failed to log activity:", error);
    }
}

export async function seedCoreData() {
    const roleCount = await db.roles.count();
    if (roleCount === 0) {
        await db.roles.bulkAdd([
            // FIX: Create a mutable array from the readonly ALL_PERMISSIONS tuple.
            { name: 'Admin', permissions: [...ALL_PERMISSIONS] },
            { name: 'Staff', permissions: DEFAULT_STAFF_PERMISSIONS },
        ]);
    }
    
    const categoryCount = await db.productCategories.count();
    if (categoryCount === 0) {
        await db.productCategories.bulkAdd([
            { name: 'General', parentId: null },
        ]);
    }

    const expenseCategoryCount = await db.expenseCategories.count();
    if (expenseCategoryCount === 0) {
        await db.expenseCategories.bulkAdd([
            { name: 'Rent' },
            { name: 'Salaries' },
            { name: 'Utilities' },
            { name: 'Supplies' },
            { name: 'Marketing' },
            { name: 'Uncategorized' },
        ]);
    }
}

// Dummy data for initial setup
export const seedInitialData = async () => {
    await seedCoreData();

    let footwearId: number | undefined, apparelId: number | undefined, accessoriesId: number | undefined;

    const categoryCount = await db.productCategories.count();
    if (categoryCount <= 1) { // Only seed if we just have 'General'
        await db.productCategories.bulkAdd([
            { name: 'Footwear', parentId: null },
            { name: 'Apparel', parentId: null },
            { name: 'Accessories', parentId: null },
        ]);
        const newCategories = await db.productCategories.where('name').anyOf('Footwear', 'Apparel', 'Accessories').toArray();
        footwearId = newCategories.find(c => c.name === 'Footwear')?.id;
        apparelId = newCategories.find(c => c.name === 'Apparel')?.id;
        accessoriesId = newCategories.find(c => c.name === 'Accessories')?.id;
    }
    
    const productCount = await db.products.count();
    if (productCount === 0) {
        const umjiKicksId = await db.brands.add({ name: 'UMJI Kicks' });
        const umjiStyleId = await db.brands.add({ name: 'UMJI Style' });

        await db.products.bulkAdd([
            {
                name: 'Classic Leather Sneaker',
                categoryId: footwearId,
                brandId: umjiKicksId,
                lowStockThreshold: 10,
                options: [
                    { name: 'Color', values: ['White', 'Black'] },
                    { name: 'Size', values: ['8', '9', '10'] },
                ],
                variants: [
                    { id: 'sneaker-w-8', attributes: { 'Color': 'White', 'Size': '8' }, stock: 10, costPrice: 1500, sellingPrice: 3499, barcode: '80001' },
                    { id: 'sneaker-w-9', attributes: { 'Color': 'White', 'Size': '9' }, stock: 15, costPrice: 1500, sellingPrice: 3499, barcode: '80002' },
                    { id: 'sneaker-w-10', attributes: { 'Color': 'White', 'Size': '10' }, stock: 12, costPrice: 1500, sellingPrice: 3499, barcode: '80003' },
                    { id: 'sneaker-b-8', attributes: { 'Color': 'Black', 'Size': '8' }, stock: 8, costPrice: 1500, sellingPrice: 3499, barcode: '80004' },
                    { id: 'sneaker-b-9', attributes: { 'Color': 'Black', 'Size': '9' }, stock: 18, costPrice: 1500, sellingPrice: 3499, barcode: '80005' },
                    { id: 'sneaker-b-10', attributes: { 'Color': 'Black', 'Size': '10' }, stock: 11, costPrice: 1500, sellingPrice: 3499, barcode: '80006' },
                ]
            },
            {
                name: 'Graphic T-Shirt',
                categoryId: apparelId,
                brandId: umjiStyleId,
                lowStockThreshold: 5,
                options: [
                    { name: 'Color', values: ['Red', 'Blue'] },
                    { name: 'Size', values: ['M', 'L'] },
                ],
                variants: [
                    { id: 'tshirt-r-m', attributes: { 'Color': 'Red', 'Size': 'M' }, stock: 25, costPrice: 500, sellingPrice: 1299, barcode: '90001' },
                    { id: 'tshirt-r-l', attributes: { 'Color': 'Red', 'Size': 'L' }, stock: 20, costPrice: 500, sellingPrice: 1299, barcode: '90002' },
                    { id: 'tshirt-b-m', attributes: { 'Color': 'Blue', 'Size': 'M' }, stock: 22, costPrice: 500, sellingPrice: 1299, barcode: '90003' },
                    { id: 'tshirt-b-l', attributes: { 'Color': 'Blue', 'Size': 'L' }, stock: 18, costPrice: 500, sellingPrice: 1299, barcode: '90004' },
                ]
            },
            {
                name: 'Premium Shoelaces',
                categoryId: accessoriesId,
                brandId: umjiKicksId,
                lowStockThreshold: 20,
                options: [],
                variants: [
                    { id: 'laces-std', attributes: {}, stock: 50, costPrice: 50, sellingPrice: 199, barcode: '90005' },
                ]
            },
        ]);
        
        await db.suppliers.bulkAdd([
            { name: 'Global Apparel Co.', phone: '555-0101', email: 'contact@globalapparel.com', contactPerson: 'John Doe' },
            { name: 'Footwear Solutions', phone: '555-0102', email: 'sales@footwearsolutions.com', contactPerson: 'Jane Smith' },
        ]);

        const rentCat = await db.expenseCategories.where('name').equals('Rent').first();
        const utilsCat = await db.expenseCategories.where('name').equals('Utilities').first();

        if (rentCat && utilsCat) {
            await db.expenses.bulkAdd([
                { categoryId: rentCat.id!, amount: 1500, date: new Date(new Date().setDate(1)) },
                { categoryId: utilsCat.id!, amount: 350, date: new Date(new Date().setDate(5)) },
            ]);
        }
    }
};