import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { motion, Variants } from 'framer-motion';
import { Users, UserCheck, Clock, UserX, RefreshCw } from 'lucide-react';
import { fetchDashboardStats, syncDataWithCloudflare } from '../services/dataService';
import { DashboardStats } from '../types';
import ErrorBoundary from '../components/ErrorBoundary';
import ClientOnly from '../components/ClientOnly';

type StatsRange = 'day' | 'month' | 'year' | 'all';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [statsRange, setStatsRange] = useState<StatsRange>(() => (localStorage.getItem('dashboard_stats_range') as StatsRange) || 'day');

  const [showChart, setShowChart] = useState(false);

  const loadStats = async (mounted: boolean) => {
    try {
      const data = await fetchDashboardStats(statsRange);
      if (mounted) {
        setStats(data);

        requestAnimationFrame(() => {
          if (mounted) setShowChart(true);
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (mounted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('dashboard_stats_range', statsRange);
  }, [statsRange]);

  useEffect(() => {
    let mounted = true;
    loadStats(mounted);
    return () => {
      mounted = false;
    };
  }, [statsRange]);

  const handleSync = async () => {
    setSyncing(true);
    await syncDataWithCloudflare();
    await loadStats(true); // Reload stats after sync
    setSyncing(false);
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-slate-500">正在加载仪表盘...</div>;
  }

  if (!stats) return null;

  // Calculate derived stats for trends
  const periodTotal = stats.presentToday + stats.lateToday + stats.absentToday;
  const attendanceRate = periodTotal > 0 ? Math.round((stats.presentToday / periodTotal) * 100) : 0;
  const lateChange = stats.lateToday - stats.lateYesterday;
  const rangeLabel = statsRange === 'day' ? '今日' : statsRange === 'month' ? '本月' : statsRange === 'year' ? '本年' : '总';
  const previousLabel = statsRange === 'day' ? '昨日' : statsRange === 'month' ? '上月' : statsRange === 'year' ? '去年' : '上一周期';
  const trendTitle = statsRange === 'day' ? '近 7 日签到任务趋势' : statsRange === 'month' ? '近 6 月签到任务趋势' : statsRange === 'year' ? '近 5 年签到任务趋势' : '历年签到任务趋势';
  const growthLabel = statsRange === 'day' ? '今日新增' : statsRange === 'month' ? '本月新增' : statsRange === 'year' ? '本年新增' : '累计新增';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">仪表盘概览</h1>
          <p className="text-slate-500">欢迎回来，今日概览如下。</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button onClick={() => setStatsRange('day')} className={`px-3 py-1 rounded-md text-sm font-medium ${statsRange === 'day' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>日</button>
            <button onClick={() => setStatsRange('month')} className={`px-3 py-1 rounded-md text-sm font-medium ${statsRange === 'month' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>月</button>
            <button onClick={() => setStatsRange('year')} className={`px-3 py-1 rounded-md text-sm font-medium ${statsRange === 'year' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>年</button>
            <button onClick={() => setStatsRange('all')} className={`px-3 py-1 rounded-md text-sm font-medium ${statsRange === 'all' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>总</button>
          </div>
          <button 
              onClick={handleSync}
              disabled={syncing}
              className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm ${syncing ? 'opacity-70' : ''}`}
          >
            <RefreshCw size={16} className={`${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '正在同步 D1...' : '同步数据'}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <StatCard 
            title="学生总数" 
            value={stats.totalUsers} 
            icon={Users} 
            variant="blue"
            trend={`${growthLabel} +${stats.newStudentsThisWeek}`}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title={`${rangeLabel}到勤`} 
            value={stats.presentToday} 
            icon={UserCheck} 
            variant="green"
            trend={`到勤率 ${attendanceRate}%`}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title={`${rangeLabel}迟到`} 
            value={stats.lateToday} 
            icon={Clock} 
            variant="amber"
            trend={lateChange !== 0 ? `较${previousLabel} ${lateChange > 0 ? '+' : ''}${lateChange}` : `较${previousLabel}持平`}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title={`${rangeLabel}缺勤`} 
            value={stats.absentToday} 
            icon={UserX} 
            variant="red"
            trend={stats.absentToday > 0 ? '需要关注' : '全员到齐'}
          />
        </motion.div>
      </motion.div>

      {/* Main Chart Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-lg font-semibold text-slate-800 mb-6">{trendTitle}</h2>
        <div className="h-80 w-full">
          {showChart && stats && (
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 300 }}>
              <BarChart data={stats.weeklyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="day" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]} 
                  barSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: number;
  icon: any;
  variant: 'blue' | 'green' | 'amber' | 'red';
  trend?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 120,
    },
  },
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, variant, trend }) => {
  const variants = {
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-600',
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-600',
    },
    amber: {
      bg: 'bg-amber-100',
      text: 'text-amber-600',
    },
    red: {
      bg: 'bg-red-100',
      text: 'text-red-600',
    },
  };

  const selectedVariant = variants[variant];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between hover:shadow-md transition-shadow">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
        {trend && <p className="text-xs text-slate-400 mt-2">{trend}</p>}
      </div>
      <div className={`p-3 rounded-xl ${selectedVariant.bg}`}>
        <Icon className={`w-6 h-6 ${selectedVariant.text}`} />
      </div>
    </div>
  );
};

export default Dashboard;
