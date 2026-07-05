import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 3001)
const VIVO_BASE_URL = 'https://api-ai.vivo.com.cn'
const VIVO_APP_ID = process.env.VIVO_APP_ID?.trim()
const VIVO_APP_KEY = process.env.VIVO_APP_KEY?.trim()
const CHAT_MODEL = process.env.VIVO_CHAT_MODEL?.trim() || 'Doubao-Seed-2.0-mini'
const IMAGE_MODEL = process.env.VIVO_IMAGE_MODEL?.trim() || 'Doubao-Seedream-4.5'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const generatedDir = path.join(__dirname, 'generated')

const guideCache = new Map()
const imageCache = new Map()

const hotspotPositions = [
  { x: 22, y: 36 },
  { x: 42, y: 58 },
  { x: 58, y: 33 },
  { x: 73, y: 56 },
  { x: 86, y: 42 }
]

const modeConfig = {
  shopping: { label: '购物', keyword: '购物中心', icon: '🛍️', color: '#f06d4f' },
  stay: { label: '住宿', keyword: '酒店', icon: '🏨', color: '#7f62d9' },
  transit: { label: '交通', keyword: '地铁站', icon: '🚇', color: '#2e7ecb' },
  food: { label: '饮食', keyword: '餐厅', icon: '🥢', color: '#d28a20' }
}

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/api/generated', express.static(generatedDir, {
  immutable: true,
  maxAge: '7d'
}))

function requireCredentials() {
  if (!VIVO_APP_ID || !VIVO_APP_KEY) {
    const error = new Error('vivo AIGC 凭据尚未配置')
    error.status = 503
    throw error
  }
}

function safeText(value, fallback = '', maxLength = 240) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return text ? text.slice(0, maxLength) : fallback
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function requestVivoJson(url, options = {}, {
  timeoutMs = 30000,
  retries = 1
} = {}) {
  requireCredentials()

  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${VIVO_APP_KEY}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: controller.signal
      })
      const text = await response.text()
      let payload

      try {
        payload = text ? JSON.parse(text) : {}
      } catch {
        payload = { message: text || '上游服务返回了无法解析的响应' }
      }

      const rateLimited = response.status === 429
        || payload?.code === 1003
        || payload?.msg === 429

      if (rateLimited && attempt < retries) {
        await sleep(900 * (attempt + 1))
        continue
      }

      if (!response.ok) {
        const error = new Error(payload?.message || payload?.msg || `vivo API 请求失败 (${response.status})`)
        error.status = response.status
        error.upstream = payload
        throw error
      }

      return payload
    } catch (error) {
      lastError = error
      if (error.name === 'AbortError') {
        lastError = new Error('vivo API 响应超时')
        lastError.status = 504
      }
      if (attempt < retries && !error.status) {
        await sleep(600 * (attempt + 1))
        continue
      }
      throw lastError
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError
}

function parseJsonObject(content) {
  if (typeof content !== 'string') {
    throw new Error('大模型没有返回文本内容')
  }

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1] || content
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')

  if (start < 0 || end <= start) {
    throw new Error('大模型没有返回有效 JSON')
  }

  return JSON.parse(source.slice(start, end + 1))
}

