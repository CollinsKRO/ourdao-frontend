'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'

export interface VirtualizedListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  keyExtractor: (item: T, index: number) => string | number
  /** Item count above which virtualization / windowing engages. Default: 50 */
  threshold?: number
  /** Estimated height of a single item row in pixels. Default: 120 */
  itemHeight?: number
  /** Number of items to render above and below visible window. Default: 5 */
  overscan?: number
  /** Container max height in px or string. Default: 600 */
  maxHeight?: number | string
  className?: string
  listAriaLabel?: string
  role?: string
}

export function VirtualizedList<T>({
  items,
  renderItem,
  keyExtractor,
  threshold = 50,
  itemHeight = 120,
  overscan = 5,
  maxHeight,
  className = '',
  listAriaLabel,
  role = 'list',
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  const isVirtualized = items.length > threshold

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrollTop(containerRef.current.scrollTop)
    }
  }, [])

  useEffect(() => {
    if (!isVirtualized) return
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      if (container) {
        setContainerHeight(container.clientHeight || 600)
      }
    }

    updateHeight()
    container.addEventListener('scroll', handleScroll, { passive: true })

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateHeight)
      : null

    if (resizeObserver) {
      resizeObserver.observe(container)
    }

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
    }
  }, [isVirtualized, handleScroll])

  const { startIndex, endIndex, topPadding, bottomPadding } = useMemo(() => {
    if (!isVirtualized) {
      return { startIndex: 0, endIndex: items.length, topPadding: 0, bottomPadding: 0 }
    }

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const end = Math.min(items.length, start + visibleCount + overscan * 2)

    const top = start * itemHeight
    const bottom = Math.max(0, (items.length - end) * itemHeight)

    return {
      startIndex: start,
      endIndex: end,
      topPadding: top,
      bottomPadding: bottom,
    }
  }, [isVirtualized, items.length, scrollTop, itemHeight, overscan, containerHeight])

  // Below threshold: render clean DOM list directly without windowing container
  if (!isVirtualized) {
    return (
      <div
        role={role}
        aria-label={listAriaLabel}
        className={className}
        data-virtualized="false"
      >
        {items.map((item, idx) => (
          <div
            key={keyExtractor(item, idx)}
            role="listitem"
            aria-setsize={items.length}
            aria-posinset={idx + 1}
          >
            {renderItem(item, idx)}
          </div>
        ))}
      </div>
    )
  }

  const visibleItems = items.slice(startIndex, endIndex)

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={listAriaLabel}
      className={`overflow-y-auto ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
      data-virtualized="true"
      tabIndex={0}
    >
      <div style={{ height: topPadding, pointerEvents: 'none' }} aria-hidden="true" />
      {visibleItems.map((item, localIdx) => {
        const globalIdx = startIndex + localIdx
        return (
          <div
            key={keyExtractor(item, globalIdx)}
            role="listitem"
            aria-setsize={items.length}
            aria-posinset={globalIdx + 1}
            data-index={globalIdx}
          >
            {renderItem(item, globalIdx)}
          </div>
        )
      })}
      <div style={{ height: bottomPadding, pointerEvents: 'none' }} aria-hidden="true" />
    </div>
  )
}
