import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryListPage } from './pages/InventoryListPage';
import { SearchPage } from './pages/SearchPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { FloorPlanPage } from './pages/FloorPlanPage';
import { ShoppingListPage } from './pages/ShoppingListPage';
import { SettingsPage } from './pages/SettingsPage';
import { QuickAddModal } from './components/QuickAddModal';
import { ToastHost } from './components/Toast';
import { BackupFailureBanner } from './components/BackupFailureBanner';

const navItems: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Dashboard' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/search', label: 'Search' },
  { to: '/floor-plan', label: 'Floor plan' },
  { to: '/shopping', label: 'Shopping' },
  { to: '/settings', label: 'Settings' },
];

export function App() {
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target && target.isContentEditable) return;
      if (e.key === 'q' || e.key === 'n') {
        e.preventDefault();
        setQuickAddOpen(true);
      }
      if (e.key === 'Escape') setQuickAddOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Primary navigation">
        <h1>Sophie-keep</h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main>
        <BackupFailureBanner />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/inventory" element={<InventoryListPage />} />
          <Route path="/inventory/:id" element={<ItemDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/floor-plan" element={<FloorPlanPage />} />
          <Route path="/shopping" element={<ShoppingListPage />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="*" element={<div className="card">Page not found.</div>} />
        </Routes>
      </main>
      <button
        className="fab"
        aria-label="Quick-add item (press q)"
        onClick={() => setQuickAddOpen(true)}
      >
        +
      </button>
      {quickAddOpen ? <QuickAddModal onClose={() => setQuickAddOpen(false)} /> : null}
      <ToastHost />
    </div>
  );
}
