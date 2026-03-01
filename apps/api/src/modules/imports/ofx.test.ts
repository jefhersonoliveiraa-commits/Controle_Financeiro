import assert from "node:assert/strict";
import test from "node:test";
import { parseOfxContent } from "./ofx.js";

test("parseOfxContent parses OFX2 XML transactions", () => {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
  <OFX>
    <BANKMSGSRSV1>
      <STMTTRNRS>
        <STMTRS>
          <BANKACCTFROM>
            <BANKID>001</BANKID>
            <ACCTID>123456</ACCTID>
          </BANKACCTFROM>
          <BANKTRANLIST>
            <STMTTRN>
              <TRNTYPE>DEBIT</TRNTYPE>
              <DTPOSTED>20260215000000[-3:BRT]</DTPOSTED>
              <TRNAMT>-125.90</TRNAMT>
              <FITID>abc-1</FITID>
              <NAME>Mercado</NAME>
              <MEMO>Compra</MEMO>
            </STMTTRN>
            <STMTTRN>
              <TRNTYPE>CREDIT</TRNTYPE>
              <DTPOSTED>20260216000000[-3:BRT]</DTPOSTED>
              <TRNAMT>500.00</TRNAMT>
              <FITID>abc-2</FITID>
              <NAME>Salario</NAME>
            </STMTTRN>
          </BANKTRANLIST>
        </STMTRS>
      </STMTTRNRS>
    </BANKMSGSRSV1>
  </OFX>`;

  const parsed = parseOfxContent(content);
  assert.equal(parsed.sourceFormat, "OFX");
  assert.equal(parsed.bankId, "001");
  assert.equal(parsed.accountRef, "123456");
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0]?.type, "EXPENSE");
  assert.equal(parsed.transactions[0]?.amount, 125.9);
  assert.equal(parsed.transactions[0]?.date, "2026-02-15");
  assert.equal(parsed.transactions[1]?.type, "INCOME");
  assert.equal(parsed.transactions[1]?.amount, 500);
});

test("parseOfxContent handles OFX1 SGML and comma decimal values", () => {
  const content = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKID>341
<ACCTID>9999
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260210
<TRNAMT>-1.234,56
<FITID>fit-1
<MEMO>Conta de energia
</STMTTRN>
</OFX>`;

  const parsed = parseOfxContent(content);
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0]?.description, "Conta de energia");
  assert.equal(parsed.transactions[0]?.type, "EXPENSE");
  assert.equal(parsed.transactions[0]?.amount, 1234.56);
  assert.equal(parsed.transactions[0]?.date, "2026-02-10");
});
