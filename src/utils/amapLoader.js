let amapPromise = null
let loadSerial = 0

const AMAP_SCRIPT_SELECTOR = 'script[data-amap-jsapi="2.0"]'
const AMAP_LOAD_TIMEOUT = 18000

function maskKey(value) {
  if (!value) return ''
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}***${value.slice(-4)}`
}

function cleanupScript(script) {
  if (script?.parentNode) script.parentNode.removeChild(script)
}

function cleanupStaleScripts() {
  document.querySelectorAll(AMAP_SCRIPT_SELECTOR).forEach(cleanupScript)
}

function readConfig() {
  return {
    key: (import.meta.env.VITE_AMAP_JS_API_KEY || '').trim(),
    securityJsCode: (import.meta.env.VITE_AMAP_SECURITY_JSCODE || '').trim()
  }
}

export function getAmapDiagnostics() {
  const { key, securityJsCode } = readConfig()
  const scripts = Array.from(document.querySelectorAll(AMAP_SCRIPT_SELECTOR)).map(script => ({
    src: script.src.replace(/key=[^&]+/, 'key=***'),
    loaded: Boolean(window.AMap?.Map)
  }))

  return {
    keyConfigured: Boolean(key),
    keyPreview: maskKey(key),
    securityJsCodeConfigured: Boolean(securityJsCode),
    securityJsCodePreview: maskKey(securityJsCode),
    protocol: window.location.protocol,
    host: window.location.host,
    online: window.navigator.onLine,
    amapReady: Boolean(window.AMap?.Map),
    scripts
  }
}

export function loadAmap({ onStage } = {}) {
  if (window.AMap?.Map) {
    onStage?.('AMap 全局对象已存在')
    return Promise.resolve(window.AMap)
  }
  if (amapPromise) return amapPromise

  const { key, securityJsCode } = readConfig()

  if (!key) {
    return Promise.reject(new Error('VITE_AMAP_JS_API_KEY 未配置'))
  }

  if (!securityJsCode) {
    return Promise.reject(new Error('VITE_AMAP_SECURITY_JSCODE 未配置'))
  }

  onStage?.('写入 window._AMapSecurityConfig')
  window._AMapSecurityConfig = { securityJsCode }
  cleanupStaleScripts()

  amapPromise = new Promise((resolve, reject) => {
    const callbackName = `__xingjiAmapLoaded_${Date.now()}_${loadSerial += 1}`
    const script = document.createElement('script')
    const browserErrors = []
    let settled = false

    function finish(error, AMap) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('error', captureWindowError)
      window.removeEventListener('unhandledrejection', captureRejection)
      try {
        delete window[callbackName]
      } catch {
        window[callbackName] = undefined
      }

      if (error) {
        cleanupScript(script)
        amapPromise = null
        reject(error)
        return
      }

      resolve(AMap)
    }

    function diagnosticSuffix() {
      const recentErrors = browserErrors.slice(-3).join('；')
      return [
        `当前地址：${window.location.href}`,
        `浏览器在线状态：${window.navigator.onLine ? 'online' : 'offline'}`,
        recentErrors ? `浏览器错误：${recentErrors}` : ''
      ].filter(Boolean).join('；')
    }

    function captureWindowError(event) {
      const targetSrc = event.target?.src || ''
      if (targetSrc.includes('webapi.amap.com') || !targetSrc) {
        browserErrors.push(event.message || `脚本错误：${targetSrc}`)
      }
    }

    function captureRejection(event) {
      browserErrors.push(event.reason?.message || String(event.reason || 'Promise rejection'))
    }

    window[callbackName] = () => {
      onStage?.('高德 callback 已触发，校验 AMap.Map')
      if (window.AMap?.Map) finish(null, window.AMap)
      else finish(new Error(`高德 JS API 已回调，但未找到 AMap.Map。${diagnosticSuffix()}`))
    }

    const encodedKey = encodeURIComponent(key)
    const query = `v=2.0&key=${encodedKey}&callback=${callbackName}&plugin=AMap.Scale,AMap.ToolBar`
    const url = `https://webapi.amap.com/maps?${query}`

    const timer = setTimeout(() => {
      finish(new Error(`高德 JS API 加载超时。请检查 webapi.amap.com 可访问性、Key 的 Web 端来源白名单，以及安全密钥是否匹配。${diagnosticSuffix()}`))
    }, AMAP_LOAD_TIMEOUT)

    window.addEventListener('error', captureWindowError)
    window.addEventListener('unhandledrejection', captureRejection)

    script.dataset.amapJsapi = '2.0'
    script.async = true
    script.src = url
    script.onerror = () => {
      finish(new Error(`高德 JS API 脚本网络加载失败：${url.replace(/key=[^&]+/, 'key=***')}。${diagnosticSuffix()}`))
    }

    onStage?.('插入高德 JS API 2.0 脚本')
    document.head.appendChild(script)
  })

  return amapPromise
}
