# FileAnywhere · 随档

> 你的文件，随处可达。

FileAnywhere 是一个运行在桌面电脑 / VPS 上的私有文件管理器。服务端部署在本地电脑或服务器上，支持局域网和公网环境下电脑、平板或手机通过浏览器浏览和管理这台电脑或服务器的全部磁盘文件。

没有云端账号，没有文件上传到第三方服务器，所有数据都留在你自己的电脑上。

---

## 功能

- **浏览所有磁盘**：盘符、常用文件夹、面包屑导航、列表 / 网格视图、排序、隐藏文件开关。
- **完整文件操作**：新建文件夹 / 文件、重命名、复制、移动、删除、批量选择、拖拽上传。
- **安全删除**：删除操作统一进入 Windows 回收站，不提供永久删除；关键系统位置直接禁止删除 / 移动 / 重命名。
- **上传队列**：切换目录或页面不会中断上传；重名文件自动保留并编号，不覆盖原文件。
- **预览与编辑**：图片、文本、PDF、音视频预览；CodeMirror 文本编辑器支持自动编码识别、BOM、换行符、字号和保存冲突检测。
- **搜索**：当前目录或递归搜索，键盘上下选择，一键定位文件所在文件夹。
- **压缩下载**：单文件夹 ZIP、多选文件打包下载。
- **远程访问**：内置局域网地址、二维码，以及 Cloudflare 临时隧道（cloudflared）。
- **三语与主题**：English / 简体中文 / 繁體中文，深色 / 浅色 / 跟随系统，桌面与手机自适应。
- **安全**：单密码登录、scrypt 哈希、HttpOnly 会话 Cookie、CSRF 防护、登录限速、操作审计日志。

---

## 环境要求

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 20 或更高版本
- 可选：局域网访问需要在 Windows 防火墙中允许 Node.js 的专用网络访问
- 可选：内网穿透需要能访问互联网，需要下载 cloudflared

---

## 快速开始

```bat
npm install
npm run build
```

双击运行 `start.bat`，或在命令行运行：

```bat
npm start
```

启动后打开 <http://localhost:8666>。

`start.bat` 会在首次运行时自动安装依赖、构建项目，并在服务启动后打开浏览器。

### 开发模式

```bat
npm run dev
```

- 前端开发服务器：<http://localhost:5173>
- 后端 API：<http://localhost:8666>
- Vite 已配置 `/api` 代理；开发模式下请访问 5173 端口。

---

## 首次使用

1. 在本机打开 <http://localhost:8666>。
2. 设置一个登录密码（至少 8 位）。
3. 登录后即可浏览磁盘。

如果第一次设置密码时使用的是另一台设备，页面会要求输入启动日志中打印的 **Remote setup code**。设置完成后，所有设备都使用同一个密码登录。

登录时可勾选“保持登录”，会话最长 30 天；不勾选则为 12 小时。

---

## 局域网访问

1. 确保手机 / 平板与电脑连接同一个 Wi-Fi 或局域网。
2. 在电脑上启动 FileAnywhere，记下控制台里的 `Network` 地址，例如 `http://192.168.1.20:8666`。
3. 在手机浏览器中打开该地址。
4. 也可以进入应用左侧的 **远程访问** 页面，扫描二维码直接打开。

如果手机无法连接：

- 在 Windows 防火墙提示中允许 Node.js 访问“专用网络”。
- 确认路由器没有开启“AP 隔离 / 客户端隔离”。
- 电脑有多个网卡时，优先使用 WLAN / 以太网地址，忽略 VMware、VPN、TUN 等虚拟网卡地址。

---

## 内网穿透

应用内置 Cloudflare Quick Tunnel 支持，适合在外网临时访问家里的电脑。

1. 打开 **远程访问** 页面。
2. 点击安装 cloudflared（会自动下载到数据目录的 `bin` 文件夹）。
3. 点击启动隧道，等待生成 `https://xxxx.trycloudflare.com` 地址。
4. 可开启“随应用自动启动”，以后启动 FileAnywhere 时会自动创建隧道。

注意事项：

- Quick Tunnel 的地址每次启动都会变化，不适合长期固定域名。
- 隧道会把登录页面暴露到公网，请务必使用强密码。
- 不需要外网访问时，建议关闭隧道。
- 如果下载失败，也可以自行安装 cloudflared 并加入 `PATH`，应用会自动检测。

