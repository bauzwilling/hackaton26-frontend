import { useCallback, useRef, useState } from "react";
import { LayoutGroup } from "framer-motion";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { Chrome } from "./components/kit";
import { useSession } from "./context/session";
import { HelpOverlay } from "./canvas/HelpTour";
import { HelpProvider } from "./context/help";
import { WorkspaceProvider } from "./context/workspace";
import { LoginPage } from "./pages/Login";
import { StudioPage, type StudioLeave } from "./pages/Studio";

function Shell() {
  const { session, signOut } = useSession();
  const nav = useNavigate();
  const loggingOut = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const finishLogout = useCallback(() => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    signOut();
    nav("/login", { replace: true, state: { fromLogout: true } });
  }, [nav, signOut]);
  if (!session && !loggingOut.current) return <Navigate to="/login" replace />;
  const leave: StudioLeave = { leaving, onLeaveDone: finishLogout };
  return (
    <WorkspaceProvider>
      <HelpProvider>
        <Chrome
          session={session}
          leaving={leaving}
          onSignOut={() => {
            if (leaving || loggingOut.current) return;
            setLeaving(true);
          }}
        />
        <Outlet context={leave} />
        <HelpOverlay />
      </HelpProvider>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <LayoutGroup>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<StudioPage />} />
          <Route path="/boxouts" element={<Navigate to="/?app=boxouts" replace />} />
          <Route path="/parts" element={<Navigate to="/?app=simpleparts" replace />} />
          <Route path="/plyworks" element={<Navigate to="/?app=plyworks" replace />} />
          <Route path="/projects" element={<Navigate to="/?app=projects" replace />} />
          <Route path="/orbit" element={<Navigate to="/?app=orbit" replace />} />
          <Route path="/admin" element={<Navigate to="/?app=admin" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LayoutGroup>
  );
}
