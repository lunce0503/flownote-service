import type { Block } from "@blocknote/core";

export interface BlockDataProps {
  id: string;
  title: string;
  content: Block[];
  created_at: Date;
}
