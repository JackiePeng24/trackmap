import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'

dotenv.config()

const app = express()
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

app.use(cors())
app.use(express.json())

// 生成旅游指南API
app.post('/api/travel-guide', async (req, res) => {
  try {
    const { location } = req.body

    const prompt = `请为"${location}"生成一份旅游图解指南。

要求：
1. 返回JSON格式，包含一个cards数组
2. 每个card代表一页，包含：title(标题), subtitle(副标题), content(内容数组), tip(提示)
3. content数组每项包含：icon(emoji), title(小标题), description(描述), tags(标签数组)
4. 生成5-8页内容，涵盖：景点推荐、美食、文化体验、交通指南、实用信息等
5. 内容要生动有趣，符合本地特色

请只返回JSON，不要其他说明文字。`

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })

    const responseText = message.content[0].text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)

    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0])
      res.json(data)
    } else {
      throw new Error('无法解析AI返回的数据')
    }
  } catch (error) {
    console.error('AI API错误:', error)
    res.status(500).json({ error: '生成旅游指南失败' })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`API服务器运行在 http://localhost:${PORT}`)
})
