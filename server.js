import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 3001)
const VIVO_BASE_URL = 'https://api-ai.vivo.com.cn'
const VIVO_APP_ID = process.env.VIVO_APP_ID?.trim()
const VIVO_APP_KEY = process.env.VIVO_APP_KEY?.trim()
const CHAT_MODEL = process.env.VIVO_CHAT_MODEL?.trim() || 'Doubao-Seed-2.0-mini'
const VLM_BASE_URL = (process.env.VLM_BASE_URL || process.env.API_BASE_URL || process.env.BASE_URL || 'https://llmapi.paratera.com').trim().replace(/\/+$/, '')
const VLM_API_KEY = (process.env.VLM_API_KEY || process.env.API_KEY || process.env.PARATERA_API_KEY || '').trim()
const VLM_MODEL = (process.env.VLM_MODEL || process.env.VIVO_VLM_MODEL || 'Qwen3-VL-30B-A3B-Thinking').trim()
const IMAGE_BASE_URL = (process.env.IMAGE_BASE_URL || VLM_BASE_URL).trim().replace(/\/+$/, '')
const IMAGE_API_KEY = (process.env.IMAGE_API_KEY || VLM_API_KEY).trim()
const IMAGE_MODEL = (process.env.IMAGE_MODEL || process.env.VIVO_IMAGE_MODEL || 'Doubao-Seedream-4.5').trim()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const generatedDir = path.join(__dirname, 'generated')

const guideCache = new Map()
const imageCache = new Map()
const imagePendingCache = new Map()
const landmarkReferenceCache = new Map()

const hotspotPositions = [
  { x: 22, y: 36 },
  { x: 42, y: 58 },
  { x: 58, y: 33 },
  { x: 73, y: 56 },
  { x: 86, y: 42 }
]

