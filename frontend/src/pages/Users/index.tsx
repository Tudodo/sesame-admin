import { InlineError } from "@/components/InlineError";
import {
  LazyOptionsPicker,
  type LazyPickerOption,
} from "@/components/LazyOptionsPicker";
import { DataTable } from "@/components/data-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { RequiredLabel } from "@/components/ui/required-label";
import { useFieldErrors } from "@/hooks/useFieldErrors";
import { useLazyResource } from "@/hooks/useLazyResource";
import { useUserNames } from "@/hooks/useUserNames";
import { confirm } from "@/lib/confirm";
import { isEmail } from "@/lib/email";
import { message } from "@/lib/message";
import { passwordError } from "@/lib/password";
import {
  apiFetch,
  create,
  getList,
  getOne,
  remove,
  update,
} from "@/services/api";
import { can } from "@/services/permission";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import React from "react";

interface UserItem {
  id: number;
  name: string;
  email: string;
  pid?: string;
  department_id: number | null;
  department_ids?: number[];
  manager_pid?: string | null;
}

interface DeptItem {
  id: number;
  name: string;
  status: string;
}

interface RoleItem {
  id: number;
  name: string;
}

interface PositionItem {
  id: number;
  name: string;
  dept_id: number | null;
}

interface AssignmentRole {
  role_id: number;
  name: string;
}

