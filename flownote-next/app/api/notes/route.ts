import { NextResponse } from 'next/server';
import  query from '../../lib/db'

// 1. 모든 게시글 조회 (GET)
const GET = async () => {
  try {
    const result = await query('SELECT * FROM notes ORDER BY created_at DESC', []);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '데이터를 불러오지 못했습니다.' }, { status: 500 });
  }
};

// 2. 새로운 게시글 추가 (POST)
const POST = async (request: Request) => {
  try {
    const body = await request.json();
    const { id, title, content, created_at } = body;

    // PostgreSQL의 'ON CONFLICT' 구문을 사용하여 UPSERT 구현
    const queryText = `
      INSERT INTO notes (id, title, content, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) 
      DO UPDATE SET 
        title = EXCLUDED.title,
        content = EXCLUDED.content
      RETURNING *`;

    const values = [id, title, JSON.stringify(content), created_at];
    const result = await query(queryText, values);

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }
}

export {GET, POST}