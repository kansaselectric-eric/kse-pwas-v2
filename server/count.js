const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();
async function main(){
  console.log('cwd', process.cwd());
  console.log('db', process.env.DATABASE_URL);
  const accounts = await p.account.count();
  const opps = await p.opportunity.count();
  console.log('accounts', accounts);
  console.log('opps', opps);
}
main().finally(()=>p.$disconnect());
