# Daily - 桌面日记应用

一个基于 **Electron + React + TypeScript** 构建的现代化桌面日记应用，提供优雅的书写体验与个性化定制能力。

---

## 📸 应用预览

![1779369808478](image/README/1779369808478.png)

---

## ✨ 核心特性

### 📝 优雅的日记编辑

- **自由书写** - 纯文本编辑区，无干扰的写作环境
- **可调字体** - 每篇日记独立调节字号（12-48px）
- **标签系统** - 内置「日期」「天气」标签，支持自定义标签
- **图片画廊** - 支持多图上传、预览和删除
- **自动保存** - 500ms 防抖自动同步，无需手动保存

### 🎨 个性化定制

- **主题色切换** - 7 种预设色彩（黑、蓝、橙、绿、红、紫、粉）
- **全局字体设置** - 新日记默认字号可配置
- **侧边栏折叠** - 为书写提供更专注的空间

### 🔍 日记管理

- **搜索过滤** - 按日期或内容快速查找
- **侧边栏列表** - 时间倒序排列，最近日记优先
- **二次确认删除** - 防止误删的重要日记

### 🖼️ 沉浸体验

- **图片预览** - 点击图片全屏放大，毛玻璃背景
- **原生窗口控制** - 自定义标题栏，支持拖拽区域
- **流畅动画** - Framer Motion 驱动的优雅过渡

---

## 🛠️ 技术栈

| 领域     | 技术                   |
| -------- | ---------------------- |
| 前端框架 | React 19 + TypeScript  |
| 构建工具 | Vite 6                 |
| 样式方案 | Tailwind CSS 4         |
| 动画库   | Framer Motion (motion) |
| 桌面框架 | Electron 42            |
| 后端服务 | Express 4              |
| 数据存储 | 本地文件系统 (JSON)    |
| 图标库   | Lucide React           |

---

## 📦 项目结构

```
daily-diary/
├── src/
│   ├── App.tsx              # 主组件（侧边栏 + 编辑器 + 设置）
│   ├── main.tsx             # React 入口
│   ├── lib/
│   │   └── dateUtils.ts     # 日期工具函数
│   └── types.ts             # TypeScript 类型定义
├── server.ts                # Express 后端服务
├── electron-main.cjs              # Electron 主进程
├── preload.cjs           # 预加载脚本
├── data/                    # 数据存储目录（自动生成）
│   ├── diaries/             # 日记 JSON 文件
│   └── settings.json        # 用户设置
└── package.json
```

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

**方式一：仅运行后端服务**

```bash
npm run dev
# 后端服务启动在 http://localhost:3000
```

**方式二：完整 Electron 开发**

```bash
npm run electron:dev
# 自动启动后端 + Electron 窗口
```

### 构建应用

```bash
npm run electron:build
```

**构建输出：**

- Windows: `release/Daily Setup {version}.exe` (NSIS 安装包)
- macOS: `release/Daily {version}.dmg`

---

## 📄 数据存储

所有数据存储在本地，完全离线可用：

| 数据类型 | 存储路径                   |
| -------- | -------------------------- |
| 日记文件 | `data/diaries/{id}.json` |
| 用户设置 | `data/settings.json`     |

**数据结构示例：**

```json
{
  "id": 1703123456789,
  "content": "今天是个好日子...",
  "date": "2024-01-01",
  "tags": [
    { "label": "日期", "value": "2024-01-01", "isRemovable": false },
    { "label": "天气", "value": "晴", "isRemovable": true }
  ],
  "images": ["data:image/png;base64,..."],
  "fontSize": 16,
  "updatedAt": 1703123456789
}
```

---

## 🎯 使用指南

### 基础操作

| 操作       | 方法                                   |
| ---------- | -------------------------------------- |
| 新建日记   | 点击侧边栏顶部的 `+` 按钮            |
| 编辑日记   | 点击侧边栏中的日记卡片                 |
| 搜索日记   | 在侧边栏搜索框输入关键词               |
| 删除日记   | 点击日记卡片的 `🗑️` → 再次确认    |
| 调节字号   | 使用编辑器右上角的滑块                 |
| 添加标签   | 点击标签区域末端的 `+` → 输入标签名 |
| 上传图片   | 点击图片区域的「Upload Image」         |
| 预览图片   | 点击任意图片                           |
| 打开设置   | 点击侧边栏的 `⚙️` 图标             |
| 折叠侧边栏 | 点击左下角的 `<` 按钮                |

### 标签说明

- **日期标签** - 不可删除，修改后日记日期同步更新
- **天气标签** - 可删除，支持自定义值（晴/阴/雨/雪等）
- **自定义标签** - 可随意添加和删除

---

## 🔧 配置说明

### 环境变量

```bash
PORT=3000           # 后端服务端口
DATA_PATH=./data    # 自定义数据存储路径
```

### 应用设置

通过设置面板可配置：

- `themeColor` - 主题色（默认 `#000000`）
- `defaultFontSize` - 默认字号（默认 `16`）

---

## 📝 开发说明

### 脚本命令

| 命令                       | 说明                   |
| -------------------------- | ---------------------- |
| `npm run dev`            | 启动后端服务（tsx）    |
| `npm run build`          | 构建前端 + 打包后端    |
| `npm run electron:dev`   | 启动 Electron 开发环境 |
| `npm run electron:build` | 打包生产版本           |

### 构建配置

**Electron Builder 配置要点：**

- Windows 目标: NSIS (可自定义安装路径)
- macOS 目标: DMG
- 图标: `icon.ico` (Windows) / `icon.icns` (macOS)

---

## 📄 许可

MIT License © 2026

---

## 🙏 致谢

- [Lucide](https://lucide.dev/) - 精美的开源图标库
- [Framer Motion](https://motion.dev/) - 流畅的动画库
- [Tailwind CSS](https://tailwindcss.com/) - 高效的 CSS 框架
