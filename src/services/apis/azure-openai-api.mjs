import { getUserConfig } from '../../config/index.mjs'
import { pushRecord, setAbortController } from './shared.mjs'
import { fetchSSE } from '../../utils/fetch-sse.mjs'
import { isEmpty } from 'lodash-es'
import { getModelValue } from '../../utils/model-name-convert.mjs'

/**
 * Build the message prompt array from session history and current question.
 * Shared between Chat Completions and Responses API paths.
 */
function normalizeImages(ic) {
  return Array.isArray(ic) ? ic : ic ? [ic] : []
}

function makeTextPart(text, apiType) {
  return apiType === 'responses' ? { type: 'input_text', text } : { type: 'text', text }
}

function makeImagePart(url, detail, apiType) {
  if (apiType === 'responses') {
    return { type: 'input_image', image_url: url, detail }
  }
  return { type: 'image_url', image_url: { url, detail } }
}

function buildAzurePrompt(session, question, config, apiType) {
  const prompt = []
  const imageContent = normalizeImages(session.imageContent)
  const detail = config.imageDetail || 'auto'

  const historicalRecords = session.conversationRecords.slice(
    -config.maxConversationContextLength,
    -1,
  )

  historicalRecords.forEach((record) => {
    const recordImages = normalizeImages(record.imageContent)
    if (record.question || recordImages.length > 0) {
      const content =
        recordImages.length > 0
          ? [
              ...(record.question ? [makeTextPart(record.question, apiType)] : []),
              ...recordImages.map((img) => makeImagePart(img, detail, apiType)),
            ]
          : record.question
      prompt.push({ role: 'user', content })
    }
    if (record.answer) {
      prompt.push({ role: 'assistant', content: record.answer })
    }
  })

  const messageContent =
    imageContent.length > 0
      ? [
          makeTextPart(question, apiType),
          ...imageContent.map((img) => makeImagePart(img, detail, apiType)),
        ]
      : question

  prompt.push({
    role: 'user',
    content: messageContent,
  })

  return { prompt, imageContent }
}

/**
 * Validate image content size.
 * @returns {string|null} error message or null if valid
 */
function validateImageContent(imageContent) {
  const images = normalizeImages(imageContent)
  if (images.length === 0) return null
  for (const img of images) {
    try {
      const base64Data = img.split(',')[1]
      const imageSize = (base64Data.length * 3) / 4 / (1024 * 1024)
      if (imageSize > 10) {
        return 'Image size exceeds 10 MB'
      }
    } catch (error) {
      return error.message
    }
  }
  return null
}

/**
 * Chat Completions API path
 */
async function generateWithChatCompletions(
  port,
  question,
  session,
  config,
  model,
  controller,
  messageListener,
  disconnectListener,
) {
  const { prompt, imageContent } = buildAzurePrompt(session, question, config, 'chat')

  const apiVersion = config.azureApiVersion || '2025-04-01-preview'
  const url = `${config.azureEndpoint.replace(
    /\/$/,
    '',
  )}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`

  const body = {
    messages: prompt,
    stream: true,
  }

  if (config.azureIsReasoningModel) {
    body.max_completion_tokens = config.maxResponseTokenLength
    body.reasoning_effort = config.azureReasoningEffort
  } else {
    body.max_tokens = config.maxResponseTokenLength
    body.temperature = config.temperature
  }

  let answer = ''
  await fetchSSE(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.azureApiKey,
    },
    body: JSON.stringify(body),
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
      throw new Error(!isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`)
    },
  })
}

/**
 * Responses API path
 */
async function generateWithResponsesApi(
  port,
  question,
  session,
  config,
  model,
  controller,
  messageListener,
  disconnectListener,
) {
  const { prompt, imageContent } = buildAzurePrompt(session, question, config, 'responses')

  const url = `${config.azureEndpoint.replace(/\/$/, '')}/openai/v1/responses`
  console.debug('Azure Responses API URL:', url)
  console.debug('Azure Responses API model:', model)
  console.debug('Azure Responses API config:', {
    azureApiType: config.azureApiType,
    azureEndpoint: config.azureEndpoint,
    azureIsReasoningModel: config.azureIsReasoningModel,
  })

  const body = {
    model: model,
    input: prompt,
    stream: true,
    max_output_tokens: config.maxResponseTokenLength,
  }

  if (config.azureIsReasoningModel) {
    const reasoning = { effort: config.azureReasoningEffort }
    if (config.azureShowReasoningSummary) {
      reasoning.summary = 'auto'
    }
    body.reasoning = reasoning
  }

  if (!config.azureIsReasoningModel || config.azureReasoningEffort === 'none') {
    body.temperature = config.temperature
  }

  let answer = ''
  let reasoningSummary = ''
  await fetchSSE(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.azureApiKey,
    },
    body: JSON.stringify(body),
    onMessage(message) {
      console.debug('sse message', message)
      let data
      try {
        data = JSON.parse(message)
      } catch (error) {
        console.debug('json error', error)
        return
      }

      if (data.type === 'response.output_text.delta' && data.delta) {
        answer += data.delta
        port.postMessage({ answer, reasoningSummary, done: false, session: null })
      }

      if (data.type === 'response.reasoning_summary_text.delta' && data.delta) {
        reasoningSummary += data.delta
        port.postMessage({ answer, reasoningSummary, done: false, session: null })
      }

      if (data.type === 'response.completed') {
        pushRecord(session, question, answer, imageContent)
        console.debug('conversation history', { content: session.conversationRecords })
        port.postMessage({ answer: null, reasoningSummary, done: true, session: session })
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
      throw new Error(!isEmpty(error) ? JSON.stringify(error) : `${resp.status} ${resp.statusText}`)
    },
  })
}

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

  console.debug('session', session)

  const imageContent = normalizeImages(session.imageContent)
  console.debug('imageContent', imageContent)

  const validationError = validateImageContent(imageContent)
  if (validationError) {
    console.error('Image validation error:', validationError)
    pushRecord(port, {
      type: 'error',
      content: `Image validation error: ${validationError}`,
    })
    return
  }

  if (config.azureApiType === 'responses') {
    await generateWithResponsesApi(
      port,
      question,
      session,
      config,
      model,
      controller,
      messageListener,
      disconnectListener,
    )
  } else {
    await generateWithChatCompletions(
      port,
      question,
      session,
      config,
      model,
      controller,
      messageListener,
      disconnectListener,
    )
  }
}
