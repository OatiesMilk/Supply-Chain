import { PrismaClient } from '@prisma/client';
import { DRIVER_SEED_DATA } from './seeds/drivers';
import { lockDriverDirectory } from '../src/services/driverDirectory';
import * as crypto from 'crypto';

function isValidDate(dateStr: string) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === dateStr;
}

export async function seedDriverDemo(prisma: PrismaClient, targetDate?: string) {
  if (targetDate !== undefined && !isValidDate(targetDate)) {
    throw new Error(`Invalid target date format: ${targetDate}. Must be a valid YYYY-MM-DD calendar date.`);
  }
  const dateStr = targetDate ?? new Date().toISOString().slice(0, 10);

  return prisma.$transaction(async (tx) => {
    // 1. Lock driver directory
    await lockDriverDirectory(tx);

    // 2. Validate prerequisites: Sales, Logistics users, admin, company
    const sales = await tx.user.findFirst({ where: { email: 'sales@microgenesis.com', role: 'SALES_COORDINATOR', isActive: true } });
    const logistics = await tx.user.findFirst({ where: { email: 'logistics@microgenesis.com', role: 'LOGISTICS', isActive: true } });
    const admin = await tx.user.findFirst({ where: { email: 'admin@microgenesis.com', role: 'ADMIN', isActive: true } });

    if (!sales || !logistics || !admin) {
      throw new Error('Prerequisite users (sales, logistics, admin) with correct roles not found or inactive.');
    }

    const company = await tx.company.findFirst();
    if (!company) {
      throw new Error('Prerequisite company not found.');
    }

    // 3. Resolve the actual seeded driver account
    const driverUser = await tx.user.findFirst({
      where: { email: 'driver@microgenesis.com', role: 'DRIVER', isActive: true }
    });

    if (!driverUser) {
      throw new Error('Prerequisite driver account not found or inactive.');
    }

    const driverUserName = driverUser.name; // exact case login name

    // 4. Create or verify Driver directory entry for the driver account
    // Prefer matching inactive entries to avoid duplicates.
    const duplicateEntries = await tx.driver.findMany({
      where: { name: { equals: driverUserName, mode: 'insensitive' }, type: 'DRIVER' }
    });

    let dirEntry = duplicateEntries.find(e => !e.isActive);
    if (!dirEntry) {
      dirEntry = duplicateEntries.find(e => e.isActive);
    }

    if (dirEntry) {
      if (!dirEntry.isActive) {
        console.log(`Driver directory entry for ${dirEntry.name} is inactive. Skipping activation.`);
      }
    } else {
      dirEntry = await tx.driver.create({
        data: {
          name: driverUserName, // use exact account name
          type: 'DRIVER',
          coverageAreas: '[]',
          isActive: true,
          createdBy: admin.name,
          modifiedBy: admin.name
        }
      });
      console.log(`Created Driver directory entry for ${driverUserName}`);
    }

    // 5. Collect active drivers to schedule runs for (deduplicate by case-insensitive name)
    const driversToSeed = new Map<string, string>(); // lowercased name -> exact name to use in record

    // Add existing seeded drivers if active
    for (const d of DRIVER_SEED_DATA.filter(x => x.type === 'DRIVER')) {
      const allMatches = await tx.driver.findMany({
        where: { name: { equals: d.name, mode: 'insensitive' }, type: 'DRIVER' }
      });
      const inactiveMatch = allMatches.find(e => !e.isActive);
      const activeMatch = allMatches.find(e => e.isActive);

      if (inactiveMatch) {
        console.log(`Seed driver ${inactiveMatch.name} is inactive. Skipping.`);
      } else if (activeMatch) {
        driversToSeed.set(activeMatch.name.toLowerCase(), activeMatch.name);
      }
    }

    // Add the driver account if active
    if (dirEntry && dirEntry.isActive) {
      driversToSeed.set(dirEntry.name.toLowerCase(), driverUserName);
    }

    let createdCount = 0;

    // 6. Pick an active assistant
    const activeAssistant = await tx.driver.findFirst({ where: { type: 'ASSISTANT', isActive: true } });
    const assistantName = activeAssistant ? activeAssistant.name : null;

    // 7. Create demo runs deterministically
    for (const [lowerName, exactName] of driversToSeed.entries()) {
      const hashName = crypto.createHash('sha256').update(lowerName).digest('hex').substring(0, 16).toUpperCase();
      const demoId = `REC-DEMO-${dateStr.replace(/-/g, '')}-${hashName}`;

      const existingRecord = await tx.deliveryRecord.findUnique({
        where: { id: demoId }
      });

      if (!existingRecord) {
        await tx.deliveryRecord.create({
          data: {
            id: demoId,
            companyId: company.id,
            priority: '2 - Moderate',
            reference: `SAP-DEMO-${hashName.substring(0, 8)}`,
            remarks: 'Demo seeded run for Driver App',
            status: 'SCHEDULED',
            vehicle: 'Van-01 (L300)',
            area: 'Metro Manila',
            driver: exactName,
            driverAssistants: assistantName ? JSON.stringify([assistantName]) : '[]',
            accountManager: 'Demo Account',
            deliveryDate: dateStr,
            category: 'DELIVERY',
            itemType: 'Small Item',
            draft: false,
            dateAndTime: `${dateStr}T09:00:00`,
            itemDescription: 'Demo item for testing driver app',
            collectionVerified: false,
            createdById: sales.id,
            modifiedById: logistics.id
          }
        });
        createdCount++;
      } else {
        console.log(`Demo record ${demoId} already exists, skipping to preserve edits.`);
      }
    }

    return createdCount;
  });
}

if (require.main === module) {
  const { prisma } = require('../src/db');
  seedDriverDemo(prisma)
    .then(count => {
      console.log(`Successfully seeded ${count} driver demo records.`);
    })
    .catch(e => {
      console.error(e.message || e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
