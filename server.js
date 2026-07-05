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
const IMAGE_MODEL = process.env.VIVO_IMAGE_MODEL?.trim() || 'Doubao-Seedream-4.0'
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
  "panoramaPrompt": "用于文生图的中文提示词：目的地全景视觉画册、低UI、可点击热区、手绘旅行插画、局部地图标注、浅米色纸张、红色主路线、圆角标签、flipbook页面设计，不要水印"
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
    panoramaPrompt: `${destination} 全景视觉旅游画册，低 UI，手绘旅行插画，局部地图标注，浅米色纸张，红色主轴路线，蓝色道路，绿色公园，圆角标签，flipbook 页面设计，不要真实摄影，不要3D，不要水印`
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

function buildMapPrompt(destination, prompt, context = {}) {
  const focus = safeText(context?.focus, '城市中轴与周边街区', 80)
  const mode = modeConfig[context?.mode] || null
  const modePart = mode ? `探索模式：${mode.label}。画面中用精致 POI pin、小卡片标签和半透明路径线标出${mode.keyword}、步行路径与周边单位。` : ''
  return `High-end travel map product concept image, inspired by a polished city-map interface mockup.
Visual style: low-altitude isometric aerial view, miniature 3D city diorama, soft morning haze, river or road network composition, detailed but clean buildings, bridges, trees, plazas, water reflections when suitable, pastel warm lighting, premium UI overlay.
Interface layout: full-screen map canvas with floating translucent sidebar buttons, search bar, rounded POI labels, small location pins, zoom controls, and a subtle glassmorphism detail card area; keep the UI elegant and readable, like a modern travel app prototype.
Destination context: ${destination}.
Current frame focus: ${focus}.
${modePart}
Scene semantics: ${prompt}.
Composition requirements: 16:9 landscape, clear central landmark or clicked region, surrounding blocks remain explorable, route hints visible but not cluttered. Avoid screenshots of real apps, avoid watermarks, avoid messy text.`
}

async function generateMapImage(destination, prompt, context = {}) {
  const finalPrompt = buildMapPrompt(destination, prompt, context)
  const cacheKey = `${IMAGE_MODEL}:${destination}:${finalPrompt}`
  if (imageCache.has(cacheKey)) {
    console.info(`[IMAGE] cache hit model=${IMAGE_MODEL} destination=${destination} focus=${safeText(context?.focus, '', 80)}`)
    return imageCache.get(cacheKey)
  }

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
    // File does not exist yet; continue to vivo image generation.
  }

  const requestId = randomUUID()
  const startedAt = Date.now()
  console.info(`[IMAGE] request start model=${IMAGE_MODEL} requestId=${requestId} destination=${destination} focus=${safeText(context?.focus, '', 80)}`)
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
  }, { timeoutMs: 90000, retries: 1 })

  if (payload?.code !== 0) {
    const error = new Error(payload?.message || '图片生成失败')
    error.status = payload?.code === 1003 ? 429 : 502
    error.upstream = payload
    console.warn(`[IMAGE] request failed model=${IMAGE_MODEL} requestId=${requestId} code=${payload?.code} message=${error.message}`)
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
  console.info(`[IMAGE] request success model=${IMAGE_MODEL} requestId=${requestId} ms=${Date.now() - startedAt} file=${fileName}`)
  return localUrl
}

function areaNameFromPoint(x = 50, y = 50) {
  const horizontal = x < 34 ? '西侧' : x > 66 ? '东侧' : '中轴'
  const vertical = y < 34 ? '北段' : y > 66 ? '南段' : '核心区'
  return `${horizontal}${vertical}`
}

