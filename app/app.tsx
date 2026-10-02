import { createElement, lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeContext, useThemeProvider } from "~/hooks/use-theme";
const LocationPage = lazy(() => import("~/pages/location-page"));
const NativeModePage = lazy(() => import("~/pages/native-mode-page"));
const RevitImportPage = lazy(() => import("~/pages/revit-import-page"));
const ViewerModePage = lazy(() => import("~/pages/viewer-mode-page"));
const ViewerModesPage = lazy(() => import("~/pages/viewer-modes-page"));
const WelcomePage = lazy(() => import("~/pages/welcome-page"));
const IndoorProjectPage = lazy(() => import("~/pages/indoor-project-page"));

export default function App() {
  const themeValue = useThemeProvider();

  return createElement(
    ThemeContext.Provider,
    { value: themeValue },
    <BrowserRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Suspense fallback={<div role="status">Loading map…</div>}>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/modes" element={<ViewerModesPage />} />
          <Route path="/modes/:modeId" element={<ViewerModePage />} />
          <Route path="/modes/native/:skinId" element={<NativeModePage />} />
          <Route
            path="/imports/revit/:importId"
            element={<RevitImportPage />}
          />
          <Route path="/projects/indoor" element={<IndoorProjectPage />} />
          <Route path="/:locationId" element={<LocationPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>,
  );
}