---

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 服务监听端口 | `8666` |
| `FILEANYWHERE_DATA_DIR` | 配置、日志与 cloudflared 的存放目录 | `%APPDATA%\FileAnywhere` |

示例：

```bat
set PORT=8677
set FILEANYWHERE_DATA_DIR=D:\FileAnywhereData
npm start
```

> `start.bat` 会把 `PORT` 传给应用，并用同一个端口打开浏览器。

### 数据目录

默认位于 `%APPDATA%\FileAnywhere`：

```text
%APPDATA%\FileAnywhere\
├─ config.json        # 端口、密码哈希、会话密钥、隧道设置
├─ audit.log          # 操作审计日志（超过 2 MB 自动轮转）
├─ audit.log.1
└─ bin\
   └─ cloudflared.exe
```

`config.json` 包含密码哈希和会话密钥，请勿分享。该目录不会通过文件管理接口暴露。

---

## 安全说明

- 密码使用 `scrypt` + 随机盐哈希存储，不保存明文。
- 会话使用 HMAC 签名的 HttpOnly Cookie，`SameSite=Strict`。
- 所有写操作要求自定义请求头并通过同源校验，降低 CSRF 风险。
- 登录失败会触发内存限速：10 分钟内失败 8 次后暂时锁定 5 分钟。
- 删除、移动、复制、重命名、上传、保存以及登录、密码和隧道设置都会写入 `audit.log`。
- 受保护位置（Windows、Program Files、ProgramData、带 SYSTEM 属性的文件等）在执行删除、移动、重命名、写入前需要二次确认。
- 关键位置（磁盘根目录、Windows 顶层、用户目录顶层等）直接禁止删除、移动和重命名。
- 删除只进入 Windows 回收站，但清空回收站仍会永久删除文件，请自行留意。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动后端与 Vite 开发服务器 |
| `npm run typecheck` | TypeScript 类型检查（前后端） |
| `npm run build` | 构建前端静态资源并编译后端 |
| `npm start` | 以生产模式启动 |
| `start.bat` | Windows 一键启动（自动安装 / 构建 / 打开浏览器） |

---

## 项目结构

```text
FileAnywhere/
├─ server/            # Express 后端
│  ├─ index.ts        # 启动入口
│  ├─ app.ts          # 路由与中间件
│  ├─ auth.ts         # 密码、会话、限速
│  ├─ files.ts        # 文件操作
│  ├─ archive.ts      # ZIP 打包
│  ├─ recycle.ts      # Windows 回收站
│  ├─ paths.ts        # 路径规范化与系统保护
│  ├─ system.ts       # 磁盘、常用文件夹、网卡
│  └─ tunnel.ts       # Cloudflare 隧道
├─ src/               # React 前端
│  ├─ pages/          # 文件页、远程访问页
│  ├─ components/     # 通用组件
│  ├─ context/        # 上传、防护、偏好等上下文
│  ├─ i18n/           # 三语字典
│  └─ styles/         # 设计系统与响应式样式
├─ dist/              # 构建产物（client + server）
├─ start.bat
└─ package.json
```

---

## 常见问题

**端口被占用**

另一个 FileAnywhere 或其它程序占用了 8666。关闭占用程序，或使用其它端口启动：

```bat
set PORT=8677
npm start
```

**手机打不开局域网地址**

先确认手机和电脑在同一网络，再检查 Windows 防火墙是否允许 Node.js 访问专用网络。虚拟网卡地址通常无法被手机访问。

**隧道启动失败**

确认电脑能访问互联网；在“远程访问”页面重新安装 cloudflared；或手动安装后加入 `PATH`。

**无法删除或移动某个系统文件**

这是预期的保护行为。磁盘根目录、Windows 顶层等关键位置禁止操作；其它受保护位置需要在二次确认中明确允许。

**上传大文件失败**

单个文件上限为 1 TB，单次最多 50 个文件；批量操作单次最多 1000 项。浏览器或代理的超时设置也可能影响超大文件上传。

**编辑器打不开文件**

文本编辑器限制为 8 MB，二进制文件请使用下载或预览。
