import { useState, useEffect,useMemo } from "react";
import { v4 as uuidv4 } from "uuid";

import getTaskData from "../../entities/task/api/getTaskData";
import postTaskData from "../../entities/task/api/postTaskData";
import deleteTasksData from "../../entities/task/api/deleteTaskData";
import updateTasksData from "../../entities/task/api/updateTaskData";

import { TaskHeader, TaskItem } from "./TaskEliment";
import type { TaskProps } from "./TaskEliment";
import { SortAsc, AlertCircle, Plus, Filter } from "lucide-react";

const TaskTable = () => {
    const [tasks, setTasks] = useState<TaskProps[]>([]);
    // 상태 관리 
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [sortCriterion, setSortCriterion] = useState<string>("due_date");
    const [isLoading,setIsLoading] = useState(true);

    useEffect(() => {
        fetchTasks();
        setIsLoading(false);
    },[]);

    const processedTasks = useMemo(() => {
        let result = [...tasks];

        // 필터링
        if (filterStatus !== "ALL") {
        result = result.filter((t) => t.status === filterStatus);
        }

        // 정렬
        result.sort((a, b) => {
        // 완료된 항목은 무조건 최하단 배치
        if (a.status === 'DONE' && b.status !== 'DONE') return 1;
        if (a.status !== 'DONE' && b.status === 'DONE') return -1;

        if (sortCriterion === "due_date") {
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        } else if (sortCriterion === "difficulty") {
            return b.difficulty_level - a.difficulty_level;
        } else if (sortCriterion === "estimated") {
            return a.estimated_minutes - b.estimated_minutes;
        } else if (sortCriterion === "task_name") {
            return a.task_name.localeCompare(b.task_name ,'ko', {sensitivity:'base'})
        }
        return 0;
        });

        return result;
    }, [tasks, filterStatus, sortCriterion]);

    // 통계 계산
    const stats = useMemo(() => {
        const totalMinutes = tasks
        .filter(t => t.status !== 'DONE')
        .reduce((acc, curr) => acc + curr.estimated_minutes, 0);
        const completedCount = tasks.filter(t => t.status === 'DONE').length;
        return { totalMinutes, completedCount };
    }, [tasks]);
    // CRUD 핸들러
    const fetchTasks = async () => {
            const tasksData = await getTaskData();
            setTasks(tasksData);
        };

    const AddTask = () => {
        // postTaskData(task);
        // setTasks((prevTask)=>[...prevTask, task]);
        const newTask: TaskProps = {
            id: uuidv4(),
            create_at: new Date(),
            update_at: new Date(),
            task_name: "",
            category: "",
            difficulty_level: 1,
            status: 'TODO',
            description: null,
            estimated_minutes: 0,
            actual_minutes: 0,
            due_date: new Date().toISOString().split('T')[0],
            memo: "",
            tags: []
        };
        postTaskData(newTask);
        setTasks([...tasks, newTask]);
    };
    
    const UpadateTask = (updatedTask:TaskProps) => {
        try{
            // 1. 낙관적 UI 업데이트: 사용자에게 즉각적인 피드백 제공
            setTasks((prevTasks) =>
                prevTasks.map((t) => (t.id === updatedTask.id ? updatedTask : t))
            );

            // 2. 백엔드 전송: 전체 객체 또는 변경된 필드를 전송
            // 이제 updateTasksData는 {status: string} 뿐만 아니라 전체 데이터를 보낼 수 있습니다.
            updateTasksData(updatedTask.id, updatedTask);
        } catch (error) {
            // 에러 발생 시 원래 상태로 롤백하거나 에러 알림 처리
            console.error("수정 중 오류 발생, 다시 시도해주세요.");
            fetchTasks(); // 최신 데이터 다시 불러오기
        }
    };

    const handleDeleteTask = (id:string)=>{
        deleteTasksData(id);
        setTasks((prevTasks) => prevTasks.filter((task)=>task.id !== id))
    }

    


    return (
        <div>
            <div className="m-4 p-4 bg-white rounded-2xl shadow-md">
                <div className="tasks-table bg-amber-100 text-black m-3 p-3 rounded-2xl">Task Table</div>
                {/* TaskHeader */}
                <div>
                    
                    {/* TaskFilter */}
                    <div className="flex flex-row items-center gap-2 text-black mx-4">
                        <div className="flex  items-center gap-2">
                            <Filter size={16} className="text-gray-400" />
                            <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="text-sm border-none bg-gray-50 rounded-lg focus:ring-2 focus:ring-blue-100 py-1.5"
                            >
                            <option value="ALL">모든 상태</option>
                            <option value="TODO">할 일</option>
                            <option value="DOING">진행 중</option>
                            <option value="DONE">완료됨</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <SortAsc size={16} className="text-gray-400" />
                            <select 
                            value={sortCriterion}
                            onChange={(e) => setSortCriterion(e.target.value)}
                            className="text-sm border-none bg-gray-50 rounded-lg focus:ring-2 focus:ring-blue-100 py-1.5"
                            >
                            <option value="due_date">마감일 빠른 순</option>
                            <option value="task_name">일정명 순</option>
                            <option value="difficulty">난이도 높은 순</option>
                            <option value="estimated">예상 시간 짧은 순</option>
                            </select>
                        </div>
                    </div>
                    <TaskHeader />
                </div>
                {/* TaskTable */}
                <div>
                    {isLoading ? (
                        <div className="flex justify-center items-center py-20 italic text-gray-400">데이터를 불러오는 중...</div>
                    ) : processedTasks.length === 0 ? (
                        <div className="flex flex-direction-column items-center mx-4 p-4 bg-white">
                            <AlertCircle size={48} />
                            <p className="text-gray-700">No tasks available. Please add a task.</p>
                        </div>
                    ) : (processedTasks.map(task => (
                        <TaskItem 
                            key={task.id} 
                            task={task}
                            onDelete={handleDeleteTask}
                            onChange={UpadateTask}
                        />
                        ))
                    )}
                </div>
                {/* Add button */}
                <div className="grid grid-cols-12">
                    <button 
                        onClick={AddTask}
                        className="flex items-center justify-center col-span-12 mx-4 bg-gray-600 text-white rounded-b-xl hover:bg-gray-700 transition-colors"
                    >
                        <Plus size={24} />
                    </button>  
                </div>
                  
            </div>
            
        </div>
    );
};

export default TaskTable;