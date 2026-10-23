# Dawn Craft Launcher 二次开发

安装包会把当前版本源码放在安装目录的 `resources/developer-source`。该目录不包含历史发行版、构建缓存、测试截图或 `node_modules`。

## 环境

- Windows 10/11 x64
- Node.js 22 或更高版本
- npm
- JDK 17 或更高版本（仅在重新构建内置 Bridge MOD 时需要）
- MinGW-w64 GCC（Windows 构建离线种子地图 Cubiomes 计算器）

## 启动开发版

在 `developer-source` 目录打开 PowerShell：

```powershell
npm install
npm run dev
```

## 编译与安装包

```powershell
npm run build
npm run dist:installer
```

安装包内的程序位于 Electron 的 `app.asar` 中；请修改 `developer-source` 里的 TypeScript、Vue、CSS 或原生源码，再重新编译，不要直接修改 `app.asar`。

原 KAMUCL 用户数据目录会继续复用，因此更名后账号、设置与游戏实例不会被重置。
