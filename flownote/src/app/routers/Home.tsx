import TaskTable from "../../widgets/TaskWidget/TaskTable";
import Chat from "../../widgets/SocialWidget/Chat";


const Home = () => {
    return (
        <div className="grid grid-cols-20 grid-rows-5">
            <div className="col-span-10 row-start-1">
                <Chat/>
            </div>
            <div className="col-span-10 p-4 row-start-1">
                <TaskTable />
            </div>
        </div>
    );
};

export default Home;