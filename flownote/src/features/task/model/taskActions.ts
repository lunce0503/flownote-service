// 작업(Task) 사용자 액션. 위젯은 entities api를 직접 부르지 않고 이 feature를 경유한다.
// (옵티미스틱 업데이트, 캐시 무효화 등 액션 수준 로직이 생기면 여기에 쌓는다)
export { getTasksData, postTaskData, updateTaskData, deleteTasksData } from "@/entities/task";
