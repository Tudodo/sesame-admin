-- Default tenant
INSERT INTO tenant (id, name, code, domain, status, contact_name, contact_email, description, created_at, updated_at)
VALUES (1, '默认租户', 'default', NULL, 'enabled', NULL, NULL, NULL, NOW(), NOW());
SELECT setval('tenant_id_seq', GREATEST((SELECT MAX(id) FROM tenant), 1));

-- Default roles
INSERT INTO roles (id, name, description, role_key, role_sort, status, data_scope, dept_ids, tenant_id, is_system, created_at, updated_at)
VALUES
  (1, 'admin', 'Super administrator with full access', 'admin', 0, 1, 1, NULL, 'default', true, NOW(), NOW()),
  (2, 'editor', 'Can view and edit content', 'editor', 0, 1, 1, NULL, 'default', false, NOW(), NOW()),
  (3, 'viewer', 'Read-only access', 'viewer', 0, 1, 1, NULL, 'default', false, NOW(), NOW());
SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 3));

-- Default department
INSERT INTO departments (id, name, description, parent_id, sort_order, tenant_id, code, created_at, updated_at)
VALUES (1, 'General', 'Default department', NULL, 0, 'default', 'DEPT-1', NOW(), NOW());
SELECT setval('departments_id_seq', GREATEST((SELECT MAX(id) FROM departments), 1));

