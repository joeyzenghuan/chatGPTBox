import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { isFirefox, isMobile, isSafari, updateRefHeight } from '../../utils'
import { useTranslation } from 'react-i18next'
import { getUserConfig } from '../../config/index.mjs'

export function InputBox({ onSubmit, enabled, postMessage, reverseResizeDir }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [imageContent, setImageContent] = useState(null)
  const [imageError, setImageError] = useState(null)
  const reverseDivRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const resizedRef = useRef(false)
  const [internalReverseResizeDir, setInternalReverseResizeDir] = useState(reverseResizeDir)

  const MAX_IMAGE_SIZE_MB = 10 // 最大图片大小
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    setImageError(null)

    if (!file) return

    // 检查文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError(t('Unsupported image type. Please upload JPEG, PNG, GIF, or WebP.'))
      return
    }

    // 检查文件大小
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > MAX_IMAGE_SIZE_MB) {
      setImageError(
        t('Image is too large. Maximum size is {{maxSize}} MB.', { maxSize: MAX_IMAGE_SIZE_MB }),
      )
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      // 压缩图片
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const maxWidth = 1024 // 最大宽度
        const maxHeight = 1024 // 最大高度
        let width = img.width
        let height = img.height

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width *= ratio
          height *= ratio
        }

        canvas.width = width
        canvas.height = height
        ctx.drawImage(img, 0, 0, width, height)

        const compressedImageContent = canvas.toDataURL(file.type, 0.7)
        setImageContent(compressedImageContent)
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setImageContent(null)
    setImageError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
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
