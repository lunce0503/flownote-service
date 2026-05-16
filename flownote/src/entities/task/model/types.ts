export interface TaskProps {
  id: string;
  create_at: Date;
  update_at: Date;
  task_name: string;
  category: string | null;
  difficulty_level: 1 | 2 | 3;
  status: "TODO" | "DOING" | "DONE";
  description: string | null;
  estimated_minutes: number;
  actual_minutes: number | null;
  due_date: string;
  memo: string | null;
  tags: string[];
}
