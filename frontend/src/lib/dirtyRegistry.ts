/**
 * 全局脏状态注册表。
 *
 * SPA 路由变化（浏览器后退/前进按钮）不会触发 beforeunload，
 * 因此需要一个进程内的注册表，让设计器类页面在存在未保存改动时
 * 能够拦截路由跳转并提示用户。
 */

interface DirtyEntry {
  message: string;
}

const registry = new Map<string, DirtyEntry>();

/**
 * 标记某个路由存在未保存的改动。
 * @param route 路由标识（通常为 currentRoute）
 * @param message 提示文案
 */
export function setDirty(
  route: string,
  message = "有未保存的更改，确定要离开吗？",
): void {
  registry.set(route, { message });
}

/** 清除某个路由的脏状态标记。 */
export function clearDirty(route: string): void {
  registry.delete(route);
}

/** 当前是否存在任意未保存的改动。 */
export function hasDirty(): boolean {
  return registry.size > 0;
}

/** 获取所有脏状态的合并提示文案。 */
export function getDirtyMessage(): string {
  const entries = [...registry.values()];
  if (entries.length === 0) return "有未保存的更改，确定要离开吗？";
  return entries[0].message;
}

/** 清除所有脏状态标记（例如保存成功后）。 */
export function clearAllDirty(): void {
  registry.clear();
}
