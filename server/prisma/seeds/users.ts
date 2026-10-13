
import { prisma } from '../../src/db';
import bcrypt from 'bcryptjs';

const USERS = [
  { name: 'Maria Reyes',  email: 'sales@microgenesis.com',     password: 'password123', role: 'SALES_COORDINATOR' as const, isActive: true },
  { name: 'Juan Santos',  email: 'logistics@microgenesis.com', password: 'password123', role: 'LOGISTICS' as const,          isActive: true },
  { name: 'Ana Cruz',     email: 'tass@microgenesis.com',      password: 'password123', role: 'TASS' as const,               isActive: true },
  { name: 'System Admin', email: 'admin@microgenesis.com',     password: 'admin123',    role: 'ADMIN' as const,              isActive: true },
  { name: 'John Doe',   email: 'driver@microgenesis.com',    password: 'password123', role: 'DRIVER' as const,             isActive: true }
];

export async function seedUsers() {
  const users: Record<string, { id: string; name: string }> = {};
  for (const u of USERS) {
    const hashed = await bcrypt.hash(u.password, 10);
    const created = await prisma.user.create({
      data: { name: u.name, email: u.email, password: hashed, role: u.role, isActive: u.isActive }
    });
    users[u.role] = { id: created.id, name: created.name };
  }
  return users;
}

export { USERS };
