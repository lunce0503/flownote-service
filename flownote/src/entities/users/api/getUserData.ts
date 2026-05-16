import axios from "axios";
import { API_CORE_BASE_URL } from "../../../shared/api";

const getUserData = async () => {
    try {
            const response = await axios.get(`${API_CORE_BASE_URL}/api/users`);
            console.log("Fetched users:", response.data);
            return response.data;
        } catch (error) {
            console.error("Error fetching users:", error);
            return [];
        }
};

export default getUserData;
