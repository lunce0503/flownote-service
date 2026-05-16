import { useEffect, useState, type ReactElement } from "react";
import getNoteData from "../../../entities/blog/getNoteData";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import postNoteData from "../../../entities/blog/postNoteData";
import { v4 as uuidv4 } from "uuid";
import type { BlockDataProps } from "../BlockNote/BlockNote";
interface BlogViewerBlockProps{
    title : string;
    preview? : ReactElement;
}

const Bloglist = () => {
    const [blogList, setBlogList] = useState<BlogViewerBlockProps[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(()=>{
        handleBlogList();
    }, [])

    const handleBlogList = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getNoteData();
                
            const list = data.map((item: any) => ({
                title: item.title,
                preview: <div>{item.content?.[0]?.content?.[0]?.text || "No content"}</div>, // 간단한 미리보기
            }));
            setBlogList(list);
            
        } catch (err){
            console.error("Failed to fetch blog data:",err)
            setError("데이터를 불러오는 중 오류가 발생했습니다.")
        } finally{
            setLoading(false);
        }
        
    };

    const AddBlogNote = () => {
        const newId = uuidv4();
        const newTitle = `새 노트_${new Date().getTime()}`
        const blankNote: BlockDataProps = {
            title: newTitle,
            id: newId,
            content: [
                        {
                            id: uuidv4(), // 블록 자체의 고유 ID가 필요함
                            type: "paragraph",
                            content: [],
                            props: {
                                textColor: "default",
                                backgroundColor: "default",
                                textAlignment: "left",
                            },
                            children: [],
                        }
                    ] as any,
            created_at : new Date()
        } 
        setBlogList((prev)=>([...prev, blankNote]));
        postNoteData(blankNote);
    }
    return (
        <div className="m-4 bg-white rounded-xl p-4">
            {/* Blog List Title*/}
            <div className="bg-amber-100 mt-5 hover:bg-amber-200 text-stone-800 font-bold py-4 px-4 rounded">
                {loading ? "Loading" : "Load Blog List"}
            </div>
            {/* Blog List */}
            
            <div className="flex flex-col items-start">
                {
                    blogList.length > 0 ? (
                        blogList.map((blog, index) => (
                            <Link
                                to={`/blog/${encodeURIComponent(blog.title)}`}
                                className="flex-1 flex w-full flex-col text-black items-start stone-300 rounded-md p-2 mb-2 hover:bg-stone-400" 
                                key={index}
                            >
                                <h3 className="flex-1">{blog.title}</h3>
                                <span className="text-xs flex-1">{blog.preview}</span>
                            </Link>
                        ))
                    ):(
                        !loading && <p>작성된 글이 없습니다</p>
                    )
                }
                <button 
                    className="flex-1 flex w-full flex-col text-black items-center stone-300 rounded-md p-2 mb-2 hover:bg-stone-400"
                    onClick={AddBlogNote}
                ><Plus/></button>
            </div>
            
        </div>
    )
}

export default Bloglist;