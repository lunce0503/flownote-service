import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useEffect, useState } from "react";
import {
  BlockNoteSchema,
  type Block,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import postNoteData from "../../../entities/blog/postNoteData";
import { useParams } from "react-router-dom";
import getNoteData from "../../../entities/blog/getNoteData";
import { API_BASE_URL2, authHeaders } from "../../../shared/api";
import axios from "axios";
import { LatexInline } from "./LatexInline";
import { transformLatexInlineContent } from "./latexTransform";

interface BlockDataProps {
  id: string;
  title: string;
  content: Block[];
  created_at: Date;
}
const uploadFile = async (file: File) => {
  const body = new FormData();
  body.append("file", file);

  const response = await axios.post(`${API_BASE_URL2}/api/notes/upload`, body, {
    headers: authHeaders(),
  });

  const data = response.data;
  const finalUrl = `${API_BASE_URL2}${data.fileUrl}`;
  
  console.log("최종 전달된 이미지 URL:", finalUrl); // 디버깅용
  return finalUrl;
}
const  BlockNote = () => {
  const { title } = useParams<{title:string}>();

  const schema = BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      latex: LatexInline,
    },
  });

  const editor = useCreateBlockNote({
    schema,
    uploadFile,    
  });
  const [noteData,setNoteData] = useState<BlockDataProps | null>(null);
  const [isLoading,setIsLoading] = useState<boolean>(true);
  
  // 1. 페이지 진입 시 데이터 로드 로직
  useEffect(() => {
    const fetchData = async () => {
      if (title) {
        const decodedTitle = decodeURIComponent(title);
        try {
          setIsLoading(true);
          // 실제 환경에서는 여기서 API 호출을 합니다.
          // const data = await getNoteByTitle(decodedTitle);
          const data: BlockDataProps[] = await getNoteData();
          const targetData = data.find((note)=>note.title===decodedTitle)
          if (targetData){
            setNoteData(targetData);

          // 데이터에 내용(Block)이 있다면 에디터에 주입
            if (targetData.content.length > 0) {
              editor.replaceBlocks(editor.document, targetData.content);
            } else {
              setNoteData(null);
            }
          
          }
        } catch (error) {
          console.error("Failed to fetch note:", error);
        } finally {
          setIsLoading(false); // 로딩 해제 (이게 있어야 화면이 뜹니다!)
        }
      }
    };
    fetchData();
  }, [title, editor]);

  const handleTitle = (title:string) => {
    if (!noteData) return;
    setNoteData({
      ...noteData, 
      title: title
    }); 
  }

  const normalizeLatexInBlocks = (blocks: Block[]) => {
    for (const block of blocks) {
      if (Array.isArray(block.content)) {
        const { changed, content } = transformLatexInlineContent(block.content);

        if (changed) {
          editor.updateBlock(block.id, {
            content,
          });
        }
      }

      if (block.children.length > 0) {
        normalizeLatexInBlocks(block.children);
      }
    }
  }

  const handleNoteData = () => {
    if (!noteData) return;

    normalizeLatexInBlocks(editor.document);

    const current = editor.document;
    const blockData : BlockDataProps= {
      ...noteData,
      content : current,
      created_at: new Date()
    } 
    postNoteData(blockData)
  }

  if (isLoading) return <div className="p-10 text-center text-stone-500">노트를 불러오는 중...</div>;
  if (!noteData) return <div className="p-10 text-center text-stone-500">노트를 찾을 수 없습니다.</div>;
  
  return (
    <div className="m-4 bg-white rounded-xl p-4">
      <div className='note-header mb-2 bg-amber-100 text-stone-800 rounded-xl p-1'>
        <input 
          type="text" 
          className=" m-1 text-2xl"
          value={noteData && noteData.title}
          onChange={(e) => {handleTitle(e.target.value);}}
          placeholder="Title"
        />
      </div>
      
      <BlockNoteView 
        editor={editor} 
        onChange={handleNoteData}
        theme="light"
      />
      
    </div>
  );
}

export default BlockNote;
export type {BlockDataProps};
