import React, { useState, useEffect } from 'react';
import { Moon, Sun, Database, Server, Smartphone, Copy, Check } from 'lucide-react';

const SettingsPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [copied, setCopied] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Initialize Theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(isDark ? 'dark' : 'light');
    if (isDark) document.documentElement.classList.add('dark');
  }, []);

  // Handle Theme Toggle
  const toggleTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Fetch System Health
  useEffect(() => {
    const checkHealth = async () => {
      setLoadingHealth(true);
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setHealthData(data);
        }
      } catch (e) {
        console.error("Health check failed", e);
      } finally {
        setLoadingHealth(false);
      }
    };
    checkHealth();
  }, []);

  const apiBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-worker-url.workers.dev';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiBaseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in dark:text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">设置</h1>
        <p className="text-slate-500 dark:text-slate-400">配置系统偏好与连接信息。</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        
        {/* 1. Appearance */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Sun className="w-5 h-5" /> 外观
          </h2>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-200">界面主题</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{theme === 'dark' ? '深色模式已启用' : '浅色模式已启用'}</p>
              </div>
            </div>
            <div className="flex bg-slate-200 dark:bg-slate-900 rounded-lg p-1">
              <button 
                onClick={() => toggleTheme('light')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${theme === 'light' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                浅色
              </button>
              <button 
                onClick={() => toggleTheme('dark')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
              >
                深色
              </button>
            </div>
          </div>
        </div>

        {/* 2. Android App Configuration */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5" /> Android 应用配置
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            在 Android 应用中使用此 Base URL 连接后端。
          </p>
          
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-300 break-all">
              {apiBaseUrl}
            </div>
            <button 
              onClick={copyToClipboard}
              className="p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-colors"
              title="复制地址"
            >
              {copied ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>
        </div>

        {/* 3. System Health & D1 Database */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Server className="w-5 h-5" /> 系统状态
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Database Status */}
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
              <div className="flex items-center gap-3 mb-2">
                <Database className="text-blue-500" size={20} />
                <span className="font-medium text-slate-700 dark:text-slate-200">D1 数据库</span>
              </div>
              {loadingHealth ? (
                <div className="animate-pulse h-4 bg-slate-200 rounded w-24"></div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${healthData?.database?.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-sm font-semibold capitalize text-slate-800 dark:text-white">
                      {healthData?.database?.status || '未知'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    记录数：{healthData?.database?.recordCount ?? '-'}
                  </p>
                </div>
              )}
            </div>

            {/* API Status */}
            <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
              <div className="flex items-center gap-3 mb-2">
                <Server className="text-purple-500" size={20} />
                <span className="font-medium text-slate-700 dark:text-slate-200">Worker API</span>
              </div>
              {loadingHealth ? (
                <div className="animate-pulse h-4 bg-slate-200 rounded w-24"></div>
              ) : (
                 <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                    <span className="text-sm font-semibold text-slate-800 dark:text-white">在线</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    环境：{healthData?.environment || 'Production'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsPage;