const modeConfig = {
  shopping: {
    label: '购物',
    keyword: '购物中心',
    queries: ['购物中心', '商场', '商业街', '百货', '奥特莱斯', '步行街'],
    include: /购物|商场|商城|商业|百货|步行街|奥特莱斯|市场|店|零售|广场/,
    icon: '🛍️',
    color: '#f06d4f'
  },
  stay: {
    label: '住宿',
    keyword: '酒店',
    queries: ['酒店', '宾馆', '民宿', '旅馆', '公寓酒店', '青年旅舍'],
    include: /酒店|宾馆|旅馆|住宿|民宿|客栈|公寓|旅舍|招待所/,
    icon: '🏨',
    color: '#7f62d9'
  },
  transit: {
    label: '交通',
    keyword: '地铁站',
    queries: ['地铁站', '公交站', '火车站', '汽车站', '停车场', '交通枢纽'],
    include: /地铁|公交|车站|火车|高铁|汽车站|交通|停车|码头|机场|枢纽/,
    icon: '🚇',
    color: '#2e7ecb'
  },
  food: {
    label: '饮食',
    keyword: '餐厅',
    queries: ['餐厅', '小吃', '美食', '咖啡', '火锅', '天津菜', '老字号'],
    include: /餐饮|餐厅|小吃|美食|咖啡|火锅|菜|面|饭|酒楼|饭店|茶|甜品|奶茶|烧烤|早点/,
    icon: '🥢',
    color: '#d28a20'
  }
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

  const systemPrompt = `你是“行迹”AI 无限视觉旅游规划设计师。请为用户生成真实、可执行、适合“全景视觉画册 + 可点击深入帧”呈现的一日旅行方案。
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
  "panoramaPrompt": "用于文生图的中文提示词：生成目的地城市全景纯视觉底图，真实感3D城市沙盘或等距鸟瞰视觉画册风格；体现真实地标、水系、街区肌理、建筑风格、地方文化和生活细节；明确要求无UI、无文字、无标签、无按钮、无搜索框、无定位图标、无路线、无卡片、无水印"
}
hotspots 必须恰好 5 个，itinerary 必须至少 5 个节点。`

  const userPrompt = `目的地：${destination}
偏好：${vibe || '综合地图漫游'}
请生成一份像“无限视觉旅游画册”一样的旅行方案，保留可点击探索的画面节点。`

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
    photoUrl: safeText(poi?.photoUrl || poi?.photos?.[0]?.url || poi?.photos?.[0], '', 300),
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
    subtitle: vibe && vibe !== '全部' ? `${vibe}视觉漫游` : '无限视觉画册',
    overview: `以全景插画与局部地图标注打开${destination}，点击任意区域继续生成下一帧特写与周边 POI。`,
    accent: '#f06d4f',
    quickFacts: [
      { label: '画面风格', value: '视觉画册' },
      { label: '建议时长', value: '1 天' },
      { label: '推荐玩法', value: '点击续帧' }
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
    panoramaPrompt: `${destination} AI漫游向导城市全景纯底图，16:9，高级产品概念图质量，真实感3D城市沙盘，等距鸟瞰视角，体现真实地标、水系、街区肌理、建筑风格和地方文化；自然出现行人、车辆、河流、桥梁、街边小店、绿地和生活细节；纯视觉底图，无UI、无文字、无标签、无按钮、无搜索框、无定位图标、无路线、无卡片、无水印`
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
      description: safeText(item?.description, '沿着视觉线索继续探索。', 120),
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

function cityLandmarkTarget(keyword, city) {
  const text = safeText(keyword, city, 80)
  const isDistrictScale = /区|县|镇|乡|街道|街区|景区|公园|广场|博物馆|古镇|古街|商圈|车站|机场|大学/.test(text)
  const isCityScale = text === city || text.includes(`${city}旅游`) || text.includes(`${city}景点`) || text.includes(`${city}攻略`)
  const municipality = ['北京', '上海', '天津', '重庆'].includes(city)

  if (isDistrictScale) return 10
  if (municipality && isCityScale) return 18
  if (isCityScale) return 16
  return 12
}

async function enrichCityLandmarks(city, keyword, guidePois) {
  const targetCount = cityLandmarkTarget(keyword, city)
  const pois = [...guidePois]
  const seen = new Set(pois.map(poi => safeText(poi.name, '', 80).replace(/\s+/g, '')))
  const pageSize = Math.min(20, Math.max(10, targetCount))
  const queries = [
    `${city} 著名景点`,
    `${city} 地标建筑`,
    `${city} 旅游景区`,
    `${city} 历史文化景点`,
    `${city} 博物馆 公园 观光`,
    `${safeText(keyword, city, 80)} 必去景点`
  ]

  const batches = await Promise.allSettled([
    ...queries.map(query => searchPois(query, city, pageSize))
  ])

  for (const batch of batches) {
    if (batch.status !== 'fulfilled') continue
    for (const rawPoi of batch.value) {
      const poi = publicPoi(rawPoi, pois.length, 'landmark')
      const key = safeText(poi.name, '', 80).replace(/\s+/g, '')
      if (!poi.lng || !poi.lat || seen.has(key)) continue
      seen.add(key)
      pois.push(poi)
      if (pois.length >= targetCount) return pois
    }
  }

  return pois
}

function buildMapPrompt(destination, prompt, context = {}) {
  const focus = safeText(context?.focus, '城市核心探索区域', 80)
  const mode = modeConfig[context?.mode] || null
  const modePart = mode
    ? `Current exploration theme: ${mode.label}. Express this only through natural city content such as restaurants, food stalls, shop windows, hotel silhouettes, transit entrances, vehicles, pedestrians, lighting, road rhythm, and local street life. Do not use icons, labels, pins, cards, text, or UI hints.`
    : 'Current exploration theme: general city travel discovery, expressed only through natural landmarks, streets, people, vehicles, water, bridges, greenery, and architectural details.'

  return `You are generating a pure visual base image for an AI travel visual-atlas product. The generated image is only a background canvas. The frontend will add all UI, hotspots, labels, text, route overlays, buttons, cards, and interactions later.

City and intent:
- City / destination: ${destination}
- Current exploration level: immersive city panorama or zoomed-in exploration background
- Explored object / focus: ${focus}
- User travel intent: ${prompt}
- ${modePart}

Core visual goal:
Create a high-end immersive city visual-atlas scene with strong real-city recognizability. The image must not look like a generic city. It should naturally reflect the destination's real landmarks, terrain or water system, street texture, architectural style, local cultural symbols, representative colors, and authentic travel atmosphere.

Style:
premium travel visual atlas, realistic but slightly poetic, isometric aerial city diorama, detailed architecture modeling, real material texture, cinematic composition, soft natural light, atmospheric perspective, warm but refined color palette, rich local life, high-end product concept art, ultra detailed, clean complete background.

Scene requirements:
1. The city structure should feel believable; major landmark relationships should be roughly reasonable.
2. Key landmarks should be recognizable and not randomly deformed.
3. The scene should contain life details: pedestrians, vehicles, bicycles, boats if there is water, street-side shops, green spaces, lights, benches, market stalls, riverbanks, bridges, plazas, or local cultural objects.
4. Exploration should be implied only through the image content itself: landmarks, street blocks, food stalls, bridges, museums, riversides, old town gates, local neighborhoods, natural scenery, crowd activities, light focus, and road composition.
5. Keep a 16:9 landscape composition suitable for a web app hero background and visual album cover. The central landmark or focus area should be clear, while surrounding areas remain rich and clickable for later exploration.
6. Reserve some natural visual breathing room near edges for future frontend overlay, but do not create blank template areas.

Absolute restrictions:
Do not generate any UI elements. Do not generate text. Do not generate labels. Do not generate buttons, search bars, information cards, map controls, legends, navigation bars, app frames, popups, route dashed lines, arrows, hotspot circles, location pins, POI icons, floating panels, title bars, captions, subtitles, watermarks, logos, readable signage, Chinese characters, English letters, numbers, random glyphs, fake characters, garbled text, pseudo-Chinese strokes, shop signs with readable or unreadable writing, or fake interface decorations.

Negative prompt:
no UI, no text, no labels, no letters, no numbers, no captions, no signage, no shop sign text, no random glyphs, no garbled text, no pseudo Chinese, no unreadable typography, no buttons, no search bar, no information card, no location marker, no map control, no route line, no popup, no app border, no interface panel, no readable signage, no generic city, no wrong landmark, no mixed-city landmarks, no cyberpunk, no futuristic sci-fi city, no childish cartoon, no low-resolution map collage, no plastic toy look, no messy composition, no random typography, no overexposure, no dark oppressive mood, no cheap illustration style.`
}

async function fetchLandmarkReference(city, poi) {
  const name = safeText(poi?.name, '', 80)
  const cacheKey = `${city}:${name}`
  if (!name) return null
  if (landmarkReferenceCache.has(cacheKey)) return landmarkReferenceCache.get(cacheKey)

  const reference = await (async () => {
    const candidates = [`${city}${name}`, name]
    for (const title of candidates) {
      try {
        const url = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
        const response = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'xingji-travel-guide/1.0' },
          signal: AbortSignal.timeout(5000)
        })
        if (!response.ok) continue
        const payload = await response.json()
        const extract = safeText(payload?.extract, '', 260)
        const imageUrl = safeText(payload?.thumbnail?.source || payload?.originalimage?.source || '', '', 300)
        if (extract || imageUrl) return { extract, imageUrl, source: 'wikipedia' }
      } catch {
        // Continue with the next candidate.
      }
    }

    return {
      extract: `${name} 位于 ${city}。地址线索：${safeText(poi?.address, '', 120)}。类型：${safeText(poi?.typeName, '地标景点', 80)}。`,
      imageUrl: safeText(poi?.photoUrl, '', 300),
      source: poi?.photoUrl ? 'poi-photo' : 'poi-text'
    }
  })()

  landmarkReferenceCache.set(cacheKey, reference)
  return reference
}

