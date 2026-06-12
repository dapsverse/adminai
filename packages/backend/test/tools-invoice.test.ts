import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, createTestUser } from './setup'
import { createInvoiceTool } from '../src/agent/tools/create-invoice'

beforeEach(() => cleanDb())

const sampleItems = [
  { description: 'Jasa desain logo', qty: 1, price: 500000 },
  { description: 'Revisi 2x', qty: 2, price: 100000 },
]

describe('create_invoice', () => {
  it('creates an outgoing invoice with auto-generated number', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'PT Maju Jaya', items: sampleItems },
      user.id
    )
    expect(result.success).toBe(true)
    const inv = result.data as any
    expect(inv.direction).toBe('outgoing')
    expect(inv.clientName).toBe('PT Maju Jaya')
    expect(inv.status).toBe('draft')
    expect(inv.invoiceNumber).toMatch(/^INV-\d{6}-\d{3}$/)
  })

  it('calculates totalAmount from items', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: sampleItems },
      user.id
    )
    const inv = result.data as any
    // 1*500000 + 2*100000 = 700000
    expect(inv.totalAmount).toBe(700000)
  })

  it('creates an incoming invoice with status received', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      {
        direction: 'incoming',
        clientName: 'Supplier Bahan',
        items: [{ description: 'Tepung 50kg', qty: 1, price: 400000 }],
      },
      user.id
    )
    const inv = result.data as any
    expect(inv.direction).toBe('incoming')
    expect(inv.status).toBe('received')
  })

  it('increments invoice sequence per user per month', async () => {
    const user = await createTestUser()
    const r1 = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'X', qty: 1, price: 100 }] },
      user.id
    )
    const r2 = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client B', items: [{ description: 'Y', qty: 1, price: 200 }] },
      user.id
    )
    const n1 = (r1.data as any).invoiceNumber
    const n2 = (r2.data as any).invoiceNumber
    expect(n1).not.toBe(n2)
    expect(n1).toMatch(/-001$/)
    expect(n2).toMatch(/-002$/)
  })

  it('returns error when required fields are missing', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute({ direction: 'outgoing' }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns error when item is missing qty or price', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      {
        direction: 'outgoing',
        clientName: 'Client A',
        items: [{ description: 'Barang X' }], // no qty or price
      },
      user.id
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
