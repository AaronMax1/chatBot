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

## 部署到 GitHub Pages

先在 GitHub 创建仓库并 push 代码，然后执行：

```bash
npm run deploy
```

脚本会构建 `dist` 并发布到 `gh-pages` 分支。仓库 Settings -> Pages 里选择 `Deploy from a branch`，分支选 `gh-pages`。
