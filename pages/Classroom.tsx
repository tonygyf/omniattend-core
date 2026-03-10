import React, { useState } from 'react';
import { Plus, Trash2, Edit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../components/Modal';

// 模拟的班级数据结构
interface Classroom {
  id: number;
  name: string;
  year: number;
  studentCount: number;
}

interface ClassroomPageProps {
  onNavigateToClass: (id: number, name: string) => void;
}

const ClassroomPage: React.FC<ClassroomPageProps> = ({ onNavigateToClass }) => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([
    // 之后会从API加载真实数据
    { id: 1, name: '软件工程 2023级 1班', year: 2023, studentCount: 58 },
    { id: 2, name: '计算机科学 2023级 3班', year: 2023, studentCount: 62 },
    { id: 3, name: '人工智能 2022级 实验班', year: 2022, studentCount: 35 },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassYear, setNewClassYear] = useState(new Date().getFullYear());

  const handleAddClass = () => {
    if (!newClassName.trim()) {
      alert('班级名称不能为空。');
      return;
    }
    const newClass: Classroom = {
      id: Date.now(),
      name: newClassName,
      year: newClassYear,
      studentCount: 0,
    };
    setClassrooms(prev => [newClass, ...prev]);
    setIsModalOpen(false);
    setNewClassName('');
    setNewClassYear(new Date().getFullYear());
  };

  const handleDeleteClass = (classId: number) => {
    setClassrooms(prev => prev.filter(c => c.id !== classId));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">班级管理</h1>
          <p className="text-slate-500">创建、编辑和管理您的班级。</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span>新增班级</span>
        </button>
      </div>

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
                  onClick={(e) => { e.stopPropagation(); /* handle edit */ }}
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

      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="新增班级"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">班级名称</label>
            <input 
              type="text" 
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">所属年份</label>
            <input 
              type="number" 
              value={newClassYear}
              onChange={(e) => setNewClassYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" 
            />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleAddClass} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">确认新增</button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default ClassroomPage;
