import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { SettingsModal } from "./components/SettingsModal";
import { syncNavigationStack } from "./lib/navigation";
import { LibraryPage } from "./routes/LibraryPage";
import { LearningPage } from "./routes/LearningPage";
import { QuestionPage } from "./routes/QuestionPage";
import { SettingsPage } from "./routes/SettingsPage";
import { useAppStore } from "./store/appStore";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { bootstrap, theme } = useAppStore();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    return window.hinterviewDesktop?.onOpenSettings?.(() => {
      navigate("/settings");
    });
  }, [navigate]);

  useEffect(() => {
    syncNavigationStack(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
  }, [theme]);

  return (
    <AppErrorBoundary>
      <AppHeader />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/learning" element={<LearningPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/questions/:slug" element={<QuestionPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
      <SettingsModal />
    </AppErrorBoundary>
  );
}

export default App;
