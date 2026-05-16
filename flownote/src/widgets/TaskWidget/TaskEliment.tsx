import { Trash2, Tag } from "lucide-react";

// --- Types ---
export interface TaskProps {
    // db용
    id: string;
    create_at: Date;
    update_at: Date;
    // 고객용
    task_name: string;
    category: string | null;
    difficulty_level: 1 | 2 | 3;
    status: 'TODO'|'DOING'|'DONE';
    description: string | null;
    estimated_minutes: number;
    actual_minutes: number | null;
    due_date: string;
    memo: string | null;
    tags: string[];
}

// --- Constants & Styles ---
const STATUS_CONFIG = {
    TODO: { label: '할 일', color: 'bg-gray-400' , hover: 'hover:bg-gray-500' },
    DOING: { label: '진행 중', color: 'bg-amber-500', hover: 'hover:bg-amber-600' },
    DONE: { label: '완료', color: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
};

const DIFFICULTY_CONFIG = {
    1: { label: '쉬움', color: 'bg-green-200' },
    2: { label: '보통', color: 'bg-yellow-200' },
    3: { label: '어려움', color: 'bg-red-200' },
};

const GRID_LAYOUT = {
    display: 'grid grid-cols-12 gap-2 items-center px-4 py-3',
    columns: 'grid-cols-12',
    gap: '',
}

const GRID_HEADER_LAYOUT = {
    display: 'hidden md:grid grid-cols-12 gap-2 items-center px-4 py-3',
    columns: 'grid-cols-12',
    gap: '',
}

// --- Components ---
const TaskHeader = () => (
  <div className={` ${GRID_HEADER_LAYOUT.display} bg-gray-600 text-white text-xs font-bold uppercase rounded-t-xl mx-4`}>
    <div className="col-span-3">일정명</div>
    <div className="col-span-1 text-center">상태</div>
    <div className="col-span-1 text-center">카테고리</div>
    <div className="col-span-1 text-center">난이도</div>
    <div className="col-span-1 text-center">예상(분)</div>
    <div className="col-span-1 text-center">실제(분)</div>
    <div className="col-span-2 text-center">마감일</div>
    <div className="col-span-2 text-center">태그/메모</div>
  </div>
);

const TaskItem = ({ 
        task, 
        onDelete, 
        onChange 
    }: {
        task: TaskProps;
        onDelete: (id: string) => void;
        onChange: (updateTask: TaskProps) => void;
    }) => {

        const handleUpdate = (field: keyof TaskProps, value: any) => {
            onChange({ ...task, [field]: value, update_at: new Date() });
        };
        
        const cycleStatus = () => {
            const sequence: TaskProps['status'][] = ['TODO', 'DOING', 'DONE'];
            const nextIndex = (sequence.indexOf(task.status) + 1 ) % sequence.length;
            handleUpdate('status', sequence[nextIndex]);
        }

        const cycleDifficulty = () => {
            const sequence: TaskProps['difficulty_level'][] = [1, 2, 3];
            const nextIndex = sequence.indexOf(task.difficulty_level) + 1 % sequence.length;
            handleUpdate('difficulty_level', sequence[nextIndex]);
        }

        return (
            <div className={`${GRID_LAYOUT.display} ${GRID_LAYOUT.columns} mx-4 text-black border-b bg-gray-300 last:border-0 group hover:bg-gray-200 rounded-lg transition-all group`}>
                {/* Task Name & Delete */}
                <div className="col-span-12 md:col-span-3 flex items-center gap-2">
                    <button 
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                        onClick={() => onDelete(task.id)}
                    >
                        <Trash2 size={14} />
                    </button>
                    <input type="text"
                        value={task.task_name}
                        onChange={(e) => handleUpdate('task_name', e.target.value)}
                        className="border-none focus:ring-0 w-full font-medium text-gray-700"
                        placeholder="할 일 입력..."
                    />
                </div>

                {/* Task Status */}
                <div className="col-span-4 md:col-span-1 flex justify-center">
                    <button 
                    onClick={cycleStatus}
                    className={`${STATUS_CONFIG[task.status].color} text-white text-[10px] px-2 py-1 rounded-full w-16 transition-all shadow-sm`}
                    >
                    {STATUS_CONFIG[task.status].label}
                    </button>
                </div>

                {/* Task Category */}
                <div className="col-span-4 md:col-span-1">
                    <input 
                    type="text"
                    value={task.category || ''}
                    onChange={(e) => handleUpdate('category', e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-center text-xs text-gray-500 w-full"
                    placeholder="분류"
                    />
                </div>

                {/* Task Difficulty */}
                <div className="col-span-4 md:col-span-1 flex justify-center">
                    <button onClick={cycleDifficulty} className="flex gap-0.5">
                        {[1, 2, 3].map((lv) => (
                            <div 
                            key={lv} 
                            className={`w-2 h-2 rounded-full ${lv <= task.difficulty_level ? DIFFICULTY_CONFIG[task.difficulty_level].color : 'bg-gray-200'}`}
                            style={{ backgroundColor: lv <= task.difficulty_level ? '#000000' : '#e5e7eb' }}
                            />
                        ))}
                    </button>
                </div>

                {/* Times */}
                <div className="col-span-6 md:col-span-1">
                    <input 
                    type="number"
                    value={task.estimated_minutes}
                    onChange={(e) => handleUpdate('estimated_minutes', Number(e.target.value))}
                    className="bg-gray-50 rounded border-none text-center text-xs w-full py-1"
                    />
                </div>
                <div className="col-span-6 md:col-span-1">
                    <input 
                    type="number"
                    value={task.actual_minutes || 0}
                    onChange={(e) => handleUpdate('actual_minutes', Number(e.target.value))}
                    className="bg-gray-50 rounded border-none text-center text-xs w-full py-1"
                    />
                </div>

                {/* Due Date */}
                <div className="col-span-12 md:col-span-2">
                    <input 
                    type="date"
                    value={task.due_date}
                    onChange={(e) => handleUpdate('due_date', e.target.value)}
                    className="bg-transparent border-none text-xs text-gray-500 w-full text-center focus:ring-0"
                    />
                </div>

                {/* Tags & Memo */}
                <div className="col-span-12 md:col-span-2 flex items-center gap-2">
                    <Tag size={12} className="text-gray-400 shrink-0" />
                    <input 
                    type="text"
                    value={task.tags.join(', ')}
                    onChange={(e) => handleUpdate('tags', e.target.value.split(',').map(s => s.trim()))}
                    className="bg-transparent border-none focus:ring-0 text-xs text-gray-500 w-full italic"
                    placeholder="태그 (쉼표 구분)"
                    />
                </div>
            </div>
        );
    };

export { TaskHeader,  TaskItem};