function buildMarkerPrompt(city, poi, reference = null) {
  return `为旅行地图生成一个“${safeText(poi?.name, '地标景点', 80)}”的地标建筑/景点小图。
城市：${city}
地点类型：${safeText(poi?.typeName || poi?.type, '地标景点', 80)}
地址线索：${safeText(poi?.address, '城市核心区域', 120)}
联网参考摘要：${safeText(reference?.extract, '无公开摘要时请严格依据地点名称、城市和地址线索生成。', 260)}
参考实景图链接线索：${safeText(reference?.imageUrl, '无', 300)}

画面要求：
- 正方形构图，主体必须占画面 75% 以上，是该地标或景点最有辨识度的建筑轮廓、入口牌楼、桥梁、塔楼、摩天轮、馆舍或代表性景观
- 像高级旅行手账贴纸、精致景点插画、轻微等距视角，边缘有轻微立体阴影
- 主体完整清楚，色彩和结构特征鲜明，适合放大显示在真实地图 Marker 上
- 背景干净，边缘留白，明亮高级，避免大面积空白
- 不要出现任何文字、乱码、伪中文、字母、数字、招牌文字、按钮、地图路线、定位图钉、UI 卡片、商标、水印`
}

function withPendingImage(cacheKey, producer) {
  if (imagePendingCache.has(cacheKey)) return imagePendingCache.get(cacheKey)
  const pending = Promise.resolve()
    .then(producer)
    .finally(() => imagePendingCache.delete(cacheKey))
  imagePendingCache.set(cacheKey, pending)
  return pending
}

async function generateLandmarkMarkerImage(city, poi) {
  const reference = await fetchLandmarkReference(city, poi)
  const prompt = buildMarkerPrompt(city, poi, reference)
  const cacheKey = `${IMAGE_MODEL}:marker-v3:${city}:${safeText(poi?.name, '', 80)}:${prompt}`
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)

  return withPendingImage(cacheKey, async () => {
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)

    const digest = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16)
    const fileName = `marker-${digest}.jpg`
    const filePath = path.join(generatedDir, fileName)

    try {
      await access(filePath)
      const localUrl = `/api/generated/${fileName}`
      imageCache.set(cacheKey, localUrl)
      return localUrl
    } catch {
      // Continue to generation.
    }

    const requestId = randomUUID()
    console.info(`[MARKER_IMAGE] request start model=${IMAGE_MODEL} requestId=${requestId} city=${city} poi=${safeText(poi?.name, '', 80)}`)
    const payload = await requestOpenAIJson(openAIImagesUrl(IMAGE_BASE_URL), IMAGE_API_KEY, {
      model: IMAGE_MODEL,
      prompt,
      size: '2048x2048',
      response_format: 'url',
      n: 1
    }, { timeoutMs: 120000 })

    const imageResult = Array.isArray(payload?.data) ? payload.data[0] : payload?.data?.images?.[0]
    const remoteUrl = imageResult?.url || payload?.data?.image || payload?.url
    const b64Json = imageResult?.b64_json || payload?.data?.b64_json || payload?.b64_json
    let imageBuffer

    if (b64Json) {
      imageBuffer = Buffer.from(b64Json, 'base64')
    } else if (typeof remoteUrl === 'string' && remoteUrl.startsWith('data:image/')) {
      imageBuffer = Buffer.from(remoteUrl.slice(remoteUrl.indexOf(',') + 1), 'base64')
    } else if (remoteUrl) {
      const imageResponse = await fetch(remoteUrl, { signal: AbortSignal.timeout(60000) })
      if (!imageResponse.ok) throw new Error(`Marker 图片下载失败 (${imageResponse.status})`)
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    } else {
      throw new Error('Marker 图片生成成功，但上游没有返回图片 url 或 b64_json')
    }

    await mkdir(generatedDir, { recursive: true })
    await writeFile(filePath, imageBuffer)
    const localUrl = `/api/generated/${fileName}`
    imageCache.set(cacheKey, localUrl)
    console.info(`[MARKER_IMAGE] request success model=${IMAGE_MODEL} requestId=${requestId} file=${fileName}`)
    return localUrl
  })
}

