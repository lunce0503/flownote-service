import { SocialWidget } from "../../widgets";
import { MessageSquareText, Users } from "lucide-react";

const SocialPage = () => (
    <section className="min-h-[calc(100vh-56px)] bg-stone-100 py-4 text-stone-900">
        <div className="mx-auto max-w-7xl px-3 md:px-4">
            <div className="mb-4 flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-800">
                        <Users size={14} />
                        Social
                    </div>
                    <h1 className="flex items-center gap-2 text-2xl font-black text-stone-950 md:text-3xl">
                        <MessageSquareText size={28} className="text-stone-700" />
                        소셜
                    </h1>
                    <p className="mt-1 text-sm text-stone-500">팀원과 메시지, 사진, 영상, 파일을 주고받습니다.</p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 shadow-sm">
                    <MessageSquareText size={16} className="text-blue-700" />
                    실시간 대화
                </div>
            </div>
            <SocialWidget />
        </div>
    </section>
);

export default SocialPage;
