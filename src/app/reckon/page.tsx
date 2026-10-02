import { Suspense } from "react";
import { Masthead } from "@/components/Masthead";
import { ReckonScreen } from "@/components/reckon/ReckonScreen";

export const metadata = { title: "Reckon a channel — Reckoning" };

export default function ReckonPage() {
  return (
    <div className="min-h-dvh bg-page text-type">
      <Masthead />
      <main>
        <Suspense><ReckonScreen /></Suspense>
      </main>
    </div>
  );
}
