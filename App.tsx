import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import AttendancePage from './pages/Attendance';
import AiInsights from './pages/AiInsights';
import Login from './pages/Login';
import Register from './pages/Register';

// Inner component to handle routing that consumes AuthContext
const AppContent = () => {
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authPage, setAuthPage] = useState<'login' | 'register'>('login');

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading...</div>;
  }

  // Auth Flow
  if (!user) {
    if (authPage === 'register') {
      return <Register onNavigateLogin={() => setAuthPage('login')} />;
    }
    return <Login onNavigateRegister={() => setAuthPage('register')} />;
  }

  // Protected App Flow
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'users': return <UsersPage />;
      case 'attendance': return <AttendancePage />;
      case 'insights': return <AiInsights />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={setCurrentPage} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Mobile Header */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 font-bold text-lg text-slate-800">
             <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-white text-xs">F</div>
             FaceCheck
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <Menu size={24} />
          </button>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {renderPage()}
          </div>
        </main>

      </div>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
