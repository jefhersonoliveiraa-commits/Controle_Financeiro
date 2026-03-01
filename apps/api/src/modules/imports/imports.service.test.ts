import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { ImportsService } from "./imports.service.js";

test("ImportsService.previewTransactions marks duplicated rows by external hash", async () => {
  const accountId = "00000000-0000-0000-0000-000000000001";
  const categoryId = "00000000-0000-0000-0000-000000000002";
  const base = "2026-01-05|250.00|conta de luz|" + accountId;
  const duplicateHash = createHash("sha256").update(base).digest("hex");

  const prisma = {
    account: {
      findFirst: async () => ({ id: accountId })
    },
    category: {
      findFirst: async () => ({ id: categoryId })
    },
    transaction: {
      findMany: async (query: { where?: { externalHash?: { in: string[] } } }) => {
        if (query.where?.externalHash?.in) {
          return [{ id: "trx-dup", externalHash: duplicateHash }];
        }
        return [];
      }
    }
  };

  const service = new ImportsService(prisma as never);

  const result = await service.previewTransactions("user-1", {
    fileName: "extrato.csv",
    csvContent: `2026-01-05;Conta de luz;250;EXPENSE;${categoryId}`,
    delimiter: ";",
    hasHeader: false,
    accountId,
    defaultType: "EXPENSE",
    defaultBehavior: "VARIABLE",
    defaultStatus: "PENDING",
    defaultCategoryId: categoryId
  });

  assert.equal(result.totalRows, 1);
  assert.equal(result.duplicateRows, 1);
  assert.equal(result.rows[0]?.status, "DUPLICATE");
  assert.equal(result.rows[0]?.duplicateOfTransactionId, "trx-dup");
});

