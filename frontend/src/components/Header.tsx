import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/cards': 'My Cards',
  '/transactions': 'Transactions',
  '/transfer': 'Transfer Funds',
  '/profile': 'Profile',
};

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user } = useAuth();
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'DemoBank';
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <header className="bg-mc-card border-b border-mc-border px-4 md:px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-mc-muted hover:text-white transition-colors"
        >
          <Menu size={22} />
        </button>
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-xs text-mc-muted hidden md:block">
            {greeting}, {user?.firstName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 text-mc-muted hover:text-white transition-colors">
          <Bell size={20} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-mc-red rounded-full" />
        </button>
        <div className="w-9 h-9 rounded-full bg-mc-gradient flex items-center justify-center text-sm font-bold">
          {user?.firstName?.[0]}{user?.lastName?.[0]}
        </div>
      </div>
    </header>
  );
};

export default Header;