async function generateMapImage(destination, prompt, context = {}) {
  const finalPrompt = buildMapPrompt(destination, prompt, context)
  const cacheKey = `${IMAGE_MODEL}:${destination}:${finalPrompt}`
  if (imageCache.has(cacheKey)) {
    console.info(`[IMAGE] cache hit model=${IMAGE_MODEL} destination=${destination} focus=${safeText(context?.focus, '', 80)}`)
    return imageCache.get(cacheKey)
  }

  return withPendingImage(cacheKey, async () => {
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)

  const digest = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16)
  const fileName = `${digest}.jpg`
  const filePath = path.join(generatedDir, fileName)

  try {
    await access(filePath)
    const localUrl = `/api/generated/${fileName}`
    imageCache.set(cacheKey, localUrl)
    console.info(`[IMAGE] file cache hit model=${IMAGE_MODEL} destination=${destination} file=${fileName}`)
    return localUrl
  } catch {
    // File does not exist yet; continue to Paratera image generation.
  }

  const requestId = randomUUID()
  const startedAt = Date.now()
  console.info(`[IMAGE] request start provider=${IMAGE_BASE_URL} model=${IMAGE_MODEL} requestId=${requestId} destination=${destination} focus=${safeText(context?.focus, '', 80)}`)
  const imageBodies = [
    { model: IMAGE_MODEL, prompt: finalPrompt, size: '2560x1440', response_format: 'url', n: 1 },
    { model: IMAGE_MODEL, prompt: finalPrompt, size: '2048x2048', response_format: 'url', n: 1 },
    { model: IMAGE_MODEL, prompt: finalPrompt, n: 1 }
  ]
  let payload
  let lastImageError

  for (const [index, body] of imageBodies.entries()) {
    try {
      payload = await requestOpenAIJson(openAIImagesUrl(IMAGE_BASE_URL), IMAGE_API_KEY, body, { timeoutMs: 120000 })
      if (index > 0) {
        console.info(`[IMAGE] request retry success provider=${IMAGE_BASE_URL} model=${IMAGE_MODEL} requestId=${requestId} attempt=${index + 1}`)
      }
      break
    } catch (error) {
      lastImageError = error
      console.warn(`[IMAGE] request failed provider=${IMAGE_BASE_URL} model=${IMAGE_MODEL} requestId=${requestId} attempt=${index + 1} status=${error.status || 'n/a'} message=${error.message}`)
      if (!error.status || ![400, 404, 422].includes(error.status) || index === imageBodies.length - 1) {
        throw error
      }
    }
  }

  if (!payload) {
    throw lastImageError || new Error('图片生成失败')
  }

  const imageResult = Array.isArray(payload?.data) ? payload.data[0] : payload?.data?.images?.[0]
  const remoteUrl = imageResult?.url || payload?.data?.image || payload?.url
  const b64Json = imageResult?.b64_json || payload?.data?.b64_json || payload?.b64_json
  let imageBuffer

  if (b64Json) {
    imageBuffer = Buffer.from(b64Json, 'base64')
  } else if (typeof remoteUrl === 'string' && remoteUrl.startsWith('data:image/')) {
    const base64 = remoteUrl.slice(remoteUrl.indexOf(',') + 1)
    imageBuffer = Buffer.from(base64, 'base64')
  } else if (remoteUrl) {
    try {
      const imageResponse = await fetch(remoteUrl, {
        signal: AbortSignal.timeout(60000)
      })
      if (!imageResponse.ok) {
        throw new Error(`生成图片下载失败 (${imageResponse.status})`)
      }
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    } catch (downloadError) {
      imageCache.set(cacheKey, remoteUrl)
      console.warn(`[IMAGE] download skipped model=${IMAGE_MODEL} requestId=${requestId} message=${downloadError.message}; using remote url`)
      console.info(`[IMAGE] request success model=${IMAGE_MODEL} requestId=${requestId} ms=${Date.now() - startedAt} remoteUrl=true`)
      return remoteUrl
    }
  } else {
    const error = new Error('图片生成成功，但上游没有返回图片 url 或 b64_json')
    error.upstream = payload
    throw error
  }

  await mkdir(generatedDir, { recursive: true })
  await writeFile(filePath, imageBuffer)

  const localUrl = `/api/generated/${fileName}`
  imageCache.set(cacheKey, localUrl)
  console.info(`[IMAGE] request success model=${IMAGE_MODEL} requestId=${requestId} ms=${Date.now() - startedAt} file=${fileName}`)
  return localUrl
  })
}

function areaNameFromPoint(x = 50, y = 50) {
  const horizontal = x < 34 ? '西侧' : x > 66 ? '东侧' : '中轴'
  const vertical = y < 34 ? '北段' : y > 66 ? '南段' : '核心区'
  return `${horizontal}${vertical}`
}

function openAIChatUrl(baseUrl) {
  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`
}

function openAIImagesUrl(baseUrl) {
  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/images/generations`
    : `${baseUrl}/v1/images/generations`
}

