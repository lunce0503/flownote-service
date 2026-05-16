import { NextResponse } from 'next/server';
import query from '../../../lib/db';

/**
 * Task 삭제 API (DELETE)
 */
const DELETE = async (
  request: Request, 
  { params }: { params: Promise<{ id: string }> } // Next.js 15: params는 Promise입니다.
) => {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: '삭제할 ID가 필요합니다.' }, { status: 400 });
    }

    const queryText = `
      DELETE FROM tasks
      WHERE id = $1
      RETURNING *`;

    const values = [id];
    const result = await query(queryText, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: '해당 ID의 데이터를 찾을 수 없습니다.' }, { status: 404 });
    }

    // NextResponse.json(data, init) 구조를 따라야 헤더가 올바르게 전송됩니다.
    return NextResponse.json(
      { 
        message: '성공적으로 삭제되었습니다.', 
        deletedTask: result.rows[0] 
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    console.error("DELETE Error:", error);
    return NextResponse.json({ error: '데이터를 삭제하지 못했습니다.' }, { status: 500 });
  }
};

/**
 * Task 수정 API (PATCH)
 */
const PATCH = async (
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (!body || Object.keys(body).length === 0) {
      return NextResponse.json({ error: '수정할 데이터가 없습니다.' }, { status: 400 });
    }

    // 1. 수정 가능한 필드 목록 정의
    const allowedFields = [
      'task_name', 'category', 'difficulty_level', 
      'status', 'estimated_minutes', 'actual_minutes', 
      'due_date', 'memo', 'tags'
    ];

    // 2. body에서 유효한 데이터만 골라내어 동적 쿼리 생성
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    Object.keys(body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${idx}`);
        // tags 배열의 경우 DB 형식에 맞게 처리 (필요시)
        values.push(body[key]);
        idx++;
      }
    });

    if (updates.length === 0) {
      return NextResponse.json({ error: '유효한 수정 필드가 없습니다.' }, { status: 400 });
    }

    // 3. 마지막 파라미터로 ID 추가
    values.push(id);
    const queryText = `
      UPDATE tasks 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *`;

    const result = await query(queryText, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: '데이터를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(
      { message: '성공적으로 업데이트되었습니다.', updatedTask: result.rows[0] },
      { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (error) {
    console.error("PATCH Error:", error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
};

export { DELETE, PATCH };