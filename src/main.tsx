import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

const missingEnv = [
  !import.meta.env.VITE_SUPABASE_URL && "VITE_SUPABASE_URL",
  !(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) && "VITE_SUPABASE_PUBLISHABLE_KEY",
].filter(Boolean) as string[];

if (missingEnv.length > 0) {
  // Show a readable error instead of a page where every action silently fails.
  root.render(
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-bold">Configuration missing</h1>
        <p className="text-sm text-muted-foreground">
          The app can't connect to its backend because these environment variables are not set:
        </p>
        <pre className="text-xs bg-muted rounded-md p-3">{missingEnv.join("\n")}</pre>
        <p className="text-sm text-muted-foreground">
          Copy <code>.env.example</code> to <code>.env</code>, fill in your Supabase project values, and restart the app.
        </p>
      </div>
    </div>,
  );
} else {
  // Load the app only once the configuration is known to be present.
  import("./App.tsx").then(({ default: App }) => root.render(<App />));
}
