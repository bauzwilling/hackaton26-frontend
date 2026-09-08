import { Configurator } from "./components/Configurator";
import { JointWizPage } from "./components/JointWizPage";
import { NestingPage } from "./components/NestingPage";

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/nesting")) return <NestingPage />;
  if (path.endsWith("/jw")) return <JointWizPage />;
  return <Configurator />;
}
