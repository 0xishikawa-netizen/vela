import TelopEditor from '../telop/TelopEditor'
import type { TelopClip } from '../../lib/types'
import { useProjectStore } from '../../store/projectStore'
import { useEditorStore } from '../../store/editorStore'

export default function TextPanel() {
  const current = useProjectStore((s) => s.current)
  const addClip = useProjectStore((s) => s.addClip)
  const currentTime = useEditorStore((s) => s.currentTime)

  if (!current) return null

  const telopTrack = current.tracks.find((t) => t.type === 'telop')

  const onAdd = (clip: Omit<TelopClip, 'id'>) => {
    if (!telopTrack) return
    addClip(telopTrack.id, { ...clip, timelineStart: currentTime })
  }

  return (
    <TelopEditor
      resolution={current.resolution}
      onAddToTimeline={(c) => onAdd({ ...c, timelineStart: currentTime })}
    />
  )
}
