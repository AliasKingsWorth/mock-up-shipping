export function createFixture() {
  return {
    config: {
      companyName: 'Miami ↔ Honduras Freight',
      supportPhone: '+1 (305) 555-0148',
      supportEmail: 'hello@example.test',
      miamiAddress: '100 Example Way, Suite 4, Miami, FL 33166',
      receivingHours: 'Monday–Friday, 9:00 AM–5:00 PM ET',
      hondurasBranch: 'San Pedro Sula',
      labelPrefix: 'MIA',
      receivingNote: 'Ask the seller to print your account code on the outside of every box.',
      airRateUsdPerKg: 8.5,
      oceanRateUsdPerCbm: 215,
      minimumQuoteUsd: 18,
    },
    customers: [
      { id: 'cus_ana', name: 'Ana Martínez', accountCode: 'MIA-ANA01', email: 'ana@example.test', phone: '+504 9999-1001', deliveryAddress: 'Casa 4, Colonia Ejemplo\nSan Pedro Sula, Cortés' },
      { id: 'cus_miguel', name: 'Miguel Reyes', accountCode: 'MIA-MIG02', email: 'miguel@example.test', phone: '+504 9999-1002' },
    ],
    prealerts: [
      { id: 'pal_ana_books', customerId: 'cus_ana', carrier: 'UPS', tracking: '1Z-DEMO-ALPHA', contents: 'Books and stationery', mode: 'air', expectedDate: '2026-11-17', status: 'received', createdAt: '2026-11-08T14:00:00.000Z' },
      { id: 'pal_ana_shoes', customerId: 'cus_ana', carrier: 'FedEx', tracking: 'FDX-DEMO-551', contents: 'Running shoes', mode: 'air', expectedDate: '2026-11-20', status: 'expected', createdAt: '2026-11-13T12:00:00.000Z' },
      { id: 'pal_miguel_tools', customerId: 'cus_miguel', carrier: 'USPS', tracking: 'USPS-DEMO-910', contents: 'Hand tools', mode: 'ocean', expectedDate: '2026-11-12', status: 'received', createdAt: '2026-11-05T16:00:00.000Z' },
    ],
    pickups: [],
    quotes: [],
    labels: [],
    packages: [
      {
        id: 'pkg_1048', label: 'PKG-1048', customerId: 'cus_ana', prealertId: 'pal_ana_books',
        carrier: 'UPS', tracking: '1Z-DEMO-ALPHA', contents: 'Books and stationery', mode: 'air',
        state: 'in_transit', shelf: null, weightGrams: 2200, dimensionsCm: [32, 24, 18], condition: 'Intact',
        receivedAt: '2026-11-09T15:32:00.000Z',
        events: [
          { kind: 'received', title: 'Received in Miami', detail: 'Scanned, weighed and placed on shelf A-12.', at: '2026-11-09T15:32:00.000Z', location: 'Miami warehouse' },
          { kind: 'prepared', title: 'Prepared for air freight', detail: 'Box matched to Ana’s account.', at: '2026-11-10T13:20:00.000Z', location: 'Miami warehouse' },
          { kind: 'departed', title: 'Departed Miami', detail: 'Loaded on demonstration flight AIR-214.', at: '2026-11-12T18:05:00.000Z', location: 'In transit' },
        ],
      },
      {
        id: 'pkg_1052', label: 'PKG-1052', customerId: 'cus_ana', prealertId: null,
        accountCode: 'MIA-ANA01', source: 'dropoff', pickupId: null, receiptNo: 'RCV-DEMO1052', photos: [],
        carrier: 'Amazon Logistics', tracking: 'TBA-DEMO-202', contents: 'Kitchen supplies', mode: 'ocean',
        state: 'received', shelf: 'B-07', weightGrams: 4100, dimensionsCm: [42, 31, 27], condition: 'Outer box dented; contents not opened',
        receivedAt: '2026-11-14T16:15:00.000Z',
        events: [
          { kind: 'received', title: 'Received in Miami', detail: 'Condition photographed and placed on shelf B-07.', at: '2026-11-14T16:15:00.000Z', location: 'Miami warehouse' },
        ],
      },
      {
        id: 'pkg_1031', label: 'PKG-1031', customerId: 'cus_ana', prealertId: null,
        carrier: 'DHL', tracking: 'DHL-DEMO-811', contents: 'Clothing', mode: 'air',
        state: 'delivered', shelf: null, weightGrams: 1800, dimensionsCm: [35, 25, 20], condition: 'Intact',
        receivedAt: '2026-10-29T13:00:00.000Z',
        events: [
          { kind: 'received', title: 'Received in Miami', detail: 'Box scanned at warehouse.', at: '2026-10-29T13:00:00.000Z', location: 'Miami warehouse' },
          { kind: 'departed', title: 'Departed Miami', detail: 'Air freight departed.', at: '2026-11-01T11:00:00.000Z', location: 'In transit' },
          { kind: 'arrived', title: 'Arrived in Honduras', detail: 'Received at San Pedro Sula branch.', at: '2026-11-03T15:00:00.000Z', location: 'San Pedro Sula' },
          { kind: 'delivered', title: 'Delivered to recipient', detail: 'Signed handoff completed.', at: '2026-11-05T17:20:00.000Z', location: 'San Pedro Sula' },
        ],
      },
      {
        id: 'pkg_2020', label: 'PKG-2020', customerId: 'cus_miguel', prealertId: 'pal_miguel_tools',
        carrier: 'USPS', tracking: 'USPS-DEMO-910', contents: 'Hand tools', mode: 'ocean',
        state: 'ready_for_pickup', shelf: 'SPS-C-03', weightGrams: 6300, dimensionsCm: [48, 35, 24], condition: 'Intact',
        receivedAt: '2026-11-12T14:40:00.000Z',
        events: [
          { kind: 'received', title: 'Received in Miami', detail: 'Scanned and measured.', at: '2026-11-12T14:40:00.000Z', location: 'Miami warehouse' },
          { kind: 'departed', title: 'Departed Miami', detail: 'Ocean sailing departed.', at: '2026-11-13T20:00:00.000Z', location: 'In transit' },
          { kind: 'arrived', title: 'Arrived in Honduras', detail: 'Reconciled to shelf SPS-C-03.', at: '2026-11-15T13:30:00.000Z', location: 'San Pedro Sula' },
          { kind: 'ready_for_pickup', title: 'Ready for pickup', detail: 'Awaiting recipient at branch.', at: '2026-11-15T15:00:00.000Z', location: 'San Pedro Sula' },
        ],
      },
    ],
  }
}
