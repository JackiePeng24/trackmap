# 行迹 - AI漫游向导

一个基于AI的旅游图解生成应用，用户搜索地点后自动生成flipbook风格的旅游指南。

## 技术栈
- React 18 + Vite
- TailwindCSS
- Anthropic Claude API
- Lucide Icons

## 开始使用

### 安装依赖
```bash
npm install
```

### 配置API Key
1. 复制 `.env.example` 为 `.env`
2. 添加你的 Anthropic API Key

### 启动开发服务器
```bash
npm run dev
```

## 项目结构
```
src/
├── components/        # React组件
│   ├── SearchBar.jsx  # 搜索栏组件
│   └── Flipbook.jsx   # Flipbook展示组件
├── services/          # API服务
├── styles/            # 样式文件
└── App.jsx           # 主应用组件
```

## 功能特性
- 📍 智能地点搜索
- 🎨 AI生成旅游内容
- 📖 Flipbook翻页效果
- 🌈 精美UI设计

## 后续开发计划
- [ ] 集成Claude API生成旅游内容
- [ ] 添加地图集成
- [ ] 支持多语言
- [ ] 保存收藏功能
