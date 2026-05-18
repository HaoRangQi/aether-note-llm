import { AetherError } from "../errors.js";
import type { AiRole } from "../types.js";

/**
 * 角色注册表：内存中维护当前生效的 AiRole 列表。
 *
 * 它是 settings.roles 的运行时镜像——SettingsStore 持久化，RoleRegistry 提供查询。
 * 应用层（AI 调用、UI）只跟这个 Registry 打交道。
 */
export class RoleRegistry {
  private roles = new Map<string, AiRole>();

  setRoles(list: AiRole[]): void {
    this.roles.clear();
    for (const r of list) this.roles.set(r.id, r);
  }

  list(): AiRole[] {
    return [...this.roles.values()];
  }

  /** 取一个角色（不管启用状态）。 */
  get(id: string): AiRole | undefined {
    return this.roles.get(id);
  }

  /** 必须取到、必须启用、必须有 provider 绑定。否则抛错。 */
  resolve(id: string): AiRole {
    const r = this.roles.get(id);
    if (!r) throw new AetherError("BINDING_NOT_FOUND", `Role not found: ${id}`);
    if (!r.enabled) throw new AetherError("BINDING_NOT_FOUND", `Role disabled: ${id}`);
    if (!r.providerId) throw new AetherError("BINDING_NOT_FOUND", `Role has no provider: ${id}`);
    return r;
  }

  /** 出现在编辑器右键菜单的角色（启用 + showInEditor + 有 provider 绑定）。 */
  listForEditor(): AiRole[] {
    return this.list().filter((r) => r.enabled && r.showInEditor && r.providerId);
  }
}
