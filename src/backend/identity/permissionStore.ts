/** Shared PostgreSQL adapter for role_permissions and user_permissions. */

import type { UserRole } from '../../types';
import type { Permission } from '../productionContracts';
import type { PermissionStore } from '../persistence/coreRecords';
import type { SqlQueryExecutor } from '../services/database';

export function createSqlPermissionStore(db: SqlQueryExecutor): PermissionStore {
  const codes = async (sql: string, values: readonly unknown[]): Promise<Permission[]> => {
    const result = await db.query<{ permission_code: string }>(sql, values);
    return result.rows.map(row => row.permission_code as Permission);
  };

  return {
    async listRolePermissions(role: UserRole) {
      return codes('SELECT permission_code FROM role_permissions WHERE role = $1 ORDER BY permission_code ASC', [role]);
    },

    async listUserPermissions(userId) {
      return codes('SELECT permission_code FROM user_permissions WHERE user_id = $1 ORDER BY permission_code ASC', [userId]);
    },

    async listEffectivePermissions(userId, role) {
      return codes(
        `SELECT permission_code FROM role_permissions WHERE role = $1
         UNION
         SELECT permission_code FROM user_permissions WHERE user_id = $2
         ORDER BY permission_code ASC`,
        [role, userId],
      );
    },
  };
}
