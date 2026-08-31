import { useEffect, useState } from "react";
import { ConfigurationSchema } from "@ax/schema";

type Health = { status: string; schemaLoaded: boolean };

const clientSchemaLoaded = typeof ConfigurationSchema.parse === "function";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800">AX Page Editor</h1>
        <p className="mt-2 text-slate-500">
          {health
            ? `server: ${health.status}, server schema: ${String(health.schemaLoaded)}`
            : "connecting…"}
        </p>
        <p className="mt-1 text-sm text-slate-400">client schema: {String(clientSchemaLoaded)}</p>
      </div>
    </div>
  );
}
