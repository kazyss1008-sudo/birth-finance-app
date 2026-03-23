import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  '劇場費','舞台美術費','舞台監督費','舞台監督雑費','仕込みバラシ要員費','照明費','宣伝費','制作費','稽古場費','荷出し・荷返し費','小道具費','スチール費','音響費','編曲費','食材費','レコーディング費','廃棄費'
];

async function main() {
  await prisma.user.upsert({
    where: { loginId: 'admin' },
    update: { displayName: '管理者' },
    create: { loginId: 'admin', displayName: '管理者', mustChangePassword: true },
  });

  for (const [index, name] of categories.entries()) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: { sortOrder: index + 1, isActive: true },
      create: { name, sortOrder: index + 1, isActive: true },
    });
  }
}

main().finally(() => prisma.$disconnect());
