// Checks the SEBI registration a channel claims against a dated copy of SEBI's public register of
// Research Analysts (INH…) and Investment Advisers (INA…).
import type { Channel } from "./types";

export interface Register {
  /** date the register was copied from sebi.gov.in */
  asOf: string;
  /** registration number -> [registered name, valid from, valid to] */
  ra: Record<string, [string, string, string]>;
  ia: Record<string, [string, string, string]>;
}

export interface ClaimedRegistration {
  regNo: string;
  type: "research-analyst" | "investment-adviser";
  where: "description" | "message";
  msgId?: number;
  /** null when the register could not be loaded */
  onRegister: boolean | null;
  registeredName?: string;
  validFrom?: string;
  validTo?: string;
}

export interface RegistrationReport {
  claimed: ClaimedRegistration[];
  registerAsOf?: string;
  /** mentions SEBI registration in words but shows no number */
  mentionsWithoutNumber: boolean;
}

// INH000011954, INA000000037, and the IFSC-zone form INAIFSC10001
const REG_NO = /\bIN[HA](?:\d{9}|IFSC\d{5})\b/gi;

export function checkRegistration(channel: Pick<Channel, "description" | "messages">, register: Register | null): RegistrationReport {
  const seen = new Map<string, ClaimedRegistration>();
  const note = (text: string | undefined, where: "description" | "message", msgId?: number) => {
    for (const m of text?.toUpperCase().matchAll(REG_NO) ?? []) {
      const regNo = m[0];
      if (seen.has(regNo)) continue;
      const type = regNo.startsWith("INH") ? "research-analyst" : "investment-adviser";
      const row = register ? (type === "research-analyst" ? register.ra : register.ia)[regNo] : undefined;
      seen.set(regNo, {
        regNo,
        type,
        where,
        ...(msgId !== undefined ? { msgId } : {}),
        onRegister: register ? !!row : null,
        ...(row ? { registeredName: row[0], validFrom: row[1], validTo: row[2] } : {}),
      });
    }
  };
  note(channel.description, "description");
  let words = /SEBI\s+(?:REG|REGISTERED|REGISTRATION|REGD)/i.test(channel.description ?? "");
  for (const m of channel.messages) {
    note(m.text, "message", m.id);
    if (!words && /SEBI\s+(?:REG|REGISTERED|REGISTRATION|REGD)/i.test(m.text)) words = true;
  }
  return { claimed: [...seen.values()], registerAsOf: register?.asOf, mentionsWithoutNumber: words && seen.size === 0 };
}
