import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid 설치 필요

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

const sanitizeFileName = (fileName: string) => {
  const baseName = path.basename(fileName.replace(/\\/g, '/'));
  return baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
};

// 2. 새로운 게시글 파일 추가 (POST)
const POST = async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await mkdir(UPLOAD_DIR, { recursive: true });
    
    // 2. 파일명 중복 방지를 위한 랜덤 이름 생성
    const safeName = sanitizeFileName(file.name);
    const fileName = `${uuidv4()}-${safeName}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    // 3. 실제 하드 디스크에 저장
    await writeFile(filePath, buffer);

    // 4. 브라우저가 접근할 URL 반환
    const fileUrl = `/uploads/${fileName}`;

    return NextResponse.json({ fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: '서버 저장 중 오류 발생' }, { status: 500 });
  }
};

export { POST }
