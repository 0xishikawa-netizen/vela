import { useMemo } from 'react'
import { snapToGrid } from '../lib/timeUtils'
import { SNAP_THRESHOLD } from '../lib/constants'
import type { Track } from '../lib/types'

export function useSnapPoints(tracks: Track[], currentTime: number): number[] {
  return useMemo(() => {
    const pts: number[] = [0, currentTime]
    for (const t of tracks) {
      for (const c of t.clips) {
        pts.push(c.timelineStart, c.timelineStart + c.timelineDuration)
      }
    }
    return pts
  }, [tracks, currentTime])
}

export function snapTime(value: number, points: number[]) {
  return snapToGrid(value, points, SNAP_THRESHOLD)
}
