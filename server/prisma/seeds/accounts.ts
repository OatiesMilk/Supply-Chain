
import { prisma } from '../../src/db';
import { normalizedCategoryName } from '../../src/services/supplierCategories';

const COMPANIES = [
  { key: 'jollibee',     name: 'Jollibee Foods Corp. - Quezon City Cluster',          sapNumber: 'SAP-CO-0001', address: '12 E. Rodriguez Jr. Ave, Quezon City',              contactPerson: 'Theresa Alajar' },
  { key: 'mercury',      name: 'Mercury Drug Corporation - Head Office',               sapNumber: 'SAP-CO-0002', address: '7 Jupiter St. Cor. Makati Ave, Makati',             contactPerson: 'Gabriel Sy' },
  { key: 'cbtl',         name: 'The Coffee Bean & Tea Leaf (CBTL PH)',                 sapNumber: 'SAP-CO-0003', address: 'BGC Corporate Center, Taguig',                       contactPerson: 'Regine Velasquez' },
  { key: 'chowking',     name: 'Chowking Foods Corp. - South Manila Area',             sapNumber: 'SAP-CO-0004', address: 'Roxas Blvd, Malate, Manila',                        contactPerson: 'Dante Torres' },
  { key: 'techvantage',  name: 'TechVantage Manila Distribution',                      sapNumber: 'SAP-CO-0005', address: 'Balintawak Warehouse District, Quezon City',        contactPerson: 'Ferdinand Uy' },
  { key: 'mcdo',         name: "McDonald's Philippines (Golden Arches Dev't Corp)",    sapNumber: 'SAP-CO-0006', address: '6/F Citibank Center, Paseo de Roxas, Makati',       contactPerson: 'Loretta Santos' },
  { key: 'shakeys',      name: "Shakey's Pizza Asia Pacific Inc.",                     sapNumber: 'SAP-CO-0007', address: '3/F The Podium, Ortigas Center, Mandaluyong',       contactPerson: 'Benedicto Cruz' },
  { key: 'manginasal',   name: 'Mang Inasal Philippines Inc.',                         sapNumber: 'SAP-CO-0008', address: 'Jollibee Centre, 10 F. Ortigas Jr. Rd, Pasig',      contactPerson: 'Daphne Reyes' },
  { key: 'greenwich',    name: 'Greenwich Pizza Corp.',                                sapNumber: 'SAP-CO-0009', address: 'Jollibee Plaza, Emerald Ave, Ortigas, Pasig',       contactPerson: 'Marco Flores' },
  { key: 'kfc',          name: 'KFC Philippines (Lotte GRS Philippines Inc.)',          sapNumber: 'SAP-CO-0010', address: '5/F Rockwell Business Center Tower 3, Makati',      contactPerson: 'Yolanda Bautista' },
  { key: 'pizzahut',     name: 'Pizza Hut Philippines (QSR Brands Philippines)',        sapNumber: 'SAP-CO-0011', address: 'Unit 2A Bonifacio High Street, BGC, Taguig',        contactPerson: 'Alfredo Ramos' },
  { key: 'potatocorner', name: 'Potato Corner Franchise Group (Manila)',                sapNumber: 'SAP-CO-0012', address: '88 Shaw Blvd, Mandaluyong',                         contactPerson: 'Christian Pineda' },
  { key: 'gerrys',       name: "Gerry's Grill Restaurant Group Inc.",                  sapNumber: 'SAP-CO-0013', address: 'Tomas Morato Ave, Quezon City',                     contactPerson: 'Gerardo Apolinario' },
  { key: 'maxs',         name: "Max's Restaurant Group Inc.",                          sapNumber: 'SAP-CO-0014', address: '2/F AllHome Center, Commonwealth Ave, Quezon City', contactPerson: 'Jose Maximo' },
  { key: 'contis',       name: "Conti's Bakeshop & Restaurant",                        sapNumber: 'SAP-CO-0015', address: "President's Ave, BF Homes, Parañaque",              contactPerson: 'Carla Conti' },
  { key: 'marygrace',    name: 'Mary Grace Café Head Office',                          sapNumber: 'SAP-CO-0016', address: 'EDSA Shangri-La Plaza, Ortigas, Mandaluyong',       contactPerson: 'Grace Dimacali' },
  { key: 'wildflour',    name: 'Wildflour Café + Bakery Group',                        sapNumber: 'SAP-CO-0017', address: 'Net Lima Bldg, 5th Ave, BGC, Taguig',               contactPerson: 'Ana Lorenzana' },
  { key: 'pancakehouse', name: 'Pancake House Holdings Inc.',                          sapNumber: 'SAP-CO-0018', address: 'Glorietta 4, Ayala Center, Makati',                 contactPerson: 'Ricardo Villanueva' },
  { key: 'armynavy',     name: 'Army Navy Burger Burrito PH',                          sapNumber: 'SAP-CO-0019', address: 'Polaris St, Makati',                                contactPerson: 'Nicanor Reyes' },
  { key: 'boscoffee',    name: "Bo's Coffee Club Inc.",                                sapNumber: 'SAP-CO-0020', address: 'Cardinal Rosales Ave, Cebu Business Park, Cebu',    contactPerson: 'Steve Benitez' },
  { key: 'zagu',         name: 'Zagu Inc.',                                            sapNumber: 'SAP-CO-0021', address: '4/F SM Megamall Bldg A, Ortigas, Mandaluyong',     contactPerson: 'Aileen Quiambao' },
  { key: 'serenitea',    name: 'Serenitea Milktea House (Manila HQ)',                  sapNumber: 'SAP-CO-0022', address: 'Pasig Blvd, Oranbo, Pasig',                         contactPerson: 'Juliet Lorenzo' },
  { key: 'smretail',     name: 'SM Retail Inc. - Department Store Division',           sapNumber: 'SAP-CO-0023', address: 'SM City Bicutan, Parañaque',                        contactPerson: 'Veronica Co' },
  { key: 'robinsons',    name: 'Robinsons Grocery Inc.',                               sapNumber: 'SAP-CO-0024', address: 'Robinsons Place Ermita, Manila',                    contactPerson: 'Frederick Go' },
  { key: 'puregold',     name: 'Puregold Price Club Inc.',                             sapNumber: 'SAP-CO-0025', address: '900 Romualdez St, Paco, Manila',                    contactPerson: 'Manny Mendoza' },
  { key: 'snr',          name: 'S&R Membership Shopping (PriceSmart Philippines)',     sapNumber: 'SAP-CO-0026', address: 'C5 Road, Libis, Quezon City',                       contactPerson: 'Patricia Jankulovski' },
  { key: 'landmark',     name: 'The Landmark Retail Stores Inc.',                      sapNumber: 'SAP-CO-0027', address: 'Ayala Center, Makati',                              contactPerson: 'Eduardo Lichauco' },
  { key: 'generika',     name: 'Generika Drugstore Head Office',                       sapNumber: 'SAP-CO-0028', address: 'Alabang-Zapote Road, Muntinlupa',                   contactPerson: 'Manuel Lopez' },
  { key: 'rosepharmacy', name: 'Rose Pharmacy (Medilink Health Corp.)',                sapNumber: 'SAP-CO-0029', address: 'Mandaue Reclamation Area, Cebu',                    contactPerson: 'Francisca Go' },
  { key: 'tgp',          name: 'The Generics Pharmacy (TGP) Inc.',                    sapNumber: 'SAP-CO-0030', address: '188 Tomas Morato Ave, Quezon City',                 contactPerson: 'Benjamin Lirio' },
  { key: 'watsons',      name: 'Watsons Personal Care Stores PH',                     sapNumber: 'SAP-CO-0031', address: 'SM Mall of Asia, Pasay',                            contactPerson: 'Rachel Chan' },
  { key: 'southstar',    name: 'South Star Drug Inc.',                                 sapNumber: 'SAP-CO-0032', address: 'EDSA corner Quezon Ave, Quezon City',               contactPerson: 'Luisa Guerrero' },
  { key: 'abenson',      name: 'Abenson Enterprises Inc.',                             sapNumber: 'SAP-CO-0033', address: 'SM City Marikina, Marcos Highway, Marikina',        contactPerson: 'Antonio Abellana' },
  { key: 'pcexpress',    name: 'PC Express Technology Inc.',                           sapNumber: 'SAP-CO-0034', address: 'Gilmore Ave, New Manila, Quezon City',              contactPerson: 'Kenneth Tan' },
  { key: 'octagon',      name: 'Octagon Computer Superstore',                          sapNumber: 'SAP-CO-0035', address: 'SM Megamall, Ortigas Center, Mandaluyong',          contactPerson: 'Ramon Ocampo' },
  { key: 'istore',       name: 'iStore Philippines (FOSS National Corp.)',             sapNumber: 'SAP-CO-0036', address: 'Uptown Mall, BGC, Taguig',                          contactPerson: 'Diana Fuentes' },
  { key: 'dynaquestpc',  name: 'DynaQuest PC Inc.',                                   sapNumber: 'SAP-CO-0037', address: 'Gilmore IT Center, New Manila, Quezon City',        contactPerson: 'Harold Dy' },
  { key: 'seven11',      name: 'Philippine Seven Corp. (7-Eleven PH)',                 sapNumber: 'SAP-CO-0038', address: 'Plaza 2000, Meralco Ave, Pasig',                     contactPerson: 'Victor Paterno' },
  { key: 'alfamart',     name: 'Alfamart Philippines Inc.',                            sapNumber: 'SAP-CO-0039', address: 'Canlubang, Calamba, Laguna',                        contactPerson: 'Ayin Sulistyo' },
  { key: 'ministop',     name: 'Ministop Philippines Inc.',                            sapNumber: 'SAP-CO-0040', address: 'AEON Square, Subic Bay Freeport Zone',              contactPerson: 'Jocelyn Sy' },
  { key: 'nbs',          name: 'National Book Store Holdings Inc.',                    sapNumber: 'SAP-CO-0041', address: 'SM City North EDSA, Quezon City',                   contactPerson: 'Socorro Ramos' },
  { key: 'timezone',     name: 'Timezone Philippines Inc.',                            sapNumber: 'SAP-CO-0042', address: 'SM Mall of Asia, Pasay',                            contactPerson: 'James Uy' },
  { key: 'redribbon',    name: 'Red Ribbon Bakeshop Inc.',                             sapNumber: 'SAP-CO-0043', address: 'Jollibee Centre, Pasig',                            contactPerson: 'Rosario Tengco' },
  { key: 'goldilocks',   name: 'Goldilocks Bakeshop Inc.',                             sapNumber: 'SAP-CO-0044', address: '967 Aurora Blvd, Cubao, Quezon City',               contactPerson: 'Milagros Leelin' },
  { key: 'zubuchon',     name: 'Zubuchon Inc. - Manila Branch Office',                sapNumber: 'SAP-CO-0045', address: 'Talisay St, Yakal, Makati',                         contactPerson: 'Lars Ramirez' }
];

