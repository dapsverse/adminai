import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../src/index'
import { cleanDb } from './setup'

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(async () => {
  await cleanDb()
})

describe('POST /auth/register', () => {
  it('creates user and returns token + user', async () => {
    const res = await post('/auth/register', {
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Budi Santoso',
      businessName: 'Toko Makmur',
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.token).toBeTypeOf('string')
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.passwordHash).toBeUndefined()
  })

  it('returns 409 if email already registered', async () => {
    await post('/auth/register', {
      email: 'dupe@example.com',
      password: 'password123',
      fullName: 'Ani',
      businessName: 'Warung Ani',
    })
    const res = await post('/auth/register', {
      email: 'dupe@example.com',
      password: 'password123',
      fullName: 'Ani',
      businessName: 'Warung Ani',
    })
    expect(res.status).toBe(409)
  })

  it('returns 400 if required fields missing', async () => {
    const res = await post('/auth/register', { email: 'bad@example.com' })
    expect(res.status).toBe(400)
  })

  it('includes telegramConnected: false for newly registered user', async () => {
    const res = await post('/auth/register', {
      email: 'tg@example.com',
      password: 'password123',
      fullName: 'Citra',
      businessName: 'Toko Citra',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { user: { telegramConnected: boolean } }
    expect(body.user.telegramConnected).toBe(false)
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await post('/auth/register', {
      email: 'login@example.com',
      password: 'correctpassword',
      fullName: 'Login User',
      businessName: 'Biz',
    })
  })

  it('returns token for valid credentials', async () => {
    const res = await post('/auth/login', {
      email: 'login@example.com',
      password: 'correctpassword',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTypeOf('string')
    expect(body.user.email).toBe('login@example.com')
  })

  it('returns 401 for wrong password', async () => {
    const res = await post('/auth/login', {
      email: 'login@example.com',
      password: 'wrongpassword',
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 for unknown email', async () => {
    const res = await post('/auth/login', {
      email: 'nobody@example.com',
      password: 'password',
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /auth/me', () => {
  it('returns user for valid token', async () => {
    const reg = await post('/auth/register', {
      email: 'me@example.com',
      password: 'password123',
      fullName: 'Me User',
      businessName: 'My Biz',
    })
    const { token } = await reg.json()

    const res = await app.request('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe('me@example.com')
  })

  it('returns 401 without token', async () => {
    const res = await app.request('/auth/me')
    expect(res.status).toBe(401)
  })
})