async function generateGuideWithVivo(destination, vibe) {
  const requestId = randomUUID()
  const url = new URL('/v1/chat/completions', VIVO_BASE_URL)
  url.searchParams.set('requestId', requestId)

  const systemPrompt = `你是“行迹”AI 2D 地图漫游设计师。请为用户生成真实、可执行、适合手绘平面地图呈现的一日旅行方案。
只返回 JSON 对象，不要 Markdown，不要解释。JSON 结构必须严格如下：
{
  "destination": "规范目的地名称",
  "subtitle": "12字以内主题",
  "overview": "80字以内概览",
  "accent": "#十六进制颜色",
  "quickFacts": [
    {"label": "地图风格", "value": "简短内容"},
    {"label": "建议时长", "value": "简短内容"},
    {"label": "推荐玩法", "value": "简短内容"}
  ],
  "hotspots": [
    {
      "title": "真实存在的地点名称",
      "category": "历史/自然/美食/艺术/城市/休闲之一",
      "description": "45字以内说明",
      "tags": ["标签1", "标签2"],
      "duration": "建议停留时长",
      "bestTime": "适合到访时段"
    }
  ],
  "itinerary": [
    {
      "time": "09:00",
      "title": "行程节点",
      "description": "35字以内行动建议",
      "hotspotTitle": "关联热点名称"
    }
  ],
  "panoramaPrompt": "用于文生图的中文提示词：2D平面地图、手绘线稿、浅米色纸张、正交俯视、建筑轮廓、绿色公园、红色主路线、蓝色道路、圆角标签、flipbook页面设计，不要真实摄影、不要3D、不要水印"
}
hotspots 必须恰好 5 个，itinerary 必须至少 5 个节点。`

  const userPrompt = `目的地：${destination}
偏好：${vibe || '综合地图漫游'}
请生成一份像城市手绘导览图一样的旅行方案，保留可点击探索的地图节点。`

  const payload = await requestVivoJson(url, {
    method: 'POST',
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      reasoning_effort: 'minimal',
      temperature: 0.72,
      max_tokens: 2600,
      stream: false
    })
  }, { timeoutMs: 45000, retries: 1 })

  const content = payload?.choices?.[0]?.message?.content
  return {
    rawGuide: parseJsonObject(content),
    usage: payload?.usage,
    requestId
  }
}

function normalizePoi(poi, index) {
  const location = safeText(poi?.location, '', 80)
  const [longitude, latitude] = location.split(',')
  return {
    id: poi?.nid || poi?.id || `poi-${index + 1}`,
    name: safeText(poi?.name, `推荐地点 ${index + 1}`, 80),
    address: safeText(poi?.address, '', 140),
    phone: safeText(poi?.phone, '', 60),
    typeName: safeText(poi?.typeName || poi?.type, '', 80),
    coordinates: longitude && latitude ? { longitude, latitude } : null
  }
}

async function searchPois(keywords, city, pageSize = 5) {
  const url = new URL('/search/geo', VIVO_BASE_URL)
  url.searchParams.set('keywords', keywords)
  url.searchParams.set('city', city)
  url.searchParams.set('page_num', '1')
  url.searchParams.set('page_size', String(pageSize))
  url.searchParams.set('requestId', randomUUID())

  const payload = await requestVivoJson(url, { method: 'GET' }, {
    timeoutMs: 12000,
    retries: 1
  })

  const pois = Array.isArray(payload?.pois) ? payload.pois : []
  return pois.map(normalizePoi)
}

const categoryIcons = {
  历史: '🏛️',
  自然: '🌿',
  美食: '🥢',
  艺术: '🎨',
  城市: '🌆',
  休闲: '✨'
}

async function enrichHotspots(rawHotspots, destination) {
  const hotspots = rawHotspots.slice(0, 5)
  const poiResults = await Promise.allSettled(
    hotspots.map(async (hotspot, index) => {
      await sleep(index * 100)
      const pois = await searchPois(safeText(hotspot.title, destination, 50), destination, 3)
      return pois[0] || null
    })
  )

  return hotspots.map((hotspot, index) => {
    const poi = poiResults[index]?.status === 'fulfilled' ? poiResults[index].value : null
    const category = safeText(hotspot.category, '城市', 10)

    return {
      id: poi?.id || `hotspot-${index + 1}`,
      ...hotspotPositions[index],
      title: safeText(hotspot.title, `${destination}地图节点`, 50),
      category,
      icon: categoryIcons[category] || '📍',
      description: safeText(hotspot.description, '适合放慢脚步继续探索。', 140),
      tags: Array.isArray(hotspot.tags)
        ? hotspot.tags.map(tag => safeText(tag, '', 16)).filter(Boolean).slice(0, 3)
        : [category],
      duration: safeText(hotspot.duration, '约 1 小时', 30),
      bestTime: safeText(hotspot.bestTime, '白天', 30),
      address: safeText(poi?.address, '', 120),
      phone: safeText(poi?.phone, '', 40),
      typeName: safeText(poi?.typeName, category, 60),
      coordinates: poi?.coordinates || null
    }
  })
}

