export const getChatSystemPromptBase = async () => {
  return `You are a helpful, creative, clever, and very friendly assistant. You are familiar with various languages in the world.`
}

export const getCompletionPromptBase = async () => {
  return (
    `The following is a conversation with an AI assistant.` +
    `The assistant is helpful, creative, clever, and very friendly. The assistant is familiar with various languages in the world.\n\n` +
    `Human: Hello, who are you?\n` +
    `AI: I am an AI assistant. How can I help you today?\n`
  )
}

export const getCustomApiPromptBase = async () => {
  return `I am a helpful, creative, clever, and very friendly assistant. I am familiar with various languages in the world.`
}

export function setAbortController(port, onStop, onDisconnect) {
  const controller = new AbortController()
  const messageListener = (msg) => {
    if (msg.stop) {
      port.onMessage.removeListener(messageListener)
      console.debug('stop generating')
      port.postMessage({ done: true })
      controller.abort()
      if (onStop) onStop()
    }
  }
  port.onMessage.addListener(messageListener)

  const disconnectListener = () => {
    port.onDisconnect.removeListener(disconnectListener)
    console.debug('port disconnected')
    controller.abort()
    if (onDisconnect) onDisconnect()
  }
  port.onDisconnect.addListener(disconnectListener)

  const cleanController = () => {
    try {
      port.onMessage.removeListener(messageListener)
      port.onDisconnect.removeListener(disconnectListener)
    } catch (e) {
      // ignore
    }
  }

  return { controller, cleanController, messageListener, disconnectListener }
}

export function pushRecord(session, question, answer, imageContent = null) {
  const recordLength = session.conversationRecords.length
  let lastRecord = recordLength > 0 ? session.conversationRecords[recordLength - 1] : null

  // 检查最后一条记录是否未完成（没有答案）
  if (lastRecord && !lastRecord.answer) {
    // 更新最后一条记录
    lastRecord.answer = answer
    lastRecord.imageContent = imageContent || lastRecord.imageContent
  } else {
    // 添加新记录
    session.conversationRecords.push({
      question: question,
      answer: answer,
      imageContent: imageContent,
    })
  }

  // 限制历史记录长度
  const maxRecords = 10 // 可以根据需要调整
  if (session.conversationRecords.length > maxRecords) {
    session.conversationRecords.splice(0, session.conversationRecords.length - maxRecords)
  }
}
