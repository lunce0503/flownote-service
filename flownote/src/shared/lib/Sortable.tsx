import { useSortable } from "@dnd-kit/react/sortable"
import { useState } from "react";

interface SortableProps {
    id: string;
    index: number;
    children?: React.ReactNode;
}
const Sortable = ({id, index, children} : SortableProps) => {
    const [element, setElement] = useState<Element | null>(null);
    const {isDragging} = useSortable({id, index, element});

    return (
        <div
            ref={setElement}
            className="item"
            data-shadow={isDragging || undefined}
            style={{height: '100%', justifyContent: 'center'}}
        >
            {children}
        </div>
        );
    }
export default Sortable;
