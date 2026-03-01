import { PrismaClient } from "@prisma/client";
import { addMonths, startOfMonth } from "date-fns";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function run() {
  const userEmail = "demo@financeiro.app";
  const existingUser = await prisma.user.findUnique({ where: { email: userEmail } });

  const user =
    existingUser ??
    (await prisma.user.create({
      data: {
        name: "Usuario Demo",
        email: userEmail,
        passwordHash: await bcrypt.hash("123456", 10),
        role: "ADMIN"
      }
    }));

  await prisma.transactionHistory.deleteMany({
    where: { transaction: { userId: user.id } }
  });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.goalSchedule.deleteMany({ where: { goal: { userId: user.id } } });
  await prisma.goal.deleteMany({ where: { userId: user.id } });
  await prisma.installmentPlan.deleteMany({ where: { userId: user.id } });
  await prisma.recurrence.deleteMany({ where: { userId: user.id } });
  await prisma.party.deleteMany({ where: { userId: user.id } });
  await prisma.category.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });

  const [inter, nubank, dinheiro] = await prisma.$transaction([
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Inter",
        type: "BANK_ACCOUNT",
        initialBalance: 5000,
        initialBalanceDate: new Date()
      }
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Nubank",
        type: "CREDIT_CARD",
        initialBalance: 0,
        initialBalanceDate: new Date(),
        creditLimit: 3000,
        statementClosingDay: 5,
        statementDueDay: 12
      }
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Dinheiro",
        type: "CASH",
        initialBalance: 300,
        initialBalanceDate: new Date()
      }
    })
  ]);

  const categories = await prisma.$transaction([
    prisma.category.create({
      data: { userId: user.id, name: "Salario", type: "INCOME", color: "#10b981", icon: "Wallet" }
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Moradia", type: "EXPENSE", color: "#ef4444", icon: "Home" }
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Internet", type: "EXPENSE", color: "#3b82f6", icon: "Wifi" }
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Energia", type: "EXPENSE", color: "#f59e0b", icon: "Zap" }
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Compras", type: "EXPENSE", color: "#8b5cf6", icon: "ShoppingBag" }
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Metas", type: "EXPENSE", color: "#06b6d4", icon: "Target" }
    })
  ]);

  const salaryCategory = categories.find((item) => item.name === "Salario")!;
  const rentCategory = categories.find((item) => item.name === "Moradia")!;
  const internetCategory = categories.find((item) => item.name === "Internet")!;
  const energyCategory = categories.find((item) => item.name === "Energia")!;
  const shoppingCategory = categories.find((item) => item.name === "Compras")!;
  const goalCategory = categories.find((item) => item.name === "Metas")!;

  await prisma.party.createMany({
    data: [
      { userId: user.id, name: "Empresa XYZ", type: "PAYER" },
      { userId: user.id, name: "Imobiliaria Central", type: "RECEIVER" },
      { userId: user.id, name: "Provedor Net", type: "RECEIVER" }
    ]
  });

  await prisma.recurrence.createMany({
    data: [
      {
        userId: user.id,
        type: "INCOME",
        description: "Salario",
        defaultAmount: 8000,
        behavior: "FIXED",
        dayOfMonth: 5,
        frequency: "MONTHLY",
        accountId: inter.id,
        categoryId: salaryCategory.id,
        startsAt: startOfMonth(new Date()),
        autoGenerateMonthly: true
      },
      {
        userId: user.id,
        type: "EXPENSE",
        description: "Aluguel",
        defaultAmount: 2500,
        behavior: "FIXED",
        dayOfMonth: 10,
        frequency: "MONTHLY",
        accountId: inter.id,
        categoryId: rentCategory.id,
        startsAt: startOfMonth(new Date()),
        autoGenerateMonthly: true
      },
      {
        userId: user.id,
        type: "EXPENSE",
        description: "Internet",
        defaultAmount: 150,
        behavior: "FIXED",
        dayOfMonth: 12,
        frequency: "MONTHLY",
        accountId: inter.id,
        categoryId: internetCategory.id,
        startsAt: startOfMonth(new Date()),
        autoGenerateMonthly: true
      },
      {
        userId: user.id,
        type: "EXPENSE",
        description: "Energia",
        defaultAmount: 280,
        behavior: "PROVISION",
        dayOfMonth: 15,
        frequency: "MONTHLY",
        accountId: inter.id,
        categoryId: energyCategory.id,
        startsAt: startOfMonth(new Date()),
        autoGenerateMonthly: true
      }
    ]
  });

  const plan = await prisma.installmentPlan.create({
    data: {
      userId: user.id,
      type: "EXPENSE",
      description: "Notebook novo",
      totalAmount: 12000,
      installmentAmount: 1000,
      installments: 12,
      frequency: "MONTHLY",
      isVariable: false,
      startDate: new Date(),
      accountId: nubank.id,
      categoryId: shoppingCategory.id
    }
  });

  await prisma.transaction.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      userId: user.id,
      type: "EXPENSE",
      description: `Notebook novo - Parcela ${index + 1}/12`,
      categoryId: shoppingCategory.id,
      accountId: nubank.id,
      dueDate: addMonths(new Date(), index),
      amountPlanned: 1000,
      status: "PENDING",
      behavior: "FIXED",
      installmentPlanId: plan.id,
      installmentNumber: index + 1,
      installmentTotal: 12
    }))
  });

  const goal = await prisma.goal.create({
    data: {
      userId: user.id,
      name: "Juntar R$20.000",
      targetAmount: 20000,
      initialAccumulatedAmount: 0,
      accumulatedAmount: 0,
      dueDate: addMonths(new Date(), 10),
      accountId: inter.id,
      categoryId: goalCategory.id,
      saveDayOfMonth: 25,
      status: "ACTIVE"
    }
  });

  await prisma.$transaction(
    Array.from({ length: 10 }, (_, index) => {
      const monthRef = addMonths(startOfMonth(new Date()), index);
      return prisma.transaction.create({
        data: {
          userId: user.id,
          type: "EXPENSE",
          description: `[META] ${goal.name} - ${monthRef.toISOString().slice(0, 7)}`,
          categoryId: goal.categoryId,
          accountId: goal.accountId,
          dueDate: addMonths(new Date(), index),
          amountPlanned: 2000,
          behavior: "VARIABLE",
          status: "PENDING",
          note: "Provisao automatica para meta financeira",
          goalId: goal.id,
          isProjected: true
        }
      });
    })
  );

  console.log("Seed concluido.");
  console.log("Login demo:", { email: userEmail, senha: "123456" });
  console.log("Contas criadas:", [inter.name, nubank.name, dinheiro.name]);
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
