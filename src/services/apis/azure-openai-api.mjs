import { getUserConfig } from '../../config/index.mjs'
import { pushRecord, setAbortController } from './shared.mjs'
import { fetchSSE } from '../../utils/fetch-sse.mjs'
import { isEmpty } from 'lodash-es'
import { getModelValue } from '../../utils/model-name-convert.mjs'

/**
 * @param {Runtime.Port} port
 * @param {string} question
 * @param {Session} session
 */
export async function generateAnswersWithAzureOpenaiApi(port, question, session) {
  const { controller, messageListener, disconnectListener } = setAbortController(port)
  const config = await getUserConfig()
  let model = getModelValue(session)
  if (!model) model = config.azureDeploymentName

  const prompt = []
  console.debug('session', session)

  // 处理图片输入
  const imageContent = session.imageContent ? session.imageContent : null
  console.debug('imageContent', imageContent)

  // 验证图片大小和类型
  if (imageContent) {
    try {
      const base64Data = imageContent.split(',')[1]
      const imageBuffer = Buffer.from(base64Data, 'base64')
      const imageSize = imageBuffer.length / (1024 * 1024) // 转换为 MB

      if (imageSize > 10) {
        throw new Error('Image size exceeds 10 MB')
      }
    } catch (error) {
      console.error('Image validation error:', error)
      pushRecord(port, {
        type: 'error',
        content: `图片验证错误：${error.message}`,
      })
      return
    }
  }

  // 添加历史对话记录（限制最大上下文长度，排除最后一条记录）
  const historicalRecords = session.conversationRecords.slice(
    -config.maxConversationContextLength,
    -1, // 排除最后一条记录
  )

  historicalRecords.forEach((record) => {
    if (record.question || record.imageContent) {
      prompt.push({
        role: 'user',
        content: record.imageContent
          ? record.question
            ? [
                { type: 'text', text: record.question },
                {
                  type: 'image_url',
                  image_url: {
                    url: record.imageContent,
                    detail: config.imageDetail || 'auto',
                  },
                },
              ]
            : [
                {
                  type: 'image_url',
                  image_url: {
                    url: record.imageContent,
                    detail: config.imageDetail || 'auto',
                  },
                },
              ]
          : record.question,
      })
    }
    if (record.answer) {
      prompt.push({ role: 'assistant', content: record.answer })
    }
  })
  console.debug('prompt before adding current question', prompt)

  // 添加当前问题
  const messageContent = imageContent
    ? [
        { type: 'text', text: question },
        {
          type: 'image_url',
          image_url: {
            url: imageContent,
            detail: config.imageDetail || 'auto',
          },
        },
      ]
    : question

  prompt.push({
    role: 'user',
    content: imageContent ? messageContent : question,
  })

  console.debug('prompt!!!!!!', prompt)

  let answer = ''
  await fetchSSE(
    `${config.azureEndpoint.replace(
      /\/$/,
      '',
    )}/openai/deployments/${model}/chat/completions?api-version=2024-02-01`,
    {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.azureApiKey,
      },
      body: JSON.stringify({
        messages: prompt,
        stream: true,
        max_tokens: config.maxResponseTokenLength,
        temperature: config.temperature,
      }),
      onMessage(message) {
        console.debug('sse message', message)
        let data
        try {
          data = JSON.parse(message)
        } catch (error) {
          console.debug('json error', error)
          return
        }
        if (
          data.choices &&
          data.choices.length > 0 &&
          data.choices[0] &&
          data.choices[0].delta &&
          'content' in data.choices[0].delta
        ) {
          answer += data.choices[0].delta.content
          port.postMessage({ answer: answer, done: false, session: null })
        }

        if (data.choices && data.choices.length > 0 && data.choices[0]?.finish_reason) {
          pushRecord(session, question, answer, imageContent)
          console.debug('conversation history', { content: session.conversationRecords })
          port.postMessage({ answer: null, done: true, session: session })
        }
      },
      async onStart() {},
      async onEnd() {
        port.postMessage({ done: true })
        port.onMessage.removeListener(messageListener)
        port.onDisconnect.removeListener(disconnectListener)
      },
      async onError(resp) {
        port.onMessage.removeListener(messageListener)
        port.onDisconnect.removeListener(disconnectListener)
        if (resp instanceof Error) throw resp
        const error = await resp.json().catch(() => ({}))
        throw new Error(
          !isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`,
        )
      },
    },
  )
}
