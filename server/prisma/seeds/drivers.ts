import { PrismaClient } from '@prisma/client';

export const DRIVER_SEED_DATA = [
  {
    name: 'Lando Navarro',
    type: 'DRIVER',
    areas: ['Makati', 'BGC', 'Taguig', 'Mandaluyong', 'San Juan', 'Pasig', 'Ortigas', 'Ortigas Corridor', 'Ortigas Center (Pasig)'],
  },
  {
    name: 'Manny Santos',
    type: 'DRIVER',
    areas: ['Quezon City', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Bulacan', 'Cainta', 'Antipolo'],
  },
  {
    name: 'Ronald de la Cruz',
    type: 'DRIVER',
    areas: ['Manila', 'Parañaque', 'Pasay', 'Las Piñas', 'Muntinlupa', 'Cavite', 'Laguna', 'Batangas'],
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
