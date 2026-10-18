import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { Footer } from './components/Footer'
import { Navbar } from './components/Navbar'
import { Empty } from './components/Status'
import { ExamPage } from './pages/ExamPage'
import { LevelPage } from './pages/LevelPage'
import { LoginPage } from './pages/LoginPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="layout">
          <Navbar />
          <main className="app">
          <Routes>
            <Route index element={<LevelPage />} />
            {/* Static route wins over :gradeId, so "login" can't be used as a grade id */}
            <Route path="login" element={<LoginPage />} />
            <Route path=":gradeId" element={<LevelPage />} />
            <Route path=":gradeId/:sectionId" element={<LevelPage />} />
            <Route path=":gradeId/:sectionId/:subjectId" element={<LevelPage />} />
            <Route path=":gradeId/:sectionId/:subjectId/:examId" element={<ExamPage />} />
            <Route path="*" element={<Empty>الصفحة غير موجودة</Empty>} />
          </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
