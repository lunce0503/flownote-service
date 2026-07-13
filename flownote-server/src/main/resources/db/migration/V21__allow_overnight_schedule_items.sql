-- 자정을 넘기는(종료 < 시작) 시간표 항목을 허용한다.
-- 의미론: 종료 시각이 시작보다 이르면 다음 날로 이어지는 일정이며, 시작 요일에 귀속된다.
ALTER TABLE daily_schedule_items DROP CONSTRAINT IF EXISTS chk_daily_schedule_time_range;
ALTER TABLE daily_schedule_items ADD CONSTRAINT chk_daily_schedule_time_range CHECK (start_time <> end_time);
