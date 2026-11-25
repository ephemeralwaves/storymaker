import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/unifrakturcook/700.css";
import { App } from "./App";
import { StoryProvider } from "./lib/store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoryProvider>
      <App />
    </StoryProvider>
  </StrictMode>,
);
