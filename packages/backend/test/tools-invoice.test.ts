import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, createTestUser } from './setup'
import { createInvoiceTool } from '../src/agent/tools/create-invoice'
import { listInvoicesTool } from '../src/agent/tools/list-invoices'
import { markInvoicePaidTool } from '../src/agent/tools/mark-invoice-paid'

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

describe('list_invoices', () => {
  it('returns empty array for new user', async () => {
    const user = await createTestUser()
    const result = await listInvoicesTool.execute({}, user.id)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns invoices in descending creation order', async () => {
    const user = await createTestUser()
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client B', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    const result = await listInvoicesTool.execute({}, user.id)
    const rows = result.data as any[]
    expect(rows[0].clientName).toBe('Client B') // newest first
  })

  it('filters by status', async () => {
    const user = await createTestUser()
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    await createInvoiceTool.execute(
      { direction: 'incoming', clientName: 'Supplier X', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    // outgoing = draft, incoming = received
    const result = await listInvoicesTool.execute({ status: 'draft' }, user.id)
    const rows = result.data as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].clientName).toBe('Client A')
  })

  it('filters by direction', async () => {
    const user = await createTestUser()
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    await createInvoiceTool.execute(
      { direction: 'incoming', clientName: 'Supplier X', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    const result = await listInvoicesTool.execute({ direction: 'incoming' }, user.id)
    const rows = result.data as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].clientName).toBe('Supplier X')
  })
})

describe('mark_invoice_paid', () => {
  it('marks an outgoing invoice as paid and sets paidAt', async () => {
    const user = await createTestUser()
    const created = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    const invoiceId = (created.data as any).id

    const result = await markInvoicePaidTool.execute({ invoiceId }, user.id)
    expect(result.success).toBe(true)
    const updated = result.data as any
    expect(updated.status).toBe('paid')
    expect(updated.paidAt).toBeTruthy()
  })

  it('marks an incoming invoice as paid', async () => {
    const user = await createTestUser()
    const created = await createInvoiceTool.execute(
      { direction: 'incoming', clientName: 'Supplier X', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    const invoiceId = (created.data as any).id

    const result = await markInvoicePaidTool.execute({ invoiceId }, user.id)
    expect(result.success).toBe(true)
    expect((result.data as any).status).toBe('paid')
  })

  it('returns error when invoice not found or belongs to another user', async () => {
    const user = await createTestUser()
    const result = await markInvoicePaidTool.execute({ invoiceId: 'nonexistent-id' }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