-- Default menu tree
INSERT INTO menus (id, name, path, icon, parent_id, sort_order, permission, visible, menu_type, actions, tenant_id, created_at, updated_at)
VALUES
  (1, '系统管理', NULL, 'SettingOutlined', NULL, 1, NULL, true, 'M', NULL, 'default', NOW(), NOW()),
  (2, '文件管理', '/file-management', 'FileOutlined', 1, 99, 'system:file:list', true, 'C', '["read","upload","delete"]'::jsonb, 'default', NOW(), NOW()),
  (3, '仪表盘', '/dashboard', 'DashboardOutlined', NULL, 0, NULL, true, 'C', '["read"]'::jsonb, 'default', NOW(), NOW()),
  (11, '用户管理', '/users', 'UserOutlined', 1, 1, 'system:user:list', true, 'C', '["read","create","update","delete","export"]'::jsonb, 'default', NOW(), NOW()),
  (12, '角色管理', '/roles', 'TeamOutlined', 1, 2, 'system:role:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (13, '菜单管理', '/menus', 'MenuOutlined', 1, 3, 'system:menu:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (14, '部门管理', '/departments', 'ApartmentOutlined', 1, 4, 'system:dept:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (15, '岗位管理', '/positions', 'IdcardOutlined', 1, 5, 'system:post:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (16, '字典管理', '/dictionaries', 'BookOutlined', 1, 6, 'system:dict:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (17, '操作日志', '/oper-logs', 'FileSearchOutlined', 1, 7, 'system:operlog:list', true, 'C', '["read","delete"]'::jsonb, 'default', NOW(), NOW()),
  (18, '登录日志', '/login-logs', 'LoginOutlined', 1, 8, 'system:loginlog:list', true, 'C', '["read","delete"]'::jsonb, 'default', NOW(), NOW()),
  (19, '系统参数', '/sys-configs', 'SettingOutlined', 1, 9, 'system:config:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (20, '在线用户', '/online-users', 'TeamOutlined', 1, 10, 'system:online:list', true, 'C', '["read","delete"]'::jsonb, 'default', NOW(), NOW()),
  (21, '服务监控', '/server-monitor', 'DashboardOutlined', 1, 11, 'system:monitor:list', true, 'C', '["read"]'::jsonb, 'default', NOW(), NOW()),
  (22, '缓存管理', '/cache', 'HddOutlined', 1, 12, 'system:cache:list', true, 'C', '["read"]'::jsonb, 'default', NOW(), NOW()),
  (23, '代码生成', '/codegen', 'CodeOutlined', 1, 13, 'system:codegen:list', true, 'C', '["read","create"]'::jsonb, 'default', NOW(), NOW()),
  (25, '通知中心', '/notifications', 'BellOutlined', 1, 14, 'system:notif:list', true, 'C', '["read"]'::jsonb, 'default', NOW(), NOW()),
  (26, '定时任务', '/scheduled-tasks', 'ClockCircleOutlined', 1, 15, 'system:sched:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (27, '租户管理', '/tenants', 'BankOutlined', 1, 16, 'system:tenant:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (31, '数据同步', '/data-sync', 'SyncOutlined', 1, 17, 'system:sync:list', true, 'C', '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (32, '任务队列', '/job-queue', 'OrderedListOutlined', 1, 18, 'system:job:list', true, 'C', '["read","create","delete"]'::jsonb, 'default', NOW(), NOW());
SELECT setval('menus_id_seq', GREATEST((SELECT MAX(id) FROM menus), 32));

-- Admin role grants
INSERT INTO roles_menus (role_id, menu_id, permissions, tenant_id, created_at, updated_at)
VALUES
  (1, 1, '["read"]'::jsonb, 'default', NOW(), NOW()),
  (1, 2, '["read","upload","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 3, '["read"]'::jsonb, 'default', NOW(), NOW()),
  (1, 11, '["read","create","update","delete","export"]'::jsonb, 'default', NOW(), NOW()),
  (1, 12, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 13, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 14, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 15, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 16, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 17, '["read","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 18, '["read","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 19, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 20, '["read","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 21, '["read"]'::jsonb, 'default', NOW(), NOW()),
  (1, 22, '["read"]'::jsonb, 'default', NOW(), NOW()),
  (1, 23, '["read","create"]'::jsonb, 'default', NOW(), NOW()),
  (1, 25, '["read"]'::jsonb, 'default', NOW(), NOW()),
  (1, 26, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 27, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 31, '["read","create","update","delete"]'::jsonb, 'default', NOW(), NOW()),
  (1, 32, '["read","create","delete"]'::jsonb, 'default', NOW(), NOW());
SELECT setval('roles_menus_id_seq', GREATEST((SELECT MAX(id) FROM roles_menus), 21));

-- Default dictionaries
INSERT INTO dictionaries (id, name, code, description, tenant_id, created_at, updated_at)
VALUES
  (2, '性别', 'gender', '用户性别', 'default', NOW(), NOW()),
  (3, '是否', 'yes_no', '通用布尔选项', 'default', NOW(), NOW()),
  (4, '通用状态', 'status', '启用/停用', 'default', NOW(), NOW()),
  (5, '优先级', 'priority', '高/中/低', 'default', NOW(), NOW()),
  (6, '通知类型', 'notification_type', '系统/任务/告警等通知分类', 'default', NOW(), NOW());
SELECT setval('dictionaries_id_seq', GREATEST((SELECT MAX(id) FROM dictionaries), 6));

INSERT INTO dictionary_entries (id, dictionary_id, label, value, sort_order, tenant_id, created_at, updated_at)
VALUES
  (201, 2, '男', 'male', 1, 'default', NOW(), NOW()),
  (202, 2, '女', 'female', 2, 'default', NOW(), NOW()),
  (301, 3, '是', 'true', 1, 'default', NOW(), NOW()),
  (302, 3, '否', 'false', 2, 'default', NOW(), NOW()),
  (401, 4, '启用', 'enabled', 1, 'default', NOW(), NOW()),
  (402, 4, '停用', 'disabled', 2, 'default', NOW(), NOW()),
  (501, 5, '高', 'high', 1, 'default', NOW(), NOW()),
  (502, 5, '中', 'medium', 2, 'default', NOW(), NOW()),
  (503, 5, '低', 'low', 3, 'default', NOW(), NOW()),
  (605, 6, '系统', 'system', 5, 'default', NOW(), NOW()),
  (606, 6, '告警', 'alert', 6, 'default', NOW(), NOW());
SELECT setval('dictionary_entries_id_seq', GREATEST((SELECT MAX(id) FROM dictionary_entries), 606));

-- Default storage config
INSERT INTO storage_config (id, provider, local_path, s3_bucket, s3_region, s3_endpoint, s3_access_key, s3_secret_key, s3_enabled, tenant_id, updated_at)
VALUES (1, 'local', 'uploads', NULL, NULL, NULL, NULL, NULL, false, 'default', NOW());
SELECT setval('storage_config_id_seq', GREATEST((SELECT MAX(id) FROM storage_config), 1));

-- Default administrator
INSERT INTO users (id, pid, email, password, api_key, name, department_id, tenant_id, created_at, updated_at)
VALUES (
  1,
  '99999999-9999-9999-9999-999999999999',
  'admin@sesame.dev',
  '$argon2id$v=19$m=19456,t=2,p=1$yO+qCO5ocD8wwiqknvWM+A$MZYPq8I3J0PFMwK5Oi22fR+2ueGMrRjSImp8rAylKIo',
  'lo-community-admin',
  '管理员',
  1,
  'default',
  NOW(),
  NOW()
);
INSERT INTO users_roles (user_id, role_id, tenant_id, created_at, updated_at)
VALUES (1, 1, 'default', NOW(), NOW());
SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1));
SELECT setval('users_roles_id_seq', GREATEST((SELECT MAX(id) FROM users_roles), 1));
