import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  BrainCircuit, 
  Settings, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, isOpen, setIsOpen }) => {
  const { user, logout } = useAuth();
  const remembered = (() => {
    try {
      return !!localStorage.getItem('facecheck_admin_credentials');
    } catch {
      return false;
    }
  })();
  const avatarUrl = (user as any)?.avatarUri || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user?.name || 'Teacher') + '&background=0D8ABC&color=fff';
  
  const navItems = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { id: 'users', label: '学生管理', icon: Users },
    { id: 'attendance', label: '考勤日志', icon: History },
    { id: 'insights', label: 'AI 洞察', icon: BrainCircuit },
  ];

  const handleNav = (id: string) => {
    onNavigate(id);
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed top-0 left-0 z-30 h-full w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg">F</span>
            </div>
            FaceCheck
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Current User Card */}
        {user && (
          <div className="mx-4 mb-3 p-3 bg-slate-800 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3">
              <img
                src={avatarUrl}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover border border-slate-700"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">{user.name}</div>
                <div className="text-xs text-slate-400">{user.email || user.username}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded-full ${remembered ? 'bg-green-700 text-green-100' : 'bg-slate-700 text-slate-200'}`}>
                {remembered ? '已记住登录' : '未记住登录'}
              </span>
              <button
                onClick={() => handleNav('settings')}
                className="text-xs text-blue-300 hover:text-blue-200"
              >
                管理账户
              </button>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-slate-700 space-y-2">
          <button 
            onClick={() => handleNav('settings')}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors">
            <Settings size={20} />
            <span className="font-medium">设置</span>
          </button>
          <button 
            onClick={() => { logout(); setIsOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-xl transition-colors">
            <LogOut size={20} />
            <span className="font-medium">退出登录</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
