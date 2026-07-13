const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

function absoluteApiAssetUrl(value) {
  if (!value || typeof value !== 'string') return value
  if (!API_BASE_URL || !value.startsWith('/api/')) return value
  return `${API_BASE_URL}${value}`
}

function normalizeAssetUrls(payload) {
  if (Array.isArray(payload)) return payload.map(normalizeAssetUrls)
  if (!payload || typeof payload !== 'object') return payload
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [
    key,
    key === 'imageUrl' || key === 'photoUrl' ? absoluteApiAssetUrl(value) : normalizeAssetUrls(value)
  ]))
}

const modeConfig = {
  food: { label: '美食小吃', typeName: '餐饮' },
  stay: { label: '酒店旅馆', typeName: '住宿' },
  transit: { label: '交通站点', typeName: '交通' },
  shopping: { label: '商场购物', typeName: '购物' }
}

const mockPois = [
  { id: 'mock-eye', name: '天津之眼', type: 'landmark', typeName: '地标景点', address: '天津市河北区三岔河口永乐桥', lng: 117.1805, lat: 39.1538, icon: '🎡', duration: '60-90 分钟' },
  { id: 'mock-culture', name: '古文化街', type: 'landmark', typeName: '历史街区', address: '天津市南开区通北路', lng: 117.1925, lat: 39.1423, icon: '🏮', duration: '90-120 分钟' },
  { id: 'mock-italy', name: '意式风情区', type: 'landmark', typeName: '城市街区', address: '天津市河北区胜利路', lng: 117.2057, lat: 39.1357, icon: '🏛️', duration: '60-120 分钟' },
  { id: 'mock-station', name: '天津站', type: 'landmark', typeName: '交通枢纽', address: '天津市河北区新纬路', lng: 117.2108, lat: 39.1369, icon: '🚉', duration: '30-60 分钟' },
  { id: 'mock-five', name: '五大道', type: 'landmark', typeName: '历史建筑群', address: '天津市和平区重庆道', lng: 117.1992, lat: 39.1157, icon: '🏘️', duration: '90-150 分钟' }
]

function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  }).then(async response => {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = payload.detail ? `：${payload.detail}` : ''
      throw new Error(`${payload.error || payload.warning || `请求失败 (${response.status})`}${detail}`)
    }
    return normalizeAssetUrls(payload)
  })
}

function mockAround(centerPoi, mode = 'food') {
  const config = modeConfig[mode] || modeConfig.food
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 8
    const distance = 260 + index * 90
    return {
      id: `mock-around-${mode}-${index + 1}`,
      name: `${centerPoi.name}${config.label}${index + 1}`,
      type: mode,
      typeName: config.typeName,
      address: `${centerPoi.name}周边 ${index + 1} 号`,
      distance,
      bearing: Math.round((angle * 180) / Math.PI),
      lng: Number((Number(centerPoi.lng || 117.18) + Math.cos(angle) * 0.006).toFixed(6)),
      lat: Number((Number(centerPoi.lat || 39.15) + Math.sin(angle) * 0.004).toFixed(6)),
      duration: mode === 'food' ? '30-60 分钟' : '20-45 分钟'
    }
  })
}

export function fetchHealth() {
  if (STATIC_DEMO) {
    return Promise.resolve({
      ok: true,
      configured: false,
      provider: '静态演示',
      models: {
        chat: '后端代理: vivo chat',
        image: '后端代理: image generation',
        lbs: '后端代理: vivo POI search'
      }
    })
  }
  return request('/api/health')
}

export function fetchCityScene(keyword, vibe) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      city: keyword.includes('天津') ? '天津' : keyword,
      query: keyword,
      center: { lng: 117.200983, lat: 39.084158 },
      pois: mockPois,
      source: 'static'
    })
  }

  return request('/api/city-scene', {
    method: 'POST',
    body: JSON.stringify({ keyword, vibe })
  })
}

export function fetchPoiAround(city, centerPoi, mode) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      city,
      centerPoi,
      mode,
      pois: mockAround(centerPoi, mode),
      source: 'static'
    })
  }

  return request('/api/poi-around', {
    method: 'POST',
    body: JSON.stringify({ city, centerPoi, mode })
  })
}

export function generateLandmarkMarkerImage(city, poi) {
  return request('/api/landmark-marker-image', {
    method: 'POST',
    body: JSON.stringify({ city, poi })
  })
}

export function generateSceneImage(payload) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      imageUrl: null,
      source: 'css-fallback',
      prompt: '',
      error: '静态演示不调用图片生成模型'
    })
  }

  return request('/api/scene-image', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchPlaceDetail(city, place) {
  if (STATIC_DEMO) {
    return Promise.resolve({ place, source: 'static' })
  }

  return request('/api/place-detail', {
    method: 'POST',
    body: JSON.stringify({ city, place })
  })
}

export function generateRoutePlan(city, places) {
  if (STATIC_DEMO) {
    return Promise.resolve({
      city,
      steps: places.map((place, index) => ({
        order: index + 1,
        title: place.name,
        description: index === 0 ? '作为起点' : '按当前顺序继续前往'
      })),
      notes: ['静态演示路线仅供参考。']
    })
  }

  return request('/api/route-plan', {
    method: 'POST',
    body: JSON.stringify({ city, places })
  })
}

export function exploreMapArea(destination, click, mode, guide, imageUrl) {
  if (STATIC_DEMO) {
    return Promise.resolve({ area: { title: '点击区域', summary: '静态演示未调用 VLM。', x: 50, y: 50 }, pois: [] })
  }
  return request('/api/area-insight', {
    method: 'POST',
    body: JSON.stringify({ destination, click, mode, guide, imageUrl })
  })
}