interface AssignmentPosition {
  position_id: number;
  name: string;
}
export const UsersPage = () => {
  const [data, setData] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [searchKey, setSearchKey] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [deptNames, setDeptNames] = useState<
    Record<number, { name: string; status: string }>
  >({});

  const roleSource = useLazyResource<RoleItem>("roles", modalOpen);
  const deptSource = useLazyResource<DeptItem>("departments", modalOpen);
  const positionSource = useLazyResource<PositionItem>("positions", modalOpen);
  const managerSource = useLazyResource<UserItem>("users", modalOpen);

  // form fields
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoleIds, setFormRoleIds] = useState<number[]>([]);
  const [formDeptIds, setFormDeptIds] = useState<number[]>([]);
  const [formPosIds, setFormPosIds] = useState<number[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<LazyPickerOption[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<LazyPickerOption[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<
    LazyPickerOption[]
  >([]);
  const [selectedManager, setSelectedManager] = useState<LazyPickerOption[]>(
    [],
  );
  const formErrors = useFieldErrors();
  const { getName, userMap, users } = useUserNames();
  const [submitting, setSubmitting] = useState(false);
  const [formManagerPid, setFormManagerPid] = useState("");
  const [formOptionsLoading, setFormOptionsLoading] = useState(false);
  const [formOptionsError, setFormOptionsError] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const loadDataRequestIdRef = useRef(0);
  const formSessionRef = useRef(0);
  const formOpeningRef = useRef(false);
  const submittingRef = useRef(false);
  const deletingRef = useRef(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);

  const loadData = useCallback(async () => {
    setLoading(true);
    const requestId = ++loadDataRequestIdRef.current;
    try {
      const query: Record<string, unknown> = { _start: 0, _end: 999 };
      query._start = page * pageSize;
      query._end = (page + 1) * pageSize;
      if (searchKey) query.name = searchKey;
      const res = await getList<UserItem>("users", query);
      if (requestId !== loadDataRequestIdRef.current) return;
      setData(res.data);
      setTotal(res.total);
      setLoadError(false);
    } catch (e: unknown) {
      // 非关键：列表加载失败时保留旧数据，不阻塞页面
      if (requestId !== loadDataRequestIdRef.current) return;
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      setLoadError(true);
    } finally {
      if (requestId === loadDataRequestIdRef.current) setLoading(false);
    }
  }, [searchKey, page, pageSize]);

  useEffect(() => {
    loadData();
    return () => {
      loadDataRequestIdRef.current += 1;
    };
  }, [loadData]);

  useEffect(() => {
    return () => {
      formSessionRef.current += 1;
      formOpeningRef.current = false;
    };
  }, []);

  // 直属上级的当前值仅存了 pid，这里结合共享姓名缓存解析真实姓名与邮箱，
  // 避免编辑弹窗里只显示占位文本。
  useEffect(() => {
    if (!formManagerPid) return;
    getName(formManagerPid);
    const resolvedName = userMap[formManagerPid];
    const managerUser = users.find((u) => u.pid === formManagerPid);
    setSelectedManager((prev) => {
      if (!prev.length || prev[0].key !== formManagerPid) return prev;
      return [
        {
          key: formManagerPid,
          label: resolvedName || "当前直属上级",
          sublabel: resolvedName
            ? managerUser?.email || formManagerPid
            : "重新搜索可选择其他人员",
        },
      ];
    });
  }, [formManagerPid, getName, userMap, users]);

  useEffect(() => {
    const ids = new Set<number>();
    for (const user of data) {
      for (const id of user.department_ids ||
        (user.department_id ? [user.department_id] : [])) {
        ids.add(id);
      }
    }
    for (const position of positionSource.items) {
      if (position.dept_id != null) ids.add(position.dept_id);
    }
    const allMissing = [...ids].filter((id) => !deptNames[id]);
    if (!allMissing.length) return;
    let cancelled = false;
    void Promise.all(
      allMissing.map(async (id) => {
        try {
          return { id, dept: await getOne<DeptItem>("departments", id) };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<number, { name: string; status: string }> = {};
      for (const result of results) {
        if (result) {
          next[result.id] = {
            name: result.dept.name,
            status: result.dept.status || "enabled",
          };
        }
      }
      setDeptNames((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [data, deptNames, positionSource.items]);

  const loadEditOptions = async (record: UserItem, sessionId: number) => {
    const deptIds =
      record.department_ids ||
      (record.department_id ? [record.department_id] : []);
    setFormOptionsLoading(true);
    setFormOptionsError(false);
    try {
      const [roleData, posData, deptItems] = await Promise.all([
        apiFetch<AssignmentRole[]>(`/api/users/${record.id}/roles`),
        apiFetch<AssignmentPosition[]>(`/api/users/${record.id}/positions`),
        Promise.all(
          deptIds.map((id) =>
            getOne<DeptItem>("departments", id).catch(() => null),
          ),
        ),
      ]);
      if (sessionId !== formSessionRef.current) return false;
      setFormRoleIds((roleData || []).map((role) => role.role_id));
      setFormPosIds((posData || []).map((position) => position.position_id));
      setSelectedRoles(
        (roleData || [])
          .filter((role) => Number.isFinite(role.role_id))
          .map((role) => ({
            key: String(role.role_id),
            label: role.name || `#${role.role_id}`,
          })),
      );
      setSelectedPositions(
        (posData || [])
          .filter((position) => Number.isFinite(position.position_id))
          .map((position) => ({
            key: String(position.position_id),
            label: position.name || `#${position.position_id}`,
          })),
      );
      const loadedDepts = deptItems.filter(
        (dept): dept is DeptItem => dept !== null,
      );
      setSelectedDepts(
        loadedDepts.map((dept) => ({
          key: String(dept.id),
          label: dept.name || `#${dept.id}`,
          disabled: dept.status === "disabled",
          sublabel: dept.status === "disabled" ? "已停用" : undefined,
        })),
      );
      return true;
    } catch (e: unknown) {
      if (sessionId !== formSessionRef.current) return false;
      setFormOptionsError(true);
      if (e instanceof Error) message.error(`加载失败: ${e.message}`);
      return false;
    } finally {
      if (sessionId === formSessionRef.current) setFormOptionsLoading(false);
    }
  };

  const openAdd = () => {
    formSessionRef.current += 1;
    setEditing(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRoleIds([]);
    setFormDeptIds([]);
    setFormPosIds([]);
    setFormManagerPid("");
    setSelectedRoles([]);
    setSelectedDepts([]);
    setSelectedPositions([]);
    setSelectedManager([]);
    setFormOptionsError(false);
    setFormOptionsLoading(false);
    roleSource.setSearch("");
    deptSource.setSearch("");
    positionSource.setSearch("");
    managerSource.setSearch("");
    formErrors.clearErrors();
    setModalOpen(true);
  };

  const openEdit = async (record: UserItem) => {
    if (formOpeningRef.current) return;
    formOpeningRef.current = true;
    const sessionId = ++formSessionRef.current;
    setEditing(record);
    setFormName(record.name);
    setFormEmail(record.email);
    setFormPassword("");
    setFormRoleIds([]);
    setFormPosIds([]);
    setFormDeptIds(
      record.department_ids ||
        (record.department_id ? [record.department_id] : []),
    );
    setFormManagerPid(record.manager_pid || "");
    setSelectedRoles([]);
    setSelectedDepts([]);
    setSelectedPositions([]);
    setSelectedManager(
      record.manager_pid
        ? [
            {
              key: record.manager_pid,
              label: "当前直属上级",
              sublabel: "重新搜索可选择其他人员",
            },
          ]
        : [],
    );
    setFormOptionsError(false);
    roleSource.setSearch("");
    deptSource.setSearch("");
    positionSource.setSearch("");
    managerSource.setSearch("");
    formErrors.clearErrors();
    setModalOpen(true);
    try {
      await loadEditOptions(record, sessionId);
    } finally {
      formOpeningRef.current = false;
    }
  };

  const retryFormOptions = async () => {
    if (!editing) return;
    const sessionId = formSessionRef.current;
    await loadEditOptions(editing, sessionId);
  };

  const handleSubmit = async () => {
    if (submitting || submittingRef.current) return;
    const trimmedName = formName.trim();
    const trimmedEmail = formEmail.trim();
    const nextErrors: Record<string, string> = {};
    if (!trimmedName) nextErrors.name = "请输入姓名";
    if (!trimmedEmail) nextErrors.email = "请输入邮箱";
    else if (!isEmail(trimmedEmail)) nextErrors.email = "请输入有效邮箱";
    if (!editing) {
      const pwdIssue = passwordError(formPassword);
      if (!formPassword) nextErrors.password = "请输入初始密码";
      else if (pwdIssue) nextErrors.password = pwdIssue;
    }
    if (Object.keys(nextErrors).length > 0) {
      formErrors.setErrors(nextErrors);
      return;
    }
    formErrors.clearErrors();
    if (formOptionsLoading || formOptionsError) {
      message.error("请先完成用户关联信息加载");
      return;
    }
    const payload: Record<string, unknown> = {
      name: trimmedName,
      email: trimmedEmail,
      role_ids: formRoleIds,
      department_ids: formDeptIds,
      position_ids: formPosIds,
      manager_pid: formManagerPid,
    };
    setSubmitting(true);
    submittingRef.current = true;
    try {
      if (editing) {
        await update("users", editing.id, payload);
        message.success("已更新");
      } else {
        await create("users", {
          ...payload,
          password: formPassword,
        });
        message.success("已创建");
      }
      setModalOpen(false);
      if (page === 0) void loadData();
      else setPage(0);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleDelete = async (record: UserItem) => {
    if (deletingRef.current || deletingId !== null || loading) return;
    deletingRef.current = true;
    const ok = await confirm({
      title: `确定删除用户「${record.name || record.email}」？`,
      content: "删除后不可恢复",
      okVariant: "destructive",
    });
    if (!ok) {
      deletingRef.current = false;
      return;
    }
    setDeletingId(record.id);
    try {
      await remove("users", record.id);
      message.success("已删除");
      const nextTotal = Math.max(0, total - 1);
      const nextMaxPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
      if (page > nextMaxPage) setPage(nextMaxPage);
      else void loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
      deletingRef.current = false;
    }
  };

  const toggleArray = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const upsertSelectedOption = (
    options: LazyPickerOption[],
    option: LazyPickerOption,
    selected: boolean,
  ): LazyPickerOption[] => {
    const exists = options.some((item) => item.key === option.key);
    if (selected) return exists ? options : [...options, option];
    return options.filter((item) => item.key !== option.key);
  };

  const handleToggleRole = (key: string, option: LazyPickerOption) => {
    const id = Number(key);
    const selected = formRoleIds.includes(id);
    setFormRoleIds(toggleArray(formRoleIds, id));
    setSelectedRoles((prev) => upsertSelectedOption(prev, option, !selected));
  };

  const handleToggleDept = (key: string, option: LazyPickerOption) => {
    const id = Number(key);
    const selected = formDeptIds.includes(id);
    setFormDeptIds(toggleArray(formDeptIds, id));
    setSelectedDepts((prev) => upsertSelectedOption(prev, option, !selected));
  };

  const handleTogglePosition = (key: string, option: LazyPickerOption) => {
    const id = Number(key);
    const selected = formPosIds.includes(id);
    setFormPosIds(toggleArray(formPosIds, id));
    setSelectedPositions((prev) =>
      upsertSelectedOption(prev, option, !selected),
    );
  };

  const handleToggleManager = (key: string, option: LazyPickerOption) => {
    const next = formManagerPid === key ? "" : key;
    setFormManagerPid(next);
    setSelectedManager(next ? [option] : []);
  };

  const handleSearch = () => {
    if (loading) return;
    if (search === searchKey && page === 0) {
      void loadData();
      return;
    }
    setSearchKey(search);
    if (page !== 0) setPage(0);
  };

  const handleResetSearch = () => {
    if (loading) return;
    if (!searchKey && !search) return;
    setSearch("");
    setSearchKey("");
    if (page !== 0) setPage(0);
  };

  const roleOptions = roleSource.items.map((role) => ({
    key: String(role.id),
    label: role.name || `#${role.id}`,
  }));

  const deptOptions = deptSource.items.map((dept) => ({
    key: String(dept.id),
    label: dept.name || `#${dept.id}`,
    disabled: dept.status === "disabled",
    sublabel: dept.status === "disabled" ? "已停用" : undefined,
  }));

  const positionOptions = positionSource.items.map((position) => ({
    key: String(position.id),
    label: position.name || `#${position.id}`,
    sublabel:
      position.dept_id != null ? deptNames[position.dept_id]?.name : undefined,
  }));

  const managerOptions = managerSource.items
    .filter((user) => user.pid && user.pid !== editing?.pid)
    .map((user) => ({
      key: String(user.pid),
      label: user.name,
      sublabel: user.email,
    }));

  const columns: ColumnDef<UserItem>[] = [
    {
      accessorKey: "name",
      header: "用户",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {r.name?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <div
                className="block max-w-[180px] truncate font-medium leading-tight"
                title={r.name}
              >
                {r.name}
              </div>
              <div
                className="block max-w-[180px] truncate text-xs text-muted-foreground"
                title={r.email}
              >
                {r.email}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "pid",
      header: "账号",
      cell: ({ row }) => (
        <code
          className="block max-w-[220px] break-all text-xs"
          title={row.original.pid || row.original.email}
        >
          {row.original.pid || row.original.email}
        </code>
      ),
    },
    {
      id: "departments",
      header: "部门",
      cell: ({ row }) => {
        const r = row.original;
        const ids =
          r.department_ids || (r.department_id ? [r.department_id] : []);
        if (!ids.length)
          return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {ids.map((id) => {
              const dept = deptNames[id];
              const disabled = dept?.status === "disabled";
              return (
                <Badge
                  key={id}
                  variant={disabled ? "destructive" : "outline"}
                  className="max-w-[160px] truncate"
                  title={dept?.name || `#${id}`}
                >
                  {dept?.name || `#${id}`}
                  {disabled ? "（停用）" : null}
                </Badge>
              );
            })}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex gap-2">
            {can("system:user:update") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(r)}
                disabled={deletingId !== null || loading}
              >
                <Pencil className="size-4" /> 编辑
              </Button>
            )}
            {can("system:user:delete") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(r)}
                disabled={deletingId !== null || loading}
              >
                {deletingId === r.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="size-4" /> 删除
                  </>
                )}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            aria-label="搜索用户名"
            placeholder="搜索用户名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSearch}
            disabled={loading}
          >
            搜索
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetSearch}
            disabled={loading || (!searchKey && !search)}
          >
            重置
          </Button>
        </div>
        {can("system:user:create") && (
          <Button onClick={openAdd} disabled={loading}>
            <Plus className="size-4" /> 新建用户
          </Button>
        )}
      </div>

      {loadError && (
        <InlineError
          title="用户列表加载失败"
          description="列表可能未更新，已保留原有数据。"
          onRetry={loadData}
          loading={loading}
        />
      )}

      <DataTable
        columns={columns}
        data={data}
        pageSize={pageSize}
        serverSide
        total={total}
        pageIndex={page}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(0);
          setPageSize(size);
        }}
        loading={loading}
        emptyMessage={
          searchKey
            ? `未找到匹配「${searchKey}」的用户`
            : "暂无用户，点击「新增用户」创建"
        }
      />

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && submitting) return;
          if (!open) {
            formSessionRef.current += 1;
            formOpeningRef.current = false;
            setFormOptionsLoading(false);
            setFormOptionsError(false);
          }
          setModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? "编辑用户" : "新建用户"}</DialogTitle>
            </DialogHeader>
            {formOptionsLoading && !formOptionsError && (
              <div className="block text-sm text-muted-foreground">
                正在加载用户关联信息…
              </div>
            )}
            {formOptionsError && (
              <InlineError
                title="用户关联信息加载失败"
                description="为避免覆盖原有角色、部门或岗位，请重试后再保存"
                loading={formOptionsLoading}
                onRetry={() => {
                  void retryFormOptions();
                }}
              />
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="user-name" required>
                  姓名
                </RequiredLabel>
                <Input
                  id="user-name"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    formErrors.clearError("name");
                  }}
                  {...formErrors.fieldProps("name", "user-name")}
                />
              </div>
              {formErrors.errors.name && (
                <FormMessage
                  id="user-name-error"
                  error={formErrors.errors.name}
                />
              )}
              <div className="space-y-2">
                <RequiredLabel htmlFor="user-email" required>
                  邮箱
                </RequiredLabel>
                <Input
                  type="email"
                  id="user-email"
                  value={formEmail}
                  onChange={(e) => {
                    setFormEmail(e.target.value);
                    formErrors.clearError("email");
                  }}
                  {...formErrors.fieldProps("email", "user-email")}
                />
              </div>
              {formErrors.errors.email && (
                <FormMessage
                  id="user-email-error"
                  error={formErrors.errors.email}
                />
              )}
              {!editing && (
                <div className="space-y-2">
                  <RequiredLabel htmlFor="user-password" required>
                    密码
                  </RequiredLabel>
                  <PasswordInput
                    id="user-password"
                    value={formPassword}
                    autoComplete="new-password"
                    onChange={(e) => {
                      setFormPassword(e.target.value);
                      formErrors.clearError("password");
                    }}
                    {...formErrors.fieldProps("password", "user-password", [
                      "user-password-hint",
                    ])}
                    placeholder="请输入初始密码"
                  />
                  <p
                    id="user-password-hint"
                    className="text-xs text-muted-foreground"
                  >
                    至少8位，需包含大写字母、小写字母和数字
                  </p>
                  {formErrors.errors.password && (
                    <FormMessage
                      id="user-password-error"
                      error={formErrors.errors.password}
                    />
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="user-manager">直属上级</Label>
                <LazyOptionsPicker
                  placeholder="搜索并选择直属上级"
                  id="user-manager"
                  options={managerOptions}
                  selectedOptions={selectedManager}
                  total={managerSource.total}
                  loading={managerSource.loading}
                  error={managerSource.error}
                  multiple={false}
                  search={managerSource.search}
                  onSearchChange={managerSource.setSearch}
                  onLoadMore={managerSource.loadMore}
                  onRetry={managerSource.reload}
                  onToggle={handleToggleManager}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-roles">角色</Label>
                <LazyOptionsPicker
                  placeholder="搜索并选择角色"
                  id="user-roles"
                  options={roleOptions}
                  selectedOptions={selectedRoles}
                  total={roleSource.total}
                  loading={roleSource.loading}
                  error={roleSource.error}
                  multiple
                  search={roleSource.search}
                  onSearchChange={roleSource.setSearch}
                  onLoadMore={roleSource.loadMore}
                  onRetry={roleSource.reload}
                  onToggle={handleToggleRole}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-departments">部门</Label>
                <LazyOptionsPicker
                  placeholder="搜索并选择部门"
                  id="user-departments"
                  options={deptOptions}
                  selectedOptions={selectedDepts}
                  total={deptSource.total}
                  loading={deptSource.loading}
                  error={deptSource.error}
                  multiple
                  search={deptSource.search}
                  onSearchChange={deptSource.setSearch}
                  onLoadMore={deptSource.loadMore}
                  onRetry={deptSource.reload}
                  onToggle={handleToggleDept}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-positions">岗位</Label>
                <LazyOptionsPicker
                  placeholder="搜索并选择岗位"
                  id="user-positions"
                  options={positionOptions}
                  selectedOptions={selectedPositions}
                  total={positionSource.total}
                  loading={positionSource.loading}
                  error={positionSource.error}
                  multiple
                  search={positionSource.search}
                  onSearchChange={positionSource.setSearch}
                  onLoadMore={positionSource.loadMore}
                  onRetry={positionSource.reload}
                  onToggle={handleTogglePosition}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  if (submitting) return;
                  setModalOpen(false);
                }}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={submitting || formOptionsLoading || formOptionsError}
              >
                {submitting ? "提交中…" : "确定"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
