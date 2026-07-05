# 行迹 · AI 漫游向导

行迹是一款基于 vivo AIGC 开放能力的沉浸式旅行灵感产品。用户输入目的地后，系统会生成城市叙事、核验真实 POI，并异步绘制一幅可缩放、可点击探索的旅行画卷。

## 已接入能力

- 大模型：生成目的地概览、5 个探索热点与一日路线
- 地理编码（POI 搜索）：补充地点地址、类别和经纬度
- 图片生成：生成 16:9 专属旅行画卷并在服务端缓存
- 安全后端代理：AppKey 只保存在 `.env`，不会打包到浏览器

官方文档入口：<https://aigc.vivo.com.cn/#/document/index?id=1746>

## 本地运行

```bash
npm install
copy .env.example .env
npm run dev
```

访问 <http://localhost:3000>。前端开发服务器运行在 3000 端口，API 服务运行在 3001 端口。

`.env` 配置：

```dotenv
VIVO_APP_ID=your_app_id_here
VIVO_APP_KEY=your_app_key_here
VIVO_CHAT_MODEL=Doubao-Seed-2.0-mini
VIVO_IMAGE_MODEL=Doubao-Seedream-4.5
PORT=3001
```

## API

- `GET /api/health`：服务与模型配置状态
- `POST /api/travel-guide`：生成攻略并通过 LBS 补全地点
- `POST /api/panorama-image`：生成并缓存旅行画卷
- `GET /api/generated/:file`：读取已缓存的生成图片

## 构建

```bash
npm run build
```

生成结果位于 `dist/`。
