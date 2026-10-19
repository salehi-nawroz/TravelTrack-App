import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ConfigError from "./pages/ConfigError.jsx";
import { CONFIG_PROBLEMS } from "./config/env";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  CONFIG_PROBLEMS.length ? <ConfigError problems={CONFIG_PROBLEMS} /> : <App />,
);
