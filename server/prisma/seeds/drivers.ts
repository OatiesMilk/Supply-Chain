import { PrismaClient } from '@prisma/client';

// Coverage uses canonical Area / Subregion names from src/areaHierarchy.ts (TSK-115).
export const DRIVER_SEED_DATA = [
  {
    name: 'Lando Navarro',
    type: 'DRIVER',
    areas: ['Makati CBD', 'BGC (Taguig)', 'Ortigas Corridor'],
  },
  {
    name: 'Manny Santos',
    type: 'DRIVER',
    areas: ['Quezon City - Fairview', 'Quezon City - Balintawak', 'Quezon City - Commonwealth', 'Quezon City - Diliman', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Bulacan', 'Cainta (Rizal)', 'Antipolo (Rizal)'],
  },
  {
    name: 'Ronald de la Cruz',
    type: 'DRIVER',
    areas: ['Manila - Binondo', 'Manila - Ermita', 'Manila - Malate', 'Parañaque', 'Pasay', 'Las Piñas', 'Muntinlupa - Alabang', 'Cavite', 'Laguna', 'Batangas'],
  },
  {
    name: 'Jayson Reyes',
    type: 'ASSISTANT',
    areas: [],
  },
  {
    name: 'Bong Alvarez',
    type: 'ASSISTANT',
    areas: [],
  },
  {
    name: 'Ricky Mendoza',
    type: 'ASSISTANT',
    areas: [],
  },
];

export async function seedDrivers(prisma: PrismaClient, createdBy: string = 'system') {
  console.log('Seeding Drivers and Assistants...');
  const created = [];
  for (const d of DRIVER_SEED_DATA) {
    const record = await prisma.driver.create({
      data: {
        name: d.name,
        type: d.type,
        coverageAreas: JSON.stringify(d.areas),
        isActive: true,
        createdBy,
        modifiedBy: createdBy,
      },
    });
    created.push(record);
  }
  console.log(`Seeded ${created.length} drivers/assistants.`);
  return created;
}