function fallbackGuide(destination, vibe) {
  const names = ['城市地标', '历史街区', '在地风味', '绿地水岸', '夜游节点']
  const categories = ['城市', '历史', '美食', '自然', '休闲']
  const icons = ['🌆', '🏛️', '🥢', '🌿', '✨']

  return {
    destination,
    subtitle: vibe && vibe !== '全部' ? `${vibe}地图漫游` : '2D 地图漫游',
    overview: `以平面手绘地图的方式打开${destination}，点击任意区域继续生成局部地图与周边 POI。`,
    accent: '#f06d4f',
    quickFacts: [
      { label: '地图风格', value: '2D 手绘' },
      { label: '建议时长', value: '1 天' },
      { label: '推荐玩法', value: '点击扩展' }
    ],
    hotspots: names.map((name, index) => ({
      id: `fallback-${index + 1}`,
      ...hotspotPositions[index],
      title: `${destination}${name}`,
      category: categories[index],
      icon: icons[index],
      description: `围绕${name}展开城市地图探索。`,
      tags: ['地图', categories[index]],
      duration: '约 1 小时',
      bestTime: index === 4 ? '日落后' : '白天',
      address: '',
      phone: '',
      typeName: categories[index],
      coordinates: null
    })),
    itinerary: names.map((name, index) => ({
      time: `${String(9 + index * 2).padStart(2, '0')}:00`,
      title: `${destination}${name}`,
      description: '跟随地图节点移动，保留自由探索时间。',
      hotspotTitle: `${destination}${name}`
    })),
    panoramaPrompt: `${destination} 2D 平面旅行地图，手绘线稿，浅米色纸张，红色主轴路线，蓝色道路，绿色公园，圆角标签，flipbook 页面设计，不要真实摄影，不要3D，不要水印`
  }
}

async function normalizeGuide(rawGuide, destination, vibe) {
  const fallback = fallbackGuide(destination, vibe)
  const rawHotspots = Array.isArray(rawGuide?.hotspots) && rawGuide.hotspots.length
    ? rawGuide.hotspots
    : fallback.hotspots
  const hotspots = await enrichHotspots(rawHotspots, destination)

  while (hotspots.length < 5) {
    hotspots.push(fallback.hotspots[hotspots.length])
  }

  const itinerary = Array.isArray(rawGuide?.itinerary)
    ? rawGuide.itinerary.slice(0, 6).map((item, index) => ({
      time: safeText(item?.time, `${String(9 + index * 2).padStart(2, '0')}:00`, 12),
      title: safeText(item?.title, hotspots[index % hotspots.length].title, 60),
      description: safeText(item?.description, '沿着地图路线继续探索。', 120),
      hotspotTitle: safeText(item?.hotspotTitle, hotspots[index % hotspots.length].title, 60)
    }))
    : fallback.itinerary

  return {
    destination: safeText(rawGuide?.destination, destination, 40),
    subtitle: safeText(rawGuide?.subtitle, fallback.subtitle, 40),
    overview: safeText(rawGuide?.overview, fallback.overview, 180),
    accent: /^#[0-9a-f]{6}$/i.test(rawGuide?.accent) ? rawGuide.accent : fallback.accent,
    quickFacts: Array.isArray(rawGuide?.quickFacts)
      ? rawGuide.quickFacts.slice(0, 3).map((fact, index) => ({
        label: safeText(fact?.label, fallback.quickFacts[index]?.label || '旅行提示', 20),
        value: safeText(fact?.value, fallback.quickFacts[index]?.value || '自由探索', 30)
      }))
      : fallback.quickFacts,
    hotspots,
    itinerary,
    panoramaPrompt: safeText(rawGuide?.panoramaPrompt, fallback.panoramaPrompt, 600)
  }
}