function fallbackMapDataUrl(destination, focus = '城市中轴', mode = 'food') {
  const config = modeConfig[mode] || modeConfig.food
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <defs>
      <pattern id="blocks" width="112" height="78" patternUnits="userSpaceOnUse">
        <rect x="10" y="10" width="44" height="20" rx="2" fill="none" stroke="#a6aaa2" stroke-width="2"/>
        <rect x="64" y="18" width="35" height="18" rx="2" fill="none" stroke="#b8bbb4" stroke-width="2"/>
        <path d="M0 64H112M104 0V78" stroke="#c9cbc3" stroke-width="2"/>
      </pattern>
    </defs>
    <rect width="1600" height="900" fill="#efeadd"/>
    <rect x="38" y="38" width="1524" height="824" rx="36" fill="#fbf7ec" stroke="#111" stroke-width="4"/>
    <rect x="38" y="38" width="1524" height="86" rx="36" fill="#fffdf6" stroke="#111" stroke-width="4"/>
    <circle cx="76" cy="82" r="11" fill="none" stroke="#c8c2b7" stroke-width="4"/>
    <circle cx="108" cy="82" r="11" fill="none" stroke="#c8c2b7" stroke-width="4"/>
    <circle cx="140" cy="82" r="11" fill="none" stroke="#c8c2b7" stroke-width="4"/>
    <rect x="180" y="58" width="520" height="46" rx="23" fill="#fffdf6" stroke="#111" stroke-width="3"/>
    <text x="205" y="88" font-family="monospace" font-size="22" font-weight="800" fill="#111">${destination} / ${focus}</text>
    <rect x="38" y="124" width="1524" height="682" fill="url(#blocks)"/>
    <rect x="620" y="155" width="360" height="596" fill="#cfe0c0" stroke="#7c986f" stroke-width="4"/>
    <rect x="690" y="232" width="220" height="128" fill="#ead4b3" stroke="#8c6d46" stroke-width="5"/>
    <rect x="665" y="520" width="270" height="145" fill="#e8dac1" stroke="#8c6d46" stroke-width="5"/>
    <path d="M790 156V752" stroke="#d94735" stroke-width="12"/>
    <path d="M120 476H1480" stroke="#2d79bd" stroke-width="8"/>
    <path d="M250 680C430 610 520 670 650 590C805 492 930 520 1110 420C1250 340 1350 360 1450 300" fill="none" stroke="#222" stroke-width="4" stroke-dasharray="12 10"/>
    <rect x="642" y="178" width="315" height="62" rx="10" fill="#fffdf6" stroke="#111" stroke-width="3"/>
    <text x="666" y="218" font-family="sans-serif" font-size="26" font-weight="900" fill="#111">2D Map Journey</text>
    <rect x="1020" y="266" width="260" height="58" rx="10" fill="#fffdf6" stroke="#111" stroke-width="3"/>
    <text x="1040" y="303" font-family="sans-serif" font-size="24" font-weight="900" fill="#111">${config.icon} ${config.label}</text>
    <circle cx="790" cy="476" r="58" fill="#fffdf6" stroke="#111" stroke-width="4"/>
    <circle cx="790" cy="476" r="20" fill="${config.color}"/>
    <rect x="1200" y="665" width="275" height="115" rx="14" fill="#fffdf6" stroke="#111" stroke-width="4"/>
    <text x="1230" y="705" font-family="sans-serif" font-size="25" font-weight="900" fill="#111">Legend</text>
    <circle cx="1240" cy="740" r="13" fill="${config.color}"/>
    <text x="1265" y="748" font-family="sans-serif" font-size="19" fill="#111">POI mode</text>
    <path d="M1230 765H1460" stroke="#2d79bd" stroke-width="6"/>
    <text x="1265" y="790" font-family="sans-serif" font-size="19" fill="#111">Route reference</text>
    <rect x="38" y="806" width="1524" height="56" fill="#222"/>
    <text x="504" y="842" font-family="sans-serif" font-size="24" font-weight="800" fill="#f7f3e8">Tap anywhere on the page to expand</text>
  </svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function openAIChatUrl(baseUrl) {
  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`
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
  "mapPrompt": "用于继续生成平面2D地图图片的中文提示词，突出点击区域、${config.label}、道路、建筑、标注和flipbook风格"
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
      `${destination}${areaTitle}${config.label}局部视觉特写，融合 2D 地图标注，突出${poiKeyword}、道路、街区、公园和步行路线，手绘线稿，flipbook 设计`,
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
    return res.json({ imageUrl, source: 'vivo', model: IMAGE_MODEL })
  } catch (error) {
    console.error('vivo 地图图片生成失败:', error.message)
    return res.status(200).json({
      imageUrl: fallbackMapDataUrl(destination, safeText(context.focus, '城市中轴', 40), safeText(context.mode, 'food', 20)),
      source: 'fallback-map',
      model: 'inline-svg',
      warning: error.message || 'AI 地图生成失败，已切换为 2D SVG 地图'
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
      mapPrompt: `${destination}${title}${config.label}局部视觉特写，融合 2D 地图标注，手绘线稿，flipbook 设计`,
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
