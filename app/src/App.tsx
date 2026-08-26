import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { Chrome } from "./components/kit";
import { useSession } from "./context/session";
import { WorkspaceProvider } from "./context/workspace";
import { LoginPage } from "./pages/Login";
import { StudioPage } from "./pages/Studio";

function Shell() {
  const { session, signOut } = useSession();
  const nav = useNavigate();
  if (!session) return <Navigate to="/login" replace />;
  return (
    <WorkspaceProvider>
      <Chrome
        session={session}
        onSignOut={() => { signOut(); nav("/login"); }}
      />
      <Outlet />
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<StudioPage />} />
        <Route path="/boxouts" element={<Navigate to="/?app=boxouts" replace />} />
        <Route path="/parts" element={<Navigate to="/?app=simpleparts" replace />} />
        <Route path="/plyworks" element={<Navigate to="/?app=plyworks" replace />} />
        <Route path="/projects" element={<Navigate to="/?app=projects" replace />} />
        <Route path="/orbit" element={<Navigate to="/?app=orbit" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