function buildMapPrompt(destination, prompt, context = {}) {
  const focus = safeText(context?.focus, '城市中轴与周边街区', 80)
  const mode = modeConfig[context?.mode] || null
  const modePart = mode ? `当前探索模式：${mode.label}，突出${mode.keyword}、步行路径与周边单位。` : ''
  return `FLAT 2D MAP ONLY. Top-down illustrated city map infographic, not a photo.
The whole image must look like a hand drawn paper map / flipbook page:
- cream paper background, thin black linework, simple grey building blocks
- green park rectangles, blue road line, red main travel route
- rounded callout bubbles and a dark bottom caption bar
- orthographic top-down view, no sky, no cinematic lighting, no people close-up
- no realistic landmark photo, no 3D render, no panorama, no camera perspective
- no watermark, no logo, no large readable text

中文要求：只画 2D 平面地图，不要真实摄影，不要街景，不要建筑特写，不要透视大片。
目的地：${destination}
地图焦点：${focus}
${modePart}
补充语义：${prompt}`
}

async function generateMapImage(destination, prompt, context = {}) {
  const finalPrompt = buildMapPrompt(destination, prompt, context)
  const cacheKey = `${IMAGE_MODEL}:${destination}:${finalPrompt}`
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)

  const digest = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16)
  const fileName = `${digest}.jpg`
  const filePath = path.join(generatedDir, fileName)

  try {
    await access(filePath)
    const localUrl = `/api/generated/${fileName}`
    imageCache.set(cacheKey, localUrl)
    return localUrl
  } catch {
    // File does not exist yet; continue to vivo image generation.
  }

  const requestId = randomUUID()
  const url = new URL('/api/v1/image_generation', VIVO_BASE_URL)
  url.searchParams.set('module', 'aigc')
  url.searchParams.set('request_id', requestId)
  url.searchParams.set('system_time', String(Math.floor(Date.now() / 1000)))

  const payload = await requestVivoJson(url, {
    method: 'POST',
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: finalPrompt,
      parameters: {
        size: '2560x1440',
        sequential_image_generation: 'disabled'
      }
    })
  }, { timeoutMs: 90000, retries: 0 })

  if (payload?.code !== 0) {
    const error = new Error(payload?.message || '图片生成失败')
    error.status = payload?.code === 1003 ? 429 : 502
    error.upstream = payload
    throw error
  }

  const remoteUrl = payload?.data?.images?.[0]?.url || payload?.data?.image
  if (!remoteUrl) {
    throw new Error('图片生成成功，但没有返回图片地址')
  }

  const imageResponse = await fetch(remoteUrl, {
    signal: AbortSignal.timeout(30000)
  })
  if (!imageResponse.ok) {
    throw new Error('生成图片下载失败')
  }

  await mkdir(generatedDir, { recursive: true })
  await writeFile(filePath, Buffer.from(await imageResponse.arrayBuffer()))

  const localUrl = `/api/generated/${fileName}`
  imageCache.set(cacheKey, localUrl)
  return localUrl
}

function areaNameFromPoint(x = 50, y = 50) {
  const horizontal = x < 34 ? '西侧' : x > 66 ? '东侧' : '中轴'
  const vertical = y < 34 ? '北段' : y > 66 ? '南段' : '核心区'
  return `${horizontal}${vertical}`
}

async function buildAreaInsight(destination, click = {}, mode = 'food') {
  const config = modeConfig[mode] || modeConfig.food
  const x = Number.isFinite(Number(click.x)) ? Math.max(0, Math.min(100, Number(click.x))) : 50
  const y = Number.isFinite(Number(click.y)) ? Math.max(0, Math.min(100, Number(click.y))) : 50
  const areaTitle = areaNameFromPoint(x, y)
  const pois = await searchPois(config.keyword, destination, 8)

  const route = pois.slice(0, 4).map((poi, index) => ({
    order: index + 1,
    title: poi.name,
    description: index === 0
      ? `从${areaTitle}出发，优先确认最近的${config.label}点。`
      : `继续串联${config.label}备选点，按步行或公共交通调整。`
  }))

  return {
    area: {
      title: areaTitle,
      summary: `已根据点击位置识别为${destination}${areaTitle}，并用 vivo POI 搜索附近${config.label}单位。`,
      mode,
      modeLabel: config.label,
      icon: config.icon,
      x,
      y
    },
    pois,
    route,
    mapPrompt: `${destination}${areaTitle}${config.label}局部 2D 平面地图，突出${config.keyword}、道路、街区、公园和步行路线，手绘线稿，flipbook 设计`
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(VIVO_APP_ID && VIVO_APP_KEY),
    provider: 'vivo AIGC',
    appId: VIVO_APP_ID ? `${VIVO_APP_ID.slice(0, 4)}••••${VIVO_APP_ID.slice(-2)}` : null,
    models: {
      chat: CHAT_MODEL,
      image: IMAGE_MODEL,
      lbs: 'vivo 地理编码（POI 搜索）'
    }
  })
})

