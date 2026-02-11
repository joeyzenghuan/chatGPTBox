import { memo, useState } from 'react'
import { ChevronDownIcon, XCircleIcon, SyncIcon } from '@primer/octicons-react'
import CopyButton from '../CopyButton'
import ReadButton from '../ReadButton'
import PropTypes from 'prop-types'
import MarkdownRender from '../MarkdownRender/markdown.jsx'
import { useTranslation } from 'react-i18next'

function AnswerTitle({ descName }) {
  const { t } = useTranslation()

  return <p style="white-space: nowrap;">{descName ? `${descName}:` : t('Loading...')}</p>
}

AnswerTitle.propTypes = {
  descName: PropTypes.string,
}

export function ConversationItem({
  type,
  content,
  descName,
  onRetry,
  imageContent,
  reasoningSummary,
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false)

  const renderImageContent = () => {
    const images = Array.isArray(imageContent) ? imageContent : imageContent ? [imageContent] : []
    if (images.length === 0) return null
    return (
      <div className="conversation-image-preview">
        {images.map((img, idx) => (
          <img
            key={idx}
            src={img}
            alt={`Conversation Image ${idx + 1}`}
            style={{ maxWidth: '400px', maxHeight: '400px', margin: '10px 0' }}
          />
        ))}
      </div>
    )
  }

  switch (type) {
    case 'question':
      return (
        <div className={'chatgptbox-' + type} dir="auto">
          <div className="gpt-header">
            <p>{t('You')}:</p>
            <div className="gpt-util-group">
              <CopyButton contentFn={() => content.replace(/\n<hr\/>$/, '')} size={14} />
              <ReadButton contentFn={() => content} size={14} />
              {!collapsed ? (
                <span
                  title={t('Collapse')}
                  className="gpt-util-icon"
                  onClick={() => setCollapsed(true)}
                >
                  <XCircleIcon size={14} />
                </span>
              ) : (
                <span
                  title={t('Expand')}
                  className="gpt-util-icon"
                  onClick={() => setCollapsed(false)}
                >
                  <ChevronDownIcon size={14} />
                </span>
              )}
            </div>
          </div>
          {!collapsed && (
            <>
              <MarkdownRender>{content}</MarkdownRender>
              {renderImageContent()}
            </>
          )}
        </div>
      )
    case 'answer':
      return (
        <div className={'chatgptbox-' + type} dir="auto">
          <div className="gpt-header">
            <AnswerTitle descName={descName} />
            <div className="gpt-util-group">
              {onRetry && (
                <span title={t('Retry')} className="gpt-util-icon" onClick={onRetry}>
                  <SyncIcon size={14} />
                </span>
              )}
              {descName && (
                <CopyButton contentFn={() => content.replace(/\n<hr\/>$/, '')} size={14} />
              )}
              {descName && <ReadButton contentFn={() => content} size={14} />}
              {!collapsed ? (
                <span
                  title={t('Collapse')}
                  className="gpt-util-icon"
                  onClick={() => setCollapsed(true)}
                >
                  <XCircleIcon size={14} />
                </span>
              ) : (
                <span
                  title={t('Expand')}
                  className="gpt-util-icon"
                  onClick={() => setCollapsed(false)}
                >
                  <ChevronDownIcon size={14} />
                </span>
              )}
            </div>
          </div>
          {!collapsed && (
            <>
              {reasoningSummary && (
                <div className="chatgptbox-reasoning-summary">
                  <div
                    className="reasoning-header"
                    onClick={() => setReasoningCollapsed(!reasoningCollapsed)}
                  >
                    <span>
                      {reasoningCollapsed ? '\u25B6' : '\u25BC'} {t('Reasoning')}
                    </span>
                  </div>
                  {!reasoningCollapsed && (
                    <div className="reasoning-content">
                      <MarkdownRender>{reasoningSummary}</MarkdownRender>
                    </div>
                  )}
                </div>
              )}
              <MarkdownRender>{content}</MarkdownRender>
              {renderImageContent()}
            </>
          )}
        </div>
      )
    case 'error':
      return (
        <div className={'chatgptbox-' + type} dir="auto">
          <div className="gpt-header">
            <p>{t('Error')}:</p>
            <div className="gpt-util-group">
              {onRetry && (
                <span title={t('Retry')} className="gpt-util-icon" onClick={onRetry}>
                  <SyncIcon size={14} />
                </span>
              )}
              <CopyButton contentFn={() => content.replace(/\n<hr\/>$/, '')} size={14} />
              {!collapsed ? (
                <span
                  title={t('Collapse')}
                  className="gpt-util-icon"
                  onClick={() => setCollapsed(true)}
                >
                  <XCircleIcon size={14} />
                </span>
              ) : (
                <span
                  title={t('Expand')}
                  className="gpt-util-icon"
                  onClick={() => setCollapsed(false)}
                >
                  <ChevronDownIcon size={14} />
                </span>
              )}
            </div>
          </div>
          {!collapsed && (
            <>
              <MarkdownRender>{content}</MarkdownRender>
              {renderImageContent()}
            </>
          )}
        </div>
      )
  }
}

ConversationItem.propTypes = {
  type: PropTypes.oneOf(['question', 'answer', 'error']).isRequired,
  content: PropTypes.string.isRequired,
  descName: PropTypes.string,
  onRetry: PropTypes.func,
  imageContent: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
  reasoningSummary: PropTypes.string,
}

export default memo(ConversationItem)
