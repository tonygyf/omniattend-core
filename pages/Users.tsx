import React, { useEffect, useState, useCallback } from 'react';
import { User } from '../types';
import { Search, Plus, Trash2, ArrowLeft, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createStudent, createStudentsBatch, fetchStudentsByClass } from '../services/dataService';
import { getFullImageUrl } from '../services/cdn';
import Papa from 'papaparse';
import Modal from '../components/Modal';
import toast from 'react-hot-toast';

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
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserGender, setNewUserGender] = useState<'M' | 'F' | 'O' | '' >('');
  const [newUserAvatarUri, setNewUserAvatarUri] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);

  const loadStudents = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const studentsData = await fetchStudentsByClass(classId);
      const studentsWithClassName = studentsData.map(s => ({ ...s, department: className }));
      setUsers(studentsWithClassName);
    } catch (error) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [classId, className]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.sid && user.sid.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteUser = async (userId: string) => {
    // This should call a backend API to delete the user.
    // For now, we'll just filter the state.
    // Example: await deleteStudent(userId);
    setUsers(currentUsers => currentUsers.filter(user => user.id !== userId));
  };

  const handleAddNewUser = async () => {
    if (!newUserName.trim() || !newUserSid.trim()) {
      alert('学生姓名和学号是必填项。');
      return;
    }
    setIsSubmitting(true);
    const result = await createStudent({
      classId: classId,
      name: newUserName,
      sid: newUserSid,
      email: newUserEmail || undefined,
      password: newUserPassword || undefined,
      gender: newUserGender || undefined,
      avatarUrl: newUserAvatarUri || undefined,
    });

    if (result.success) {
      await loadStudents(); // Reload the list from the server
      setIsModalOpen(false);
      // Reset form
      setNewUserName('');
      setNewUserSid('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserGender('');
      setNewUserAvatarUri('');
    } else {
      alert(`创建失败: ${result.error}`);
    }
    setIsSubmitting(false);
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
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsBatchModalOpen(true)}
            className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm border"
          >
            <Upload size={18} />
            <span>批量导入</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>新增学生</span>
          </button>
        </div>
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
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">学生姓名 <span className="text-red-500">*</span></label>
              <input type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" autoComplete="off" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">学号 <span className="text-red-500">*</span></label>
              <input type="text" value={newUserSid} onChange={(e) => setNewUserSid(e.target.value)} className="w-full px-3 py-2 border rounded-lg" autoComplete="off" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">邮箱 (可选)</label>
            <input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg" autoComplete="off" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">初始密码 (可选)</label>
            <input type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg" autoComplete="new-password" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">性别 (可选)</label>
              <select value={newUserGender} onChange={(e) => setNewUserGender(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg bg-white">
                <option value="">未选择</option>
                <option value="M">男</option>
                <option value="F">女</option>
                <option value="O">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">头像链接 (可选)</label>
              <input type="text" value={newUserAvatarUri} onChange={(e) => setNewUserAvatarUri(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleAddNewUser} disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {isSubmitting ? '正在提交...' : '确认新增'}
            </button>
          </div>
        </div>
      </Modal>

      {isBatchModalOpen && (
        <BatchImportModal 
          classId={classId}
          onClose={() => setIsBatchModalOpen(false)}
          onSuccess={() => {
            setIsBatchModalOpen(false);
            loadStudents();
          }}
        />
      )}
    </div>
  );
};

// Batch Import Modal Component
const BatchImportModal: React.FC<{ classId: number, onClose: () => void, onSuccess: () => void }> = ({ classId, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setIsParsing(true);
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setParsedData(results.data);
          setIsParsing(false);
        },
        error: (error) => {
          toast.error(`文件解析失败: ${error.message}`);
          setIsParsing(false);
        }
      });
    }
  };

  const handleSubmit = async () => {
    if (parsedData.length === 0) {
      toast.error("没有可导入的数据。");
      return;
    }
    setIsSubmitting(true);
    const result = await createStudentsBatch(classId, parsedData);
    if (result.success) {
      toast.success(`${parsedData.length} 名学生已成功导入！`);
      onSuccess();
    } else {
      toast.error(`导入失败: ${result.error}`);
    }
    setIsSubmitting(false);
  };

  return (
    <Modal open={true} onClose={onClose} title={`批量导入学生到班级`}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            选择一个 CSV 或 TXT 文件进行上传。
          </label>
          <p className="text-xs text-slate-500 mb-2">
            文件第一行应为表头，至少包含 <code className="bg-slate-100 px-1 rounded">name</code> 和 <code className="bg-slate-100 px-1 rounded">sid</code> 字段。
          </p>
          <input 
            type="file" 
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
        </div>

        {isParsing && <p>正在解析文件...</p>}

        {parsedData.length > 0 && (
          <div className="max-h-60 overflow-y-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {Object.keys(parsedData[0]).map(key => <th key={key} className="p-2 font-medium">{key}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {parsedData.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val: any, j) => <td key={j} className="p-2 truncate">{val}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 10 && <p className="text-center text-xs p-2">...等共 {parsedData.length} 条记录</p>}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button onClick={handleSubmit} disabled={isParsing || isSubmitting || parsedData.length === 0} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
            {isSubmitting ? '正在导入...' : `确认导入 ${parsedData.length} 名学生`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default UsersPage;
