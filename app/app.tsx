import { createElement } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeContext, useThemeProvider } from "~/hooks/use-theme";
import LocationPage from "~/pages/location-page";
import NativeModePage from "~/pages/native-mode-page";
import RevitImportPage from "~/pages/revit-import-page";
import ViewerModePage from "~/pages/viewer-mode-page";
import ViewerModesPage from "~/pages/viewer-modes-page";
import WelcomePage from "~/pages/welcome-page";

export default function App() {
  const themeValue = useThemeProvider();

  return createElement(
    ThemeContext.Provider,
    { value: themeValue },
    <BrowserRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/modes" element={<ViewerModesPage />} />
        <Route path="/modes/:modeId" element={<ViewerModePage />} />
        <Route path="/modes/native/:skinId" element={<NativeModePage />} />
        <Route path="/imports/revit/:importId" element={<RevitImportPage />} />
        <Route path="/:locationId" element={<LocationPage />} />
      </Routes>
    </BrowserRouter>,
  );
}
