import { Pool } from 'pg';

// 환경 변수(.env.local)에 DB 정보를 저장하는 것이 안전합니다.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const query = (text: string, params?: any[]) => pool.query(text, params); 

export default query;