async function requestOpenAIJson(url, apiKey, body, {
  timeoutMs = 90000
} = {}) {
  if (!apiKey) {
    const error = new Error('图片生成 API Key 未配置')
    error.status = 503
    throw error
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await response.text()
    let payload

    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { message: text || '上游返回了无法解析的响应' }
    }

    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || payload?.msg || `OpenAI-compatible request failed (${response.status})`)
      error.status = response.status
      error.upstream = payload
      throw error
    }

    return payload
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('图片生成响应超时')
      timeoutError.status = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function requestVlmJson(body, { timeoutMs = 45000 } = {}) {
  if (!VLM_API_KEY || !VLM_MODEL || VLM_MODEL.toLowerCase() === 'reserved') {
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(openAIChatUrl(VLM_BASE_URL), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await response.text()
    let payload

    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { message: text || 'VLM upstream returned an unreadable response' }
    }

    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `VLM request failed (${response.status})`)
      error.status = response.status
      error.upstream = payload
      throw error
    }

    return payload
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('VLM response timed out')
      timeoutError.status = 504
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function imageUrlToVisionUrl(imageUrl) {
  if (!imageUrl) return ''
  if (/^data:image\/(?!svg\+xml)/i.test(imageUrl)) return imageUrl
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl

  const match = imageUrl.match(/^\/api\/generated\/([^/?#]+)$/)
  if (!match) return ''

  const fileName = path.basename(match[1])
  const filePath = path.join(generatedDir, fileName)
  const buffer = await readFile(filePath)
  const ext = path.extname(fileName).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

async function analyzeMapRegionWithVivo({ destination, click, mode, imageUrl }) {
  if (!VLM_API_KEY || !VLM_MODEL || VLM_MODEL.toLowerCase() === 'reserved') {
    console.info(`[VLM] skipped model=${VLM_MODEL || 'unset'} reason=missing-api-key-or-reserved`)
    return null
  }

  const visionUrl = await imageUrlToVisionUrl(imageUrl).catch(error => {
    console.warn('VLM image loading degraded:', error.message)
    return ''
  })

  if (!visionUrl) {
    console.info(`[VLM] skipped model=${VLM_MODEL} reason=no-supported-image imageUrl=${imageUrl ? 'provided' : 'empty'}`)
    return null
  }

  const config = modeConfig[mode] || modeConfig.food
  const prompt = `你是旅行地图视觉识别助手。请识别用户点击的地图区域，并给出后续生图与路线参考。

目的地：${destination}
点击位置：x=${click.x}%, y=${click.y}%
当前模式：${config.label}

只返回 JSON，不要 Markdown。JSON 结构：
{
  "areaTitle": "点击区域的短名称，10字以内",
  "summary": "结合图片内容和点击位置说明该区域适合怎么玩，80字以内",
  "visualElements": ["图中可见元素1", "图中可见元素2"],
  "poiKeywords": ["用于POI搜索的关键词，优先与${config.label}相关"],
  "routeHints": ["路线建议1", "路线建议2", "路线建议3", "路线建议4"],
  "mapPrompt": "用于继续生成局部放大纯视觉底图的中文提示词：保持上一帧城市风格、光线、色彩和空间关系，突出点击对象或街区的真实建筑、道路、河岸、树木、人群活动和地方文化；明确禁止UI、文字、标签、按钮、卡片、定位图标、路线虚线、箭头和水印"
}`

  const requestId = randomUUID()
  const startedAt = Date.now()
  console.info(`[VLM] request start model=${VLM_MODEL} provider=${VLM_BASE_URL} requestId=${requestId} destination=${destination} click=${click.x},${click.y} mode=${mode}`)

  try {
    const payload = await requestVlmJson({
      model: VLM_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: visionUrl } },
            { type: 'text', text: prompt }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 900,
      stream: false
    })

    if (!payload) return null

    const content = payload?.choices?.[0]?.message?.content
    const parsed = parseJsonObject(content)
    console.info(`[VLM] request success model=${VLM_MODEL} requestId=${requestId} ms=${Date.now() - startedAt}`)
    return parsed
  } catch (error) {
    console.warn(`[VLM] request failed model=${VLM_MODEL} requestId=${requestId} status=${error.status || 'n/a'} message=${error.message}`)
    throw error
  }
}

async function buildAreaInsight(destination, click = {}, mode = 'food', imageUrl = '') {
  const config = modeConfig[mode] || modeConfig.food
  const x = Number.isFinite(Number(click.x)) ? Math.max(0, Math.min(100, Number(click.x))) : 50
  const y = Number.isFinite(Number(click.y)) ? Math.max(0, Math.min(100, Number(click.y))) : 50
  const normalizedClick = { x, y }
  let vlmWarning = ''
  const vlm = await analyzeMapRegionWithVivo({
    destination,
    click: normalizedClick,
    mode,
    imageUrl
  }).catch(error => {
    console.warn('VLM 区域识别降级:', error.message)
    vlmWarning = error.message || 'VLM unavailable'
    return null
  })

  const areaTitle = safeText(vlm?.areaTitle, areaNameFromPoint(x, y), 30)
  const poiKeyword = Array.isArray(vlm?.poiKeywords) && vlm.poiKeywords[0]
    ? safeText(vlm.poiKeywords[0], config.keyword, 40)
    : config.keyword
  let poiWarning = ''
  const pois = await searchPois(poiKeyword, destination, 8).catch(error => {
    console.warn('POI search degraded:', error.message)
    poiWarning = error.message || 'POI service unavailable'
    return []
  })

  const route = pois.slice(0, 4).map((poi, index) => ({
    order: index + 1,
    title: poi.name,
    description: vlm?.routeHints?.[index]
      ? safeText(vlm.routeHints[index], '', 120)
      : (index === 0
        ? `从${areaTitle}出发，优先确认最近的${config.label}点。`
        : `继续串联${config.label}备选点，按步行或公共交通调整。`)
  }))

  return {
    area: {
      title: areaTitle,
      summary: safeText(
        vlm?.summary,
        `已根据点击位置识别为${destination}${areaTitle}，并用 vivo POI 搜索附近${config.label}单位。`,
        180
      ),
      mode,
      modeLabel: config.label,
      icon: config.icon,
      visualElements: Array.isArray(vlm?.visualElements)
        ? vlm.visualElements.map(item => safeText(item, '', 24)).filter(Boolean).slice(0, 4)
        : [],
      x,
      y
    },
    pois,
    route,
    mapPrompt: safeText(
      vlm?.mapPrompt,
      `${destination}${areaTitle}${config.label}局部放大纯视觉底图，保持上一帧城市风格、光线、色彩和空间关系，从等距鸟瞰自然过渡到中景探索视角；突出真实建筑、道路、河岸、树木、店铺、人群活动和地方文化细节；纯底图，无UI、无文字、无标签、无按钮、无卡片、无定位图标、无路线虚线、无箭头、无水印`,
      700
    ),
    vlm: Boolean(vlm),
    vlmReserved: !VLM_API_KEY || VLM_MODEL.toLowerCase() === 'reserved',
    vlmModel: VLM_MODEL,
    vlmProvider: VLM_API_KEY ? VLM_BASE_URL : null,
    vlmWarning: vlmWarning || undefined,
    warning: poiWarning || undefined
  }
}

function guessCity(keyword) {
  const text = safeText(keyword, '天津', 60)
  const known = ['北京', '上海', '天津', '重庆', '杭州', '成都', '西安', '南京', '苏州', '广州', '深圳', '武汉', '长沙', '厦门', '泉州']
  return known.find(city => text.includes(city)) || text.replace(/一日游|夜景|小吃|旅行|旅游|攻略|路线/g, '').slice(0, 12) || '天津'
}

function poiToLngLat(poi) {
  const lng = Number(poi?.coordinates?.longitude ?? poi?.lng)
  const lat = Number(poi?.coordinates?.latitude ?? poi?.lat)
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
}

function publicPoi(poi, index, type = 'landmark') {
  const point = poiToLngLat(poi)
  return {
    id: poi?.id || `poi-${index + 1}`,
    name: safeText(poi?.name || poi?.title, `推荐地点 ${index + 1}`, 80),
    type,
    typeName: safeText(poi?.typeName || poi?.category || type, type, 80),
    address: safeText(poi?.address, '', 160),
    phone: safeText(poi?.phone, '', 60),
    lng: point?.lng,
    lat: point?.lat,
    photoUrl: safeText(poi?.photoUrl, '', 300),
    detail: safeText(poi?.detail || poi?.description || '', '', 240),
    icon: poi?.icon || '📍',
    duration: poi?.duration || '45-90 分钟'
  }
}

function poiDistanceMeters(centerPoi, poi) {
  const centerLng = Number(centerPoi?.lng)
  const centerLat = Number(centerPoi?.lat)
  const lng = Number(poi?.lng)
  const lat = Number(poi?.lat)
  if (!Number.isFinite(centerLng) || !Number.isFinite(centerLat) || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const toRad = value => (value * Math.PI) / 180
  const dLat = toRad(lat - centerLat)
  const dLng = toRad(lng - centerLng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centerLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function maxPoiDistance(mode) {
  if (mode === 'stay') return 6000
  if (mode === 'shopping') return 4500
  if (mode === 'transit') return 3000
  return 2800
}

async function searchModePois(city, centerPoi, mode) {
  const config = modeConfig[mode] || modeConfig.food
  const centerName = safeText(centerPoi?.name, city, 50)
  const centerAddress = safeText(centerPoi?.address, centerName, 80)
  const maxDistance = maxPoiDistance(mode)
  const queries = [
    ...config.queries.map(keyword => `${centerName} ${keyword}`),
    ...config.queries.map(keyword => `${centerAddress} ${keyword}`),
    ...config.queries.map(keyword => `${city} ${centerName} ${keyword}`)
  ]
  const batches = await Promise.allSettled(queries.map(query => searchPois(query, city, 12)))
  const seen = new Set()
  const publicPois = []

  for (const batch of batches) {
    if (batch.status !== 'fulfilled') continue
    for (const rawPoi of batch.value) {
      const item = publicPoi(rawPoi, publicPois.length, mode)
      const haystack = `${item.name} ${item.typeName} ${item.address}`
      if (!item.lng || !item.lat || !config.include.test(haystack)) continue
      const key = `${item.name}:${item.lng}:${item.lat}`
      if (seen.has(key)) continue
      seen.add(key)

      const distance = poiDistanceMeters(centerPoi, item)
      if (distance !== null) {
        const dx = Number(item.lng) - Number(centerPoi.lng)
        const dy = Number(item.lat) - Number(centerPoi.lat)
        item.bearing = Math.round((Math.atan2(dy, dx) * 180) / Math.PI)
        item.distance = distance
        if (distance > maxDistance) continue
      }
      item.duration = mode === 'stay' ? '过夜/休整' : mode === 'food' ? '45-90 分钟' : mode === 'transit' ? '10-30 分钟' : '30-90 分钟'
      item.reason = [
        item.address ? `地址：${item.address}` : '',
        item.phone ? `电话：${item.phone}` : '',
        item.distance ? `距离中心景点约 ${item.distance} 米` : '',
        item.typeName ? `类别：${item.typeName}` : ''
      ].filter(Boolean).join('；')
      publicPois.push(item)
    }
  }

  return publicPois
    .sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999))
    .slice(0, 12)
}

async function searchPlaceDetail(city, place) {
  const base = publicPoi(place, 0, place?.type || 'unit')
  const query = `${safeText(place?.name, '', 80)} ${safeText(place?.address, '', 80)}`.trim()
  const pois = query ? await searchPois(query, city, 10) : []
  const candidates = pois
    .map((poi, index) => {
      const item = publicPoi(poi, index, base.type)
      const distance = poiDistanceMeters(base, item)
      if (distance !== null) item.distance = distance
      return item
    })
    .filter(item => item.lng && item.lat)
    .sort((a, b) => (a.distance ?? 999999) - (b.distance ?? 999999))
  const best = candidates.find(item => !item.distance || item.distance < 1200) || candidates[0] || {}
  const merged = { ...base, ...Object.fromEntries(Object.entries(best).filter(([, value]) => value !== undefined && value !== '')) }
  merged.reason = [
    merged.address ? `位置：${merged.address}` : '',
    merged.distance ? `距离当前中心点约 ${merged.distance} 米` : '',
    merged.phone ? `电话：${merged.phone}` : '',
    merged.typeName ? `类型：${merged.typeName}` : ''
  ].filter(Boolean).join('；')
  merged.detailSource = candidates.length ? 'online-poi-search' : 'selected-poi'
  return merged
}

function scenePrompt({ sceneType, city, centerPoi, place, mode }) {
  const config = modeConfig[mode] || modeConfig.food
  if (sceneType === 'landmark-center') {
    const target = centerPoi || place || {}
    return `生成一张“${safeText(target.name, '中心景点', 80)}”的清晰地标建筑主视觉图。
城市：${city}
地点类型：${safeText(target.typeName || target.type, '地标景点', 40)}
要求：
- 主体必须是该景点最有辨识度的建筑、桥梁、塔楼、入口、摩天轮、馆舍或代表性景观
- 构图居中，主体完整，占画面主要区域
- 明亮、精致、旅行画册质感，适合覆盖在真实地图中心
- 不要出现任何文字、乱码、伪中文、字母、数字、招牌文字、按钮、地图路线、定位图钉、UI 卡片、商标、水印`
  }

  if (sceneType === 'place-detail') {
    const target = place || centerPoi || {}
    return `生成一张“${safeText(target.name, '旅行地点', 80)}”的精细旅游详情插画。
城市：${city}
地点类型：${safeText(target.typeName || target.type, '地点', 40)}
要求：
- 突出地点的视觉特征和游览氛围
- 风格与上一层保持一致
- 不要出现任何文字、乱码、伪中文、字母、数字、招牌文字
- 不要出现按钮
- 适合作为详情页主视觉背景`
  }

  return `生成一张以“${safeText(centerPoi?.name, '中心景点', 80)}”为中心的 2D 旅游视觉探索图。
城市：${city}
场景：${config.label}探索
要求：
- 画面中心突出 ${safeText(centerPoi?.name, '中心景点', 80)} 的代表性外观
- 周围留出空间，方便前端叠加美食、酒店、交通、购物等卡片
- 风格为年轻化旅行画册、明亮、干净、轻微等距视角
- 不要出现文字
- 不要出现乱码、伪中文、字母、数字或招牌文字
- 不要出现按钮
- 不要生成地图道路文字
- 不要生成真实地图标注
- 画面适合作为网页交互背景`
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(VIVO_APP_ID && VIVO_APP_KEY),
    provider: 'vivo AIGC',
    appId: VIVO_APP_ID ? `${VIVO_APP_ID.slice(0, 4)}••••${VIVO_APP_ID.slice(-2)}` : null,
    models: {
      chat: CHAT_MODEL,
      vlm: VLM_API_KEY ? VLM_MODEL : `${VLM_MODEL}（未配置 API Key）`,
      vlmProvider: VLM_API_KEY ? VLM_BASE_URL : null,
      image: IMAGE_MODEL,
      imageProvider: IMAGE_API_KEY ? IMAGE_BASE_URL : null,
      lbs: 'vivo 地理编码（POI 搜索）'
    }
  })
})