const CUSTOMERS = [
  { name: 'Jollibee Foods Corp. - Quezon City Cluster', contactPerson: 'Theresa Alajar', email: 'procurement.qc@jfc.com.ph', phone: '0917-882-9921', address: '12 E. Rodriguez Jr. Ave', city: 'Quezon City' },
  { name: 'Mercury Drug Corporation - Head Office',     contactPerson: 'Gabriel Sy',     email: 'purchasing@mercurydrug.com', phone: '02-8911-5000', address: '7 Jupiter St. Cor. Makati Ave', city: 'Makati' },
  { name: 'SM Retail Inc. - Department Store Division', contactPerson: 'Veronica Co',    email: 'veronica.co@smretail.com', phone: '0918-112-4040', address: 'SM Central Business Park', city: 'Pasay' },
  { name: 'Potato Corner Franchise Group (Manila)',      contactPerson: 'Christian Pineda', email: 'cpineda@potatocorner.com', phone: '0905-223-9110', address: '88 Shaw Blvd, Mandaluyong', city: 'Mandaluyong' },
  { name: 'The Coffee Bean & Tea Leaf (CBTL PH)',        contactPerson: 'Regine Velasquez', email: 'rvelasquez@cbtl.com.ph', phone: '0917-555-8833', address: 'BGC Corporate Center, Taguig', city: 'Taguig' },
  { name: 'Wildflour Café + Bakery Group',                contactPerson: 'Ana Lorenzana',  email: 'alorenzana@wildflour.com.ph', phone: '02-8856-7600', address: 'Net Lima Bldg, 4th Ave, BGC', city: 'Taguig' },
  { name: 'Generika Drugstore Head Office',              contactPerson: 'Manuel Lopez',   email: 'mlopez@generika.com.ph', phone: '0922-332-1111', address: 'Alabang-Zapote Road', city: 'Muntinlupa' },
  { name: 'Zubuchon Inc. - Manila Branch Office',        contactPerson: 'Lars Ramirez',   email: 'lramirez@zubuchon.com', phone: '0919-440-2020', address: 'Talisay St, Yakal', city: 'Makati' },
  { name: 'Rose Pharmacy Cebu Supply Depot',             contactPerson: 'Francisca Go',   email: 'f.go@rosepharmacy.com', phone: '032-234-9911', address: 'Mandaue Reclamation Area', city: 'Cebu' },
  { name: 'Chowking Foods Corp. - South Manila Area',    contactPerson: 'Dante Torres',   email: 'dtorres@chowking.com.ph', phone: '0917-771-4040', address: 'Roxas Blvd, Malate', city: 'Manila' },
  { name: 'Davao POS Merchant Association',              contactPerson: 'Roberto Duterte', email: 'davao.merchants@gmail.com', phone: '082-224-8831', address: 'C.M. Recto Ave', city: 'Davao' },
  { name: 'Army Navy Burger Burrito PH',                 contactPerson: 'Nicanor Reyes',  email: 'nreyes@armynavy.com.ph', phone: '02-8333-2222', address: 'Polaris St, Makati', city: 'Makati' },
  { name: "Conti's Bakeshop & Restaurant",               contactPerson: 'Carla Conti',    email: 'carlaconti@contis.com.ph', phone: '0915-442-9900', address: "President's Avenue, BF Homes", city: 'Parañaque' },
  { name: "Max's Restaurant Group Inc.",                 contactPerson: 'Jose Maximo',    email: 'jmaximo@maxsgroup.com', phone: '02-8784-9000', address: 'Tomas Morato Ave', city: 'Quezon City' },
  { name: 'Mary Grace Cafe Head Office',                 contactPerson: 'Grace Dimacali', email: 'grace@marygracecafe.com', phone: '0917-111-5555', address: 'Pasig City Industrial Zone', city: 'Pasig' },
];

