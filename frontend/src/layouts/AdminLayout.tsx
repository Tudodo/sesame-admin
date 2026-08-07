import type { AdminLayoutProps } from "@/theme/shared/AdminShell";
import { AdminShell } from "@/theme/shared/AdminShell";
import type React from "react";

export const AdminLayout: React.FC<AdminLayoutProps> = (props) => {
  return <AdminShell {...props} />;
};
