import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CreditCard, ArrowLeftRight, History, User, X, LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/cards', icon: CreditCard, label: 'My Cards' },
  { to: '/transactions', icon: History, label: 'Transactions' },
  { to: '/transfer', icon: ArrowLeftRight, label: 'Transfer' },
  { to: '/profile', icon: User, label: 'Profile' },
];

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { user, logout } = useAuth();

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:relative z-30 inset-y-0 left-0 w-64
        bg-mc-card border-r border-mc-border flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between p-6 border-b border-mc-border">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-6">
              <div className="absolute left-0 w-6 h-6 rounded-full bg-mc-red opacity-90" />
              <div className="absolute right-0 w-6 h-6 rounded-full bg-mc-orange opacity-90" />
            </div>
            <span className="text-lg font-bold tracking-tight">DemoBank</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-mc-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                transition-all duration-200
                ${isActive
                  ? 'bg-gradient-to-r from-mc-red/20 to-mc-orange/20 text-white border border-mc-red/30'
                  : 'text-mc-muted hover:text-white hover:bg-mc-surface'
                }
              `}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-mc-border">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-mc-gradient flex items-center justify-center text-xs font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-mc-muted truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-2 w-full rounded-xl text-sm text-mc-muted hover:text-mc-red hover:bg-mc-red/10 transition-all duration-200"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