app.post('/api/travel-guide', async (req, res) => {
  const destination = safeText(req.body?.destination, '', 40)
  const vibe = safeText(req.body?.vibe, '综合地图漫游', 20)

  if (destination.length < 2) {
    return res.status(400).json({ error: '请输入至少两个字的目的地' })
  }

  const cacheKey = `${destination}:${vibe}:map-v2`
  if (guideCache.has(cacheKey)) {
    return res.json({ ...guideCache.get(cacheKey), cached: true })
  }

  try {
    const { rawGuide, usage, requestId } = await generateGuideWithVivo(destination, vibe)
    const guide = await normalizeGuide(rawGuide, destination, vibe)
    const result = { guide, source: 'vivo', requestId, usage, cached: false }
    guideCache.set(cacheKey, result)
    return res.json(result)
  } catch (error) {
    console.error('vivo 攻略生成失败:', error.message)
    return res.status(200).json({
      guide: fallbackGuide(destination, vibe),
      source: 'fallback',
      warning: 'AI 服务暂时繁忙，已切换为本地地图路线。',
      cached: false
    })
  }
})

app.post('/api/panorama-image', async (req, res) => {
  const destination = safeText(req.body?.destination, '', 40)
  const prompt = safeText(req.body?.prompt, '', 800)
  const context = typeof req.body?.context === 'object' && req.body.context ? req.body.context : {}

  if (!destination || !prompt) {
    return res.status(400).json({ error: '缺少目的地或地图提示词' })
  }

  try {
    const imageUrl = await generateMapImage(destination, prompt, context)
    return res.json({ imageUrl, source: 'vivo', model: IMAGE_MODEL })
  } catch (error) {
    console.error('vivo 地图图片生成失败:', error.message)
    return res.status(error.status || 502).json({
      error: error.message || 'AI 地图生成失败'
    })
  }
})

app.post('/api/area-insight', async (req, res) => {
  const destination = safeText(req.body?.destination, '', 40)
  const mode = safeText(req.body?.mode, 'food', 20)
  const click = typeof req.body?.click === 'object' && req.body.click ? req.body.click : {}

  if (destination.length < 2) {
    return res.status(400).json({ error: '缺少有效目的地' })
  }

  try {
    const insight = await buildAreaInsight(destination, click, mode)
    return res.json(insight)
  } catch (error) {
    console.error('区域 POI 识别失败:', error.message)
    const config = modeConfig[mode] || modeConfig.food
    const title = areaNameFromPoint(click.x, click.y)
    return res.status(200).json({
      area: {
        title,
        summary: `暂时无法实时检索 POI，已保留${config.label}探索提示。`,
        mode,
        modeLabel: config.label,
        icon: config.icon,
        x: click.x || 50,
        y: click.y || 50
      },
      pois: [],
      route: [],
      mapPrompt: `${destination}${title}${config.label}局部 2D 平面地图，手绘线稿，flipbook 设计`,
      warning: 'POI 服务暂时不可用'
    })
  }
})

app.use((error, _req, res, _next) => {
  console.error('服务异常:', error)
  res.status(error.status || 500).json({
    error: error.message || '服务暂时不可用'
  })
})

app.listen(PORT, () => {
  console.log(`行迹 API 服务运行在 http://localhost:${PORT}`)
  console.log(`vivo AIGC: ${VIVO_APP_ID && VIVO_APP_KEY ? '已配置' : '未配置'}`)
})
