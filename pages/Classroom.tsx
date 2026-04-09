import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Edit, LayoutGrid, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../components/Modal';
import { fetchClassrooms, fetchAllStudents, createClassroom, updateClassroom, deleteClassroom } from '../services/dataService';
import { Classroom, User } from '../types';
import { useAuth } from '../context/AuthContext';

interface ClassroomPageProps {
  onNavigateToClass: (id: number, name: string) => void;
}

import { getFullImageUrl } from '../services/cdn';

const ClassroomPage: React.FC<ClassroomPageProps> = ({ onNavigateToClass }) => {
  const auth = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    return (localStorage.getItem('classroom_view_mode') as 'card' | 'list') || 'card';
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClassroomId, setEditingClassroomId] = useState<number | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState(new Date().getFullYear());

  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadClassrooms = async () => {
    try {
      const classData = await fetchClassrooms();
      setClassrooms(classData);
    } catch (error) {
      console.error("Failed to load classrooms:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          loadClassrooms(),
          (async () => {
            const studentData = await fetchAllStudents();
            setStudents(studentData);
          })()
        ]);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem('classroom_view_mode', viewMode);
  }, [viewMode]);

  const handleOpenAddModal = () => {
    setEditingClassroomId(null);
    setNewClassName('');
    setNewClassYear(new Date().getFullYear());
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (classroom: Classroom) => {
    setEditingClassroomId(classroom.id);
    setNewClassName(classroom.name);
    setNewClassYear(classroom.year);
    setIsModalOpen(true);
  };

  const handleSubmitClass = async () => {
    if (!newClassName.trim()) {
      alert('班级名称不能为空。');
      return;
    }
    if (!auth.user?.id || Number.isNaN(Number(auth.user.id))) {
      alert('当前账号无有效教师 ID，无法保存班级。');
      return;
    }
    setIsSubmitting(true);
    
    let result;
    if (editingClassroomId) {
      result = await updateClassroom(editingClassroomId, {
        name: newClassName,
        year: newClassYear,
      });
    } else {
      result = await createClassroom({
        name: newClassName,
        year: newClassYear,
        teacherId: Number(auth.user.id),
      });
    }

    if (result.success) {
      await loadClassrooms();
      setIsModalOpen(false);
      setEditingClassroomId(null);
      setNewClassName('');
      setNewClassYear(new Date().getFullYear());
    } else {
      alert(`保存失败: ${result.error}`);
    }
    setIsSubmitting(false);
  };

  const handleDeleteClass = async (classId: number) => {
    if (window.confirm('确定要删除此班级吗？删除后将无法恢复。')) {
      const result = await deleteClassroom(classId);
      if (result.success) {
        setClassrooms(prev => prev.filter(c => c.id !== classId));
      } else {
        alert(`删除失败: ${result.error}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">班级管理</h1>
          <p className="text-slate-500">创建、编辑和管理您的班级。</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button onClick={() => setViewMode('card')} className={`px-3 py-1 rounded-md text-sm font-medium ${viewMode === 'card' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <LayoutGrid size={16} className="inline mr-1"/>
              卡片视图
            </button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-1 rounded-md text-sm font-medium ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              <List size={16} className="inline mr-1"/>
              列表视图
            </button>
          </div>
          <button 
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={18} />
            <span>新增班级</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {classrooms.map(classroom => (
              <motion.div
                key={classroom.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow duration-300 cursor-pointer"
                onClick={() => onNavigateToClass(classroom.id, classroom.name)}
              >
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-slate-900 truncate">{classroom.name}</h2>
                  <p className="text-sm text-slate-500">{classroom.year}级</p>
                  <p className="text-sm text-slate-500 mt-2">学生人数: {classroom.studentCount}</p>
                </div>
                <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleOpenEditModal(classroom); }}
                    className="text-slate-400 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-100/50"
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteClass(classroom.id); }}
                    className="text-slate-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-100/50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <AllStudentsListView students={students} setStudents={setStudents} />
      )}

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClassroomId ? "编辑班级" : "新增班级"}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">班级名称</label>
            <input 
              type="text" 
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" 
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">所属年份</label>
            <input 
              type="number" 
              value={newClassYear}
              onChange={(e) => setNewClassYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" 
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleSubmitClass} disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
              {isSubmitting ? '正在提交...' : (editingClassroomId ? '保存修改' : '确认新增')}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default ClassroomPage;

// Helper component for the All Students List View
const AllStudentsListView: React.FC<{ students: User[]; setStudents: React.Dispatch<React.SetStateAction<User[]>> }> = ({ students, setStudents }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const studentsByClass = useMemo(() => {
    const grouped: { [key: string]: User[] } = {};
    students.forEach(student => {
      const className = student.department || '未分配班级';
      if (!grouped[className]) {
        grouped[className] = [];
      }
      grouped[className].push(student);
    });
    return grouped;
  }, [students]);

  const filteredClasses = useMemo(() => {
    if (!searchTerm.trim()) return Object.keys(studentsByClass);
    const lowercasedFilter = searchTerm.toLowerCase();
    return Object.keys(studentsByClass).filter(className => {
      if (className.toLowerCase().includes(lowercasedFilter)) return true;
      return studentsByClass[className].some(student => 
        student.name.toLowerCase().includes(lowercasedFilter) ||
        (student.sid && student.sid.toLowerCase().includes(lowercasedFilter))
      );
    });
  }, [searchTerm, studentsByClass]);

  const handleDeleteUser = (userId: string) => {
    setStudents(currentUsers => currentUsers.filter(user => user.id !== userId));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <input 
          type="text" 
          placeholder="按姓名、学号或班级搜索..." 
          className="w-full max-w-md pl-4 pr-4 py-2 border border-slate-200 rounded-lg"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
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
            <AnimatePresence>
              {filteredClasses.length > 0 ? filteredClasses.map(className => (
                <React.Fragment key={className}>
                  <tr className="bg-slate-50/80">
                    <td colSpan={4} className="px-6 py-2.5 font-semibold text-slate-800">
                      {className}
                    </td>
                  </tr>
                  {studentsByClass[className]
                    .filter(student => { 
                      if (!searchTerm.trim()) return true;
                      const lowercasedFilter = searchTerm.toLowerCase();
                      return className.toLowerCase().includes(lowercasedFilter) ||
                             student.name.toLowerCase().includes(lowercasedFilter) ||
                             (student.sid && student.sid.toLowerCase().includes(lowercasedFilter));
                    })
                    .map(user => (
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
                </React.Fragment>
              )) : (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-500">
                    没有找到匹配的学生或班级。
                  </td>
                </tr>
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </div>
  );
};
