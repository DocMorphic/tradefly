import { readFile } from 'node:fs/promises';
import solc from 'solc';

export async function compileReceipts() {
  const source = await readFile(
    new URL('../contracts/DecisionReceipts.sol', import.meta.url),
    'utf8',
  );
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: { 'DecisionReceipts.sol': { content: source } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: 'cancun',
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      }),
    ),
  );
  const errors = (compiled.errors || []).filter((e) => e.severity === 'error');
  if (errors.length)
    throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  const contract = compiled.contracts['DecisionReceipts.sol'].DecisionReceipts;
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}
