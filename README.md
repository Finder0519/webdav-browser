# WebDAV 浏览器

基于 Electron 的 WebDAV 客户端。

## 技术栈

- Electron（主进程 / 预加载 / 渲染进程）
- Vite（构建，由 `electron-vite` 编排）
- React + TypeScript

## 目录结构

```
electron.vite.config.ts   # Vite 配置（main / preload / renderer 三段）
src/
  main/                   # 主进程：窗口、IPC、系统能力
  preload/                # 预加载：通过 contextBridge 暴露受控 API
  renderer/               # 渲染进程：React 应用
    index.html
    src/
  shared/                 # 主进程与渲染进程共享的类型
```

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 启动开发模式（Vite 热更新）
```

## 常用命令

| 命令               | 作用                                   |
| ------------------ | -------------------------------------- |
| `npm run dev`      | 启动开发模式                           |
| `npm run build`    | 构建产物到 `out/`                      |
| `npm run preview`  | 构建并以生产模式预览                   |
| `npm run typecheck`| TypeScript 类型检查                    |

## 安全基线

- 主进程窗口开启 `contextIsolation`，关闭 `nodeIntegration`，启用 `sandbox`。
- 渲染进程只能通过 `window.api`（`src/preload/index.ts`）调用受控的 IPC 方法。
- 外部链接交给系统默认浏览器打开。
- 生产环境建议将 CSP 收紧（`script-src` 去掉 `unsafe-inline`，改为主进程响应头设置）。
