import { useProjectStore } from './store/projectStore'
import Home from './pages/Home'
import Editor from './pages/Editor'

export default function App() {
  const current = useProjectStore((s) => s.current)
  return current ? <Editor /> : <Home />
}
