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

  const systemPrompt = `你是“行迹”AI 漫游向导的旅行策划师。
请为用户生成真实、可执行、富有画面感的城市漫游方案。
只返回 JSON 对象，不要 Markdown，不要解释，不要虚构具体票价或营业时间。
JSON 结构必须严格为：
{
  "destination": "规范目的地名称",
  "subtitle": "12字以内的旅行主题",
  "overview": "60字以内概览",
  "accent": "#十六进制颜色",
  "quickFacts": [
    {"label": "最佳季节", "value": "简短内容"},
    {"label": "建议天数", "value": "简短内容"},
    {"label": "旅行节奏", "value": "简短内容"}
  ],
  "hotspots": [
    {
      "title": "真实存在的地点名称",
      "category": "历史/自然/美食/艺术/城市/休闲之一",
      "description": "40字以内，说明为何值得去",
      "tags": ["标签1", "标签2"],
      "duration": "建议停留时长",
      "bestTime": "适合到访时段"
    }
  ],
  "itinerary": [
    {
      "time": "09:00",
      "title": "行程节点",
      "description": "30字以内行动建议",
      "hotspotTitle": "关联热点名称"
    }
  ],
  "panoramaPrompt": "用于文生图的中文提示词，描述该目的地标志性景观融合成横向电影感旅行画卷，不出现文字和水印"
}
hotspots 必须恰好 5 个且覆盖不同体验；itinerary 必须为 5 个节点，并优先使用 hotspots 中的地点。`

  const userPrompt = `目的地：${destination}
偏好：${vibe || '综合漫游'}
请生成一天的沉浸式漫游方案。`

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

async function searchPoi(keywords, city) {
  const url = new URL('/search/geo', VIVO_BASE_URL)
  url.searchParams.set('keywords', keywords)
  url.searchParams.set('city', city)
  url.searchParams.set('page_num', '1')
  url.searchParams.set('page_size', '3')
  url.searchParams.set('requestId', randomUUID())

  const payload = await requestVivoJson(url, { method: 'GET' }, {
    timeoutMs: 12000,
    retries: 1
  })

  const pois = Array.isArray(payload?.pois) ? payload.pois : []
  if (!pois.length) return null

  const exact = pois.find(poi => safeText(poi.name).includes(keywords))
  return exact || pois[0]
}

const hotspotPositions = [
  { x: 20, y: 38 },
  { x: 39, y: 60 },
  { x: 58, y: 35 },
  { x: 73, y: 57 },
  { x: 87, y: 40 }
]

const categoryIcons = {
  历史: '🏛️',
  自然: '🌿',
  美食: '🥢',
  艺术: '🎨',
  城市: '🌆',
  休闲: '☕'
}

async function enrichHotspots(rawHotspots, destination) {
  const hotspots = rawHotspots.slice(0, 5)
  const poiResults = await Promise.allSettled(
    hotspots.map(async (hotspot, index) => {
      await sleep(index * 100)
      return searchPoi(safeText(hotspot.title, destination, 50), destination)
    })
  )

  return hotspots.map((hotspot, index) => {
    const poi = poiResults[index]?.status === 'fulfilled'
      ? poiResults[index].value
      : null
    const category = safeText(hotspot.category, '城市', 10)
    const location = safeText(poi?.location, '', 60)
    const [longitude, latitude] = location.split(',')

    return {
      id: poi?.nid || `hotspot-${index + 1}`,
      ...hotspotPositions[index],
      title: safeText(hotspot.title, `${destination}漫游点`, 50),
      category,
      icon: categoryIcons[category] || '📍',
      description: safeText(hotspot.description, '值得放慢脚步细细探索。', 120),
      tags: Array.isArray(hotspot.tags)
        ? hotspot.tags.map(tag => safeText(tag, '', 16)).filter(Boolean).slice(0, 3)
        : [category],
      duration: safeText(hotspot.duration, '约 1 小时', 30),
      bestTime: safeText(hotspot.bestTime, '白天', 30),
      address: safeText(poi?.address, '', 120),
      phone: safeText(poi?.phone, '', 40),
      typeName: safeText(poi?.typeName, category, 60),
      coordinates: longitude && latitude
        ? { longitude, latitude }
        : null
    }
  })
}

