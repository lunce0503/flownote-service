import { NextResponse } from 'next/server';
import  query from '../../lib/db'
import bcrypt from 'bcryptjs';

const POST =  async (request: Request) => {
    try {
        const body = await request.json();
        const { username, email, password, nickname } = body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const queryText = `
            INSERT INTO users (username, email, password_hash, nickname) 
            VALUES ($1, $2, $3, $4) 
            RETURNING id, username, email, nickname
        `;
        const values = [username, email, hashedPassword, nickname];
        const result = await query(queryText, values);
        return NextResponse.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: '회원가입에 실패했습니다.' }, { status: 500 });
    }
}
 const GET = async () => {
    try {
        const result = await query('SELECT id, username, email, nickname FROM users'); 
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: '사용자 데이터를 가져오는 데 실패했습니다.' }, { status: 500 });
    }
}
export { POST,GET };