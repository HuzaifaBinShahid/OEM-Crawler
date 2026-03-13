import { runVinLookup } from './runner.js';

function parseArgs(): { vin: string; cartName: string; skuQuery?: string } {
  const args = process.argv.slice(2);
  let vin = '';
  let cartName = 'default-cart';
  let skuQuery: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--vin=')) vin = arg.slice(6).trim();
    else if (arg.startsWith('--cart-name=')) cartName = arg.slice(12).trim();
    else if (arg.startsWith('--sku-query=')) skuQuery = arg.slice(12).trim();
  }

  return { vin, cartName, skuQuery };
}

async function main(): Promise<void> {
  const { vin, cartName, skuQuery } = parseArgs();

  if (!vin) {
    console.error('Usage: npm run vin -- --vin=<VIN> [--cart-name=<name>] [--sku-query=<query>]');
    process.exit(1);
  }

  const result = await runVinLookup({ vin, cartName, skuQuery });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
