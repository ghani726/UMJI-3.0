
import { useAppContext } from './useAppContext';
import type { Permission } from '../types';

export const usePermissions = () => {
  const { currentUser } = useAppContext();

  const hasPermission = (permission: Permission): boolean => {
    return currentUser?.permissions.includes(permission) ?? false;
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some(p => hasPermission(p));
  };

  return { hasPermission, hasAnyPermission };
};