app.post('/api/city-scene', async (req, res) => {
  const keyword = safeText(req.body?.keyword || req.body?.destination, '', 80)
  const vibe = safeText(req.body?.vibe, '综合', 30)
  if (keyword.length < 2) {
    return res.status(400).json({ error: '请输入至少两个字的关键词' })
  }

  const city = guessCity(keyword)
  try {
    const { rawGuide } = await generateGuideWithVivo(city, vibe)
    const guide = await normalizeGuide(rawGuide, city, vibe)
    const guidePois = guide.hotspots.map((poi, index) => publicPoi(poi, index, 'landmark')).filter(poi => poi.lng && poi.lat)
    const pois = await enrichCityLandmarks(city, keyword, guidePois)
    if (!pois.length) throw new Error('未获得可用经纬度 POI')
    const center = pois.reduce((acc, poi) => ({ lng: acc.lng + poi.lng / pois.length, lat: acc.lat + poi.lat / pois.length }), { lng: 0, lat: 0 })
    return res.json({ city, query: keyword, center, pois, source: 'vivo' })
  } catch (error) {
    console.error('city-scene failed:', error.message)
    return res.status(502).json({
      error: '城市 POI 生成失败',
      detail: error.message || '未知错误',
      stage: 'city-scene'
    })
  }
})

