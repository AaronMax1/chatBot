# Assistants Chat Web

一个从 SmartFlowAI Assistants 功能抽出来的简洁网页聊天端。

## 功能

- 助手列表：新建、编辑、删除、搜索助手
- 话题列表：新建、重命名、置顶、删除话题
- 聊天：Markdown 渲染、流式回复、Enter 发送
- 本地保存：助手、话题、消息保存在浏览器 `localStorage`
- 静态部署：浏览器直连 OpenAI-compatible Chat Completions 接口

## 配置

模型接口在页面右上角“接口设置”里填写：

```text
API Key
Base URL
默认模型
```

配置会保存到当前浏览器 `localStorage`，不会写入仓库。静态页面会从浏览器直接请求 `Base URL/chat/completions`，所以接口需要允许跨域访问。

如果部署为 Render Web Service，推荐 Base URL 使用默认值：

```text
/v1
```

服务端会把 `/v1/*` 代理到 `UPSTREAM_BASE_URL`，默认是：

```text
http://130.94.65.11:8317/v1
```

## 启动

```bash
npm install
npm run dev
```

访问：

```text
http://localhost:5173/
```

## 构建

```bash
npm run build
```

## 本地验证 Render 形态

```bash
npm run dev:server
```

访问：

```text
http://localhost:10000/
```

## 部署到 Render

创建 Web Service，使用：

```text
Build Command: npm install && npm run build
Start Command: npm start
```

环境变量：

```text
UPSTREAM_BASE_URL=http://130.94.65.11:8317/v1
```

## 部署到 GitHub Pages

先在 GitHub 创建仓库并 push 代码，然后执行：

```bash
npm run deploy
```

脚本会构建 `dist` 并发布到 `gh-pages` 分支。仓库 Settings -> Pages 里选择 `Deploy from a branch`，分支选 `gh-pages`。
