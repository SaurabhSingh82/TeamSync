import { useState } from 'react'

interface AvatarProps {
  name: string
  src?: string | null
  alt?: string
  className?: string
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

export function Avatar({
  name,
  src,
  alt = '',
  className = 'size-9',
}: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return (
    <span
      aria-label={alt || name}
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ${className}`}
      role="img"
      title={name}
    >
      {src && src !== failedSrc ? (
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
          src={src}
        />
      ) : (
        initials(name)
      )}
    </span>
  )
}