app.post('/api/landmark-marker-image', async (req, res) => {
  const city = safeText(req.body?.city, '当前城市', 40)
  const poi = typeof req.body?.poi === 'object' && req.body.poi ? req.body.poi : null
  if (!poi?.name) {
    return res.status(400).json({ error: '缺少需要生成图片的 POI' })
  }

  try {
    const imageUrl = await generateLandmarkMarkerImage(city, poi)
    return res.json({ imageUrl, source: 'vivo-ai-marker' })
  } catch (error) {
    console.error('landmark-marker-image failed:', error.message)
    return res.status(502).json({
      error: '地标 Marker 生图失败',
      detail: error.message || '未知错误',
      stage: 'landmark-marker-image',
      poi: safeText(poi.name, '', 80)
    })
  }
})

app.post('/api/poi-around', async (req, res) => {
  const city = safeText(req.body?.city, '天津', 40)
  const mode = safeText(req.body?.mode, 'food', 20)
  const centerPoi = typeof req.body?.centerPoi === 'object' && req.body.centerPoi ? req.body.centerPoi : {}

  try {
    const publicPois = await searchModePois(city, centerPoi, mode)
    if (!publicPois.length) throw new Error('周边 POI 为空')
    return res.json({ city, centerPoi, mode, pois: publicPois, source: 'vivo' })
  } catch (error) {
    console.error('poi-around failed:', error.message)
    return res.status(502).json({
      error: '周边 POI 检索失败',
      detail: error.message || '未知错误',
      stage: 'poi-around',
      city,
      centerPoi,
      mode
    })
  }
})

app.post('/api/place-detail', async (req, res) => {
  const city = safeText(req.body?.city, '天津', 40)
  const place = typeof req.body?.place === 'object' && req.body.place ? req.body.place : {}
  if (!place?.name) {
    return res.status(400).json({ error: '缺少地点名称' })
  }

  try {
    const detail = await searchPlaceDetail(city, place)
    return res.json({ place: detail, source: detail.detailSource })
  } catch (error) {
    console.error('place-detail failed:', error.message)
    return res.status(502).json({
      error: '地点详情联网检索失败',
      detail: error.message || '未知错误',
      stage: 'place-detail',
      city,
      place
    })
  }
})

