import { CaseFile } from "@/components/CaseFile";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "A SEBI case — Reckoning" };

export default function Case() {
  return (
    <div className="min-h-dvh bg-page text-type">
      <Masthead />
      <main>
        <CaseFile />
      </main>
    </div>
  );
}
