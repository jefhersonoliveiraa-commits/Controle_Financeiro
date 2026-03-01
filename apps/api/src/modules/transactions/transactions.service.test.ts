import assert from "node:assert/strict";
import test from "node:test";
import { TransactionsService } from "./transactions.service.js";

test("TransactionsService.create blocks foreign account/category references", async () => {
  const prisma = {
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    account: {
      findFirst: async () => null
    },
    category: {
      findFirst: async () => ({ id: "cat-1" })
    },
    party: {
      findFirst: async () => ({ id: "party-1" })
    },
    recurrence: {
      findFirst: async () => ({ id: "rec-1" })
    },
    goal: {
      findFirst: async () => ({ id: "goal-1" })
    }
  };

  const goalsService = {
    recalculateGoal: async () => ({})
  };

  const service = new TransactionsService(prisma as never, goalsService as never);

  await assert.rejects(
    service.create("user-1", {
      type: "EXPENSE",
      description: "Teste",
      categoryId: "00000000-0000-0000-0000-000000000001",
      accountId: "00000000-0000-0000-0000-000000000002",
      dueDate: "2026-01-10",
      amountPlanned: 100,
      status: "PENDING",
      behavior: "FIXED",
      isInstallment: false
    }),
    /Conta informada nao pertence ao usuario/
  );
});

test("TransactionsService.updateCardSplits validates split sum against planned amount", async () => {
  const prisma = {
    transaction: {
      findFirst: async () => ({
        id: "trx-1",
        type: "EXPENSE",
        account: { type: "CREDIT_CARD" },
        amountPlanned: { toString: () => "100.00" },
        cardSplits: []
      })
    },
    party: {
      findFirst: async () => ({ id: "party-1" })
    }
  };

  const goalsService = {
    recalculateGoal: async () => ({})
  };

  const service = new TransactionsService(prisma as never, goalsService as never);

  await assert.rejects(
    service.updateCardSplits("user-1", "trx-1", {
      splits: [
        { ownerType: "SELF", amount: 40 },
        { ownerType: "SELF", amount: 50 }
      ]
    }),
    /A soma dos splits deve ser igual ao valor planejado/
  );
});

test("TransactionsService.thirdPartyReceivables aggregates pending and received rows", async () => {
  const prisma = {
    account: {
      findMany: async () => []
    },
    transaction: {
      findMany: async () => [
        {
          id: "trx-1",
          description: "Restaurante",
          type: "EXPENSE",
          status: "PAID",
          behavior: "FIXED",
          dueDate: new Date("2026-02-10T12:00:00.000Z"),
          amountPlanned: { toString: () => "120.00" },
          amountActual: { toString: () => "120.00" },
          cardOwnership: "SELF",
          thirdPartyReceivedAt: null,
          category: { id: "cat-1", name: "Lazer", color: "#22c55e" },
          account: { id: "acc-1", name: "Nubank", type: "CREDIT_CARD" },
          party: null,
          cardSplits: [
            {
              id: "split-self",
              ownerType: "SELF",
              amount: { toString: () => "50.00" },
              partyId: null,
              party: null,
              receivedAt: null
            },
            {
              id: "split-third",
              ownerType: "THIRD_PARTY",
              amount: { toString: () => "70.00" },
              partyId: "party-1",
              party: { id: "party-1", name: "Joao" },
              receivedAt: null
            }
          ]
        },
        {
          id: "trx-2",
          description: "Combustivel",
          type: "EXPENSE",
          status: "PAID",
          behavior: "FIXED",
          dueDate: new Date("2026-02-12T12:00:00.000Z"),
          amountPlanned: { toString: () => "80.00" },
          amountActual: { toString: () => "80.00" },
          cardOwnership: "THIRD_PARTY",
          thirdPartyReceivedAt: new Date("2026-02-13T12:00:00.000Z"),
          category: { id: "cat-2", name: "Transporte", color: "#f97316" },
          account: { id: "acc-1", name: "Nubank", type: "CREDIT_CARD" },
          party: { id: "party-2", name: "Maria" },
          cardSplits: []
        }
      ]
    }
  };

  const goalsService = {
    recalculateGoal: async () => ({})
  };

  const service = new TransactionsService(prisma as never, goalsService as never);
  const result = await service.thirdPartyReceivables("user-1", { reference: "2026-02" });

  assert.equal(result.reference, "2026-02");
  assert.equal(result.rows.length, 2);
  assert.equal(result.totals.totalThirdParty, 150);
  assert.equal(result.totals.totalPending, 70);
  assert.equal(result.totals.totalReceived, 80);
});
