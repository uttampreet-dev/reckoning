import { Masthead } from "@/components/Masthead";
import { MethodPage } from "@/components/MethodPage";

export const metadata = { title: "How it is checked — Reckoning" };

export default function Method() {
  return (
    <div className="min-h-dvh bg-page text-type">
      <Masthead />
      <main>
        <MethodPage />
      </main>
    </div>
  );
}
