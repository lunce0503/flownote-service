import { SocialWidget } from "../../widgets";

const SocialPage = () => (
    <section className="min-h-[calc(100vh-56px)] bg-stone-950 py-3 text-stone-900">
        <div className="mx-auto max-w-7xl px-3">
            <div className="mb-3">
                <h1 className="text-2xl font-black text-white md:text-3xl">Social</h1>
                <p className="text-sm text-stone-400">팀원과 메시지, 사진, 영상, 파일을 주고받습니다.</p>
            </div>
            <SocialWidget />
        </div>
    </section>
);

export default SocialPage;
