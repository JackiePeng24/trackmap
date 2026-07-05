# 行迹 · AI 无限视觉漫游向导

行迹是一款基于 vivo AIGC 开放能力的旅行灵感产品。用户输入目的地后，系统会生成一帧类似 flipbook 的旅行视觉画册，并支持点击画面任意区域继续生成下一帧、周边 POI 与路线灵感。

## 核心能力

- 无限视觉画册：对齐初赛 PPT 的“意图-视觉-深入”模型，先生成目的地全景，再通过点击续帧深入。
- 低 UI 漫游：右上角可切换低 UI 模式，隐藏辅助面板，让规划过程更接近纯视觉浏览器。
- 视觉流帧栈：每次点击生成的局部画面会进入帧栈，可回看探索路径。
- 任意点击识别：点击画面任意位置后，会识别为城市区域并继续生成局部视觉特写。
- VLM 区域理解：`/api/area-insight` 会把当前地图图像交给 OpenAI-compatible VLM，识别点击区域后继续生成局部地图提示词、POI 关键词与路线参考。
- 多模式 POI：支持饮食、购物、住宿、交通四种模式。
- vivo POI 搜索：点击区域后，通过 vivo 地理编码 / POI 搜索补充周边单位、地址、类型和坐标。
- 路线参考：根据 AI 热点与点击区域 POI 生成一日路线与局部串联建议。
- 安全后端代理：AppKey 只保存在服务端 `.env`，不会打包到浏览器。
- GitHub Pages 静态演示：Pages 版本使用静态 SVG 地图兜底，保证公开链接可直接展示交互效果。
- 图片兜底策略：vivo 图片生成若触发内容策略或网络波动，会自动切换为内置 SVG 视觉地图，避免页面中断。

官方文档入口：https://aigc.vivo.com.cn/#/document/index?id=1746

本次实现参考该文档中列出的云端 API 能力范围：大模型、图片生成、视频生成和地理编码（POI 搜索）；当前项目落地了文本大模型规划、图片生成、POI 搜索三类能力，视频生成作为后续扩展。

## 本地运行

```powershell
cd "C:\Users\pointzu\Desktop\vivoai\复赛\trackmap-main"
npm install
npm run dev
```

访问：

- 前端：http://localhost:3002/
- 后端：http://localhost:3001/

`.env` 配置：

```dotenv
VIVO_APP_ID=your_app_id_here
VIVO_APP_KEY=your_app_key_here
VIVO_CHAT_MODEL=Doubao-Seed-2.0-mini
VIVO_IMAGE_MODEL=Doubao-Seedream-4.0
VLM_BASE_URL=https://llmapi.paratera.com
VLM_API_KEY=your_vlm_api_key_here
VLM_MODEL=Qwen3-VL-30B-A3B-Thinking
PORT=3001
```

## API

- `GET /api/health`：服务与模型配置状态。
- `POST /api/travel-guide`：调用 vivo 大模型生成目的地攻略、热点和路线。
- `POST /api/panorama-image`：调用 vivo 图片生成，生成视觉画册帧并缓存。
- `POST /api/area-insight`：接收点击坐标、模式和当前图片；优先调用 VLM 识别图像区域，再结合 vivo POI 搜索返回周边单位与路线参考。若 VLM 不可用，会自动降级为坐标区域识别 + POI 搜索。
- `GET /api/generated/:file`：读取服务端缓存的生成图片。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 或 `vivo-aigc-integration` 后，GitHub Actions 会使用：

```bash
GITHUB_PAGES=true VITE_STATIC_DEMO=true npm run build
```

生成静态演示版并部署到 GitHub Pages。静态版不会暴露 vivo AppKey，也不会调用服务端 API。
