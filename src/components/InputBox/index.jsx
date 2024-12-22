import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { isFirefox, isMobile, isSafari, updateRefHeight } from '../../utils'
import { useTranslation } from 'react-i18next'
import { getUserConfig } from '../../config/index.mjs'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE_MB } from '../../utils/constants'
import { compressImage } from '../../utils/image-utils'

export function InputBox({ onSubmit, enabled, postMessage, reverseResizeDir, initialValue = '' }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const [imageContent, setImageContent] = useState(null)
  const [imageError, setImageError] = useState(null)
  const reverseDivRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const resizedRef = useRef(false)
  const [internalReverseResizeDir, setInternalReverseResizeDir] = useState(reverseResizeDir)

  useEffect(() => {
    setInternalReverseResizeDir(
      !isSafari() && !isFirefox() && !isMobile() ? internalReverseResizeDir : false,
    )
  }, [])

  const virtualInputRef = internalReverseResizeDir ? reverseDivRef : inputRef

  useEffect(() => {
    inputRef.current.focus()

    const onResizeY = () => {
      if (virtualInputRef.current.h !== virtualInputRef.current.offsetHeight) {
        virtualInputRef.current.h = virtualInputRef.current.offsetHeight
        if (!resizedRef.current) {
          resizedRef.current = true
          virtualInputRef.current.style.maxHeight = ''
        }
      }
    }
    virtualInputRef.current.h = virtualInputRef.current.offsetHeight
    virtualInputRef.current.addEventListener('mousemove', onResizeY)
  }, [])

  useEffect(() => {
    if (!resizedRef.current) {
      if (!internalReverseResizeDir) {
        updateRefHeight(inputRef)
        virtualInputRef.current.h = virtualInputRef.current.offsetHeight
        virtualInputRef.current.style.maxHeight = '160px'
      }
    }
  })

  useEffect(() => {
    if (enabled)
      getUserConfig().then((config) => {
        if (config.focusAfterAnswer) inputRef.current.focus()
      })
  }, [enabled])

  useEffect(() => {
    const handlePaste = async (e) => {
      const items = e.clipboardData.items
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile()
          if (blob) {
            await processImageFile(blob)
            break // 只处理第一个图片
          }
        }
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [])

  const processImageFile = async (file) => {
    // 检查文件大小
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_IMAGE_SIZE_MB) {
      setImageError(
        t('Image is too large. Maximum size is {{maxSize}} MB.', { maxSize: MAX_IMAGE_SIZE_MB }),
      )
      return
    }

    // 检查文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(t('Unsupported image type. Allowed types: {{types}}.', { 
        types: ALLOWED_IMAGE_TYPES.join(', ') 
      }))
      return
    }

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const img = new Image()
        img.onload = async () => {
          setImageContent(e.target.result)
          setImageError(null)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    } catch (error) {
      setImageError(t('Error processing image: {{error}}', { error: error.message }))
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    await processImageFile(file)
  }

  const handleRemoveImage = () => {
    setImageContent(null)
    setImageError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = '' // 重置文件输入
    }
  }

  const handleKeyDownOrClick = (e) => {
    e.stopPropagation()
    if (e.type === 'click' || (e.keyCode === 13 && e.shiftKey === false)) {
      e.preventDefault()
      if (enabled) {
        if (!value && !imageContent) return
        onSubmit({ text: value, image: imageContent }) // 传递图片内容
        setValue('')
        setImageContent(null)
        setImageError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      } else {
        postMessage({ stop: true })
      }
    }
  }

  return (
    <div className="input-box">
      <div
        ref={reverseDivRef}
        style={
          internalReverseResizeDir && {
            transform: 'rotateX(180deg)',
            resize: 'vertical',
            overflow: 'hidden',
            minHeight: '160px',
          }
        }
      >
        <textarea
          dir="auto"
          ref={inputRef}
          disabled={false}
          className="interact-input"
          style={
            internalReverseResizeDir
              ? { transform: 'rotateX(180deg)', resize: 'none' }
              : { resize: 'vertical', minHeight: '70px' }
          }
          placeholder={
            enabled
              ? t('Type your question here\nEnter to send, shift + enter to break line')
              : t('Type your question here\nEnter to stop generating\nShift + enter to break line')
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDownOrClick}
        />
        {imageContent && (
          <div className="image-preview">
            <img
              src={imageContent}
              alt="Upload Preview"
              style={{ maxWidth: '200px', maxHeight: '200px', margin: '10px 0' }}
            />
            <button onClick={handleRemoveImage} className="remove-image-btn">
              {t('Remove Image')}
            </button>
          </div>
        )}
        {imageError && (
          <div className="image-error" style={{ color: 'red', margin: '10px 0' }}>
            {imageError}
          </div>
        )}
      </div>
      <div className="input-actions">
        <input
          type="file"
          ref={fileInputRef}
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
        <button className="upload-image-button" onClick={() => fileInputRef.current.click()}>
          {t('Upload Image')}
        </button>
        <button
          className="submit-button"
          style={{
            backgroundColor: enabled ? '#30a14e' : '#cf222e',
          }}
          onClick={handleKeyDownOrClick}
        >
          {enabled ? t('Ask') : t('Stop')}
        </button>
      </div>
    </div>
  )
}

InputBox.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  enabled: PropTypes.bool.isRequired,
  reverseResizeDir: PropTypes.bool,
  postMessage: PropTypes.func.isRequired,
}

export default InputBox