const SUPPLIERS = [
  { name: 'TechVantage Manila Distribution',   contactPerson: 'Ariel Santos',    email: 'ariel@techvantage.ph',  phone: '+63 2 8888 1001', address: '45 Tuazon Ave, Quezon City',     city: 'Quezon City', category: 'Electronics' },
  { name: 'MetalWorks Fabrication Inc.',       contactPerson: 'Carlo Reyes',      email: 'carlo@metalworks.ph',   phone: '+63 2 8777 2002', address: '18 Macapagal Blvd, Pasay',       city: 'Pasay',       category: 'Hardware' },
  { name: 'PaperTrail Consumables Co.',        contactPerson: 'Liza Cruz',        email: 'liza@papertrail.ph',    phone: '+63 2 8666 3003', address: '7 EDSA North, Caloocan',         city: 'Caloocan',    category: 'Consumables' },
  { name: 'BoxRight Packaging Solutions',      contactPerson: 'Mark Villanueva',  email: 'mark@boxright.ph',      phone: '+63 2 8555 4004', address: '22 Industrial Rd, Valenzuela',   city: 'Valenzuela',  category: 'Packaging' },
  { name: 'Globalink Freight & Logistics',     contactPerson: 'Nina Bautista',    email: 'nina@globalink.ph',     phone: '+63 2 8444 5005', address: '100 Port Area, Manila',          city: 'Manila',      category: 'Services' },
];

export async function seedAccounts(adminUserId: string) {
  const companies: Record<string, { id: string; name: string }> = {};
  for (const c of COMPANIES) {
    const created = await prisma.company.create({
      data: { name: c.name, sapNumber: c.sapNumber, address: c.address, contactPerson: c.contactPerson }
    });
    companies[c.key] = { id: created.id, name: created.name };
  }

  for (const c of CUSTOMERS) {
    await prisma.customer.create({
      data: { ...c, createdById: adminUserId, modifiedById: adminUserId, modifiedAt: new Date() }
    });
  }
  for (const s of SUPPLIERS) {
    const normalizedName = await normalizedCategoryName(prisma, s.category);
    const category = await prisma.supplierCategory.upsert({
      where: { normalizedName }, update: {},
      create: { name: s.category, normalizedName },
    });
    await prisma.supplier.create({
      data: { ...s, categories: { create: { categoryId: category.id } }, createdById: adminUserId, modifiedById: adminUserId, modifiedAt: new Date() }
    });
  }

  return { companies, CUSTOMERS, SUPPLIERS, COMPANIES };
}

export { COMPANIES, CUSTOMERS, SUPPLIERS };
