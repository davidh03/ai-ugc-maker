import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import JobDetail from './pages/JobDetail';

export default function App() {
  return (
    <BrowserRouter>
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '32px 24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#111',
        color: '#fff',
        minHeight: '100vh',
      }}>
        <h1 style={{ marginBottom: 24, fontSize: 24 }}>
          <span style={{ color: '#3b82f6' }}>ai</span>-ugc-maker
        </h1>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
