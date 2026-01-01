import React, { useState } from 'react';

const SettingsPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500">Personalize your FaceCheck Admin experience.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Appearance</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
              <span className="text-slate-700">Theme</span>
              <select 
                value={theme} 
                onChange={(e) => setTheme(e.target.value as 'light'|'dark')}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-700"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Notifications</h2>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
              <span className="text-slate-700">Email notifications</span>
              <input 
                type="checkbox" 
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="h-5 w-5 accent-blue-600"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <p className="text-xs text-slate-500">
          This is a placeholder Settings screen. Extend with real preferences as needed.
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
