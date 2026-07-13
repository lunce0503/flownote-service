import { BlogListWidget } from "@/widgets";

const BlogPage = () => {
    return (
        <div className="flex flex-row">
            <div className="flex-2">
                <BlogListWidget />
            </div>
        </div>
    );
};

export default BlogPage;
