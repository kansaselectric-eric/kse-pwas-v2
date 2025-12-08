import { PrismaClient } from "../node_modules/@prisma/client/index.js";

const p = new PrismaClient();

const accounts = await p.account.count();
const opps = await p.opportunity.count();

console.log("accounts", accounts);
console.log("opps", opps);

await p.$disconnect();
