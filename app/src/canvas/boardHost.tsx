import { createContext, useContext, type ReactNode } from "react";

export type BoardHost = { width: number; height: number };

const BoardHostCtx = createContext<BoardHost>({ width: 1200, height: 700 });

export function BoardHostProvider({
  value,
  children,
}: {
  value: BoardHost;
  children: ReactNode;
}) {
  return <BoardHostCtx.Provider value={value}>{children}</BoardHostCtx.Provider>;
}

export function useBoardHost() {
  return useContext(BoardHostCtx);
}
