import { SocialWidget } from "../../widgets";

const SocialPage = () => (
    <section className="min-h-[calc(100vh-56px)] bg-stone-100 py-4 text-stone-900">
        <div className="mx-auto max-w-7xl px-3 md:px-4">
            <div className="mb-4 border-b border-stone-200 pb-4">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-amber-700">Social</p>
                    <h1 className="flex items-center gap-2 text-2xl font-black text-stone-950 md:text-3xl">
                        소셜
                    </h1>
                    <p className="mt-1 text-sm text-stone-500">팀원과 메시지, 사진, 영상, 파일을 주고받습니다.</p>
                </div>
            </div>
            <SocialWidget />
        </div>
    </section>
);

export default SocialPage;