function fallbackGuide(destination, vibe) {
  const names = [
    `${destination}城市地标`,
    `${destination}历史街区`,
    `${destination}人气美食街`,
    `${destination}自然漫步道`,
    `${destination}夜游目的地`
  ]

  return {
    destination,
    subtitle: vibe && vibe !== '全部' ? `${vibe}主题漫游` : '在地灵感漫游',
    overview: `从城市地标到街巷烟火，用一天时间发现${destination}最有记忆点的风景。`,
    accent: '#ff7a59',
    quickFacts: [
      { label: '建议天数', value: '1—2 天' },
      { label: '旅行节奏', value: '轻松漫步' },
      { label: '路线方式', value: '公共交通' }
    ],
    hotspots: names.map((title, index) => ({
      id: `fallback-${index + 1}`,
      ...hotspotPositions[index],
      title,
      category: ['城市', '历史', '美食', '自然', '休闲'][index],
      icon: ['🌆', '🏛️', '🥢', '🌿', '✨'][index],
      description: `感受${destination}独特城市气质的精选漫游点。`,
      tags: ['精选', '漫游'],
      duration: '约 1 小时',
      bestTime: index === 4 ? '日落后' : '白天',
      address: '',
      phone: '',
      typeName: '',
      coordinates: null
    })),
    itinerary: names.map((title, index) => ({
      time: `${String(9 + index * 2).padStart(2, '0')}:00`,
      title,
      description: '跟随城市节奏，留出自由探索的时间。',
      hotspotTitle: title
    })),
    panoramaPrompt: `${destination}标志性城市风景与旅行地标融合的横向电影感画卷，真实摄影，层次丰富，自然光，不出现文字和水印`
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
      description: safeText(item?.description, '跟随路线继续探索。', 100),
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
        value: safeText(fact?.value, fallback.quickFacts[index]?.value || '自在探索', 30)
      }))
      : fallback.quickFacts,
    hotspots,
    itinerary,
    panoramaPrompt: safeText(
      rawGuide?.panoramaPrompt,
      fallback.panoramaPrompt,
      500
    )
  }
}

async function generatePanoramaImage(destination, prompt) {
  const cacheKey = `${IMAGE_MODEL}:${destination}:${prompt}`
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
    // 首次生成时文件不存在，继续请求 vivo 图片生成服务。
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
      prompt: `${prompt}。16:9超宽构图，空间层次清晰，适合作为可交互旅行全景背景。`,
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
  const vibe = safeText(req.body?.vibe, '综合漫游', 20)

  if (destination.length < 2) {
    return res.status(400).json({ error: '请输入至少两个字的目的地' })
  }

  const cacheKey = `${destination}:${vibe}`
  if (guideCache.has(cacheKey)) {
    return res.json({ ...guideCache.get(cacheKey), cached: true })
  }

  try {
    const { rawGuide, usage, requestId } = await generateGuideWithVivo(destination, vibe)
    const guide = await normalizeGuide(rawGuide, destination, vibe)
    const result = {
      guide,
      source: 'vivo',
      requestId,
      usage,
      cached: false
    }
    guideCache.set(cacheKey, result)
    return res.json(result)
  } catch (error) {
    console.error('vivo 攻略生成失败:', error.message)
    const guide = fallbackGuide(destination, vibe)
    return res.status(200).json({
      guide,
      source: 'fallback',
      warning: 'AI 服务暂时繁忙，已切换为本地体验路线。',
      cached: false
    })
  }
})

app.post('/api/panorama-image', async (req, res) => {
  const destination = safeText(req.body?.destination, '', 40)
  const prompt = safeText(req.body?.prompt, '', 500)

  if (!destination || !prompt) {
    return res.status(400).json({ error: '缺少目的地或画卷提示词' })
  }

  try {
    const imageUrl = await generatePanoramaImage(destination, prompt)
    return res.json({
      imageUrl,
      source: 'vivo',
      model: IMAGE_MODEL
    })
  } catch (error) {
    console.error('vivo 图片生成失败:', error.message)
    return res.status(error.status || 502).json({
      error: error.message || 'AI 画卷生成失败'
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
