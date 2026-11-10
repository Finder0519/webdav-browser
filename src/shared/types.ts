// 主进程与渲染进程之间共享的类型定义。
// 这里只放类型（type-only），构建时会被擦除，不产生运行时依赖。

// 应用信息，由主进程通过 IPC 返回。
export interface AppInfo {
  platform: NodeJS.Platform
  versions: Record<string, string | undefined>
  isDev: boolean
}

// 通过 contextBridge 暴露给渲染进程的 API 形状（window.api）。
export interface ElectronApi {
  ping: () => Promise<string>
  getInfo: () => Promise<AppInfo>
}
