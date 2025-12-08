import { PrismaClient } from "../../node_modules/@prisma/client/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');
  try {
    const accountPath = path.join(__dirname, '../../crm/web/data/customer-strategy-seed.json');
    if (fs.existsSync(accountPath)) {
      const accounts = JSON.parse(fs.readFileSync(accountPath, 'utf-8'));
      console.log('Found ' + accounts.length + ' accounts.');
      for (const acc of accounts) {
        const id = ('seed-acct-' + acc.name.replace(/[^a-zA-Z0-9]/g, '')).substring(0, 50);
        await prisma.account.upsert({
          where: { id },
          update: {},
          create: {
            id,
            name: acc.name,
            industry: acc.industry || null,
            city: acc.city || null,
            state: acc.state || null,
            annualPotential: acc.annualPotential || null,
            projectedValue: acc.projectedValue || null,
            nextStep: acc.nextStep || null,
            notes: acc.notes || null,
            ownerName: acc.accountOwner || null,
            relationshipHealth: acc.priority || null,
            stalled: false,
            stage: 'Prospect'
          }
        });
      }
      console.log('Accounts seeded.');
    } else {
      console.log('Account seed file not found at: ' + accountPath);
    }
  } catch (e) {
    console.error('Error seeding accounts:', e);
  }

  try {
    const oppPath = path.join(__dirname, '../src/data/opportunity-seeds.json');
    if (fs.existsSync(oppPath)) {
      const opps = JSON.parse(fs.readFileSync(oppPath, 'utf-8'));
      console.log('Found ' + opps.length + ' opportunities.');
      for (const opp of opps) {
        await prisma.opportunity.upsert({
          where: { id: opp.id },
          update: {},
          create: {
            id: opp.id,
            projectName: opp.title,
            description: opp.summary,
            value: opp.value,
            status: 'Active',
            stage: 'Identified',
            projectCity: opp.location ? opp.location.split(',')[0].trim() : null,
            projectState: opp.location && opp.location.includes(',') ? opp.location.split(',')[1].trim() : null
          }
        });
      }
      console.log('Opportunities seeded.');
    } else {
      console.log('Opportunity seed file not found at: ' + oppPath);
    }
  } catch (e) {
    console.error('Error seeding opportunities:', e);
  }

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
