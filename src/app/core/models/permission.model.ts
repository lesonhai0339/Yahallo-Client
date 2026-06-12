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
  // Tag / Author / Artist library
  ManageTaxonomy = 'manage_taxonomy',   // admin: create/edit/delete + approve requests
  RequestTaxonomy = 'request_taxonomy', // mod/trans: submit add requests for admin review
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
    Permission.ManageTaxonomy,
  ],
  [AppRole.Moderator]: [
    Permission.ViewDashboard,
    Permission.ManageManga,
    Permission.CreateManga,
    Permission.EditManga,
    Permission.ManageChapters,
    Permission.ManageUsers,
    Permission.ViewAnalytics,
    Permission.RequestTaxonomy,
  ],
  [AppRole.Trans]: [
    Permission.ViewDashboard,
    Permission.ManageManga,
    Permission.CreateManga,
    Permission.EditManga,
    Permission.ManageChapters,
    Permission.ViewAnalytics,
    Permission.ViewOwnMangaOnly,
    Permission.RequestTaxonomy,
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
