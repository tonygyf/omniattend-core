import React, { useEffect, useState } from 'react';
import { User } from '../types';
import { Search, Plus, Trash2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchStudentsByClass } from '../services/dataService';
import { getFullImageUrl } from '../services/cdn';
import Modal from '../components/Modal';

interface UsersPageProps {
  classId: number;
  className: string;
  onNavigateBack: () => void;
}

const UsersPage: React.FC<UsersPageProps> = ({ classId, className, onNavigateBack }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserSid, setNewUserSid] = useState('');

  useEffect(() => {
    if (!classId) {
      // 如果没有 classId，可以选择显示一个提示信息或直接返回
      setLoading(false);
      return;
    }

    const loadStudents = async () => {
      setLoading(true);
      try {
        const studentsData = await fetchStudentsByClass(classId);
        // 将班级名称设置到每个学生对象中
        const studentsWithClassName = studentsData.map(s => ({ ...s, department: className }));
        setUsers(studentsWithClassName);
      } catch (error) {
        // 错误已在 service 层处理和 toast
        setUsers([]); // 清空数据以防显示旧数据
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, [classId, className]);

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.sid && user.sid.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteUser = (userId: string) => {
    setUsers(currentUsers => currentUsers.filter(user => user.id !== userId));
  };

  const handleAddNewUser = () => {
    if (!newUserName.trim() || !newUserSid.trim()) {
      alert('学生姓名和学号不能为空。');
      return;
    }
    const newUser: User = {
      id: String(Date.now()),
      name: newUserName,
      sid: newUserSid,
      department: className, // 关联当前班级
      role: 'student',
      avatarUrl: '',
      status: 'active',
    };
    setUsers(currentUsers => [newUser, ...currentUsers]);
    setNewUserName('');
    setNewUserSid('');
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <button onClick={onNavigateBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-2">
            <ArrowLeft size={16} />
            返回班级列表
          </button>
          <h1 className="text-2xl font-bold text-slate-800">{className} - 学生管理</h1>
          <p className="text-slate-500">管理该班级的学生信息。</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>新增学生</span>
        </button>
      </div>

      {/* ... [rest of the component remains largely the same] ... */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="按姓名或学号搜索..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-xs">
              <tr>
                <th className="px-6 py-4">学生</th>
                <th className="px-6 py-4">学号</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={4} className="px-6 py-8 text-center">Loading...</td></tr>
              ) : (
                <AnimatePresence>
                  {filteredUsers.map((user) => (
                    <motion.tr 
                      key={user.id} 
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="hover:bg-slate-50/50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img 
                            src={user.avatarUrl ? getFullImageUrl(user.avatarUrl) : (`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=0D8ABC&color=fff`)} 
                            alt={user.name} 
                            className="w-10 h-10 rounded-full object-cover border"
                          />
                          <div>
                            <div className="font-medium text-slate-900">{user.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{user.sid || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100/50"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="新增学生"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">学生姓名</label>
            <input type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">学号</label>
            <input type="text" value={newUserSid} onChange={(e) => setNewUserSid(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleAddNewUser} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">确认新增</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
