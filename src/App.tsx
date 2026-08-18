import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './App.css'
import './pdf/worker'
import { useRoute } from './routes/useRoute'
import SignerScreen from './screens/SignerScreen'
import AdminGate from './screens/AdminGate'
import AdminWorkspace from './screens/AdminWorkspace'

function App() {
  const route = useRoute()

  // Signers are never auth-gated: this branch returns before AdminGate, which
  // preserves the original ordering.
  if (route.kind === 'signer') {
    return <SignerScreen templateId={route.templateId} />
  }

  return <AdminGate>{(currentUser) => <AdminWorkspace currentUser={currentUser} />}</AdminGate>
}

export default App
