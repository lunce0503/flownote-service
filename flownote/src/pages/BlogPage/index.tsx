import BlogList from "../../widgets/BlogWidget/BlogList";

const BlogPage = () => {
    return (
        <div className="flex flex-row">
            <div className="flex-2">
                <BlogList />
            </div>
        </div>
    );
};

export default BlogPage;