import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../hooks/useAppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import type { StoreInfo, ReceiptLayout, ProductCategory, Role, User, Permission, Sale, ReportPreset, ReportLayoutElement, PaymentMethod, Brand, ExpenseCategory } from '../types';
import { ALL_PERMISSIONS } from '../types';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ImageUp, Edit, Trash2, X, Plus, Users, ShieldCheck, Barcode, Printer, Save, Download, GripVertical, CreditCard, ChevronDown, ChevronRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useMemo } from 'react';

// --- Reusable Components ---
const SettingsCard: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-secondary-50 dark:bg-secondary-900 p-6 rounded-2xl shadow-sm">
        <h2 className="text-xl font-bold mb-4">{title}</h2>
        {children}
    </div>
);

// --- Brand Management ---
const BrandManager: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
    const brands = useLiveQuery(() => db.brands.orderBy('name').toArray());
    const { showConfirmation } = useAppContext();

    const openModal = (brand: Brand | null = null) => {
        setEditingBrand(brand);
        setIsModalOpen(true);
    };

    const handleDelete = async (brand: Brand) => {
        if (!brand.id) return;

        const productCount = await db.products.where({ brandId: brand.id }).count();
        if (productCount > 0) {
            toast.error(`Cannot delete brand "${brand.name}" as it is used by ${productCount} product(s).`);
            return;
        }

        showConfirmation(
            'Delete Brand',
            `Are you sure you want to delete the brand "${brand.name}"?`,
            async () => {
                await db.brands.delete(brand.id!);
                toast.success("Brand deleted.");
            }
        );
    };

    return (
        <SettingsCard title="Brands">
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Add, edit, or remove product brands.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    <Plus size={16} /> New Brand
                </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto bg-secondary-100 dark:bg-secondary-800 p-2 rounded-lg">
                {brands?.map(brand => (
                    <div key={brand.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary-200 dark:hover:bg-secondary-800/50">
                        <span className="font-medium">{brand.name}</span>
                        <div className="flex gap-1">
                            <button onClick={() => openModal(brand)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full" title="Edit"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(brand)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="Delete"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && <BrandFormModal brand={editingBrand} onClose={() => setIsModalOpen(false)} />}
        </SettingsCard>
    );
};

const BrandFormModal: React.FC<{ brand: Brand | null; onClose: () => void; }> = ({ brand, onClose }) => {
    const [name, setName] = useState(brand?.name || '');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Brand name cannot be empty.");
            return;
        }
        try {
            if (brand?.id) {
                await db.brands.update(brand.id, { name });
                toast.success("Brand updated.");
            } else {
                await db.brands.add({ name });
                toast.success("Brand created.");
            }
            onClose();
        } catch (error) {
            toast.error("A brand with this name already exists.");
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{brand ? 'Edit' : 'New'} Brand</h2><button type="button" onClick={onClose}><X/></button></div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Brand Name" required autoFocus className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg mb-4"/>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Brand</button></div>
            </form>
        </div>
    );
};


// --- Category Management ---

interface CategoryItemProps {
  category: ProductCategory & { children: (ProductCategory & { children: any[] })[] };
  level: number;
  onEdit: (category: ProductCategory) => void;
  onDelete: (category: ProductCategory) => void;
  onAddSub: (parentId: number) => void;
}

const CategoryItem: React.FC<CategoryItemProps> = ({ category, level, onEdit, onDelete, onAddSub }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary-200 dark:hover:bg-secondary-800/50" style={{ paddingLeft: `${8 + level * 20}px` }}>
        <div className="flex items-center gap-1">
          {category.children.length > 0 ? (
            <button onClick={() => setIsOpen(!isOpen)} className="p-1 rounded-full hover:bg-secondary-300 dark:hover:bg-secondary-700">
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          ) : <div className="w-6"></div>}
          <span className="font-medium">{category.name}</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onAddSub(category.id!)} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full" title="Add sub-category"><Plus size={16} /></button>
          <button onClick={() => onEdit(category)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full" title="Edit"><Edit size={16} /></button>
          <button onClick={() => onDelete(category)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
      {isOpen && category.children.length > 0 && (
        <div className="border-l-2 border-secondary-200 dark:border-secondary-700" style={{ marginLeft: `${21 + level * 20}px`}}>
          {category.children.map(child => (
            <CategoryItem key={child.id} category={child} level={level + 1} onEdit={onEdit} onDelete={onDelete} onAddSub={onAddSub} />
          ))}
        </div>
      )}
    </div>
  );
};


const CategoryManager: React.FC = () => {
    const [modalState, setModalState] = useState<{ isOpen: boolean; editing?: ProductCategory | null; parentId?: number | null }>({ isOpen: false });
    const categories = useLiveQuery(() => db.productCategories.toArray());
    const { showConfirmation } = useAppContext();

    const categoryTree = useMemo(() => {
        if (!categories) return [];
        
        type CategoryNode = ProductCategory & { children: CategoryNode[] };
        const map = new Map<number, CategoryNode>();
        const roots: CategoryNode[] = [];

        categories.forEach(cat => {
            map.set(cat.id!, { ...cat, children: [] });
        });

        categories.forEach(cat => {
            if (cat.parentId) {
                const parent = map.get(cat.parentId);
                if (parent) {
                    parent.children.push(map.get(cat.id!)!);
                } else {
                     roots.push(map.get(cat.id!)!); // Orphaned, treat as root
                }
            } else {
                roots.push(map.get(cat.id!)!);
            }
        });
        return roots;
    }, [categories]);

    const openModal = (editing?: ProductCategory | null, parentId?: number | null) => {
        setModalState({ isOpen: true, editing, parentId });
    };

    const closeModal = () => {
        setModalState({ isOpen: false });
    };

    const handleDelete = async (category: ProductCategory) => {
        if (!category.id) return;

        const subCategoryCount = await db.productCategories.where({ parentId: category.id }).count();
        if (subCategoryCount > 0) {
            toast.error(`Cannot delete category "${category.name}" as it has ${subCategoryCount} sub-category(s).`);
            return;
        }

        const productCount = await db.products.where({ categoryId: category.id }).count();
        if (productCount > 0) {
            toast.error(`Cannot delete category "${category.name}" as it's used by ${productCount} product(s).`);
            return;
        }

        showConfirmation(
            'Delete Category',
            `Are you sure you want to delete the category "${category.name}"? This action cannot be undone.`,
            async () => {
                await db.productCategories.delete(category.id!);
                toast.success("Category deleted.");
            }
        );
    };
    
    return (
        <SettingsCard title="Product Categories">
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Manage the product categories for your store.</p>
                <button onClick={() => openModal(null, null)} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    <Plus size={16} /> New Root Category
                </button>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto bg-secondary-100 dark:bg-secondary-800 p-2 rounded-lg">
                {categoryTree?.map(cat => (
                    <CategoryItem 
                      key={cat.id} 
                      category={cat} 
                      level={0} 
                      onEdit={(c) => openModal(c)} 
                      onDelete={handleDelete}
                      onAddSub={(parentId) => openModal(null, parentId)}
                    />
                ))}
            </div>
            {modalState.isOpen && <CategoryFormModal category={modalState.editing} parentId={modalState.parentId} onClose={closeModal} />}
        </SettingsCard>
    );
};


const CategoryFormModal: React.FC<{ category?: ProductCategory | null; parentId?: number | null; onClose: () => void; }> = ({ category, parentId, onClose }) => {
    const [name, setName] = useState(category?.name || '');
    const parentCategory = useLiveQuery(() => parentId ? db.productCategories.get(parentId) : Promise.resolve(null), [parentId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Category name cannot be empty.");
            return;
        }
        try {
            if (category?.id) {
                await db.productCategories.update(category.id, { name });
                toast.success("Category updated.");
            } else {
                await db.productCategories.add({ name, parentId: parentId ?? null });
                toast.success("Category created.");
            }
            onClose();
        } catch (error) {
            toast.error("A category with this name might already exist at this level.");
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{category ? 'Edit' : 'New'} Category</h2><button type="button" onClick={onClose}><X/></button></div>
                {parentId && <p className="text-sm text-secondary-500 mb-2">Adding sub-category to: <strong>{parentCategory?.name}</strong></p>}
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Category Name" required autoFocus className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg mb-4"/>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Category</button></div>
            </form>
        </div>
    );
};

// --- Expense Category Management ---
const ExpenseCategoryManager: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
    const categories = useLiveQuery(() => db.expenseCategories.orderBy('name').toArray());
    const { showConfirmation } = useAppContext();

    const openModal = (category: ExpenseCategory | null = null) => {
        setEditingCategory(category);
        setIsModalOpen(true);
    };

    const handleDelete = async (category: ExpenseCategory) => {
        if (!category.id) return;

        const expenseCount = await db.expenses.where({ categoryId: category.id }).count();
        if (expenseCount > 0) {
            toast.error(`Cannot delete category "${category.name}" as it is used by ${expenseCount} expense(s).`);
            return;
        }

        showConfirmation(
            'Delete Expense Category',
            `Are you sure you want to delete the category "${category.name}"?`,
            async () => {
                await db.expenseCategories.delete(category.id!);
                toast.success("Category deleted.");
            }
        );
    };

    return (
        <SettingsCard title="Expense Categories">
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Add, edit, or remove expense categories.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    <Plus size={16} /> New Category
                </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto bg-secondary-100 dark:bg-secondary-800 p-2 rounded-lg">
                {categories?.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary-200 dark:hover:bg-secondary-800/50">
                        <span className="font-medium">{cat.name}</span>
                        <div className="flex gap-1">
                            <button onClick={() => openModal(cat)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full" title="Edit"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(cat)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full" title="Delete"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && <ExpenseCategoryFormModal category={editingCategory} onClose={() => setIsModalOpen(false)} />}
        </SettingsCard>
    );
};

const ExpenseCategoryFormModal: React.FC<{ category: ExpenseCategory | null; onClose: () => void; }> = ({ category, onClose }) => {
    const [name, setName] = useState(category?.name || '');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Category name cannot be empty.");
            return;
        }
        try {
            if (category?.id) {
                await db.expenseCategories.update(category.id, { name });
                toast.success("Category updated.");
            } else {
                await db.expenseCategories.add({ name });
                toast.success("Category created.");
            }
            onClose();
        } catch (error) {
            toast.error("A category with this name already exists.");
            console.error(error);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{category ? 'Edit' : 'New'} Category</h2><button type="button" onClick={onClose}><X/></button></div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Category Name" required autoFocus className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg mb-4"/>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Category</button></div>
            </form>
        </div>
    );
};


// --- Role Management ---
const RoleManager: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const roles = useLiveQuery(() => db.roles.toArray());

    const openModal = (role: Role | null = null) => {
        setEditingRole(role);
        setIsModalOpen(true);
    };

    const handleDelete = async (role: Role) => {
        if (role.name === 'Admin') {
            toast.error("The 'Admin' role cannot be deleted.");
            return;
        }
        if (role.id) {
            const usersWithRole = await db.users.where('roleId').equals(role.id).count();
            if (usersWithRole > 0) {
                toast.error(`Cannot delete role as it is assigned to ${usersWithRole} user(s).`);
                return;
            }
            if (window.confirm(`Are you sure you want to delete the role "${role.name}"?`)) {
                await db.roles.delete(role.id);
                toast.success("Role deleted.");
            }
        }
    };

    return (
        <SettingsCard title="Roles & Permissions">
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Define roles and assign specific permissions to them.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    <Plus size={16} /> New Role
                </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
                {roles?.map(role => (
                    <div key={role.id} className="flex justify-between items-center p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                        <span className="font-medium">{role.name}</span>
                        <div className="flex gap-2">
                            <button onClick={() => openModal(role)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(role)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && <RoleFormModal role={editingRole} onClose={() => setIsModalOpen(false)} />}
        </SettingsCard>
    );
};

const RoleFormModal: React.FC<{ role: Role | null; onClose: () => void; }> = ({ role, onClose }) => {
    const [name, setName] = useState(role?.name || '');
    const [permissions, setPermissions] = useState<Permission[]>(role?.permissions || []);

    const handlePermissionChange = (permission: Permission, checked: boolean) => {
        setPermissions(prev => checked ? [...prev, permission] : prev.filter(p => p !== permission));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newRole = { name, permissions };
        try {
            if (role?.id) {
                await db.roles.update(role.id, newRole);
                toast.success("Role updated.");
            } else {
                await db.roles.add(newRole as Role);
                toast.success("Role created.");
            }
            onClose();
        } catch (error) {
            toast.error("A role with this name already exists.");
        }
    };

    const permissionGroups = {
        'General': ['AccessDashboard', 'AccessSales', 'AccessPromotions'],
        'Products': ['AccessProducts', 'EditProductDetails', 'ManageProducts'],
        'Customers': ['AccessCustomers', 'DeleteCustomers'],
        'Operations': ['AccessPurchases', 'AccessSuppliers', 'AccessExpenses', 'DeleteExpenses', 'ProcessRefunds'],
        'Pricing': ['ChangeItemPricesInCart', 'GiveDiscountsOnInvoice'],
        'Admin': ['AccessReports', 'AccessActivityLog', 'AccessBackup', 'AccessSettings'],
        'Super Admin': ['ManageUsers', 'ManageRoles'],
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-2xl h-[90vh] flex flex-col animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{role ? 'Edit' : 'New'} Role</h2><button type="button" onClick={onClose}><X/></button></div>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Role Name" required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg mb-4"/>
                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                    <h3 className="font-semibold mb-2">Permissions</h3>
                    {Object.entries(permissionGroups).map(([group, perms]) => (
                        <div key={group} className="mb-4">
                            <h4 className="font-medium text-primary-600 dark:text-primary-400 mb-2 border-b border-secondary-200 dark:border-secondary-700 pb-1">{group}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {(perms as Permission[]).map(p => (
                                    <label key={p} className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary-100 dark:hover:bg-secondary-800 cursor-pointer">
                                        <input type="checkbox" checked={permissions.includes(p)} onChange={e => handlePermissionChange(p, e.target.checked)} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500" />
                                        <span>{p.replace(/([A-Z])/g, ' $1').trim()}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save Role</button></div>
            </form>
        </div>
    );
};

// --- User Management ---
const UserManager: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const users = useLiveQuery(() => db.users.toArray());
    const roles = useLiveQuery(() => db.roles.toArray());
    const rolesMap = roles ? new Map(roles.map(r => [r.id, r.name])) : new Map();

    const openModal = (user: User | null = null) => {
        setEditingUser(user);
        setIsModalOpen(true);
    };
    
    const handleDelete = async (user: User) => {
        if (user.id === 1) {
             toast.error("The root admin user cannot be deleted.");
             return;
        }
        if (window.confirm(`Are you sure you want to delete the user "${user.username}"?`)) {
            await db.users.delete(user.id!);
            toast.success("User deleted.");
        }
    };

    return (
        <SettingsCard title="User Management">
             <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-secondary-500">Add or edit users and assign them to roles.</p>
                <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                    <Plus size={16} /> New User
                </button>
            </div>
             <div className="space-y-2 max-h-60 overflow-y-auto">
                {users?.map(user => (
                    <div key={user.id} className="flex justify-between items-center p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                        <div>
                            <span className="font-medium">{user.username}</span>
                            <span className="ml-2 text-xs text-secondary-500">{rolesMap.get(user.roleId!)}</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => openModal(user)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                            <button onClick={() => handleDelete(user)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && <UserFormModal user={editingUser} onClose={() => setIsModalOpen(false)} />}
        </SettingsCard>
    );
};

const UserFormModal: React.FC<{ user: User | null; onClose: () => void; }> = ({ user, onClose }) => {
    const [username, setUsername] = useState(user?.username || '');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [roleId, setRoleId] = useState(user?.roleId || 0);
    const roles = useLiveQuery(() => db.roles.toArray());

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user && !password) {
            toast.error("Password is required for new users.");
            return;
        }
        if (password && password !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }

        try {
            if (user?.id) {
                const updateData: Partial<User> = { username, roleId };
                if (password) updateData.passwordHash = btoa(password);
                await db.users.update(user.id, updateData);
                toast.success("User updated.");
            } else {
                await db.users.add({ username, passwordHash: btoa(password), roleId } as User);
                toast.success("User created.");
            }
            onClose();
        } catch (error) {
            toast.error("A user with this name already exists.");
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
             <form onSubmit={handleSubmit} className="bg-secondary-50 dark:bg-secondary-900 rounded-2xl p-6 w-full max-w-md animate-slideInUp">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{user ? 'Edit' : 'New'} User</h2><button type="button" onClick={onClose}><X/></button></div>
                <div className="space-y-4">
                    <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <select value={roleId} onChange={e => setRoleId(Number(e.target.value))} required className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                        <option value={0} disabled>Select a role</option>
                        {roles?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={user ? "New Password (optional)" : "Password"} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm Password" className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg"/>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-secondary-200 dark:border-secondary-800"><button type="button" onClick={onClose} className="px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save User</button></div>
            </form>
        </div>
    );
};

// --- Payment Methods Manager ---
const PaymentMethodsManager: React.FC<{
    paymentMethods: PaymentMethod[];
    setFormData: React.Dispatch<React.SetStateAction<Partial<StoreInfo>>>;
}> = ({ paymentMethods, setFormData }) => {

    const handleUpdate = (id: string, field: 'name' | 'enabled', value: string | boolean) => {
        setFormData(prev => ({
            ...prev,
            paymentMethods: prev.paymentMethods?.map(p => 
                p.id === id ? { ...p, [field]: value } : p
            ),
        }));
    };

    const handleAdd = () => {
        const newMethod: PaymentMethod = {
            id: `custom_${uuidv4()}`,
            name: 'New Method',
            enabled: true,
            isSystem: false,
        };
        setFormData(prev => ({
            ...prev,
            paymentMethods: [...(prev.paymentMethods || []), newMethod],
        }));
    };

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this payment method? This cannot be undone.")) {
            setFormData(prev => ({
                ...prev,
                paymentMethods: prev.paymentMethods?.filter(p => p.id !== id),
            }));
        }
    };

    return (
        <SettingsCard title="Payment Methods">
            <p className="text-sm text-secondary-500 mb-4">
                Configure payment methods for the point of sale. You can add custom methods, edit names, and enable or disable them.
            </p>
            <div className="space-y-3">
                {paymentMethods.map(method => (
                    <div key={method.id} className="flex items-center gap-4 p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                        <input
                            type="text"
                            value={method.name}
                            onChange={(e) => handleUpdate(method.id, 'name', e.target.value)}
                            disabled={method.id === 'cash' || method.id === 'card'}
                            className="flex-1 p-3 bg-secondary-50 dark:bg-secondary-900 rounded-lg disabled:bg-secondary-200 dark:disabled:bg-secondary-700 disabled:opacity-70"
                        />
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={method.enabled}
                                onChange={(e) => handleUpdate(method.id, 'enabled', e.target.checked)}
                                disabled={method.id === 'cash' || method.id === 'card'}
                                className="sr-only peer"
                            />
                            <div className="relative w-11 h-6 bg-secondary-200 peer-focus:outline-none rounded-full peer dark:bg-secondary-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600 peer-disabled:opacity-50"></div>
                        </label>
                        {!method.isSystem && (
                            <button onClick={() => handleDelete(method.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full">
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <button onClick={handleAdd} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600">
                <Plus size={16} /> Add New Method
            </button>
        </SettingsCard>
    );
};



// --- Test Receipt Components ---
const sampleSaleForPrint: Sale = {
    id: 9999,
    invoiceNumber: 1234,
    timestamp: new Date(),
    subTotal: 59.98,
    totalItemDiscount: 5.00,
    discountOnInvoice: { type: 'flat', value: 2.00 },
    totalAmount: 52.98,
    payments: [{ method: 'cash', amount: 60.00, referenceId: 'Cash' }],
    cashGiven: 60.00,
    change: 7.02,
    items: [
        {
            productId: 101,
            variantId: 'abc-1',
            productName: 'Sample T-Shirt',
            attributes: { Size: 'M', Color: 'Blue' },
            quantity: 1,
            costPrice: 10,
            originalPrice: 29.99,
            pricePerItem: 24.99,
            totalPrice: 24.99,
            discount: { type: 'flat', value: 5.00 }
        },
        {
            productId: 102,
            variantId: 'def-2',
            productName: 'Sample Coffee Mug',
            attributes: {},
            quantity: 1,
            costPrice: 5,
            originalPrice: 14.99,
            pricePerItem: 14.99,
            totalPrice: 14.99,
        },
         {
            productId: 103,
            variantId: 'ghi-3',
            productName: 'Another Item',
            attributes: {},
            quantity: 2,
            costPrice: 2,
            originalPrice: 7.50,
            pricePerItem: 7.50,
            totalPrice: 15.00,
        },
    ],
    userId: 1,
    customerName: 'Test Customer',
    note: 'This is a test receipt.'
};

const TestReceiptContent: React.FC<{ sale: Sale, storeInfo: StoreInfo | null, forwardedRef: React.Ref<HTMLDivElement> }> = ({ sale, storeInfo, forwardedRef }) => {
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
    
    const layout = { ...defaultReceiptLayout, ...storeInfo?.receiptLayout };
    const receiptWidth = 'max-w-[300px] w-full';
    const receiptFont = 'font-mono';
    const headerColor = storeInfo?.receiptHeaderColor || 'transparent';
    const headerTextColor = isColorDark(headerColor) ? 'text-white' : 'text-black';

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
                    <p className="flex justify-between"><span>Subtotal:</span><span>{sale.subTotal.toFixed(2)}</span></p>
                    <p className="flex justify-between text-red-600"><span>Discounts:</span><span>-{(sale.totalItemDiscount + (sale.discountOnInvoice?.type === 'flat' ? sale.discountOnInvoice.value : (sale.subTotal - sale.totalItemDiscount) * ((sale.discountOnInvoice?.value || 0)/100))).toFixed(2)}</span></p>
                    <p className="flex justify-between font-bold text-lg border-t border-black pt-1"><span>Total:</span><span>{storeInfo?.currency}{sale.totalAmount.toFixed(2)}</span></p>
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

const TestReceiptToPrint: React.FC = () => {
    const { storeInfo } = useAppContext();
    return <TestReceiptContent sale={sampleSaleForPrint} storeInfo={storeInfo} forwardedRef={null} />;
};

// --- Device Management ---
const DeviceManager: React.FC<{ onPrintTest: () => void }> = ({ onPrintTest }) => {
    const [testBarcode, setTestBarcode] = useState('');
    const [scanDetected, setScanDetected] = useState(false);
    const testInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement === testInputRef.current && e.key === 'Enter') {
                e.preventDefault();
                setScanDetected(true);
                setTimeout(() => {
                    setScanDetected(false);
                    setTestBarcode('');
                }, 2000);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <SettingsCard title="Device Management">
            <p className="text-sm text-secondary-500 mb-4">Configure and test external hardware connected to your POS system.</p>
            <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                    <Barcode className="w-8 h-8 text-primary-500 mt-1 flex-shrink-0" />
                    <div>
                        <h3 className="font-semibold">Barcode Scanner</h3>
                        <p className="text-sm text-secondary-500 mb-2">Most USB or Bluetooth scanners that act as a keyboard (HID mode) are supported out-of-the-box. No special configuration is needed.</p>
                        <div className="flex items-center gap-2">
                             <span className="px-2 py-1 text-xs text-green-700 bg-green-100 rounded-full">Supported</span>
                             <span className="text-sm">Status: Ready</span>
                        </div>
                         <div className="mt-4">
                            <label className="block text-sm font-medium mb-1">Test your scanner:</label>
                            <input
                                ref={testInputRef}
                                type="text"
                                placeholder="Click here and scan a barcode"
                                value={testBarcode}
                                onChange={(e) => setTestBarcode(e.target.value)}
                                className="w-full max-w-sm p-2 bg-secondary-50 dark:bg-secondary-900 border border-secondary-300 dark:border-secondary-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                            {scanDetected && <p className="text-green-500 text-sm mt-1">Scan detected successfully! Value: {testBarcode}</p>}
                        </div>
                    </div>
                </div>
                 <div className="flex items-start gap-4 p-4 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                     <Printer className="w-8 h-8 text-primary-500 mt-1 flex-shrink-0" />
                     <div>
                         <h3 className="font-semibold">Receipt Printer</h3>
                         <p className="text-sm text-secondary-500 mb-2">This POS uses the browser's standard print dialog. Configure your thermal printer in your computer's system settings (e.g., set paper size to 80mm). Then use the button below to print a test page.</p>
                         <button
                            onClick={onPrintTest}
                            className="mt-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition"
                        >
                            Print Test Receipt
                        </button>
                     </div>
                 </div>
            </div>
        </SettingsCard>
    );
};

// --- Report Settings Manager ---
const ALL_LAYOUT_ELEMENTS: ReportLayoutElement[] = [
    { id: 'logo', label: 'Logo' },
    { id: 'storeName', label: 'Business Name' },
    { id: 'address', label: 'Address & Contact' },
    { id: 'reportTitle', label: 'Report Title' },
    { id: 'dateRange', label: 'Date Range' },
    { id: 'summaryCards', label: 'Summary Cards' },
    { id: 'chart', label: 'Chart/Visualization' },
    { id: 'dataTable', label: 'Data Table' },
];

const ReportSettingsManager: React.FC<{ formData: Partial<StoreInfo>, setFormData: React.Dispatch<React.SetStateAction<Partial<StoreInfo>>> }> = ({ formData, setFormData }) => {
    const presets = useLiveQuery(() => db.reportPresets.toArray());
    const [draggedItem, setDraggedItem] = useState<ReportLayoutElement['id'] | null>(null);

    const handleLayoutOrderChange = (newOrder: ReportLayoutElement['id'][]) => {
        setFormData(prev => ({...prev, reportLayoutOrder: newOrder}));
    };
    
    const handleDragStart = (id: ReportLayoutElement['id']) => setDraggedItem(id);
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();
    const handleDrop = (targetId: ReportLayoutElement['id']) => {
        if (!draggedItem || draggedItem === targetId) return;
        const currentOrder = formData.reportLayoutOrder || [];
        const draggedIndex = currentOrder.indexOf(draggedItem);
        const targetIndex = currentOrder.indexOf(targetId);
        const newOrder = [...currentOrder];
        newOrder.splice(draggedIndex, 1);
        newOrder.splice(targetIndex, 0, draggedItem);
        handleLayoutOrderChange(newOrder);
        setDraggedItem(null);
    };

    const handleSavePreset = async () => {
        const name = prompt("Enter a name for this preset:");
        if (name) {
            const settingsToSave = {
                storeName: formData.storeName,
                address: formData.address,
                phone: formData.phone,
                email: formData.email,
                logo: formData.logo,
                reportPaperSize: formData.reportPaperSize,
                reportMargins: formData.reportMargins,
                reportShowDate: formData.reportShowDate,
                reportLayoutOrder: formData.reportLayoutOrder,
            };
            await db.reportPresets.add({ name, settings: settingsToSave });
            toast.success(`Preset "${name}" saved.`);
        }
    };
    
    const handleLoadPreset = async (presetId: number) => {
        const preset = await db.reportPresets.get(presetId);
        if (preset) {
            setFormData(prev => ({ ...prev, ...preset.settings }));
            toast.success(`Preset "${preset.name}" loaded.`);
        }
    };
    
    const handleDeletePreset = async (presetId: number) => {
        if(window.confirm("Are you sure you want to delete this preset?")) {
            await db.reportPresets.delete(presetId);
            toast.success("Preset deleted.");
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                <SettingsCard title="Report Content & Details">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="storeName" value={formData.storeName || ''} onChange={(e) => setFormData(f => ({ ...f, storeName: e.target.value }))} placeholder="Business Name for Reports" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                        <input name="phone" value={formData.phone || ''} onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="Contact Phone" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                        <textarea name="address" value={formData.address || ''} onChange={(e) => setFormData(f => ({ ...f, address: e.target.value }))} placeholder="Business Address" className="md:col-span-2 p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                        <div className="md:col-span-2 flex items-center gap-4"><label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600"><ImageUp size={16}/> Upload Logo<input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if(file){ const reader = new FileReader(); reader.onload = (event) => setFormData(f => ({...f, logo: event.target?.result as string})); reader.readAsDataURL(file); }}} className="hidden" /></label></div>
                    </div>
                </SettingsCard>
                <SettingsCard title="Report Layout & Formatting">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                           <h3 className="font-semibold mb-2">Paper Size</h3>
                           <select name="reportPaperSize" value={formData.reportPaperSize || 'A4'} onChange={(e) => setFormData(f => ({...f, reportPaperSize: e.target.value as any}))} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                               <option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option>
                           </select>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-2">Margins (mm)</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" value={formData.reportMargins?.top || ''} onChange={e => setFormData(f=>({...f, reportMargins: {...f.reportMargins!, top: parseInt(e.target.value)}}))} placeholder="Top" className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                                <input type="number" value={formData.reportMargins?.bottom || ''} onChange={e => setFormData(f=>({...f, reportMargins: {...f.reportMargins!, bottom: parseInt(e.target.value)}}))} placeholder="Bottom" className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                                <input type="number" value={formData.reportMargins?.left || ''} onChange={e => setFormData(f=>({...f, reportMargins: {...f.reportMargins!, left: parseInt(e.target.value)}}))} placeholder="Left" className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                                <input type="number" value={formData.reportMargins?.right || ''} onChange={e => setFormData(f=>({...f, reportMargins: {...f.reportMargins!, right: parseInt(e.target.value)}}))} placeholder="Right" className="p-2 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-semibold mb-2">Layout Order</h3>
                             <div className="space-y-2 p-2 border border-dashed rounded-lg">
                                {(formData.reportLayoutOrder || []).map(id => {
                                    const el = ALL_LAYOUT_ELEMENTS.find(e => e.id === id);
                                    if (!el) return null;
                                    return <div key={el.id} draggable onDragStart={() => handleDragStart(el.id)} onDragOver={handleDragOver} onDrop={() => handleDrop(el.id)} className={`flex items-center gap-2 p-2 rounded-lg bg-secondary-100 dark:bg-secondary-800 cursor-grab ${draggedItem === el.id ? 'opacity-50' : ''}`}><GripVertical size={16} className="text-secondary-400" /> {el.label}</div>
                                })}
                            </div>
                        </div>
                        <div className="flex flex-col gap-4">
                           <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.reportShowDate} onChange={(e) => setFormData(f => ({...f, reportShowDate: e.target.checked}))} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500" /> Show Date Range on Report</label>
                           <h3 className="font-semibold mt-4">Presets</h3>
                           <div className="flex flex-col gap-2">
                               <button onClick={handleSavePreset} className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600"><Save size={16}/> Save Current as Preset</button>
                               <select onChange={(e) => handleLoadPreset(Number(e.target.value))} className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg">
                                   <option>Load a Preset...</option>
                                   {presets?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                               </select>
                               {presets?.map(p => <div key={p.id} className="flex justify-between items-center text-sm"><span>{p.name}</span><button type="button" onClick={() => handleDeletePreset(p.id!)} className="p-1 text-red-500 hover:bg-red-100 rounded-full"><Trash2 size={14}/></button></div>)}
                           </div>
                        </div>
                     </div>
                </SettingsCard>
            </div>
            <div>
                 <SettingsCard title="Live Preview">
                    <div className="bg-white p-4 rounded-lg shadow-inner aspect-[1/1.414] overflow-hidden">
                        <div className="border border-dashed p-4 h-full flex flex-col">
                            {formData.logo && <img src={formData.logo} alt="logo" className="w-16 h-auto mb-2"/>}
                            <h3 className="font-bold">{formData.storeName}</h3>
                            <p className="text-xs text-gray-600">{formData.address}</p>
                            <p className="text-xs text-gray-600">{formData.phone}</p>
                            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                                Report Content Area
                            </div>
                            <p className="text-center text-[8px] text-gray-400 border-t pt-1 mt-auto">Software by UMJI POS</p>
                        </div>
                    </div>
                </SettingsCard>
            </div>
        </div>
    );
};


// --- Main Settings Page ---
const SettingsPage: React.FC = () => {
    const { storeInfo, theme, setTheme, accentColor, setAccentColor, currentUser } = useAppContext();
    const [formData, setFormData] = useState<Partial<StoreInfo>>({});
    const [activeTab, setActiveTab] = useState('store');
    const [isPrintingTest, setIsPrintingTest] = useState(false);
    
    const hasPermission = (p: Permission) => currentUser?.permissions.includes(p) ?? false;

    useEffect(() => {
        if (storeInfo) {
            setFormData({
                ...storeInfo,
                receiptLayout: { ...defaultReceiptLayout, ...storeInfo.receiptLayout },
            });
        }
    }, [storeInfo]);

    useEffect(() => {
        const handleAfterPrint = () => {
            setIsPrintingTest(false);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, []);

    const handlePrintTest = () => {
        setIsPrintingTest(true);
        setTimeout(() => {
            window.print();
        }, 100); 
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleLayoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFormData(prev => ({ ...prev, receiptLayout: { ...(prev.receiptLayout || defaultReceiptLayout), [name]: checked } }));
    };

    const applyPreset = (preset: 'detailed' | 'simple' | 'compact') => {
        let newLayout: ReceiptLayout = { ...defaultReceiptLayout };
        switch(preset) {
            case 'detailed': newLayout = { showLogo: true, showStoreName: true, showAddress: true, showPhone: true, showEmail: true, showOwnerName: true }; break;
            case 'simple': newLayout = { showLogo: true, showStoreName: true, showAddress: false, showPhone: true, showEmail: false, showOwnerName: false }; break;
            case 'compact': newLayout = { showLogo: false, showStoreName: true, showAddress: false, showPhone: false, showEmail: false, showOwnerName: false }; break;
        }
        setFormData(prev => ({...prev, receiptLayout: newLayout }));
        toast.success(`${preset.charAt(0).toUpperCase() + preset.slice(1)} preset applied.`);
    };
    
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => setFormData({ ...formData, logo: event.target?.result as string });
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (storeInfo) {
            try {
                await db.storeInfo.update(storeInfo.id!, formData);
                if (formData.accentColor && formData.accentColor !== accentColor) {
                    setAccentColor(formData.accentColor);
                }
                toast.success('Settings updated successfully!');
            } catch (error) {
                toast.error('Failed to update settings.');
                console.error(error);
            }
        }
    };
    
    const colorPresets = ['#5d2bff', '#0ea5e9', '#22c55e', '#f97316', '#ef4444', '#d946ef'];

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn">
            {isPrintingTest && <TestReceiptToPrint />}
             <div className="border-b border-secondary-200 dark:border-secondary-800">
                <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                    <button onClick={() => setActiveTab('store')} className={`${activeTab === 'store' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Store</button>
                    <button onClick={() => setActiveTab('payment')} className={`${activeTab === 'payment' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Payment Methods</button>
                    <button onClick={() => setActiveTab('brands')} className={`${activeTab === 'brands' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Brands</button>
                    <button onClick={() => setActiveTab('categories')} className={`${activeTab === 'categories' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Product Categories</button>
                    <button onClick={() => setActiveTab('expense_categories')} className={`${activeTab === 'expense_categories' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Expense Categories</button>
                    {(hasPermission('ManageUsers') || hasPermission('ManageRoles')) &&
                        <button onClick={() => setActiveTab('users')} className={`${activeTab === 'users' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Users & Roles</button>
                    }
                    <button onClick={() => setActiveTab('receipt')} className={`${activeTab === 'receipt' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Receipt</button>
                    <button onClick={() => setActiveTab('reports')} className={`${activeTab === 'reports' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Report Output</button>
                    <button onClick={() => setActiveTab('theme')} className={`${activeTab === 'theme' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Theme</button>
                    <button onClick={() => setActiveTab('devices')} className={`${activeTab === 'devices' ? 'border-primary-500 text-primary-600' : 'border-transparent text-secondary-500 hover:text-secondary-700 hover:border-secondary-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>Devices</button>
                </nav>
            </div>
            
            <div className="max-w-4xl mx-auto">
                {activeTab === 'store' && <>
                    <SettingsCard title="Store Information">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input name="storeName" value={formData.storeName || ''} onChange={handleChange} placeholder="Store Name" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                            <input name="ownerName" value={formData.ownerName || ''} onChange={handleChange} placeholder="Owner Name" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                            <input name="email" type="email" value={formData.email || ''} onChange={handleChange} placeholder="Email" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                            <input name="phone" type="tel" value={formData.phone || ''} onChange={handleChange} placeholder="Phone" className="p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                            <textarea name="address" value={formData.address || ''} onChange={handleChange} placeholder="Store Address" className="md:col-span-2 p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                            <div className="md:col-span-2 flex items-center gap-4">
                                <label htmlFor="currency" className="font-medium">Currency Symbol:</label>
                                <input id="currency" name="currency" value={formData.currency || ''} onChange={handleChange} className="p-3 w-20 bg-secondary-100 dark:bg-secondary-800 rounded-lg" />
                            </div>
                        </div>
                    </SettingsCard>
                </>}
                
                {activeTab === 'payment' && formData.paymentMethods && (
                    <PaymentMethodsManager 
                        paymentMethods={formData.paymentMethods} 
                        setFormData={setFormData}
                    />
                )}

                {activeTab === 'brands' && <BrandManager />}

                {activeTab === 'categories' && <CategoryManager />}

                {activeTab === 'expense_categories' && <ExpenseCategoryManager />}
                
                {activeTab === 'users' && <div className="space-y-8">
                    {hasPermission('ManageUsers') && <UserManager />}
                    {hasPermission('ManageRoles') && <RoleManager />}
                </div>}
                
                {activeTab === 'receipt' && <>
                    <SettingsCard title="Receipt Settings">
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium mb-2">Store Logo</label><div className="flex items-center gap-4">{formData.logo && <img src={formData.logo} alt="Store Logo" className="w-16 h-16 object-contain rounded-lg bg-white p-1" />}<label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-secondary-200 dark:bg-secondary-700 rounded-lg hover:bg-secondary-300 dark:hover:bg-secondary-600"><ImageUp size={16}/> Upload Logo<input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" /></label></div></div>
                            <textarea name="receiptHeader" value={formData.receiptHeader || ''} onChange={handleChange} placeholder="Receipt Header Text" className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                            <textarea name="receiptFooter" value={formData.receiptFooter || ''} onChange={handleChange} placeholder="Receipt Footer Text" className="w-full p-3 bg-secondary-100 dark:bg-secondary-800 rounded-lg" rows={2}/>
                            <div className="border-t pt-4"><h3 className="text-lg font-semibold mb-2">Layout & Content</h3><div><h4 className="font-medium mb-2 text-sm">Layout Presets</h4><div className="flex flex-wrap gap-2"><button type="button" onClick={() => applyPreset('detailed')} className="px-3 py-1 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-full">Detailed</button><button type="button" onClick={() => applyPreset('simple')} className="px-3 py-1 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-full">Simple</button><button type="button" onClick={() => applyPreset('compact')} className="px-3 py-1 text-sm bg-secondary-200 dark:bg-secondary-700 rounded-full">Compact</button></div></div><div className="mt-4"><h4 className="font-medium mb-2 text-sm">Visible Elements</h4><div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4">{Object.keys(defaultReceiptLayout).map(key => (<label key={key} className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name={key} checked={formData.receiptLayout?.[key as keyof ReceiptLayout] || false} onChange={handleLayoutChange} className="form-checkbox h-4 w-4 rounded text-primary-600" /><span>{key.replace(/([A-Z])/g, ' $1').replace('show', '').trim()}</span></label>))}</div></div></div>
                            <div><h3 className="font-semibold mb-2">Receipt Page Size</h3><div className="flex gap-4"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="receiptPageSize" value="thermal_80mm" checked={formData.receiptPageSize === 'thermal_80mm'} onChange={handleChange} className="form-radio text-primary-600" />Thermal (80mm)</label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="receiptPageSize" value="A4" checked={formData.receiptPageSize === 'A4'} onChange={handleChange} className="form-radio text-primary-600" />A4</label></div></div>
                            <div><h3 className="font-semibold mb-2">Header Color</h3><div className="flex items-center gap-2"><input type="color" name="receiptHeaderColor" value={formData.receiptHeaderColor || '#5d2bff'} onChange={handleChange} className="w-10 h-10 p-0 border-none rounded-md cursor-pointer bg-transparent"/><span className="font-mono p-2 bg-secondary-100 dark:bg-secondary-800 rounded-md">{formData.receiptHeaderColor}</span></div></div>
                        </div>
                    </SettingsCard>
                </>}

                {activeTab === 'reports' && <ReportSettingsManager formData={formData} setFormData={setFormData} />}

                {activeTab === 'theme' && <>
                    <SettingsCard title="Appearance & Theme">
                        <div className="space-y-4">
                            <div>
                                <h3 className="font-semibold mb-2">Mode</h3>
                                <div className="flex gap-4">
                                    <button onClick={() => setTheme('light')} className={`px-4 py-2 rounded-lg ${theme === 'light' ? 'bg-primary-500 text-white' : 'bg-secondary-200 dark:bg-secondary-700'}`}>Light</button>
                                    <button onClick={() => setTheme('dark')} className={`px-4 py-2 rounded-lg ${theme === 'dark' ? 'bg-primary-500 text-white' : 'bg-secondary-200 dark:bg-secondary-700'}`}>Dark</button>
                                    <button onClick={() => setTheme('system')} className={`px-4 py-2 rounded-lg ${theme === 'system' ? 'bg-primary-500 text-white' : 'bg-secondary-200 dark:bg-secondary-700'}`}>System</button>
                                </div>
                            </div>
                            <div><h3 className="font-semibold mb-2">Accent Color</h3><div className="flex gap-3 items-center flex-wrap">{colorPresets.map(color => (<button key={color} onClick={() => setAccentColor(color)} style={{ backgroundColor: color }} className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${accentColor === color ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-secondary-900' : ''}`}></button>))}<input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-8 h-8 p-0 border-none rounded-full cursor-pointer bg-transparent" /></div></div>
                        </div>
                    </SettingsCard>
                </>}
                
                {activeTab === 'devices' && <DeviceManager onPrintTest={handlePrintTest} />}
            </div>

            <div className="flex justify-end mt-8">
                <button onClick={handleSave} className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg shadow hover:bg-primary-700 transition">Save Changes</button>
            </div>
        </div>
    );
};

// --- Unchanged Components (for brevity) ---
const defaultReceiptLayout: ReceiptLayout = { showLogo: true, showStoreName: true, showAddress: true, showPhone: true, showOwnerName: false, showEmail: false };


export default SettingsPage;