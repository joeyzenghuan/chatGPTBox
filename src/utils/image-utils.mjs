export async function compressImage(img, compress = false, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
  // 如果不压缩，直接返回原图
  if (!compress) {
    return img.src
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let width = img.width
  let height = img.height

  // 计算缩放比例
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height)
    width *= ratio
    height *= ratio
  }

  canvas.width = width
  canvas.height = height
  ctx.drawImage(img, 0, 0, width, height)

  // 返回压缩后的图片 Data URL
  return canvas.toDataURL('image/jpeg', quality)
}

export function isValidImageType(file) {
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  return ALLOWED_IMAGE_TYPES.includes(file.type)
}

export function isValidImageSize(file, maxSizeMB = 10) {
  const fileSizeMB = file.size / (1024 * 1024)
  return fileSizeMB <= maxSizeMB
}
