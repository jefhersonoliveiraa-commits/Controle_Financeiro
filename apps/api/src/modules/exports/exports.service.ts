import { Injectable } from "@nestjs/common";
import { reportRangeQuerySchema } from "@financeiro/contracts";
import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTransactionsCsv(userId: string, query: unknown): Promise<string> {
    const rows = await this.findTransactions(userId, query);
    return stringify(rows, {
      header: true,
      columns: [
        "id",
        "descricao",
        "tipo",
        "status",
        "comportamento",
        "vencimento",
        "valorPrevisto",
        "valorReal",
        "conta",
        "categoria"
      ]
    });
  }

  async buildTransactionsExcel(userId: string, query: unknown): Promise<Buffer> {
    const rows = await this.findTransactions(userId, query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Lancamentos");
    sheet.columns = [
      { header: "ID", key: "id", width: 40 },
      { header: "Descricao", key: "descricao", width: 40 },
      { header: "Tipo", key: "tipo", width: 10 },
      { header: "Status", key: "status", width: 12 },
      { header: "Comportamento", key: "comportamento", width: 15 },
      { header: "Vencimento", key: "vencimento", width: 16 },
      { header: "Valor Previsto", key: "valorPrevisto", width: 15 },
      { header: "Valor Real", key: "valorReal", width: 15 },
      { header: "Conta", key: "conta", width: 24 },
      { header: "Categoria", key: "categoria", width: 24 }
    ];

    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async findTransactions(userId: string, query: unknown) {
    const parsed = validateWithZod(reportRangeQuerySchema, query);
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: {
          gte: new Date(parsed.startDate),
          lte: new Date(parsed.endDate)
        }
      },
      include: { account: true, category: true },
      orderBy: { dueDate: "asc" }
    });

    return rows.map((row) => ({
      id: row.id,
      descricao: row.description,
      tipo: row.type,
      status: row.status,
      comportamento: row.behavior,
      vencimento: row.dueDate.toISOString().slice(0, 10),
      valorPrevisto: decimalToNumber(row.amountPlanned),
      valorReal: row.amountActual ? decimalToNumber(row.amountActual) : "",
      conta: row.account.name,
      categoria: row.category.name
    }));
  }
}
