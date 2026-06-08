export enum AppRole {
  Admin = 'admin',
  Moderator = 'moderator',
  Trans = 'trans',
  User = 'user'
}

export enum Permission {
  ViewDashboard = 'view_dashboard',
  ManageManga = 'manage_manga',
  CreateManga = 'create_manga',
  EditManga = 'edit_manga',
  DeleteManga = 'delete_manga',
  ManageChapters = 'manage_chapters',
  ManageUsers = 'manage_users',
  ManageRoles = 'manage_roles',
  LockUsers = 'lock_users',
  ViewAnalytics = 'view_analytics',
  ViewOwnMangaOnly = 'view_own_manga_only',
}

export const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  [AppRole.Admin]: [
    Permission.ViewDashboard,
    Permission.ManageManga,
    Permission.CreateManga,
    Permission.EditManga,
    Permission.DeleteManga,
    Permission.ManageChapters,
    Permission.ManageUsers,
    Permission.ManageRoles,
    Permission.LockUsers,
    Permission.ViewAnalytics,
  ],
  [AppRole.Moderator]: [
    Permission.ViewDashboard,
    Permission.ManageManga,
    Permission.CreateManga,
    Permission.EditManga,
    Permission.ManageChapters,
    Permission.ManageUsers,
    Permission.ViewAnalytics,
  ],
  [AppRole.Trans]: [
    Permission.ViewDashboard,
    Permission.ManageManga,
    Permission.CreateManga,
    Permission.EditManga,
    Permission.ManageChapters,
    Permission.ViewAnalytics,
    Permission.ViewOwnMangaOnly,
  ],
  [AppRole.User]: [],
};

export const ROLE_PRIORITY: Record<AppRole, number> = {
  [AppRole.Admin]: 100,
  [AppRole.Moderator]: 50,
  [AppRole.Trans]: 10,
  [AppRole.User]: 0,
};

export const ADMIN_ROLES: AppRole[] = [AppRole.Admin, AppRole.Moderator, AppRole.Trans];
