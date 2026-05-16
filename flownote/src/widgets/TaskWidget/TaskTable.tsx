import { useState, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";

import getTaskData from "../../entities/task/api/getTaskData";
import postTaskData from "../../entities/task/api/postTaskData";
import deleteTasksData from "../../entities/task/api/deleteTaskData";
import updateTasksData from "../../entities/task/api/updateTaskData";
import type { TaskProps } from "../../entities/task";

import { TaskHeader, TaskItem } from "./TaskEliment";
import DailySchedulePanel from "./DailySchedulePanel";
import { AlertCircle, ArrowDownAZ, CalendarClock, Filter, Plus, Search, SlidersHorizontal } from "lucide-react";

type SortCriterion = "due_date" | "task_name" | "difficulty" | "estimated" | "created_at";
type SortDirection = "asc" | "desc";
type StatusFilter = "ALL" | TaskProps["status"];

const TaskTable = () => {
    const [tasks, setTasks] = useState<TaskProps[]>([]);
    const [filterStatus, setFilterStatus] = useState<StatusFilter>("ALL");
    const [categoryFilter, setCategoryFilter] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortCriterion, setSortCriterion] = useState<SortCriterion>("due_date");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchTasks();
        setIsLoading(false);
    },[]);

    const processedTasks = useMemo(() => {
        let result = [...tasks];
        const normalizedQuery = searchQuery.trim().toLowerCase();

        if (filterStatus !== "ALL") {
            result = result.filter((task) => task.status === filterStatus);
        }

        if (categoryFilter !== "ALL") {
            result = result.filter((task) => (task.category || "분류 없음") === categoryFilter);
        }

        if (normalizedQuery) {
            result = result.filter((task) => (
                task.task_name.toLowerCase().includes(normalizedQuery) ||
                (task.description || "").toLowerCase().includes(normalizedQuery) ||
                (task.category || "").toLowerCase().includes(normalizedQuery) ||
                task.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
            ));
        }

        result.sort((a, b) => {
            if (a.status === 'DONE' && b.status !== 'DONE') return 1;
            if (a.status !== 'DONE' && b.status === 'DONE') return -1;

            let compareValue = 0;
            if (sortCriterion === "due_date") {
                compareValue = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
            } else if (sortCriterion === "difficulty") {
                compareValue = a.difficulty_level - b.difficulty_level;
            } else if (sortCriterion === "estimated") {
                compareValue = a.estimated_minutes - b.estimated_minutes;
            } else if (sortCriterion === "created_at") {
                compareValue = new Date(a.create_at).getTime() - new Date(b.create_at).getTime();
            } else if (sortCriterion === "task_name") {
                compareValue = a.task_name.localeCompare(b.task_name ,'ko', {sensitivity:'base'});
            }
            return sortDirection === "asc" ? compareValue : -compareValue;
        });

        return result;
    }, [tasks, categoryFilter, filterStatus, searchQuery, sortCriterion, sortDirection]);

    const stats = useMemo(() => {
        const activeCount = tasks.filter(t => t.status !== 'DONE').length;
        const totalMinutes = tasks.filter(t => t.status !== 'DONE').reduce((acc, curr) => acc + curr.estimated_minutes, 0);
        const completedCount = tasks.filter(t => t.status === 'DONE').length;
        return { activeCount, totalMinutes, completedCount };
    }, [tasks]);

    const categories = useMemo(() => (
        Array.from(new Set(tasks.map((task) => task.category?.trim() || "분류 없음"))).sort((a, b) => a.localeCompare(b, "ko"))
    ), [tasks]);

    const fetchTasks = async () => {
        setIsLoading(true);
        const tasksData = await getTaskData();
        setTasks(tasksData);
        setIsLoading(false);
    };

    const AddTask = async () => {
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
        try {
            const createdTask = await postTaskData(newTask);
            setTasks((prevTasks) => [...prevTasks, createdTask ?? newTask]);
        } catch (error) {
            console.error("일정 저장 중 오류 발생, 다시 시도해주세요.", error);
        }
    };
    
    const UpadateTask = (updatedTask: TaskProps) => {
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

    const handleDeleteTask = (id: string) => {
        deleteTasksData(id);
        setTasks((prevTasks) => prevTasks.filter((task)=>task.id !== id))
    }

    


    return (
        <div className="min-h-[calc(100vh-56px)] bg-stone-950 p-3 text-stone-900 md:p-5">
            <div className="mx-auto max-w-7xl rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl md:p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase text-amber-700">Schedule</p>
                        <h1 className="text-2xl font-black text-stone-950 md:text-3xl">일정 관리</h1>
                        <p className="text-sm text-stone-500">상태, 분류, 검색어, 정렬 기준으로 오늘 볼 일정을 정리합니다.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                            <div className="text-lg font-black">{tasks.length}</div>
                            <div className="text-xs text-stone-500">전체</div>
                        </div>
                        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                            <div className="text-lg font-black">{stats.activeCount}</div>
                            <div className="text-xs text-stone-500">진행</div>
                        </div>
                        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                            <div className="text-lg font-black">{Math.round(stats.totalMinutes / 60)}h</div>
                            <div className="text-xs text-stone-500">예상</div>
                        </div>
                    </div>
                </div>

                <DailySchedulePanel />

                <div className="mb-4 grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 md:grid-cols-[minmax(180px,1fr)_repeat(4,minmax(140px,180px))]">
                    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                        <Search size={16} className="text-stone-400" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 outline-none focus:ring-0"
                            placeholder="일정, 설명, 태그 검색"
                        />
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                        <Filter size={16} className="text-stone-400" />
                        <select
                            value={filterStatus}
                            onChange={(event) => setFilterStatus(event.target.value as StatusFilter)}
                            className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 outline-none focus:ring-0"
                        >
                            <option value="ALL">모든 상태</option>
                            <option value="TODO">할 일</option>
                            <option value="DOING">진행 중</option>
                            <option value="DONE">완료</option>
                        </select>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                        <SlidersHorizontal size={16} className="text-stone-400" />
                        <select
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 outline-none focus:ring-0"
                        >
                            <option value="ALL">모든 분류</option>
                            {categories.map((category) => (
                                <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                        <CalendarClock size={16} className="text-stone-400" />
                        <select
                            value={sortCriterion}
                            onChange={(event) => setSortCriterion(event.target.value as SortCriterion)}
                            className="min-w-0 flex-1 border-none bg-transparent text-sm text-stone-800 outline-none focus:ring-0"
                        >
                            <option value="due_date">마감일</option>
                            <option value="task_name">일정명</option>
                            <option value="difficulty">난이도</option>
                            <option value="estimated">예상 시간</option>
                            <option value="created_at">생성일</option>
                        </select>
                    </label>
                    <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100"
                        onClick={() => setSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
                    >
                        <ArrowDownAZ size={16} />
                        {sortDirection === "asc" ? "오름차순" : "내림차순"}
                    </button>
                </div>
                <div className="space-y-2">
                    <TaskHeader />
                    {isLoading ? (
                        <div className="flex items-center justify-center rounded-xl bg-white py-20 italic text-gray-400">데이터를 불러오는 중...</div>
                    ) : processedTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-xl bg-white p-10 text-center">
                            <AlertCircle size={48} />
                            <p className="mt-3 text-gray-700">조건에 맞는 일정이 없습니다.</p>
                        </div>
                    ) : processedTasks.map(task => (
                        <TaskItem 
                            key={task.id} 
                            task={task}
                            onDelete={handleDeleteTask}
                            onChange={UpadateTask}
                        />
                    ))}
                </div>
                <div className="mt-4">
                    <button 
                        onClick={AddTask}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-stone-700"
                    >
                        <Plus size={24} />
                        일정 추가
                    </button>  
                </div>
            </div>
        </div>
    );
};

export default TaskTable;
