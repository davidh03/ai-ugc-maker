import { BrowserRouter, NavLink, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import JobDetail from './pages/JobDetail';
import Generations from './pages/Generations';
function Shell({ children }) { return <div className="app-shell"><aside className="sidebar"><div className="brand"><span>ai</span> ugc maker</div><nav className="nav"><NavLink to="/">✦ &nbsp; Create</NavLink><NavLink to="/generations">◫ &nbsp; Generations</NavLink><NavLink to="/">▧ &nbsp; Assets</NavLink><NavLink to="/">⚙ &nbsp; Settings</NavLink></nav><div className="sidebar-footer"><span className="status-dot" />Local studio online</div></aside><main className="main">{children}</main></div>; }
export default function App() { return <BrowserRouter><Shell><Routes><Route path="/" element={<Home />} /><Route path="/generations" element={<Generations />} /><Route path="/jobs/:id" element={<JobDetail />} /></Routes></Shell></BrowserRouter>; }
