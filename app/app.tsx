import { createElement } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeContext, useThemeProvider } from "~/hooks/use-theme";
import LocationPage from "~/pages/location-page";
import RevitImportPage from "~/pages/revit-import-page";
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
        <Route path="/imports/revit/:importId" element={<RevitImportPage />} />
        <Route path="/:locationId" element={<LocationPage />} />
      </Routes>
    </BrowserRouter>,
  );
}