app.post('/api/scene-image', async (req, res) => {
  const city = safeText(req.body?.city, '', 40)
  const sceneType = safeText(req.body?.sceneType, 'poi-around', 30)
  const prompt = scenePrompt({
    sceneType,
    city,
    centerPoi: req.body?.centerPoi,
    place: req.body?.place,
    mode: req.body?.mode
  })

  try {
    const imageUrl = await generateMapImage(city || '旅行', prompt, {
      focus: req.body?.place?.name || req.body?.centerPoi?.name || sceneType,
      mode: req.body?.mode,
      sceneType
    })
    return res.json({ imageUrl, source: 'vivo-ai', prompt })
  } catch (error) {
    console.error('scene-image failed:', error.message)
    return res.status(502).json({
      error: 'AI 生图失败',
      detail: error.message || '未知错误',
      stage: 'scene-image',
      prompt
    })
  }
})

app.post('/api/route-plan', async (req, res) => {
  const city = safeText(req.body?.city, '当前城市', 40)
  const places = Array.isArray(req.body?.places) ? req.body.places : []
  const fallbackPlan = {
    city,
    title: `${city}${places.length}站旅行路线`,
    overview: places.length
      ? `按照当前行程草案串联 ${places.map(place => safeText(place?.name, '', 30)).filter(Boolean).join('、')}，建议根据实际交通和营业时间微调。`
      : '请先加入地点，再生成路线方案。',
    duration: places.length >= 5 ? '1日' : places.length >= 3 ? '半日-1日' : '2-4小时',
    transport: '步行/公共交通',
    steps: places.map((place, index) => ({
      order: index + 1,
      title: safeText(place?.name, `地点 ${index + 1}`, 80),
      description: index === 0 ? '作为出发点，确认交通方式。' : '按当前顺序前往，实际出行前核对距离与营业时间。',
      transport: index === 0 ? '出发前确认定位和开放状态' : '近距离步行，跨区优先公共交通或网约车'
    })),
    notes: [
      '路线根据已选地点顺序生成，可在行程抽屉里拖动式上移下移调整。',
      '跨区移动建议优先选择地铁、公交或网约车。',
      '热门景点请提前确认预约、闭馆日和夜间开放时间。',
      '餐饮点建议安排在午餐或晚餐时段，住宿点建议作为路线收尾或中途休整点。'
    ]
  }

  if (!places.length) return res.json(fallbackPlan)

  try {
    const requestId = randomUUID()
    const url = new URL('/v1/chat/completions', VIVO_BASE_URL)
    url.searchParams.set('requestId', requestId)
    const payload = await requestVivoJson(url, {
      method: 'POST',
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是旅行路线规划助手。只返回 JSON，不要 Markdown。字段：title, overview, duration, transport, steps, notes。steps 为数组，每项含 order,title,description,transport。notes 为注意事项数组。'
          },
          {
            role: 'user',
            content: `城市：${city}\n地点顺序：${places.map((place, index) => `${index + 1}. ${safeText(place?.name, '', 80)}（${safeText(place?.type, '地点', 30)}，${safeText(place?.address, '', 120)}，停留${safeText(place?.duration, '30-60分钟', 30)}）`).join('\n')}\n请生成清晰的路线信息、交通衔接和注意事项。`
          }
        ],
        reasoning_effort: 'minimal',
        temperature: 0.45,
        max_tokens: 1600,
        stream: false
      })
    }, { timeoutMs: 45000, retries: 1 })
    const raw = parseJsonObject(payload?.choices?.[0]?.message?.content)
    return res.json({
      city,
      title: safeText(raw?.title, fallbackPlan.title, 80),
      overview: safeText(raw?.overview, fallbackPlan.overview, 220),
      duration: safeText(raw?.duration, fallbackPlan.duration, 40),
      transport: safeText(raw?.transport, fallbackPlan.transport, 60),
      steps: Array.isArray(raw?.steps) && raw.steps.length
        ? raw.steps.slice(0, places.length).map((step, index) => ({
          order: Number(step?.order) || index + 1,
          title: safeText(step?.title, places[index]?.name || `地点 ${index + 1}`, 80),
          description: safeText(step?.description, fallbackPlan.steps[index]?.description || '按当前顺序前往。', 180),
          transport: safeText(step?.transport, fallbackPlan.steps[index]?.transport || '确认交通方式', 100)
        }))
        : fallbackPlan.steps,
      notes: Array.isArray(raw?.notes) && raw.notes.length
        ? raw.notes.slice(0, 6).map(note => safeText(note, '', 160)).filter(Boolean)
        : fallbackPlan.notes
    })
  } catch (error) {
    console.warn('route-plan fallback:', error.message)
    return res.json({ ...fallbackPlan, warning: error.message })
  }
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
      warning: 'AI 服务暂时繁忙，已切换为本地视觉路线。',
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
    return res.json({ imageUrl, source: 'paratera', model: IMAGE_MODEL, provider: IMAGE_BASE_URL })
  } catch (error) {
    console.error('Paratera 地图图片生成失败:', error.message)
    return res.status(error.status && error.status >= 400 ? error.status : 502).json({
      error: error.message || 'AI 地图生成失败',
      source: 'paratera',
      model: IMAGE_MODEL
    })
  }
})

app.post('/api/area-insight', async (req, res) => {
  const destination = safeText(req.body?.destination, '', 40)
  const mode = safeText(req.body?.mode, 'food', 20)
  const click = typeof req.body?.click === 'object' && req.body.click ? req.body.click : {}
  const imageUrl = safeText(req.body?.imageUrl, '', 1200)

  if (destination.length < 2) {
    return res.status(400).json({ error: '缺少有效目的地' })
  }

  try {
    const insight = await buildAreaInsight(destination, click, mode, imageUrl)
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
      mapPrompt: `${destination}${title}${config.label}局部放大纯视觉底图，真实感3D城市沙盘与高级旅行画册风格，突出建筑、道路、河流、桥梁、树木、广场、人群和生活细节；不生成任何UI、文字、标签、按钮、卡片、地图控件、定位点、路线、弹窗或水印`,
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
