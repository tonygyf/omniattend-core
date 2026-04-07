import React, { Suspense, lazy, useState } from 'react';
import { Menu } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const UsersPage = lazy(() => import('./pages/Users'));
const AttendancePage = lazy(() => import('./pages/Attendance'));
const AiInsights = lazy(() => import('./pages/AiInsights'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const ClassroomPage = lazy(() => import('./pages/Classroom'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

interface ViewingClass {
  id: number;
  name: string;
}

// Inner component to handle routing that consumes AuthContext
const AppContent = () => {
  const { user, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authPage, setAuthPage] = useState<'login' | 'register'>('login');
  const [viewingClass, setViewingClass] = useState<ViewingClass | null>(null);

  if (isLoading) {
    return <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading...</div>;
  }

  // Auth Flow
  if (!user) {
    if (authPage === 'register') {
      return (
        <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading...</div>}>
          <Register onNavigateLogin={() => setAuthPage('login')} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<div className="h-screen flex items-center justify-center bg-slate-50 text-slate-400">Loading...</div>}>
        <Login onNavigateRegister={() => setAuthPage('register')} />
      </Suspense>
    );
  }

  // Protected App Flow
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'classrooms': 
        return <ClassroomPage onNavigateToClass={(id, name) => {
          setViewingClass({ id, name });
          setCurrentPage('users');
        }} />;
      case 'users': 
        return <UsersPage 
          classId={viewingClass?.id} 
          className={viewingClass?.name} 
          onNavigateBack={() => {
            setViewingClass(null);
            setCurrentPage('classrooms');
          }} 
        />;
      case 'attendance': return <AttendancePage />;
      case 'insights': return <AiInsights />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    setViewingClass(null); // Reset class view when changing main pages
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={handleNavigate} 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Mobile Header */}
        <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 font-bold text-lg text-slate-800 dark:text-white">
             <img src="/bluelogo.png" alt="FaceCheck logo light" className="w-6 h-6 object-contain dark:hidden" />
             <img src="/blacklogo.png" alt="FaceCheck logo dark" className="w-6 h-6 object-contain hidden dark:block" />
             FaceCheck
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <Menu size={24} />
          </button>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <ErrorBoundary>
              <Suspense fallback={<div className="h-40 flex items-center justify-center text-slate-500">页面加载中...</div>}>
                {renderPage()}
              </Suspense>
            </ErrorBoundary>
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
