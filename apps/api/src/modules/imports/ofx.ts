type OfxInputFormat = "OFX";

export type ParsedOfxTransaction = {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  externalRef?: string;
  memo?: string;
};

export type ParsedOfxDocument = {
  sourceFormat: OfxInputFormat;
  bankId?: string;
  accountRef?: string;
  transactions: ParsedOfxTransaction[];
};

function decodeEntities(input: string) {
  return input
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function extractTagValue(block: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, "i");
  const match = block.match(regex);
  if (!match?.[1]) return undefined;
  return decodeEntities(match[1].trim());
}

function normalizeOfxDate(raw?: string) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return "";
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const date = new Date(`${year}-${month}-${day}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function normalizeOfxAmount(raw?: string) {
  if (!raw) return NaN;
  const compact = raw.replace(/\s/g, "");
  const normalized =
    compact.includes(",") && compact.includes(".")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.includes(",")
        ? compact.replace(",", ".")
        : compact;
  return Number(normalized);
}

function resolveType(trnTypeRaw: string | undefined, amount: number): "INCOME" | "EXPENSE" {
  const trnType = (trnTypeRaw ?? "").toUpperCase();
  if (
    trnType.includes("DEBIT") ||
    trnType.includes("PAYMENT") ||
    trnType.includes("WITHDRAWAL") ||
    trnType.includes("XFEROUT")
  ) {
    return "EXPENSE";
  }
  if (
    trnType.includes("CREDIT") ||
    trnType.includes("DEP") ||
    trnType.includes("INT") ||
    trnType.includes("XFERIN")
  ) {
    return "INCOME";
  }
  return amount < 0 ? "EXPENSE" : "INCOME";
}

function extractStmtTrnBlocks(content: string): string[] {
  const blocks: string[] = [];
  const normalized = content.replace(/\r/g, "");
  const matches = [...normalized.matchAll(/<STMTTRN>/gi)];
  if (matches.length === 0) {
    return blocks;
  }

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index]?.index ?? -1;
    if (start < 0) continue;
    const nextStart = matches[index + 1]?.index ?? normalized.length;
    const rawSegment = normalized.slice(start, nextStart);
    const closingMatch = rawSegment.match(/<\/STMTTRN>/i);
    if (closingMatch?.index !== undefined) {
      blocks.push(rawSegment.slice(0, closingMatch.index + "</STMTTRN>".length));
      continue;
    }
    blocks.push(rawSegment);
  }

  return blocks;
}

export function parseOfxContent(content: string): ParsedOfxDocument {
  const trimmed = content.replace(/^\uFEFF/, "").trim();
  const bankId = extractTagValue(trimmed, "BANKID");
  const accountRef = extractTagValue(trimmed, "ACCTID");
  const trnBlocks = extractStmtTrnBlocks(trimmed);

  const transactions: ParsedOfxTransaction[] = trnBlocks
    .map((block, index) => {
      const postedAt = normalizeOfxDate(extractTagValue(block, "DTPOSTED"));
      const amountRaw = normalizeOfxAmount(extractTagValue(block, "TRNAMT"));
      const amount = Number.isFinite(amountRaw) ? Math.abs(amountRaw) : NaN;
      const name = extractTagValue(block, "NAME") ?? "";
      const memo = extractTagValue(block, "MEMO");
      const externalRef = extractTagValue(block, "FITID");
      const description = (name || memo || "Lancamento OFX").trim();
      const type = resolveType(extractTagValue(block, "TRNTYPE"), amountRaw);

      return {
        rowNumber: index + 1,
        date: postedAt,
        description,
        amount,
        type,
        externalRef,
        memo
      };
    })
    .filter((item) => item.description.length > 0);

  return {
    sourceFormat: "OFX",
    bankId,
    accountRef,
    transactions
  };
}
