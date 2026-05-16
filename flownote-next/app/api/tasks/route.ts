import { NextResponse } from 'next/server';
import  query from '../../lib/db'

// 1. 모든 할 일 조회 (GET)

const GET = async () =>  {
  try {
    const result = await query(
      `SELECT 
        id, 
        task_name, 
        category, 
        difficulty_level, 
        status, 
        estimated_minutes, 
        actual_minutes, 
        TO_CHAR(due_date, 'YYYY-MM-DD') as due_date, 
        memo, 
        tags, 
        created_at, 
        updated_at 
      FROM tasks 
      ORDER BY due_date ASC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 })
  }
}

// 2. 새로운 할 일 추가 (POST)
const POST =  async (request: Request) => {
  try {
    const body = await request.json();
    const { 
      id,task_name, category, difficulty_level, status, 
      estimated_minutes, due_date, memo, tags 
    } = body;

    const queryText = `
      INSERT INTO tasks (
        id,task_name, category, difficulty_level, status, 
        estimated_minutes, due_date, memo, tags
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *`;

    const values = [
      id,task_name, category, difficulty_level, status, 
      estimated_minutes, due_date, memo, tags // tags는 ['tag1', 'tag2'] 형태의 배열로 전달
    ];

    const result = await query(queryText, values);
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }
}



const OPTIONS = async () => {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*', // 실제 배포시에는 특정 도메인으로 제한 권장
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

export {GET, POST,  OPTIONS}