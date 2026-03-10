import React, { useEffect, useState, useMemo } from 'react'
import { fetchAttendanceAnalysis } from '../services/dataService'
import { generateAttendanceInsights } from '../services/geminiService'
import { StudentAttendanceAnalysis } from '../types'
import { useAuth } from '../context/AuthContext'
import { Loader2, AlertTriangle, ArrowUpDown, Sparkles, Bot } from 'lucide-react'
import { motion } from 'framer-motion'

type SortKey = keyof StudentAttendanceAnalysis | 'attendanceRate'

const AiInsightsPage: React.FC = () => {
  const [analysis, setAnalysis] = useState<StudentAttendanceAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortConfig, setSortConfig] = useState<{
    key: SortKey
    direction: 'asc' | 'desc'
  }>({ key: 'absentCount', direction: 'desc' })

  const [insights, setInsights] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const auth = useAuth()

  useEffect(() => {
    if (auth.user?.id) {
      loadAnalysis(auth.user.id)
    }
  }, [auth.user?.id])

  const loadAnalysis = async (teacherId: number) => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchAttendanceAnalysis(teacherId)
      setAnalysis(data)
    } catch (err) {
      console.error(err)
      setError('无法加载考勤分析数据，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }

  const generateInsights = async () => {
    setGenerating(true)
    try {
      const stats = {
        totalUsers: analysis.length,
        presentToday: analysis.reduce((sum, s) => sum + s.presentCount, 0),
        lateToday: analysis.reduce((sum, s) => sum + s.lateCount, 0),
        absentToday: analysis.reduce((sum, s) => sum + s.absentCount, 0),
        weeklyTrend: []
      }
      const result = await generateAttendanceInsights(stats, [])
      setInsights(result)
    } catch (e) {
      console.error(e)
      setInsights('生成洞察失败，请检查 Gemini API 配置。')
    }
    setGenerating(false)
  }

  const sortedAnalysis = useMemo(() => {
    const items = [...analysis]

    items.sort((a, b) => {
      const aValue =
        sortConfig.key === 'attendanceRate'
          ? a.totalSessions
            ? a.presentCount / a.totalSessions
            : 0
          : (a as any)[sortConfig.key]

      const bValue =
        sortConfig.key === 'attendanceRate'
          ? b.totalSessions
            ? b.presentCount / b.totalSessions
            : 0
          : (b as any)[sortConfig.key]

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    return items
  }, [analysis, sortConfig])

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'desc'

    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc'
    }

    setSortConfig({ key, direction })
  }

  const atRiskStudents = useMemo(() => {
    return analysis.filter(
      s => s.absentCount > 3 || s.lateCount > 5
    )
  }, [analysis])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >

      {/* Header */}

      <div className="text-center">
        <div className="inline-flex items-center justify-center p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-2">
          <Sparkles className="text-white w-8 h-8" />
        </div>

        <h1 className="text-3xl font-bold text-slate-900">
          智能考勤洞察
        </h1>

        <p className="text-slate-500 mt-1 max-w-xl mx-auto">
          基于历史数据，自动识别考勤模式与风险学生。
        </p>
      </div>

      {/* AI Card */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white p-6 rounded-2xl shadow-lg"
      >

        <div className="flex items-center gap-3 mb-3">
          <Bot className="w-6 h-6" />
          <h2 className="text-lg font-semibold">
            AI 智能洞察
          </h2>
        </div>

        {insights ? (
          <pre className="text-sm whitespace-pre-wrap font-sans">
            {insights}
          </pre>
        ) : (
          <button
            onClick={generateInsights}
            disabled={generating || loading}
            className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
          >
            {generating
              ? <Loader2 className="animate-spin w-4 h-4" />
              : <Sparkles className="w-4 h-4" />
            }

            {generating ? '正在生成...' : '生成考勤洞察'}
          </button>
        )}

      </motion.div>

      {/* Risk Students */}

      {atRiskStudents.length > 0 && (

        <div>

          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="text-red-500" />
            高风险学生 ({atRiskStudents.length})
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {atRiskStudents.slice(0,3).map(student => (

              <motion.div
                key={student.studentId}
                initial={{ opacity:0, y:10 }}
                animate={{ opacity:1, y:0 }}
                className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm"
              >

                <div className="flex justify-between">

                  <span className="font-semibold text-red-900">
                    {student.studentName}
                  </span>

                  <AlertTriangle className="w-4 h-4 text-red-400" />

                </div>

                <div className="text-sm text-slate-600 mt-2">
                  缺勤 {student.absentCount} 次
                </div>

                <div className="text-sm text-slate-600">
                  迟到 {student.lateCount} 次
                </div>

              </motion.div>

            ))}

          </div>

        </div>

      )}

      {/* Table */}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-slate-800">
            全体学生考勤分析
          </h2>
        </div>

        {loading ? (

          <div className="flex h-60 items-center justify-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2"/>
            正在加载数据...
          </div>

        ) : error ? (

          <div className="flex h-60 items-center justify-center text-red-500">
            <AlertTriangle className="w-6 h-6 mr-2"/>
            {error}
          </div>

        ) : (

          <div className="overflow-x-auto max-h-[500px]">

            <table className="w-full text-left text-sm">

              <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">

                <tr>

                  <th className="px-6 py-4 font-semibold">学生</th>

                  {[
                    ['totalSessions','总次数'],
                    ['presentCount','出勤'],
                    ['lateCount','迟到'],
                    ['absentCount','缺勤'],
                    ['attendanceRate','出勤率']
                  ].map(([key,label]) => (

                    <th key={key} className="px-6 py-4 font-semibold">

                      <div
                        className="flex items-center gap-1 cursor-pointer"
                        onClick={() => requestSort(key as SortKey)}
                      >

                        {label}
                        <ArrowUpDown size={14}/>

                      </div>

                    </th>

                  ))}

                </tr>

              </thead>

              <motion.tbody layout className="divide-y divide-slate-100">

                {sortedAnalysis.map(student => {

                  const attendanceRate =
                    student.totalSessions > 0
                      ? (student.presentCount / student.totalSessions) * 100
                      : 0

                  const isAtRisk =
                    student.absentCount > 3 || student.lateCount > 5

                  return (

                    <motion.tr
                      key={student.studentId}
                      layout
                      transition={{ duration:0.25 }}
                      className={`hover:bg-slate-50 ${
                        isAtRisk ? 'bg-red-50/50 font-medium' : ''
                      }`}
                    >

                      <td className="px-6 py-4">

                        <div className="flex flex-col">

                          <span>{student.studentName}</span>

                          <span className="text-xs text-slate-500 font-mono">
                            {student.studentSid}
                          </span>

                        </div>

                      </td>

                      <td className="px-6 py-4 text-center font-mono">
                        {student.totalSessions}
                      </td>

                      <td className="px-6 py-4 text-center font-mono text-green-600">
                        {student.presentCount}
                      </td>

                      <td className="px-6 py-4 text-center font-mono text-amber-600">
                        {student.lateCount}
                      </td>

                      <td className="px-6 py-4 text-center font-mono text-red-600">
                        {student.absentCount}
                      </td>

                      <td className="px-6 py-4">

                        <div className="flex items-center gap-2">

                          <div className="w-full bg-slate-200 rounded-full h-2.5">

                            <div
                              className={`h-2.5 rounded-full ${
                                attendanceRate > 80
                                  ? 'bg-green-500'
                                  : attendanceRate > 60
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width:`${attendanceRate}%` }}
                            />

                          </div>

                          <span className="font-mono text-xs">
                            {attendanceRate.toFixed(0)}%
                          </span>

                        </div>

                      </td>

                    </motion.tr>

                  )
                })}

              </motion.tbody>

            </table>

          </div>

        )}

      </div>

    </motion.div>
  )
}

export default AiInsightsPage