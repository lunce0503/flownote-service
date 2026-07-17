import { Maximize2, Minimize2 } from "lucide-react";
import { BlockNoteWidget } from "@/widgets";
import { useFullscreen } from "@/shared/lib/useFullscreen";

const BlogDetailPage = () => {
    const { isFullscreen, toggleFullscreen } = useFullscreen();

    return (
        <div className="flex flex-row">
            <div className="flex-4">
                <BlockNoteWidget />
            </div>

            {/* 영상 전체 화면처럼 브라우저 UI와 Flownote 헤더를 숨기고 노트에 집중한다. */}
            <button
                type="button"
                onClick={() => { void toggleFullscreen(); }}
                className="fixed bottom-6 right-6 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-bold text-white shadow-lg transition hover:bg-stone-700 active:scale-95"
                title={isFullscreen ? "전체 보기 종료 (Esc)" : "브라우저 툴바와 헤더를 숨기고 전체 화면으로 봅니다"}
                aria-pressed={isFullscreen}
            >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                {isFullscreen ? "전체 보기 종료" : "전체로 보기"}
            </button>
        </div>
    );
};

export default BlogDetailPage;
